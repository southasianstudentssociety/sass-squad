-- Helping people end up with ONE account for both their UST email and Gmail.
--
-- The member list and team list often know both of a person's emails. That
-- isn't proof the person logging in owns both, so the hub never links logins
-- by itself. Instead:
--   * my_link_suggestion(): the other email the lists know for you that isn't
--     on your account yet, and how to add it (link Google, or change the
--     login email to UST). The app prompts with a one-tap button.
--   * discard_new_duplicate_login(): when someone logs in for the first time
--     (Google or email code) and the lists say that email belongs to someone
--     who already has an account under their other email, the brand-new empty account is deleted (so the Google
--     login can then be linked to the real account) and the masked existing
--     email is returned so the app can say "log in with that, then link".
--     Only for the caller's OWN account, only if it is minutes old, not set
--     up, has a single login method and nothing in it.

-- Other emails the member/team lists pair with this account's emails.
create or replace function private.paired_emails(p_user_id uuid)
returns setof extensions.citext
language sql stable security definer set search_path = public, extensions
as $$
  with mine as (select e from private.user_emails(p_user_id) e),
  pairs as (
    select m.email::citext as a, m.alt_email::citext as b from public.members m where m.alt_email is not null
    union all
    select i.email, i.alt_email from public.team_invites i where i.revoked_at is null and i.alt_email is not null
  )
  select distinct x from (
    select p.b as x from pairs p where p.a in (select e from mine)
    union all
    select p.a from pairs p where p.b in (select e from mine)
  ) s
  where x not in (select e from mine)
$$;
revoke execute on function private.paired_emails(uuid) from public, anon, authenticated;

create or replace function private.mask_email(p_email text)
returns text
language sql immutable set search_path = public, extensions
as $$
  select case when position('@' in p_email) > 1
    then left(p_email, 1) || repeat('•', greatest(least(length(split_part(p_email, '@', 1)) - 1, 6), 2)) || '@' || split_part(p_email, '@', 2)
    else p_email end
$$;
revoke execute on function private.mask_email(text) from public, anon, authenticated;

-- {kind: 'google' | 'login_email', email} or null.
create or replace function public.my_link_suggestion()
returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_login text;
  v_has_google boolean;
  v_other text;
begin
  if v_uid is null then
    return null;
  end if;
  select lower(email) into v_login from auth.users where id = v_uid;
  select exists (select 1 from auth.identities where user_id = v_uid and provider = 'google') into v_has_google;
  -- Their UST email isn't the login email yet: suggest switching to it (keeps any Google login).
  select x::text into v_other from private.paired_emails(v_uid) x where x::text like '%ust.hk' order by 1 limit 1;
  if v_other is not null and v_login not like '%ust.hk' then
    return jsonb_build_object('kind', 'login_email', 'email', v_other);
  end if;
  -- A Gmail (or other non-UST email) they could link with Google.
  if not v_has_google then
    select x::text into v_other from private.paired_emails(v_uid) x where x::text not like '%ust.hk' order by 1 limit 1;
    if v_other is not null then
      return jsonb_build_object('kind', 'google', 'email', v_other);
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.my_link_suggestion() from public, anon;
grant execute on function public.my_link_suggestion() to authenticated;

-- Returns the masked email of the existing account, or null (nothing done).
create or replace function public.discard_new_duplicate_login()
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_user auth.users;
  v_existing text;
begin
  if v_uid is null then
    return null;
  end if;
  select * into v_user from auth.users where id = v_uid;
  if not found or v_user.created_at < now() - interval '15 minutes' then
    return null;
  end if;
  -- Exactly one login method (Google or email code).
  if (select count(*) from auth.identities where user_id = v_uid) <> 1 then
    return null;
  end if;
  -- Not set up, nothing in it.
  if exists (select 1 from public.profiles where id = v_uid and onboarded)
     or exists (select 1 from public.tickets where user_id = v_uid)
     or exists (select 1 from public.claims where claimant_id = v_uid)
     or exists (select 1 from public.membership_applications where user_id = v_uid)
     or exists (select 1 from public.inventory_loans where borrower_id = v_uid)
     or exists (select 1 from public.hub_owners where user_id = v_uid) then
    return null;
  end if;
  -- The lists say this Gmail belongs to someone who already has an account.
  select p.email::text into v_existing
    from public.profiles p
   where p.id <> v_uid and p.email in (select private.paired_emails(v_uid))
   order by p.created_at limit 1;
  if v_existing is null then
    return null;
  end if;

  delete from auth.users where id = v_uid;  -- cascades to its identity, profile and auto-given team places
  return private.mask_email(v_existing);
end;
$$;
revoke execute on function public.discard_new_duplicate_login() from public, anon;
grant execute on function public.discard_new_duplicate_login() to authenticated;
