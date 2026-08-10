begin;

-- The driver now accepts a request before quoting it, and a customer can cancel
-- a request that has not been booked yet. Both need statuses the original
-- lifecycle did not have.
alter table public.jobs drop constraint if exists jobs_status_check;

alter table public.jobs
add constraint jobs_status_check
check (status in ('requested', 'approved', 'quoted', 'accepted', 'in_progress', 'completed', 'cancelled'));

commit;
