begin;

alter table public.jobs
  add column if not exists customer_rating smallint
    check (customer_rating between 1 and 5),
  add column if not exists rating_skipped boolean not null default false,
  add column if not exists rated_at timestamptz;

commit;
