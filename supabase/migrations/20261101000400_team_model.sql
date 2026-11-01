-- Phase 2: team model.
--
-- Access now comes from team membership per term instead of profiles.role:
--   * Admin   = an active ExCo membership (any department).
--   * Staff   = any active team membership (ExCo or subcommittee), or an
--               unexpired door-volunteer grant. Door volunteers are not on the team.
-- Memberships end on a date, so access lapses at the end of the term without
-- anyone having to remember to remove it.
--
-- Every RLS policy and RPC already goes through private.is_admin() and
-- private.is_staff(), so redefining those two switches the whole app over.
--
-- This migration is additive: profiles.role stays (unused) so the previously
-- deployed app keeps working until the new code is live. A later migration
-- drops it.

-- ---------------------------------------------------------------------------
-- Types and tables
-- ---------------------------------------------------------------------------
create type public.team_position as enum ('exco', 'subcommittee');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete restrict,
  position public.team_position not null,
  title text check (title is null or length(trim(title)) between 1 and 60),
  starts_on date not null,
  ends_on date not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint team_memberships_dates check (ends_on >= starts_on),
  constraint team_memberships_unique unique (user_id, department_id, starts_on)
);
create index team_memberships_user_idx on public.team_memberships (user_id);
create index team_memberships_department_idx on public.team_memberships (department_id);
create index team_memberships_created_by_idx on public.team_memberships (created_by);

create table public.door_staff (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  expires_on date not null,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index door_staff_added_by_idx on public.door_staff (added_by);

-- ---------------------------------------------------------------------------
-- Helpers (private schema: not callable over the REST API)
-- ---------------------------------------------------------------------------
create or replace function private.hk_today()
returns date
language sql stable set search_path = public, extensions
as $$ select (now() at time zone 'Asia/Hong_Kong')::date $$;

-- Default end of a term: 31 August of the current academic year.
create or replace function private.current_term_end()
returns date
language sql stable set search_path = public, extensions
as $$
  select make_date(
    extract(year from private.hk_today())::int + case when extract(month from private.hk_today()) >= 9 then 1 else 0 end,
    8, 31)
$$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from public.team_memberships m
    where m.user_id = (select auth.uid())
      and m.position = 'exco'
      and private.hk_today() between m.starts_on and m.ends_on
  )
$$;

create or replace function private.is_team()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from public.team_memberships m
    where m.user_id = (select auth.uid())
      and private.hk_today() between m.starts_on and m.ends_on
  )
$$;

create or replace function private.is_staff()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select private.is_team() or exists (
    select 1 from public.door_staff d
    where d.user_id = (select auth.uid()) and d.expires_on >= private.hk_today()
  )
$$;

create or replace function private.active_exco_count()
returns integer
language sql stable security definer set search_path = public, extensions
as $$
  select count(distinct user_id)::int from public.team_memberships
  where position = 'exco' and private.hk_today() between starts_on and ends_on
$$;

revoke execute on function private.hk_today() from public;
revoke execute on function private.current_term_end() from public;
revoke execute on function private.is_team() from public;
revoke execute on function private.active_exco_count() from public;
grant execute on function private.hk_today() to authenticated;
grant execute on function private.current_term_end() to authenticated;
grant execute on function private.is_team() to authenticated;
grant execute on function private.active_exco_count() to authenticated;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

-- What the signed-in user may do. The app uses this for navigation and page guards;
-- the database still enforces everything itself.
create or replace function public.my_access()
returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'is_admin', private.is_admin(),
    'is_staff', private.is_staff(),
    'term_end', private.current_term_end()
  )
$$;

create or replace function public.add_team_member(
  p_email text,
  p_department_id uuid,
  p_position public.team_position,
  p_title text default null,
  p_starts_on date default null,
  p_ends_on date default null
)
returns public.team_memberships
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_user uuid;
  v_row public.team_memberships;
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  select id into v_user from public.profiles where email = trim(p_email)::citext;
  if not found then
    raise exception 'No account with that email. They need to log in once first.' using errcode = 'P0001';
  end if;
  if coalesce(p_ends_on, private.current_term_end()) < coalesce(p_starts_on, private.hk_today()) then
    raise exception 'The end date is before the start date.' using errcode = 'P0001';
  end if;

  insert into public.team_memberships (user_id, department_id, position, title, starts_on, ends_on, created_by)
  values (
    v_user, p_department_id, p_position, nullif(trim(p_title), ''),
    coalesce(p_starts_on, private.hk_today()), coalesce(p_ends_on, private.current_term_end()),
    (select auth.uid())
  )
  returning * into v_row;
  return v_row;
