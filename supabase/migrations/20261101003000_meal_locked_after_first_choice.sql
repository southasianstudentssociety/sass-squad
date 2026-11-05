-- Meals: once a ticket has a meal, only ExCo can change it.
--
--   * set_ticket_meal(): the holder can only set a meal that isn't set yet
--     (e.g. a ticket from before meals were switched on), before the event
--     starts. ExCo can change or clear it any time (Admin → event).
--   * claim_ticket_with_meal / claim_team_ticket_with_meal: tapping "Get
--     ticket" again with a different meal no longer overwrites the first one.
-- Same signatures as before, so the deployed app keeps working.

create or replace function public.set_ticket_meal(p_ticket_id uuid, p_meal_option_id uuid)
returns public.tickets
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_ticket public.tickets;
  v_event public.events;
  v_admin boolean := coalesce(private.is_admin(), false);
begin
  if auth.uid() is null then
    raise exception 'You need to log in first.' using errcode = 'P0001';
  end if;
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found or not (v_admin or coalesce(v_ticket.user_id = auth.uid(), false)) then
    raise exception 'Ticket not found.' using errcode = 'P0001';
  end if;
  select * into v_event from public.events where id = v_ticket.event_id;
  if not v_event.meals_enabled then
    raise exception 'This event doesn''t take meal choices.' using errcode = 'P0001';
  end if;
  if v_ticket.status = 'cancelled' then
    raise exception 'This ticket was cancelled.' using errcode = 'P0001';
  end if;
  if not v_admin then
    if v_ticket.meal_option_id is not null then
      raise exception 'Your meal is already set. To change it, contact an ExCo.' using errcode = 'P0001';
    end if;
    if v_event.starts_at <= now() then
      raise exception 'The event has started. Ask an ExCo to add your meal.' using errcode = 'P0001';
    end if;
  end if;
  if p_meal_option_id is null then
    if not v_admin then
      raise exception 'Pick your meal.' using errcode = 'P0001';
    end if;
  elsif not private.valid_meal(v_ticket.event_id, p_meal_option_id) then
    raise exception 'That meal option isn''t available any more. Pick another.' using errcode = 'P0001';
  end if;
  update public.tickets set meal_option_id = p_meal_option_id where id = p_ticket_id returning * into v_ticket;
  return v_ticket;
end;
$$;
revoke execute on function public.set_ticket_meal(uuid, uuid) from public, anon;
grant execute on function public.set_ticket_meal(uuid, uuid) to authenticated;

create or replace function public.claim_ticket_with_meal(p_event_id uuid, p_meal_option_id uuid default null, p_referrer_id uuid default null)
returns public.tickets
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_ticket public.tickets;
  v_referrer uuid;
begin
  perform private.require_meal(p_event_id, p_meal_option_id);
  v_referrer := private.referrer_to_save((select referrals_enabled from public.events where id = p_event_id), p_referrer_id);
  v_ticket := public.claim_ticket(p_event_id);
  if v_ticket.status <> 'cancelled'
     and ((p_meal_option_id is not null and v_ticket.meal_option_id is null) or (v_referrer is not null and v_ticket.referrer_invite_id is null)) then
    update public.tickets
       set meal_option_id = coalesce(meal_option_id, p_meal_option_id),
           referrer_invite_id = coalesce(referrer_invite_id, v_referrer)
     where id = v_ticket.id
    returning * into v_ticket;
  end if;
  return v_ticket;
end;
$$;
revoke execute on function public.claim_ticket_with_meal(uuid, uuid, uuid) from public, anon;
grant execute on function public.claim_ticket_with_meal(uuid, uuid, uuid) to authenticated;

create or replace function public.claim_team_ticket_with_meal(p_event_id uuid, p_meal_option_id uuid default null)
returns public.tickets
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_ticket public.tickets;
begin
  perform private.require_meal(p_event_id, p_meal_option_id);
  v_ticket := public.claim_team_ticket(p_event_id);
  if p_meal_option_id is not null and v_ticket.status <> 'cancelled' and v_ticket.meal_option_id is null then
    update public.tickets set meal_option_id = p_meal_option_id where id = v_ticket.id returning * into v_ticket;
  end if;
  return v_ticket;
end;
$$;
revoke execute on function public.claim_team_ticket_with_meal(uuid, uuid) from public, anon;
grant execute on function public.claim_team_ticket_with_meal(uuid, uuid) to authenticated;
