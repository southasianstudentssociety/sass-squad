-- Team invites, department-scoped tasks, and inventory editing for the team.
--
-- TEAM INVITES
--   Owners can add people to the team before they have ever logged in. An
--   invite holds a name, a UST email and optionally a Gmail, a department,
--   a position and a term. The first time someone logs in with either email,
--   they get the membership automatically (trigger on profiles). People who
--   already have an account get it straight away.
--   Revoking an invite stops it being claimed; memberships already given are
--   ended separately on the Team page, as before.
--
-- TASKS
--   Subcommittee see only their own departments' tasks, plus any task
--   assigned to them. ExCo see every task. (Adding and editing rules are
--   unchanged: your own departments, ExCo any.)
--
-- INVENTORY
--   Every current team member can add items, edit details and change counts.
--   Retiring an item stays ExCo-only.

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 1 and 100),
  email extensions.citext not null,
  alt_email extensions.citext,
  department_id uuid not null references public.departments (id) on delete restrict,
  position public.team_position not null,
  title text check (title is null or length(trim(title)) between 1 and 60),
  starts_on date not null,
  ends_on date not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  constraint team_invites_dates check (ends_on >= starts_on)
);
create unique index if not exists team_invites_live on public.team_invites (email, department_id, starts_on) where revoked_at is null;
create index if not exists team_invites_email_idx on public.team_invites (email) where revoked_at is null;
create index if not exists team_invites_alt_email_idx on public.team_invites (alt_email) where revoked_at is null;
create index if not exists team_invites_department_idx on public.team_invites (department_id);
create index if not exists team_invites_created_by_idx on public.team_invites (created_by);
create index if not exists team_invites_revoked_by_idx on public.team_invites (revoked_by);

alter table public.team_invites enable row level security;
drop policy if exists team_invites_select on public.team_invites;
create policy team_invites_select on public.team_invites for select to authenticated
  using ((select private.is_admin()));
revoke insert, update, delete on public.team_invites from authenticated;
revoke all on public.team_invites from anon;

-- Give a user every live invite that matches their email, unless they already
-- have an overlapping membership in that department. Returns how many.
create or replace function private.claim_team_invites(p_user_id uuid)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_email citext;
  v_count integer;
begin
  select email into v_email from public.profiles where id = p_user_id;
  if v_email is null then
    return 0;
  end if;
  insert into public.team_memberships (user_id, department_id, position, title, starts_on, ends_on, created_by)
  select p_user_id, i.department_id, i.position, i.title, i.starts_on, i.ends_on, i.created_by
  from public.team_invites i
  where i.revoked_at is null
    and (i.email = v_email or i.alt_email = v_email)
    and not exists (
      select 1 from public.team_memberships m
      where m.user_id = p_user_id and m.department_id = i.department_id
        and m.starts_on <= i.ends_on and m.ends_on >= i.starts_on
    )
  on conflict (user_id, department_id, starts_on) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function private.claim_team_invites(uuid) from public, anon, authenticated;

create or replace function private.on_profile_created()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform private.claim_team_invites(new.id);
  return new;
end;
$$;
revoke execute on function private.on_profile_created() from public, anon, authenticated;

drop trigger if exists profiles_claim_team_invites on public.profiles;
create trigger profiles_claim_team_invites
  after insert on public.profiles
  for each row execute function private.on_profile_created();

-- Owners: add someone to the team by email, whether or not they've logged in.
create or replace function public.invite_team_member(
  p_full_name text,
  p_email text,
  p_alt_email text,
  p_department_id uuid,
  p_position public.team_position,
  p_title text default null,
  p_starts_on date default null,
  p_ends_on date default null
)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_invite public.team_invites;
  v_email citext := lower(trim(p_email))::citext;
  v_alt citext := nullif(lower(trim(coalesce(p_alt_email, ''))), '')::citext;
  v_claimed integer := 0;
  v_user uuid;