exception
  when unique_violation then
    raise exception 'They already have a membership in that department starting on that date.' using errcode = 'P0001';
  when foreign_key_violation then
    raise exception 'That department no longer exists.' using errcode = 'P0001';
end;
$$;

-- Ends a membership today (kept for history). A membership that hasn't started yet
-- is deleted instead. Refuses if it would leave nobody with ExCo access.
create or replace function public.end_team_membership(p_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_row public.team_memberships;
  v_today date := private.hk_today();
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  select * into v_row from public.team_memberships where id = p_id for update;
  if not found then
    raise exception 'Membership not found.' using errcode = 'P0001';
  end if;
  if v_row.ends_on < v_today then
    raise exception 'That membership has already ended.' using errcode = 'P0001';
  end if;

  if v_row.starts_on >= v_today then
    delete from public.team_memberships where id = p_id;
  else
    update public.team_memberships set ends_on = v_today - 1 where id = p_id;
  end if;

  if private.active_exco_count() = 0 then
    raise exception 'That would leave nobody with ExCo access. Add the next ExCo first.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.set_door_staff(p_email text, p_expires_on date)
returns public.door_staff
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_user uuid;
  v_row public.door_staff;
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  if p_expires_on is null or p_expires_on < private.hk_today() then
    raise exception 'Pick an expiry date from today onwards.' using errcode = 'P0001';
  end if;
  select id into v_user from public.profiles where email = trim(p_email)::citext;
  if not found then
    raise exception 'No account with that email. They need to log in once first.' using errcode = 'P0001';
  end if;

  insert into public.door_staff (user_id, expires_on, added_by)
  values (v_user, p_expires_on, (select auth.uid()))
  on conflict (user_id) do update set expires_on = excluded.expires_on, added_by = excluded.added_by
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.remove_door_staff(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  delete from public.door_staff where user_id = p_user_id;
end;
$$;

revoke execute on function public.my_access() from public, anon;
revoke execute on function public.add_team_member(text, uuid, public.team_position, text, date, date) from public, anon;
revoke execute on function public.end_team_membership(uuid) from public, anon;
revoke execute on function public.set_door_staff(text, date) from public, anon;
revoke execute on function public.remove_door_staff(uuid) from public, anon;
grant execute on function public.my_access() to authenticated;
grant execute on function public.add_team_member(text, uuid, public.team_position, text, date, date) to authenticated;
grant execute on function public.end_team_membership(uuid) to authenticated;
grant execute on function public.set_door_staff(text, date) to authenticated;
grant execute on function public.remove_door_staff(uuid) to authenticated;

-- The old role switch no longer grants anything. Fail loudly instead of silently.
create or replace function public.set_user_role(p_email text, p_role public.user_role)
returns public.profiles
language plpgsql security definer set search_path = public, extensions
as $$
begin
  raise exception 'Roles have moved to Admin → Team.' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security. Writes to memberships and door staff go through the RPCs
-- above, so the "keep at least one ExCo" rule can't be bypassed.
-- ---------------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.team_memberships enable row level security;
alter table public.door_staff enable row level security;

create policy departments_select on public.departments for select to authenticated
  using ((select private.is_team()));
create policy departments_admin_insert on public.departments for insert to authenticated
  with check ((select private.is_admin()));
create policy departments_admin_update on public.departments for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy departments_admin_delete on public.departments for delete to authenticated
  using ((select private.is_admin()));

create policy team_memberships_select on public.team_memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy door_staff_select on public.door_staff for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

revoke insert, update, delete on public.team_memberships from authenticated;
revoke insert, update, delete on public.door_staff from authenticated;
revoke all on public.departments, public.team_memberships, public.door_staff from anon;

-- ---------------------------------------------------------------------------
-- Carry existing access over: admins become ExCo in "General" until the end of
-- this term; door staff become door volunteers for 60 days.
-- ---------------------------------------------------------------------------
insert into public.departments (name) values ('General');

insert into public.team_memberships (user_id, department_id, position, starts_on, ends_on)
select p.id, d.id, 'exco', private.hk_today(), private.current_term_end()
from public.profiles p cross join public.departments d
where p.role = 'admin' and d.name = 'General';

insert into public.door_staff (user_id, expires_on)
select id, private.hk_today() + 60 from public.profiles where role = 'staff';
