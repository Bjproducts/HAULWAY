begin;

-- Driver applicants are SMS-verified before an application is stored. These
-- fields deliberately avoid licence numbers, SINs and document images.
create table public.driver_applications (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id),
  full_name text not null check (char_length(full_name) between 2 and 80),
  phone text not null,
  email text not null check (char_length(email) between 3 and 254),
  service_area text not null check (char_length(service_area) between 2 and 100),
  engagement_type text not null default 'contractor'
    check (engagement_type in ('contractor', 'employee')),
  vehicle_source text not null default 'own'
    check (vehicle_source in ('own', 'company')),
  vehicle_type text not null check (char_length(vehicle_type) between 2 and 80),
  axle_count smallint not null check (axle_count between 2 and 10),
  registered_gvw_kg integer not null check (registered_gvw_kg between 500 and 100000),
  has_trailer boolean not null default false,
  travels_outside_alberta boolean not null default false,
  licence_class text not null check (licence_class in ('1', '2', '3', '5')),
  licence_expires_on date not null,
  legal_work_attested_at timestamptz not null,
  privacy_consented_at timestamptz not null,
  screening_consented_at timestamptz not null,
  phone_verified_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by uuid references public.operators(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index driver_applications_auth_user_key
  on public.driver_applications(auth_user_id);
create unique index driver_applications_phone_key
  on public.driver_applications(phone);
create index driver_applications_review_queue
  on public.driver_applications(status, created_at);

drop trigger if exists driver_applications_set_updated_at on public.driver_applications;
create trigger driver_applications_set_updated_at
before update on public.driver_applications
for each row execute function public.set_updated_at();

alter table public.driver_applications enable row level security;
revoke all on table public.driver_applications from anon, authenticated;
grant all on table public.driver_applications to service_role;

-- Driver operators authenticate through the SMS-verified Supabase identity,
-- while administrator operators retain passphrase + authenticator MFA.
alter table public.operators
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists phone text,
  add column if not exists driver_application_id uuid references public.driver_applications(id) on delete set null,
  add column if not exists engagement_type text,
  add column if not exists vehicle_source text,
  add column if not exists compliance_expires_on date,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references public.operators(id) on delete set null;

alter table public.operators
  add constraint operators_engagement_type_check
    check (engagement_type is null or engagement_type in ('contractor', 'employee')),
  add constraint operators_vehicle_source_check
    check (vehicle_source is null or vehicle_source in ('own', 'company'));

create unique index operators_auth_user_key
  on public.operators(auth_user_id) where auth_user_id is not null;
create unique index operators_phone_key
  on public.operators(phone) where phone is not null;
create unique index operators_driver_application_key
  on public.operators(driver_application_id) where driver_application_id is not null;
create index operators_available_drivers
  on public.operators(active, compliance_expires_on)
  where role = 'driver';

-- Store verification outcomes and expiry dates, not copies of identity or
-- insurance documents. Owners can later add a separately retained vault if a
-- legal or insurer requirement makes document retention necessary.
create table public.driver_compliance (
  operator_id uuid primary key references public.operators(id) on delete cascade,
  licence_verified_at timestamptz not null,
  licence_expires_on date not null,
  abstract_issued_on date not null,
  abstract_verified_at timestamptz not null,
  commercial_insurance_expires_on date not null,
  vehicle_registration_expires_on date not null,
  wcb_clearance_checked_on date not null,
  edmonton_business_licence_expires_on date not null,
  verified_by uuid not null references public.operators(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists driver_compliance_set_updated_at on public.driver_compliance;
create trigger driver_compliance_set_updated_at
before update on public.driver_compliance
for each row execute function public.set_updated_at();

alter table public.driver_compliance enable row level security;
revoke all on table public.driver_compliance from anon, authenticated;
grant all on table public.driver_compliance to service_role;

-- The same durable outbox carries application decisions without inventing a
-- second delivery worker. Exactly one business target must own each message.
alter table public.sms_outbox
  alter column job_id drop not null,
  alter column customer_id drop not null,
  add column if not exists driver_application_id uuid
    references public.driver_applications(id) on delete cascade;

alter table public.sms_outbox
  add constraint sms_outbox_target_check check (
    (job_id is not null and customer_id is not null and driver_application_id is null)
    or
    (job_id is null and customer_id is null and driver_application_id is not null)
  );

create index sms_outbox_driver_application
  on public.sms_outbox(driver_application_id, created_at desc)
  where driver_application_id is not null;

-- Review and account creation are one database transaction. Parallel approval
-- requests cannot create duplicate drivers or partially approve an applicant.
create or replace function public.review_driver_application(
  p_application_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_rejection_reason text,
  p_abstract_issued_on date,
  p_commercial_insurance_expires_on date,
  p_vehicle_registration_expires_on date,
  p_wcb_clearance_checked_on date,
  p_business_licence_expires_on date,
  p_request_id text,
  p_ip_hash text,
  p_user_agent_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.driver_applications%rowtype;
  driver_id uuid;
  expires_on date;
begin
  if not exists (
    select 1 from public.operators
    where id = p_reviewer_id and role = 'admin' and active
  ) then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  select * into application
  from public.driver_applications
  where id = p_application_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if application.status <> 'pending' then
    return jsonb_build_object('outcome', 'already_reviewed');
  end if;

  if p_decision = 'reject' then
    update public.driver_applications
    set status = 'rejected',
        reviewed_by = p_reviewer_id,
        reviewed_at = clock_timestamp(),
        rejection_reason = nullif(left(trim(coalesce(p_rejection_reason, '')), 500), '')
    where id = p_application_id;

    insert into public.audit_events (
      actor_role, actor_id, action, target_type, target_id,
      request_id, ip_hash, user_agent_hash, metadata
    ) values (
      'operator', p_reviewer_id, 'driver.application.reject',
      'driver_application', p_application_id, left(p_request_id, 160),
      p_ip_hash, p_user_agent_hash, jsonb_build_object('reasonRecorded', p_rejection_reason is not null)
    );
    return jsonb_build_object('outcome', 'rejected', 'phone', application.phone);
  end if;

  if p_decision <> 'approve' then
    return jsonb_build_object('outcome', 'invalid_decision');
  end if;

  if application.licence_expires_on < current_date
    or p_abstract_issued_on < current_date - 60 or p_abstract_issued_on > current_date
    or p_commercial_insurance_expires_on < current_date
    or p_vehicle_registration_expires_on < current_date
    or p_wcb_clearance_checked_on < current_date - 30 or p_wcb_clearance_checked_on > current_date
    or p_business_licence_expires_on < current_date then
    return jsonb_build_object('outcome', 'invalid_compliance');
  end if;

  expires_on := least(
    application.licence_expires_on,
    p_commercial_insurance_expires_on,
    p_vehicle_registration_expires_on,
    p_wcb_clearance_checked_on + 30,
    p_business_licence_expires_on
  );
  -- Reuse the verified Auth identity as the driver operator identifier. Session
  -- rows are role-scoped, so this remains unambiguous even if the same person
  -- has previously used the customer application.
  driver_id := application.auth_user_id;

  begin
    insert into public.operators (
      id, display_name, email, auth_user_id, phone, driver_application_id,
      role, is_owner, active, engagement_type, vehicle_source,
      compliance_expires_on
    ) values (
      driver_id, application.full_name, lower(application.email),
      application.auth_user_id, application.phone, application.id,
      'driver', false, true, application.engagement_type,
      application.vehicle_source, expires_on
    );
  exception when unique_violation then
    return jsonb_build_object('outcome', 'identity_conflict');
  end;

  insert into public.driver_compliance (
    operator_id, licence_verified_at, licence_expires_on,
    abstract_issued_on, abstract_verified_at,
    commercial_insurance_expires_on, vehicle_registration_expires_on,
    wcb_clearance_checked_on, edmonton_business_licence_expires_on,
    verified_by
  ) values (
    driver_id, clock_timestamp(), application.licence_expires_on,
    p_abstract_issued_on, clock_timestamp(),
    p_commercial_insurance_expires_on, p_vehicle_registration_expires_on,
    p_wcb_clearance_checked_on, p_business_licence_expires_on,
    p_reviewer_id
  );

  update public.driver_applications
  set status = 'approved',
      reviewed_by = p_reviewer_id,
      reviewed_at = clock_timestamp(),
      rejection_reason = null
  where id = p_application_id;

  insert into public.audit_events (
    actor_role, actor_id, action, target_type, target_id,
    request_id, ip_hash, user_agent_hash, metadata
  ) values (
    'operator', p_reviewer_id, 'driver.application.approve',
    'driver_application', p_application_id, left(p_request_id, 160),
    p_ip_hash, p_user_agent_hash,
    jsonb_build_object('driverId', driver_id, 'complianceExpiresOn', expires_on)
  );

  return jsonb_build_object(
    'outcome', 'approved',
    'operatorId', driver_id,
    'phone', application.phone,
    'complianceExpiresOn', expires_on
  );
end;
$$;

revoke all on function public.review_driver_application(
  uuid, uuid, text, text, date, date, date, date, date, text, text, text
) from public, anon, authenticated;
grant execute on function public.review_driver_application(
  uuid, uuid, text, text, date, date, date, date, date, text, text, text
) to service_role;

create or replace function public.refresh_driver_compliance(
  p_driver_id uuid,
  p_reviewer_id uuid,
  p_licence_expires_on date,
  p_abstract_issued_on date,
  p_commercial_insurance_expires_on date,
  p_vehicle_registration_expires_on date,
  p_wcb_clearance_checked_on date,
  p_business_licence_expires_on date,
  p_request_id text,
  p_ip_hash text,
  p_user_agent_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expires_on date;
begin
  if not exists (
    select 1 from public.operators
    where id = p_reviewer_id and role = 'admin' and active
  ) then
    return jsonb_build_object('outcome', 'forbidden');
  end if;
  perform 1 from public.operators
  where id = p_driver_id and role = 'driver'
  for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if p_licence_expires_on < current_date
    or p_abstract_issued_on < current_date - 60 or p_abstract_issued_on > current_date
    or p_commercial_insurance_expires_on < current_date
    or p_vehicle_registration_expires_on < current_date
    or p_wcb_clearance_checked_on < current_date - 30 or p_wcb_clearance_checked_on > current_date
    or p_business_licence_expires_on < current_date then
    return jsonb_build_object('outcome', 'invalid_compliance');
  end if;

  expires_on := least(
    p_licence_expires_on,
    p_commercial_insurance_expires_on,
    p_vehicle_registration_expires_on,
    p_wcb_clearance_checked_on + 30,
    p_business_licence_expires_on
  );

  update public.driver_compliance
  set licence_verified_at = clock_timestamp(),
      licence_expires_on = p_licence_expires_on,
      abstract_issued_on = p_abstract_issued_on,
      abstract_verified_at = clock_timestamp(),
      commercial_insurance_expires_on = p_commercial_insurance_expires_on,
      vehicle_registration_expires_on = p_vehicle_registration_expires_on,
      wcb_clearance_checked_on = p_wcb_clearance_checked_on,
      edmonton_business_licence_expires_on = p_business_licence_expires_on,
      verified_by = p_reviewer_id
  where operator_id = p_driver_id;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  update public.operators
  set compliance_expires_on = expires_on
  where id = p_driver_id and role = 'driver';

  insert into public.audit_events (
    actor_role, actor_id, action, target_type, target_id,
    request_id, ip_hash, user_agent_hash, metadata
  ) values (
    'operator', p_reviewer_id, 'driver.compliance.refresh',
    'operator', p_driver_id, left(p_request_id, 160), p_ip_hash,
    p_user_agent_hash, jsonb_build_object('complianceExpiresOn', expires_on)
  );
  return jsonb_build_object('outcome', 'updated', 'complianceExpiresOn', expires_on);
end;
$$;

revoke all on function public.refresh_driver_compliance(
  uuid, uuid, date, date, date, date, date, date, text, text, text
) from public, anon, authenticated;
grant execute on function public.refresh_driver_compliance(
  uuid, uuid, date, date, date, date, date, date, text, text, text
) to service_role;

commit;
