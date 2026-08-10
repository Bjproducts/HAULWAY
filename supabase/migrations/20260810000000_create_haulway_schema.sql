begin;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  phone text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operators (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  pin_hash text not null,
  pin_salt text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  token_hash text primary key,
  role text not null check (role in ('customer', 'operator')),
  subject_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_subject on public.sessions(role, subject_id);
create index if not exists idx_sessions_expires_at on public.sessions(expires_at);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_type text not null check (service_type in ('junk', 'move')),
  item text not null check (char_length(item) between 1 and 120),
  pickup text not null check (char_length(pickup) between 1 and 180),
  dropoff text,
  notes text not null default '' check (char_length(notes) <= 1000),
  scheduled_date date not null,
  scheduled_time text not null,
  status text not null default 'requested' check (status in ('requested', 'quoted', 'accepted', 'in_progress', 'completed')),
  quote_cents integer check (quote_cents between 100 and 10000000),
  payment_method text check (payment_method in ('interac', 'cash')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  customer_confirmed boolean not null default false,
  operator_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jobs_customer_created on public.jobs(customer_id, created_at desc);
create index if not exists idx_jobs_open_status on public.jobs(status);

create table if not exists public.job_media (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  object_key text not null unique,
  filename text not null,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_job_media_job on public.job_media(job_id, created_at);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  sender text not null check (sender in ('customer', 'operator', 'system')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_job_created on public.messages(job_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.operators enable row level security;
alter table public.sessions enable row level security;
alter table public.jobs enable row level security;
alter table public.job_media enable row level security;
alter table public.messages enable row level security;

revoke all on table public.customers, public.operators, public.sessions, public.jobs, public.job_media, public.messages from anon, authenticated;
grant all on table public.customers, public.operators, public.sessions, public.jobs, public.job_media, public.messages to service_role;

commit;
