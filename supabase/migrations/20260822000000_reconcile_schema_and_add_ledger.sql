begin;

-- Reconcile the two additive migrations that were skipped in production before
-- migration tracking existed. IF NOT EXISTS / CREATE OR REPLACE makes this safe
-- in databases where either migration was already applied.
alter table public.jobs
  add column if not exists customer_rating smallint
    check (customer_rating between 1 and 5),
  add column if not exists rating_skipped boolean not null default false,
  add column if not exists rated_at timestamptz;

create or replace function public.refund_rate_limit(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(p_key) < 32 then
    return;
  end if;

  update public.rate_limits
  set attempts = greatest(attempts - 1, 0),
      updated_at = clock_timestamp()
  where key = p_key;
end;
$$;

revoke all on function public.refund_rate_limit(text) from public, anon, authenticated;
grant execute on function public.refund_rate_limit(text) to service_role;

-- This trigger migration was also skipped in production. Recreate the complete
-- invariant before validating the schema so simultaneous booking finalizations
-- cannot leave a customer with two active hauls.
create or replace function public.prevent_second_active_haul()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  becoming_active boolean := false;
begin
  if new.upload_complete
    and new.status in ('requested', 'approved', 'quoted', 'accepted', 'in_progress')
  then
    if tg_op = 'INSERT' then
      becoming_active := true;
    else
      becoming_active := not old.upload_complete
        or old.status not in ('requested', 'approved', 'quoted', 'accepted', 'in_progress');
    end if;

    if becoming_active then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(new.customer_id::text, 0)
      );

      if exists (
        select 1
        from public.jobs
        where customer_id = new.customer_id
          and id <> new.id
          and upload_complete
          and status in ('requested', 'approved', 'quoted', 'accepted', 'in_progress')
      ) then
        raise exception using
          errcode = '23505',
          message = 'A customer may only have one active haul.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists one_active_haul_per_customer on public.jobs;
create trigger one_active_haul_per_customer
before insert or update of upload_complete, status on public.jobs
for each row execute function public.prevent_second_active_haul();

create table if not exists public.haulway_schema_migrations (
  version text primary key check (version ~ '^[0-9]{14}_[a-z0-9_]+[.]sql$'),
  name text not null check (char_length(name) between 2 and 160),
  applied_at timestamptz not null default clock_timestamp()
);

alter table public.haulway_schema_migrations enable row level security;
revoke all on table public.haulway_schema_migrations from anon, authenticated;
grant select on table public.haulway_schema_migrations to service_role;

-- Never claim historical migrations were applied unless the objects relied on
-- by the launch application are actually present. The whole transaction rolls
-- back and prints the missing objects if reconciliation is incomplete.
do $$
declare
  missing text[] := '{}';
  requirement record;
begin
  for requirement in
    select * from (values
      ('customers', 'auth_user_id'),
      ('jobs', 'upload_complete'),
      ('jobs', 'pickup_building'),
      ('jobs', 'pickup_unit'),
      ('jobs', 'eta'),
      ('jobs', 'driver_arrived_at'),
      ('jobs', 'assigned_operator_id'),
      ('jobs', 'customer_rating'),
      ('jobs', 'rating_skipped'),
      ('jobs', 'rated_at'),
      ('job_media', 'verified_at'),
      ('operators', 'password_hash'),
      ('operators', 'totp_ciphertext'),
      ('operators', 'is_owner'),
      ('sessions', 'last_seen_at'),
      ('sms_outbox', 'delivery_status'),
      ('sms_outbox', 'driver_application_id')
    ) as required_columns(table_name, column_name)
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = requirement.table_name
        and column_name = requirement.column_name
    ) then
      missing := array_append(missing, requirement.table_name || '.' || requirement.column_name);
    end if;
  end loop;

  for requirement in
    select * from (values
      ('public.customers'),
      ('public.jobs'),
      ('public.job_media'),
      ('public.messages'),
      ('public.operators'),
      ('public.sessions'),
      ('public.rate_limits'),
      ('public.sms_outbox'),
      ('public.audit_events'),
      ('public.driver_applications'),
      ('public.driver_compliance'),
      ('public.operator_invitations')
    ) as required_tables(qualified_name)
  loop
    if pg_catalog.to_regclass(requirement.qualified_name) is null then
      missing := array_append(missing, requirement.qualified_name);
    end if;
  end loop;

  if pg_catalog.to_regprocedure('public.consume_rate_limit(text,integer,integer)') is null then
    missing := array_append(missing, 'public.consume_rate_limit(text,integer,integer)');
  end if;
  if pg_catalog.to_regprocedure('public.refund_rate_limit(text)') is null then
    missing := array_append(missing, 'public.refund_rate_limit(text)');
  end if;
  if pg_catalog.to_regprocedure('public.consume_operator_totp(uuid,bigint,text,text,text)') is null then
    missing := array_append(missing, 'public.consume_operator_totp(uuid,bigint,text,text,text)');
  end if;
  if pg_catalog.to_regprocedure('public.accept_operator_invitation(text,uuid,text,text,integer,text,text,bigint,text,text,text)') is null then
    missing := array_append(missing, 'public.accept_operator_invitation');
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'one_active_haul_per_customer' and not tgisinternal
  ) then
    missing := array_append(missing, 'trigger one_active_haul_per_customer');
  end if;
  if not exists (select 1 from storage.buckets as bucket where bucket.id = 'job-media' and bucket.public = false) then
    missing := array_append(missing, 'private storage bucket job-media');
  end if;

  if cardinality(missing) > 0 then
    raise exception 'Schema reconciliation failed; missing: %', array_to_string(missing, ', ');
  end if;
end;
$$;

insert into public.haulway_schema_migrations (version, name) values
  ('20260810000000_create_haulway_schema.sql', 'Initial HAULWAY schema'),
  ('20260810010000_prepare_netlify_storage.sql', 'Netlify storage preparation'),
  ('20260810020000_request_approval_flow.sql', 'Request approval flow'),
  ('20260810030000_building_details.sql', 'Building details'),
  ('20260810040000_unit_numbers.sql', 'Unit numbers'),
  ('20260810050000_driver_eta.sql', 'Driver ETA'),
  ('20260811000000_security_sms.sql', 'Security and SMS outbox'),
  ('20260812000000_customer_ratings.sql', 'Customer ratings'),
  ('20260813000000_one_active_haul.sql', 'One active haul invariant'),
  ('20260813010000_independent_driver_arrival.sql', 'Driver arrival'),
  ('20260819000000_launch_security_hardening.sql', 'Launch security hardening'),
  ('20260819100000_driver_onboarding.sql', 'Dormant driver onboarding model'),
  ('20260819110000_admin_invitations.sql', 'Named administrator invitations'),
  ('20260820000000_rate_limit_refund.sql', 'Rate-limit refund'),
  ('20260822000000_reconcile_schema_and_add_ledger.sql', 'Schema reconciliation and migration ledger')
on conflict (version) do update set name = excluded.name;

insert into public.audit_events (actor_role, action, target_type, metadata)
values (
  'system',
  'database.schema.reconciled',
  'system',
  jsonb_build_object('currentVersion', '20260822000000_reconcile_schema_and_add_ledger.sql', 'trackedMigrations', 15)
);

commit;
