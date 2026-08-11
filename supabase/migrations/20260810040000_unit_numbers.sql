begin;

-- An apartment needs a unit number for the driver to actually find the door.
-- Captured per location, so a small move can differ at each end.
alter table public.jobs
  add column if not exists pickup_unit text,
  add column if not exists dropoff_unit text;

alter table public.jobs drop constraint if exists jobs_pickup_unit_len;
alter table public.jobs drop constraint if exists jobs_dropoff_unit_len;

alter table public.jobs
  add constraint jobs_pickup_unit_len check (pickup_unit is null or char_length(pickup_unit) between 1 and 20),
  add constraint jobs_dropoff_unit_len check (dropoff_unit is null or char_length(dropoff_unit) between 1 and 20);

commit;
