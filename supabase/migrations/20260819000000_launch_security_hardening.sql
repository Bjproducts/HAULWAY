begin;

-- Replace the singleton shared-PIN operator model with named accounts that can
-- carry individual roles, strong passphrases, MFA state and revocation.
alter table public.operators
  alter column singleton drop not null,
  alter column singleton drop default,
  alter column pin_hash drop not null,
  alter column pin_salt drop not null;

update public.operators set singleton = null;

alter table public.operators drop constraint if exists operators_singleton_key;
alter table public.operators drop constraint if exists operators_singleton_check;

alter table public.operators
  add column if not exists display_name text,
  add column if not exists email text,
  add column if not exists password_hash text,
  add column if not exists password_salt text,
  add column if not exists password_iterations integer,
  add column if not exists totp_ciphertext text,
  add column if not exists totp_iv text,
  add column if not exists totp_last_counter bigint,
  add column if not exists mfa_enrolled_at timestamptz,
  add column if not exists role text not null default 'admin',
  add column if not exists is_owner boolean not null default false,
  add column if not exists active boolean not null default true,
  add column if not exists last_login_at timestamptz;

alter table public.operators drop constraint if exists operators_display_name_len;
alter table public.operators drop constraint if exists operators_email_len;
alter table public.operators drop constraint if exists operators_password_iterations_check;
alter table public.operators drop constraint if exists operators_role_check;

alter table public.operators
  add constraint operators_display_name_len check (display_name is null or char_length(display_name) between 2 and 80),
  add constraint operators_email_len check (email is null or char_length(email) between 3 and 254),
  add constraint operators_password_iterations_check check (password_iterations is null or password_iterations between 600000 and 1200000),
  add constraint operators_role_check check (role in ('admin', 'driver'));

create unique index if not exists operators_email_lower_key
  on public.operators (lower(email))
  where email is not null;

-- Bootstrap is allowed to establish exactly one owner. Future administrator or
-- driver accounts may be added without weakening this first-account invariant.
create unique index if not exists operators_single_owner
  on public.operators (is_owner)
  where is_owner;

-- No legacy PIN verifier remains after this release. Keeping unused verifier
-- columns would leave a path for an old deployment to revive shared access.
alter table public.operators
  drop column singleton,
  drop column pin_hash,
  drop column pin_salt,
  drop column pin_iterations;

-- Privileged access is scoped to an assigned driver. Admins remain able to
-- dispatch and support every job, while driver accounts receive only their jobs.
alter table public.jobs
  add column if not exists assigned_operator_id uuid references public.operators(id) on delete set null;

create index if not exists jobs_assigned_operator_status
  on public.jobs(assigned_operator_id, status, created_at desc);

-- Session metadata supports idle expiry, privileged device binding and
-- incident investigation without storing raw IP addresses.
alter table public.sessions
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists ip_hash text,
  add column if not exists user_agent_hash text;

-- The old shared-PIN sessions are not compatible with named MFA accounts.
delete from public.sessions where role = 'operator';

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_role text not null check (actor_role in ('customer', 'operator', 'system')),
  actor_id uuid,
  action text not null check (char_length(action) between 2 and 120),
  target_type text not null check (char_length(target_type) between 2 and 60),
  target_id uuid,
  request_id text check (request_id is null or char_length(request_id) <= 160),
  ip_hash text,
  user_agent_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_target_created
  on public.audit_events(target_type, target_id, created_at desc);
create index if not exists audit_events_actor_created
  on public.audit_events(actor_role, actor_id, created_at desc);

alter table public.audit_events enable row level security;
revoke all on table public.audit_events from anon, authenticated;
grant all on table public.audit_events to service_role;

create or replace function public.prevent_audit_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Audit events are append-only.';
end;
$$;

drop trigger if exists audit_events_append_only on public.audit_events;
create trigger audit_events_append_only
before update or delete on public.audit_events
for each row execute function public.prevent_audit_event_mutation();

-- A TOTP code may be accepted only once. The compare-and-update happens in one
-- transaction so parallel login attempts cannot replay the same authenticator code.
create or replace function public.consume_operator_totp(
  p_operator_id uuid,
  p_counter bigint,
  p_request_id text,
  p_ip_hash text,
  p_user_agent_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted boolean := false;
begin
  update public.operators
  set totp_last_counter = p_counter,
      last_login_at = clock_timestamp()
  where id = p_operator_id
    and active
    and password_hash is not null
    and totp_ciphertext is not null
    and (totp_last_counter is null or totp_last_counter < p_counter);

  accepted := found;

  if accepted then
    insert into public.audit_events (
      actor_role, actor_id, action, target_type, target_id,
      request_id, ip_hash, user_agent_hash, metadata
    ) values (
      'operator', p_operator_id, 'operator.login', 'operator', p_operator_id,
      left(p_request_id, 160), p_ip_hash, p_user_agent_hash,
      jsonb_build_object('mfa', true)
    );
  end if;

  return accepted;
end;
$$;

revoke all on function public.consume_operator_totp(uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.consume_operator_totp(uuid, bigint, text, text, text) to service_role;

-- Uploads remain quarantined until their stored bytes have been checked.
alter table public.job_media
  add column if not exists verified_at timestamptz;

-- Twilio acceptance is not proof of handset delivery. Preserve signed provider
-- callbacks so support can distinguish queued, delivered, failed and undelivered.
alter table public.sms_outbox
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz;

create index if not exists sms_outbox_provider_id
  on public.sms_outbox(provider_id)
  where provider_id is not null;

commit;
