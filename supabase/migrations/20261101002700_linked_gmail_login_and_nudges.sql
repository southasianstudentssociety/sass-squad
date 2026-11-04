-- One account per person, part 2.
--
-- 1. A Gmail already linked to an account (as its "Continue with Google"
--    login) must not become a second account when typed into the login-code
--    box. Supabase only matches a login code to an account's main email, so:
--      * login_email_hint(email): asked before a code is sent. 'google' means
--        "this Gmail is someone's linked Google login": the app sends no code
--        and tells them to tap Continue with Google instead.
--      * discard_duplicate_login(): discard_new_duplicate_login() plus that case
--        (a brand-new, empty account whose email is another account's linked
--        Google login), as a backstop. Returns {existing: masked email,
--        use_google: bool} or null.
-- 2. The blue link banner, for everyone (not only people the lists pair):
--      * my_link_nudge(): my_link_suggestion() plus two general kinds:
--          'add_google': no Google login linked yet;
--          'add_ust':    Google is linked but no HKUST email is on the account.
--        The list-based kinds ('google', 'login_email') still come first.
--      * snooze_link_nudge(forever): X hides it for 14 days; "I'm not at
--        HKUST" / "I don't use Gmail" hides it for good. Saved on the profile,
--        so it holds on every device. Settings ignores the snooze.
--
-- Additive: my_link_suggestion() and discard_new_duplicate_login() are left
-- unchanged so the deployed app keeps working until this code is merged; drop
-- them in a later cleanup migration.

alter table public.profiles add column if not exists link_nudge_snoozed_until timestamptz;

create or replace function private.is_ust_email(p_email text)
returns boolean
language sql immutable set search_path = public, extensions
as $$
  select lower(coalesce(p_email, '')) like '%@connect.ust.hk' or lower(coalesce(p_email, '')) like '%@ust.hk'
$$;
revoke execute on function private.is_ust_email(text) from public, anon, authenticated;

-- 'google' or null. Safe to call logged out; says nothing about whose account it is.
create or replace function public.login_email_hint(p_email text)
returns text
language sql stable security definer set search_path = public, extensions
as $$
  select case
    when exists (select 1 from auth.users u where lower(u.email) = lower(trim(p_email))) then null
    when exists (
      select 1 from auth.identities i
       where i.provider = 'google' and lower(i.identity_data ->> 'email') = lower(trim(p_email))
    ) then 'google'
  end
$$;
revoke execute on function public.login_email_hint(text) from public;
grant execute on function public.login_email_hint(text) to anon, authenticated;

create or replace function public.discard_duplicate_login()
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_user auth.users;
  v_existing text;
  v_linked boolean := false;
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
  -- New: this email is another account's linked Google login.
  select u.email::text into v_existing
    from auth.identities i join auth.users u on u.id = i.user_id
   where i.provider = 'google' and i.user_id <> v_uid
     and lower(i.identity_data ->> 'email') = lower(v_user.email)
   order by u.created_at limit 1;
  v_linked := v_existing is not null;
  -- As before: the lists say this email belongs to someone who already has an account.
  if v_existing is null then
    select p.email::text into v_existing
      from public.profiles p
     where p.id <> v_uid and p.email in (select private.paired_emails(v_uid))
     order by p.created_at limit 1;
  end if;
  if v_existing is null then
    return null;
  end if;

  delete from auth.users where id = v_uid;  -- cascades to its identity, profile and auto-given team places
  return jsonb_build_object('existing', private.mask_email(v_existing), 'use_google', v_linked);
end;
$$;
revoke execute on function public.discard_duplicate_login() from public, anon;
grant execute on function public.discard_duplicate_login() to authenticated;

-- {kind, email} or null. kind: 'google' | 'login_email' (from the lists, with
-- the email) or 'add_google' | 'add_ust' (general, email null).
create or replace function public.my_link_nudge(p_ignore_snooze boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_login text;
  v_has_google boolean;
  v_has_ust boolean;
  v_other text;
begin
  if v_uid is null then
    return null;
  end if;
  if not p_ignore_snooze and exists (
    select 1 from public.profiles where id = v_uid and link_nudge_snoozed_until > now()
  ) then
    return null;
  end if;
  select lower(email) into v_login from auth.users where id = v_uid;
  select exists (select 1 from auth.identities where user_id = v_uid and provider = 'google') into v_has_google;
  select exists (select 1 from private.user_emails(v_uid) e where private.is_ust_email(e::text)) into v_has_ust;

  -- From the lists: their UST email isn't the login email yet (keeps any Google login).
  select x::text into v_other from private.paired_emails(v_uid) x where private.is_ust_email(x::text) order by 1 limit 1;
  if v_other is not null and not private.is_ust_email(v_login) then
    return jsonb_build_object('kind', 'login_email', 'email', v_other);
  end if;
  if not v_has_google then
    -- From the lists: a Gmail they could link with Google.
    select x::text into v_other from private.paired_emails(v_uid) x where not private.is_ust_email(x::text) order by 1 limit 1;
    if v_other is not null then
      return jsonb_build_object('kind', 'google', 'email', v_other);
    end if;
    return jsonb_build_object('kind', 'add_google', 'email', null);
  end if;
  if not v_has_ust then
    return jsonb_build_object('kind', 'add_ust', 'email', null);
  end if;
  return null;
end;
$$;
revoke execute on function public.my_link_nudge(boolean) from public, anon;
grant execute on function public.my_link_nudge(boolean) to authenticated;

-- X: quiet for 14 days. Forever: "I'm not at HKUST" / "I don't use Gmail".
create or replace function public.snooze_link_nudge(p_forever boolean default false)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'You need to log in first.' using errcode = 'P0001';
  end if;
  update public.profiles
     set link_nudge_snoozed_until = case when p_forever then 'infinity'::timestamptz else now() + interval '14 days' end
   where id = auth.uid();
end;
$$;
revoke execute on function public.snooze_link_nudge(boolean) from public, anon;
grant execute on function public.snooze_link_nudge(boolean) to authenticated;