begin
  if not private.is_owner() then
    raise exception 'Only hub owners can change the team.' using errcode = 'P0001';
  end if;
  if private.clean(p_full_name) is null then
    raise exception 'Enter their name.' using errcode = 'P0001';
  end if;
  if v_email is null or v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email.' using errcode = 'P0001';
  end if;
  if v_alt is not null and v_alt::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'The second email isn''t valid.' using errcode = 'P0001';
  end if;
  if v_alt = v_email then
    v_alt := null;
  end if;
  if coalesce(p_ends_on, private.current_term_end()) < coalesce(p_starts_on, private.hk_today()) then
    raise exception 'The end date is before the start date.' using errcode = 'P0001';
  end if;

  insert into public.team_invites (full_name, email, alt_email, department_id, position, title, starts_on, ends_on, created_by)
  values (trim(p_full_name), v_email, v_alt, p_department_id, p_position, private.clean(p_title),
          coalesce(p_starts_on, private.hk_today()), coalesce(p_ends_on, private.current_term_end()), auth.uid())
  returning * into v_invite;

  for v_user in select id from public.profiles where email in (v_email, v_alt) loop
    v_claimed := v_claimed + private.claim_team_invites(v_user);
  end loop;
  return jsonb_build_object('invite_id', v_invite.id, 'added_now', v_claimed);
exception
  when unique_violation then
    raise exception 'That email is already invited to that department from that date.' using errcode = 'P0001';
  when foreign_key_violation then
    raise exception 'That department no longer exists.' using errcode = 'P0001';
  when check_violation then
    raise exception 'Check the lengths: name up to 100, title up to 60 characters.' using errcode = 'P0001';
end;
$$;

create or replace function public.revoke_team_invite(p_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not private.is_owner() then
    raise exception 'Only hub owners can change the team.' using errcode = 'P0001';
  end if;
  update public.team_invites set revoked_at = now(), revoked_by = auth.uid()
   where id = p_id and revoked_at is null;
  if not found then
    raise exception 'Invite not found, or already revoked.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.invite_team_member(text, text, text, uuid, public.team_position, text, date, date) from public, anon;
revoke execute on function public.revoke_team_invite(uuid) from public, anon;
grant execute on function public.invite_team_member(text, text, text, uuid, public.team_position, text, date, date) to authenticated;
grant execute on function public.revoke_team_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tasks: subcommittee see their own departments' tasks (and ones assigned to them)
-- ---------------------------------------------------------------------------
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (
    (select private.is_admin())
    or ((select private.is_team()) and (private.in_department(department_id) or owner_id = (select auth.uid())))
  );

drop policy if exists task_log_select on public.task_log;
create policy task_log_select on public.task_log for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_log.task_id));

-- ---------------------------------------------------------------------------
-- Inventory: the whole team can add, edit and recount; retiring stays ExCo
-- ---------------------------------------------------------------------------
create or replace function public.create_inventory_item(
  p_name text,
  p_category text,
  p_location text,
  p_condition public.item_condition,
  p_quantity integer,
  p_notes text default null,
  p_keeper_id uuid default null
)
returns public.inventory_items
language plpgsql security definer set search_path = public, extensions
as $$
declare v_item public.inventory_items;
begin
  if not private.is_team() then
    raise exception 'Team members only.' using errcode = 'P0001';
  end if;
  if private.clean(p_name) is null then
    raise exception 'Give the item a name.' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'Quantity can''t be negative.' using errcode = 'P0001';
  end if;
  if p_keeper_id is not null and not private.is_current_team_member(p_keeper_id) then
    raise exception 'The person in charge must be a current team member.' using errcode = 'P0001';
  end if;
  insert into public.inventory_items (name, category, location, condition, quantity, notes, keeper_id)
  values (private.clean(p_name), private.clean(p_category), private.clean(p_location),
          coalesce(p_condition, 'good'), p_quantity, private.clean(p_notes), p_keeper_id)
  returning * into v_item;
  insert into public.inventory_log (item_id, action, quantity_delta, actor_id, details)
  values (v_item.id, 'created', p_quantity, auth.uid(),
          case when p_keeper_id is null then null else jsonb_build_object('keeper_id', p_keeper_id) end);
  return v_item;
