begin;

-- Give an attempt back when the guarded work never happened, such as an SMS the
-- provider refused. Without it a provider outage spends the customer's hourly
-- quota on messages that were never sent, and they cannot retry once it clears.
create or replace function public.refund_rate_limit(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(p_key) < 32 then
    return;
  end if;

  -- Never drops below zero, and never resurrects an expired window.
  update public.rate_limits
  set attempts = greatest(attempts - 1, 0),
      updated_at = clock_timestamp()
  where key = p_key;
end;
$$;

revoke all on function public.refund_rate_limit(text) from public, anon, authenticated;
grant execute on function public.refund_rate_limit(text) to service_role;

commit;
