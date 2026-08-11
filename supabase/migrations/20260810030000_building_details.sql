begin;

-- Building type, stairs and fragility drive the quote, so they are real columns
-- rather than free text buried in the notes. A small move captures them for both
-- ends of the trip; junk removal only has a pickup.
alter table public.jobs
  add column if not exists pickup_building text,
  add column if not exists pickup_stairs text,
  add column if not exists dropoff_building text,
  add column if not exists dropoff_stairs text,
  add column if not exists fragile boolean;

alter table public.jobs drop constraint if exists jobs_pickup_building_len;
alter table public.jobs drop constraint if exists jobs_pickup_stairs_len;
alter table public.jobs drop constraint if exists jobs_dropoff_building_len;
alter table public.jobs drop constraint if exists jobs_dropoff_stairs_len;

alter table public.jobs
  add constraint jobs_pickup_building_len check (pickup_building is null or char_length(pickup_building) between 1 and 40),
  add constraint jobs_pickup_stairs_len check (pickup_stairs is null or char_length(pickup_stairs) between 1 and 40),
  add constraint jobs_dropoff_building_len check (dropoff_building is null or char_length(dropoff_building) between 1 and 40),
  add constraint jobs_dropoff_stairs_len check (dropoff_stairs is null or char_length(dropoff_stairs) between 1 and 40);

commit;
