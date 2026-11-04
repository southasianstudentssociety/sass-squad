-- Manual "Sold out" switch per event.
--
-- For events whose tickets were sold somewhere else (e.g. a form) and will be
-- imported later, so capacity can't do the job. While events.sold_out is on:
--   * normal online tickets (claim_ticket) are refused with a friendly message;
--   * people who already have a ticket keep it (claim_ticket returns the
--     existing ticket before it ever inserts);
--   * team places (claim_team_ticket, team_rate = true) are still reserved,
--     as decided for capacity;
--   * door tickets (walk_in / comp) and imports by ExCo still work.
--
-- claim_ticket() itself is deliberately not changed. The check is a trigger on
-- tickets that does nothing unless the switch is on.

alter table public.events add column if not exists sold_out boolean not null default false;

create or replace function private.refuse_sold_out_ticket()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.source = 'online' and not coalesce(new.team_rate, false)
     and exists (select 1 from public.events e where e.id = new.event_id and e.sold_out) then
    raise exception 'Sorry, this event is sold out.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.refuse_sold_out_ticket() from public, anon, authenticated;

drop trigger if exists tickets_refuse_sold_out on public.tickets;
create trigger tickets_refuse_sold_out
  before insert on public.tickets
  for each row execute function private.refuse_sold_out_ticket();