exception when check_violation then
  raise exception 'Check the lengths: name up to 100, category 50, location 200, notes 1000 characters.' using errcode = 'P0001';
end;
$$;

create or replace function public.update_inventory_item(
  p_item_id uuid,
  p_name text,
  p_category text,
  p_location text,
  p_condition public.item_condition,
  p_notes text
)
returns public.inventory_items
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_old public.inventory_items;
  v_item public.inventory_items;
  v_changes jsonb := '{}'::jsonb;
begin
  if not private.is_team() then
    raise exception 'Team members only.' using errcode = 'P0001';
  end if;
  select * into v_old from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found.' using errcode = 'P0001';
  end if;
  if private.clean(p_name) is null then
    raise exception 'Give the item a name.' using errcode = 'P0001';
  end if;

  update public.inventory_items
     set name = private.clean(p_name), category = private.clean(p_category), location = private.clean(p_location),
         condition = coalesce(p_condition, condition), notes = private.clean(p_notes), updated_at = now()
   where id = p_item_id
  returning * into v_item;

  if v_item.name is distinct from v_old.name then v_changes := v_changes || jsonb_build_object('name', jsonb_build_array(v_old.name, v_item.name)); end if;
  if v_item.category is distinct from v_old.category then v_changes := v_changes || jsonb_build_object('category', jsonb_build_array(v_old.category, v_item.category)); end if;
  if v_item.location is distinct from v_old.location then v_changes := v_changes || jsonb_build_object('location', jsonb_build_array(v_old.location, v_item.location)); end if;
  if v_item.condition is distinct from v_old.condition then v_changes := v_changes || jsonb_build_object('condition', jsonb_build_array(v_old.condition, v_item.condition)); end if;
  if v_item.notes is distinct from v_old.notes then v_changes := v_changes || jsonb_build_object('notes', jsonb_build_array(v_old.notes, v_item.notes)); end if;

  if v_changes <> '{}'::jsonb then
    insert into public.inventory_log (item_id, action, actor_id, details) values (p_item_id, 'edited', auth.uid(), v_changes);
  end if;
  return v_item;
exception when check_violation then
  raise exception 'Check the lengths: name up to 100, category 50, location 200, notes 1000 characters.' using errcode = 'P0001';
end;
$$;

create or replace function public.adjust_inventory(p_item_id uuid, p_delta integer, p_reason text)
returns public.inventory_items
language plpgsql security definer set search_path = public, extensions
as $$
declare v_item public.inventory_items;
begin
  if not private.is_team() then
    raise exception 'Team members only.' using errcode = 'P0001';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'Enter how many to add or remove.' using errcode = 'P0001';
  end if;
  if private.clean(p_reason) is null then
    raise exception 'Say why the count changed (e.g. bought 20 more, 5 broke).' using errcode = 'P0001';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found.' using errcode = 'P0001';
  end if;
  if v_item.retired_at is not null then
    raise exception 'This item is retired.' using errcode = 'P0001';
  end if;
  if v_item.quantity + p_delta < private.on_loan(p_item_id) then
    raise exception 'That leaves fewer than are currently checked out (%). Record the returns first.', private.on_loan(p_item_id) using errcode = 'P0001';
  end if;

  update public.inventory_items set quantity = quantity + p_delta, updated_at = now() where id = p_item_id returning * into v_item;
  insert into public.inventory_log (item_id, action, quantity_delta, actor_id, note)
  values (p_item_id, 'adjusted', p_delta, auth.uid(), private.clean(p_reason));
  return v_item;
end;
$$;
