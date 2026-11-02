-- Team prices: a special ticket price per event that only current team
-- members (ExCo and subcommittee) can see and use, and team-only membership
-- offers that ExCo can keep on sale all year.
--
-- TEAM TICKETS
--   * The price lives in its own table, readable only by current team members.
--     (A column on events would be public: anyone can read published events.)
--   * Team members buy on the same event page, through claim_team_ticket().
--     Their place is reserved: capacity, sales dates and members-only don't
--     stop them. Payment is the same FPS flow, with a SASS- reference.
--   * One ticket per person, as before. If a team member already has an
--     unpaid ticket at the normal price, it switches to the team price.
--   * claim_ticket() (every normal purchase) is NOT changed.
--
-- TEAM-ONLY MEMBERSHIP OFFERS
--   * membership_offers.team_only: only current team members see and can
--     apply for the offer; ExCo can leave it open all year.
--
-- Additive: the deployed app keeps working.

-- ---------------------------------------------------------------------------
-- Team ticket prices
-- ---------------------------------------------------------------------------
create table if not exists public.event_team_prices (
  event_id uuid primary key references public.events (id) on delete cascade,
  price_cents integer not null check (price_cents between 0 and 10000000),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists event_team_prices_updated_by_idx on public.event_team_prices (updated_by);
alter table public.event_team_prices enable row level security;
drop policy if exists event_team_prices_select on public.event_team_prices;
create policy event_team_prices_select on public.event_team_prices for select to authenticated
  using ((select private.is_team()));
revoke insert, update, delete on public.event_team_prices from authenticated;
revoke all on public.event_team_prices from anon;

alter table public.tickets add column if not exists team_rate boolean not null default false;

-- ExCo sets (or, with null, removes) an event's team price.
create or replace function public.set_event_team_price(p_event_id uuid, p_price_cents integer)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found.' using errcode = 'P0001';
  end if;
  if p_price_cents is null then
    delete from public.event_team_prices where event_id = p_event_id;
    return;
  end if;
  if p_price_cents < 0 or p_price_cents > 10000000 then
    raise exception 'That team price looks wrong.' using errcode = 'P0001';
  end if;
  insert into public.event_team_prices (event_id, price_cents, updated_by, updated_at)
  values (p_event_id, p_price_cents, auth.uid(), now())
  on conflict (event_id) do update
    set price_cents = excluded.price_cents, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;

-- A current team member gets (or switches to) a team-price ticket.
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

  -- Same lock as claim_ticket, so the two can't race each other.
  select * into v_event from public.events where id = p_event_id and is_published for update;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0001';
  end if;
  if coalesce(v_event.ends_at, v_event.starts_at + interval '12 hours') < now() then
    raise exception 'This event has finished.' using errcode = 'P0001';
  end if;
  select price_cents into v_price from public.event_team_prices where event_id = p_event_id;
  if not found then
    raise exception 'There''s no team price for this event.' using errcode = 'P0001';
  end if;

  select * into v_ticket from public.tickets
   where event_id = p_event_id and user_id = v_uid and status <> 'cancelled';
  if found then
    -- Unpaid at the normal price: switch it to the team price.
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

revoke execute on function public.set_event_team_price(uuid, integer) from public, anon;
revoke execute on function public.claim_team_ticket(uuid) from public, anon;
grant execute on function public.set_event_team_price(uuid, integer) to authenticated;
grant execute on function public.claim_team_ticket(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Team-only membership offers
-- ---------------------------------------------------------------------------
alter table public.membership_offers add column if not exists team_only boolean not null default false;

-- The offers policy is also checked for logged-out visitors, so they need to be
-- able to run is_team() (it returns false for them).
grant execute on function private.is_team() to anon;

drop policy if exists membership_offers_select on public.membership_offers;
create policy membership_offers_select on public.membership_offers for select to anon, authenticated
  using ((is_open and (not team_only or (select private.is_team()))) or (select private.is_admin()));

-- Same as before, plus: team-only offers are for current team members.
create or replace function public.apply_for_membership(p_offer_id uuid, p_student_id text default null)
returns public.membership_applications
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_offer public.membership_offers;
  v_current date;
  v_app public.membership_applications;
begin
  if v_uid is null then
    raise exception 'You need to log in first.' using errcode = 'P0001';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not v_profile.onboarded or v_profile.full_name is null then
    raise exception 'Finish setting up your profile first.' using errcode = 'P0001';
  end if;
  select * into v_offer from public.membership_offers where id = p_offer_id for update;
  if not found or not v_offer.is_open or v_offer.valid_until < private.hk_today()
     or (v_offer.team_only and not private.is_team()) then
    raise exception 'This membership isn''t on sale.' using errcode = 'P0001';
  end if;

  select max(m.valid_until) into v_current from public.members m
   where m.email = v_profile.email or m.alt_email = v_profile.email;
  if v_current is not null and v_current >= v_offer.valid_until then
    raise exception 'You''re already a member until %.', to_char(v_current, 'FMDD Mon YYYY') using errcode = 'P0001';
  end if;

  select * into v_app from public.membership_applications
   where offer_id = p_offer_id and user_id = v_uid and status <> 'cancelled';
  if found then
    return v_app;
  end if;

  insert into public.membership_applications (offer_id, user_id, full_name, email, student_id, price_cents, status, payment_reference, confirmed_at)
  values (p_offer_id, v_uid, v_profile.full_name, v_profile.email, private.clean(p_student_id), v_offer.price_cents,
          case when v_offer.price_cents = 0 then 'confirmed'::public.membership_status else 'awaiting_payment'::public.membership_status end,
          private.gen_membership_reference(),
          case when v_offer.price_cents = 0 then now() end)
  returning * into v_app;

  if v_app.status = 'confirmed' then
    perform private.grant_membership(v_app.id);
    select * into v_app from public.membership_applications where id = v_app.id;
  end if;
  return v_app;
exception when check_violation then
  raise exception 'Student ID is too long.' using errcode = 'P0001';
end;
$$;
