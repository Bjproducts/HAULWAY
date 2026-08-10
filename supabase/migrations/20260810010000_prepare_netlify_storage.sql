begin;

alter table public.jobs
add column if not exists upload_complete boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit)
values ('job-media', 'job-media', false, 26214400)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

commit;
