begin;

-- A customer record is usable only after Supabase Auth has verified ownership
-- of its phone number. Existing rows are linked on their first successful OTP.
alter table public.customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
create unique index if not exists customers_auth_user_id_key
  on public.customers(auth_user_id)
  where auth_user_id is not null;

-- Sessions issued by the old name-and-phone-only flow cannot prove phone
-- ownership. Force every existing customer through OTP once after deployment.
delete from public.sessions where role = 'customer';

-- Preserve compatibility with existing 120k-iteration PIN hashes while all new
-- and successfully authenticated operator PINs move to 600k iterations.
alter table public.operators
  add column if not exists pin_iterations integer not null default 120000
  check (pin_iterations between 120000 and 1000000);

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0),
  updated_at timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;
grant all on table public.rate_limits to service_role;

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz;
  current_attempts integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or char_length(p_key) < 32 then
    return false;
  end if;

  current_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits as limits (key, window_start, attempts, updated_at)
  values (p_key, current_window, 1, clock_timestamp())
  on conflict (key) do update
  set attempts = case
        when limits.window_start < current_window then 1
        else limits.attempts + 1
      end,
      window_start = case
        when limits.window_start < current_window then current_window
        else limits.window_start
      end,
      updated_at = clock_timestamp()
  returning attempts into current_attempts;

  return current_attempts <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Every request event is recorded before delivery. The immediate sender gives
-- low latency; the scheduled Netlify function retries transient failures.
create table if not exists public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  job_id uuid not null references public.jobs(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  phone text not null,
  body text not null check (char_length(body) between 1 and 480),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 8),
  provider_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sms_outbox_delivery_queue
  on public.sms_outbox(status, created_at)
  where status <> 'sent';

drop trigger if exists sms_outbox_set_updated_at on public.sms_outbox;
create trigger sms_outbox_set_updated_at
before update on public.sms_outbox
for each row execute function public.set_updated_at();

alter table public.sms_outbox enable row level security;
revoke all on table public.sms_outbox from anon, authenticated;
grant all on table public.sms_outbox to service_role;

commit;
