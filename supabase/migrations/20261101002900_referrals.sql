-- Referrals: who on the subcommittee brought someone in.
--
-- ExCo switch referrals on per event (events.referrals_enabled) and per
-- membership offer (membership_offers.referrals_enabled). While on, people who
-- are NOT on the team can, optionally, pick the subcommittee member who
-- referred them when they get a ticket or buy a membership. ExCo then see
-- who referred the most.
--
-- Referrers come from the team list (team_invites): every current
-- subcommittee member is on it, whether or not they've logged in yet (most
-- haven't). One entry per person (by email), alphabetical.
--
--   * referral_options(): the current subcommittee, {id, name}, A-Z.
--   * claim_ticket_with_meal(event, meal, referrer): as before plus the
--     referrer. claim_ticket itself is still unchanged.
--   * apply_for_membership_with_referral(offer, student_id, referrer):
--     apply_for_membership plus the referrer.
--   * event_referrals(event) / membership_referrals(): ExCo, who referred what.
--
-- Rules: optional; ignored for team members (they don't get referred) and
-- when referrals are off; the first referrer saved on a ticket or
-- application stays (asking again doesn't change it).

alter table public.events add column if not exists referrals_enabled boolean not null default false;
alter table public.membership_offers add column if not exists referrals_enabled boolean not null default false;

alter table public.tickets add column if not exists referrer_invite_id uuid references public.team_invites (id) on delete set null;
create index if not exists tickets_referrer_idx on public.tickets (referrer_invite_id);
alter table public.membership_applications add column if not exists referrer_invite_id uuid references public.team_invites (id) on delete set null;
create index if not exists membership_applications_referrer_idx on public.membership_applications (referrer_invite_id);

-- Current subcommittee on the team list, one row per person.
create or replace function private.current_referrers()
returns table (id uuid, name text, email extensions.citext)
language sql stable security definer set search_path = public, extensions
as $$
  select distinct on (lower(i.email::text)) i.id, trim(i.full_name), i.email
    from public.team_invites i
   where i.revoked_at is null and i.position = 'subcommittee'
     and i.starts_on <= private.hk_today() and i.ends_on >= private.hk_today()
   order by lower(i.email::text), i.created_at
$$;
revoke execute on function private.current_referrers() from public, anon, authenticated;

-- Names only, for the picker. Logged-in people only.
create or replace function public.referral_options()
returns table (id uuid, name text)
language sql stable security definer set search_path = public, extensions
as $$
  select r.id, r.name from private.current_referrers() r
   where auth.uid() is not null
   order by lower(r.name), r.id
$$;
revoke execute on function public.referral_options() from public, anon;
grant execute on function public.referral_options() to authenticated;

-- The referrer to save, or null. Raises only for an id that isn't a current referrer.
create or replace function private.referrer_to_save(p_enabled boolean, p_referrer uuid)
returns uuid
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if p_referrer is null or not coalesce(p_enabled, false) or coalesce(private.is_team(), false) then
    return null;
  end if;
  if not exists (select 1 from private.current_referrers() r where r.id = p_referrer) then
    raise exception 'That referrer isn''t on the subcommittee list. Pick another, or leave it blank.' using errcode = 'P0001';
  end if;
  return p_referrer;
end;
$$;
revoke execute on function private.referrer_to_save(boolean, uuid) from public, anon, authenticated;

-- Tickets: same name, one more (optional) argument; existing two-argument calls still work.
drop function if exists public.claim_ticket_with_meal(uuid, uuid);
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
  if v_ticket.status <> 'cancelled' and (p_meal_option_id is not null or (v_referrer is not null and v_ticket.referrer_invite_id is null)) then
    update public.tickets
       set meal_option_id = coalesce(p_meal_option_id, meal_option_id),
           referrer_invite_id = coalesce(referrer_invite_id, v_referrer)
     where id = v_ticket.id
    returning * into v_ticket;
  end if;
  return v_ticket;
end;
$$;
revoke execute on function public.claim_ticket_with_meal(uuid, uuid, uuid) from public, anon;
grant execute on function public.claim_ticket_with_meal(uuid, uuid, uuid) to authenticated;

create or replace function public.apply_for_membership_with_referral(p_offer_id uuid, p_student_id text default null, p_referrer_id uuid default null)
returns public.membership_applications
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_app public.membership_applications;
  v_referrer uuid;
begin
  v_referrer := private.referrer_to_save((select referrals_enabled from public.membership_offers where id = p_offer_id), p_referrer_id);
  v_app := public.apply_for_membership(p_offer_id, p_student_id);
  if v_referrer is not null and v_app.referrer_invite_id is null and v_app.status <> 'cancelled' then
    update public.membership_applications set referrer_invite_id = v_referrer where id = v_app.id returning * into v_app;
  end if;
  return v_app;
end;
$$;
revoke execute on function public.apply_for_membership_with_referral(uuid, text, uuid) from public, anon;
grant execute on function public.apply_for_membership_with_referral(uuid, text, uuid) to authenticated;

-- ExCo: who referred each ticket of an event.
create or replace function public.event_referrals(p_event_id uuid)
returns table (ticket_id uuid, referrer_id uuid, referrer text)
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  return query
    select t.id, i.id, trim(i.full_name)
      from public.tickets t join public.team_invites i on i.id = t.referrer_invite_id
     where t.event_id = p_event_id;
end;
$$;
revoke execute on function public.event_referrals(uuid) from public, anon;
grant execute on function public.event_referrals(uuid) to authenticated;

-- ExCo: who referred each membership application.
create or replace function public.membership_referrals()
returns table (application_id uuid, referrer_id uuid, referrer text)
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  return query
    select a.id, i.id, trim(i.full_name)
      from public.membership_applications a join public.team_invites i on i.id = a.referrer_invite_id;
end;
$$;
revoke execute on function public.membership_referrals() from public, anon;
grant execute on function public.membership_referrals() to authenticated;
