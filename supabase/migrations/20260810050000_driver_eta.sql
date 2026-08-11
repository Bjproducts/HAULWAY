begin;

-- The driver types an ETA by hand once they take a job; the customer sees it
-- on the tracking screen. Free text so "25 min" and "around 3pm" both work.
alter table public.jobs add column if not exists eta text;

alter table public.jobs drop constraint if exists jobs_eta_len;
alter table public.jobs
  add constraint jobs_eta_len check (eta is null or char_length(eta) between 1 and 40);

commit;
