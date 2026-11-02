-- Hub owners: the people who control the team itself.
--
-- Every active ExCo is still an admin (events, members, payments, budgets...).
-- Only hub owners can change who is on the team and with what role:
-- team memberships, departments (including which one handles finance),
-- door volunteers, and the owner list itself.
--
-- Owners also count as Finance, so a lone VP of Finance always has a second
-- approver for their own claims.
--
-- Owner rights are a grant that owners pass on (not tied to two named people),
-- so handover works when current owners graduate. The last owner can't be
-- removed. Recovery if it ever happens anyway: insert a row into hub_owners
-- from the Supabase SQL editor (see README).

create table public.hub_owners (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now()
);
create index hub_owners_granted_by_idx on public.hub_owners (granted_by);

create or replace function private.is_owner()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$ select exists (select 1 from public.hub_owners where user_id = (select auth.uid())) $$;
revoke execute on function private.is_owner() from public;
grant execute on function private.is_owner() to authenticated;

-- Finance = ExCo in a finance department, or a hub owner.
create or replace function private.is_finance()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select private.is_owner() or exists (
    select 1 from public.team_memberships m
    join public.departments d on d.id = m.department_id
    where m.user_id = (select auth.uid())
      and m.position = 'exco'
      and d.handles_finance
      and private.hk_today() between m.starts_on and m.ends_on
  )
$$;

create or replace function public.my_access()
returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'is_admin', private.is_admin(),
    'is_staff', private.is_staff(),
    'is_team', private.is_team(),
    'is_finance', private.is_finance(),
    'is_owner', private.is_owner(),
    'term_end', private.current_term_end()
  )
$$;

-- ---------------------------------------------------------------------------
-- Team management: owners only
-- ---------------------------------------------------------------------------
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
  if not private.is_owner() then
    raise exception 'Only hub owners can change the team.' using errcode = 'P0001';
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

create or replace function public.end_team_membership(p_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_row public.team_memberships;
  v_today date := private.hk_today();
begin
  if not private.is_owner() then
    raise exception 'Only hub owners can change the team.' using errcode = 'P0001';
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
  if not private.is_owner() then
    raise exception 'Only hub owners can give door access.' using errcode = 'P0001';
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
  if not private.is_owner() then
    raise exception 'Only hub owners can remove door access.' using errcode = 'P0001';
  end if;
  delete from public.door_staff where user_id = p_user_id;
end;
$$;

-- Departments (names, finance flag): owners only.
drop policy if exists departments_admin_insert on public.departments;
drop policy if exists departments_admin_update on public.departments;
drop policy if exists departments_admin_delete on public.departments;
create policy departments_owner_insert on public.departments for insert to authenticated
  with check ((select private.is_owner()));
create policy departments_owner_update on public.departments for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy departments_owner_delete on public.departments for delete to authenticated
  using ((select private.is_owner()));

-- ---------------------------------------------------------------------------
-- The owner list
-- ---------------------------------------------------------------------------
alter table public.hub_owners enable row level security;
-- The team can see who the owners are (so they know who to ask).
create policy hub_owners_select on public.hub_owners for select to authenticated
  using ((select private.is_team()) or (select private.is_owner()));
revoke insert, update, delete on public.hub_owners from authenticated;
revoke all on public.hub_owners from anon;

create or replace function public.grant_owner(p_email text)
returns public.hub_owners
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_user uuid;
  v_row public.hub_owners;
begin
  if not private.is_owner() then
    raise exception 'Only hub owners can add owners.' using errcode = 'P0001';
  end if;
  select id into v_user from public.profiles where email = trim(p_email)::citext;
  if not found then
    raise exception 'No account with that email. They need to log in once first.' using errcode = 'P0001';
  end if;
  insert into public.hub_owners (user_id, granted_by) values (v_user, auth.uid())
  on conflict (user_id) do nothing
  returning * into v_row;
  if not found then
    raise exception 'They''re already an owner.' using errcode = 'P0001';
  end if;
  return v_row;
end;
$$;

create or replace function public.revoke_owner(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not private.is_owner() then
    raise exception 'Only hub owners can remove owners.' using errcode = 'P0001';
  end if;
  perform 1 from public.hub_owners for update;
  if (select count(*) from public.hub_owners) <= 1 then
    raise exception 'There has to be at least one owner. Add the next owner first.' using errcode = 'P0001';
  end if;
  delete from public.hub_owners where user_id = p_user_id;
  if not found then
    raise exception 'They aren''t an owner.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.grant_owner(text) from public, anon;
revoke execute on function public.revoke_owner(uuid) from public, anon;
grant execute on function public.grant_owner(text) to authenticated;
grant execute on function public.revoke_owner(uuid) to authenticated;
