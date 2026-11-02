-- ExCo tickets are free for every event.
--
-- claim_team_ticket() now prices by position:
--   * Current ExCo: free, for every event, whether or not it has a team price.
--   * Current subcommittee: the event's team price (if it has one).
-- Everything else is as in 0016: the place is reserved (capacity, sales dates
-- and members-only don't apply), one ticket per person, and an unpaid
-- normal-price ticket switches to the team / ExCo price.
-- ExCo can still read the team price (it's what subcommittee pay).

create or replace function public.claim_team_ticket(p_event_id uuid)
returns public.tickets
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_event public.events;
  v_price integer;
  v_ticket public.tickets;
begin
  if v_uid is null then
    raise exception 'You need to log in first.' using errcode = 'P0001';
  end if;
  if not private.is_team() then
    raise exception 'Team prices are for current team members only.' using errcode = 'P0001';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not v_profile.onboarded or v_profile.full_name is null then
    raise exception 'Finish setting up your profile first.' using errcode = 'P0001';
  end if;

  select * into v_event from public.events where id = p_event_id and is_published for update;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0001';
  end if;
  if coalesce(v_event.ends_at, v_event.starts_at + interval '12 hours') < now() then
    raise exception 'This event has finished.' using errcode = 'P0001';
  end if;

  if private.is_admin() then
    v_price := 0;  -- ExCo: always free
  else
    select price_cents into v_price from public.event_team_prices where event_id = p_event_id;
    if not found then
      raise exception 'There''s no team price for this event.' using errcode = 'P0001';
    end if;
  end if;

  select * into v_ticket from public.tickets
   where event_id = p_event_id and user_id = v_uid and status <> 'cancelled';
  if found then
    if v_ticket.status = 'awaiting_payment' and not v_ticket.team_rate then
      update public.tickets
         set price_cents = v_price, team_rate = true,
             status = case when v_price = 0 then 'confirmed'::public.ticket_status else status end,
             confirmed_at = case when v_price = 0 then now() else confirmed_at end
       where id = v_ticket.id
      returning * into v_ticket;
    end if;
    return v_ticket;
  end if;

  insert into public.tickets (
    event_id, user_id, holder_name, holder_email, is_member, price_cents,
    status, source, payment_reference, confirmed_at, team_rate
  ) values (
    p_event_id, v_uid, v_profile.full_name, v_profile.email, public.current_user_is_member(), v_price,
    case when v_price = 0 then 'confirmed'::public.ticket_status else 'awaiting_payment'::public.ticket_status end,
    'online', public.gen_payment_reference(),
    case when v_price = 0 then now() else null end,
    true
  )
  returning * into v_ticket;
  return v_ticket;
end;
$$;
