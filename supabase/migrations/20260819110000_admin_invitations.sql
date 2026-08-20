begin;

create table public.operator_invitations (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 80),
  email text not null check (char_length(email) between 3 and 254),
  token_hash text not null unique check (char_length(token_hash) = 64),
  invited_by uuid not null references public.operators(id),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  accepted_operator_id uuid references public.operators(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index operator_invitations_pending_email
  on public.operator_invitations(lower(email))
  where consumed_at is null and revoked_at is null;
create index operator_invitations_expiry
  on public.operator_invitations(expires_at)
  where consumed_at is null and revoked_at is null;

alter table public.operator_invitations enable row level security;
revoke all on table public.operator_invitations from anon, authenticated;
grant all on table public.operator_invitations to service_role;

-- A partner accepts one invitation exactly once. Passphrase and TOTP work is
-- performed in the application server; this transaction owns consumption and
-- account creation so two concurrent submissions cannot both succeed.
create or replace function public.accept_operator_invitation(
  p_invitation_token_hash text,
  p_operator_id uuid,
  p_password_hash text,
  p_password_salt text,
  p_password_iterations integer,
  p_totp_ciphertext text,
  p_totp_iv text,
  p_totp_counter bigint,
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
  invitation public.operator_invitations%rowtype;
begin
  select * into invitation
  from public.operator_invitations
  where token_hash = p_invitation_token_hash
  for update;

  if not found or invitation.consumed_at is not null
    or invitation.revoked_at is not null or invitation.expires_at <= clock_timestamp() then
    return jsonb_build_object('outcome', 'invalid');
  end if;
  if not exists (
    select 1 from public.operators
    where id = invitation.invited_by and role = 'admin' and is_owner and active
  ) then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  begin
    insert into public.operators (
      id, display_name, email, password_hash, password_salt,
      password_iterations, totp_ciphertext, totp_iv, totp_last_counter,
      mfa_enrolled_at, last_login_at, role, is_owner, active
    ) values (
      p_operator_id, invitation.display_name, lower(invitation.email),
      p_password_hash, p_password_salt, p_password_iterations,
      p_totp_ciphertext, p_totp_iv, p_totp_counter,
      clock_timestamp(), clock_timestamp(), 'admin', false, true
    );
  exception when unique_violation then
    return jsonb_build_object('outcome', 'identity_conflict');
  end;

  update public.operator_invitations
  set consumed_at = clock_timestamp(), accepted_operator_id = p_operator_id
  where id = invitation.id;

  insert into public.audit_events (
    actor_role, actor_id, action, target_type, target_id,
    request_id, ip_hash, user_agent_hash, metadata
  ) values (
    'operator', p_operator_id, 'admin.invitation.accept', 'operator',
    p_operator_id, left(p_request_id, 160), p_ip_hash,
    p_user_agent_hash, jsonb_build_object('invitedBy', invitation.invited_by)
  );
  return jsonb_build_object(
    'outcome', 'accepted', 'operatorId', p_operator_id,
    'displayName', invitation.display_name, 'email', lower(invitation.email)
  );
end;
$$;

revoke all on function public.accept_operator_invitation(
  text, uuid, text, text, integer, text, text, bigint, text, text, text
) from public, anon, authenticated;
grant execute on function public.accept_operator_invitation(
  text, uuid, text, text, integer, text, text, bigint, text, text, text
) to service_role;

commit;
