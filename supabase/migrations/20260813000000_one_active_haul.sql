-- Keep the one-active-haul rule authoritative even when two booking requests
-- arrive at the same instant. Existing rows are left untouched; the trigger
-- applies only to new bookings so legacy/demo accounts remain usable.
create or replace function public.prevent_second_active_haul()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  becoming_active boolean := false;
begin
  -- Upload drafts are intentionally ignored: a closed browser must not leave an
  -- invisible row that prevents every future booking.
  if new.upload_complete
    and new.status in ('requested', 'approved', 'quoted', 'accepted', 'in_progress')
  then
    if tg_op = 'INSERT' then
      becoming_active := true;
    else
      becoming_active := not old.upload_complete
        or old.status not in ('requested', 'approved', 'quoted', 'accepted', 'in_progress');
    end if;

    if becoming_active then
      -- Serialize finalization for this customer. Two tabs can prepare uploads,
      -- but only the first completed request may become visible and active.
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(new.customer_id::text, 0)
      );

      if exists (
        select 1
        from public.jobs
        where customer_id = new.customer_id
          and id <> new.id
          and upload_complete
          and status in ('requested', 'approved', 'quoted', 'accepted', 'in_progress')
      )
      then
        raise exception using
          errcode = '23505',
          message = 'A customer may only have one active haul.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists one_active_haul_per_customer on public.jobs;
create trigger one_active_haul_per_customer
before insert or update of upload_complete, status on public.jobs
for each row execute function public.prevent_second_active_haul();
