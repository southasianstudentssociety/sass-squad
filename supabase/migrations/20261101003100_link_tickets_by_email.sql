-- Tickets made for someone before they had an account (ExCo bulk grants,
-- imports, comps) are saved with no user_id and only a holder_email, so the
-- person never sees them in the app and can book a second ticket.
--
-- private.claim_tickets(user) links every such live ticket whose holder_email
-- is one of the account's verified emails (login email or a linked Google
-- account). It runs at the same moments team invites are claimed: account
-- created, Google account linked, login email changed.
--
--   * Only live tickets (not cancelled) with no user_id are touched.
--   * If the person already has a live ticket for that event, the unlinked one
--     is left alone (one live ticket per account per event); ExCo sort it out.
--   * If both their UST and Gmail have an unlinked ticket for the same event,
--     only the oldest is linked, for the same reason.
--
-- The trigger functions from 0022 are redefined to call both claims. A
-- backfill links tickets for accounts that already exist.

create or replace function private.claim_tickets(p_user_id uuid)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare v_count integer;
begin
  with pick as (
    select distinct on (t.event_id) t.id
    from public.tickets t
    where t.user_id is null
      and t.status <> 'cancelled'
      and t.holder_email in (select private.user_emails(p_user_id))
      and not exists (
        select 1 from public.tickets x
        where x.event_id = t.event_id and x.user_id = p_user_id and x.status <> 'cancelled'
      )
    order by t.event_id, t.created_at, t.id
  )
  update public.tickets t set user_id = p_user_id
  from pick where t.id = pick.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function private.claim_tickets(uuid) from public, anon, authenticated;

-- New account.
create or replace function private.on_profile_created()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform private.claim_team_invites(new.id);
  perform private.claim_tickets(new.id);
  return new;
end;
$$;
revoke execute on function private.on_profile_created() from public, anon, authenticated;

-- A Google account was linked (or a new sign-up's identity created).
create or replace function private.on_identity_created()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.profiles where id = new.user_id) then
    perform private.claim_team_invites(new.user_id);
    perform private.claim_tickets(new.user_id);
  end if;
  return new;
end;
$$;
revoke execute on function private.on_identity_created() from public, anon, authenticated;

-- The login email changed.
create or replace function private.on_auth_email_changed()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if new.email is not null and new.email is distinct from old.email then
    update public.profiles set email = lower(new.email)::citext where id = new.id;
    perform private.claim_team_invites(new.id);
    perform private.claim_tickets(new.id);
  end if;
  return new;
end;
$$;
revoke execute on function private.on_auth_email_changed() from public, anon, authenticated;

-- Backfill: existing accounts pick up any unlinked tickets in their emails.
do $$
declare r record;
begin
  for r in
    select distinct p.id from public.profiles p
    join public.tickets t on t.user_id is null and t.status <> 'cancelled' and t.holder_email is not null
    where t.holder_email in (select private.user_emails(p.id))
  loop
    perform private.claim_tickets(r.id);
  end loop;
end $$;
