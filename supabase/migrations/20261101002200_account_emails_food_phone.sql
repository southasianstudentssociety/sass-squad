-- Account settings: food preference, several login emails per account.
--
--   * profiles.food_preference (optional), editable by the user.
--   * An account can have more than one verified email: its login email plus
--     the email of any linked Google account (auth.identities). Membership
--     and team invites now match ANY of them, so linking a Gmail to a UST
--     account (or the other way round) keeps member prices and team access.
--   * When a Google account is linked, or the login email changes, pending
--     team invites for the new email are claimed, and profiles.email follows
--     the login email.
--   * my_membership(): the signed-in user's membership end date, across all
--     of their emails.

alter table public.profiles
  add column if not exists food_preference text
  check (food_preference is null or food_preference in ('non_veg', 'veg', 'veg_jain', 'vegan'));
grant update (food_preference) on public.profiles to authenticated;

-- Every verified email on an account: the login email and linked identities'.
create or replace function private.user_emails(p_user_id uuid)
returns setof extensions.citext
language sql stable security definer set search_path = public, extensions
as $$
  select lower(u.email)::citext from auth.users u where u.id = p_user_id and u.email is not null
  union
  select lower(i.identity_data ->> 'email')::citext from auth.identities i
   where i.user_id = p_user_id and coalesce(i.identity_data ->> 'email', '') <> ''
$$;
revoke execute on function private.user_emails(uuid) from public, anon;
grant execute on function private.user_emails(uuid) to authenticated;

create or replace function public.current_user_is_member()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select auth.uid() is not null and exists (
    select 1 from public.members m
    where m.valid_until >= private.hk_today()
      and (m.email in (select private.user_emails(auth.uid())) or m.alt_email in (select private.user_emails(auth.uid())))
  )
$$;

create or replace function public.my_membership()
returns date
language sql stable security definer set search_path = public, extensions
as $$
  select max(m.valid_until) from public.members m
   where auth.uid() is not null
     and (m.email in (select private.user_emails(auth.uid())) or m.alt_email in (select private.user_emails(auth.uid())))
$$;
revoke execute on function public.my_membership() from public, anon;
grant execute on function public.my_membership() to authenticated;

-- Team invites match any of the account's emails.
create or replace function private.claim_team_invites(p_user_id uuid)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare v_count integer;
begin
  insert into public.team_memberships (user_id, department_id, position, title, starts_on, ends_on, created_by)
  select distinct on (i.department_id, i.starts_on)
         p_user_id, i.department_id, i.position, i.title, i.starts_on, i.ends_on, i.created_by
  from public.team_invites i
  where i.revoked_at is null
    and (i.email in (select private.user_emails(p_user_id)) or i.alt_email in (select private.user_emails(p_user_id)))
    and not exists (
      select 1 from public.team_memberships m
      where m.user_id = p_user_id and m.department_id = i.department_id
        and m.starts_on <= i.ends_on and m.ends_on >= i.starts_on
    )
  order by i.department_id, i.starts_on, i.created_at
  on conflict (user_id, department_id, starts_on) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function private.claim_team_invites(uuid) from public, anon, authenticated;

-- A Google account was linked (or a new sign-up's identity created).
create or replace function private.on_identity_created()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.profiles where id = new.user_id) then
    perform private.claim_team_invites(new.user_id);
  end if;
  return new;
end;
$$;
revoke execute on function private.on_identity_created() from public, anon, authenticated;
drop trigger if exists identities_claim_team_invites on auth.identities;
create trigger identities_claim_team_invites
  after insert on auth.identities
  for each row execute function private.on_identity_created();

-- The login email changed: keep profiles.email in step, claim invites.
create or replace function private.on_auth_email_changed()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if new.email is not null and new.email is distinct from old.email then
    update public.profiles set email = lower(new.email)::citext where id = new.id;
    perform private.claim_team_invites(new.id);
  end if;
  return new;
end;
$$;
revoke execute on function private.on_auth_email_changed() from public, anon, authenticated;
drop trigger if exists users_email_changed on auth.users;
create trigger users_email_changed
  after update of email on auth.users
  for each row execute function private.on_auth_email_changed();
