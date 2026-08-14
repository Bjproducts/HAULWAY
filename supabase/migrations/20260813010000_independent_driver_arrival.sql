begin;

-- Arrival is its own durable event. It cannot be inferred from the booking
-- status because a driver can reach the pickup while a quote is still being
-- reviewed by the customer.
alter table public.jobs
  add column if not exists driver_arrived_at timestamptz;

-- Preserve arrival for jobs created before this column existed.
update public.jobs
set driver_arrived_at = coalesce(driver_arrived_at, updated_at)
where status = 'in_progress';

commit;
