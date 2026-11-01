-- Phase 5: department task tracker.
--
-- Tasks belong to a department and optionally an event, with an owner, due
-- date and status.
--   * Every current team member can see every task (departments coordinate
--     around events).
--   * Team members create and edit tasks in their own departments; ExCo can in
--     any department. Whoever owns a task can always change its status.
--   * Tasks are cancelled, never deleted. Every change is logged.
-- All writes go through the RPCs below; the tables have no write policies.

create type public.task_status as enum ('todo', 'doing', 'blocked', 'done', 'cancelled');
create type public.task_action as enum ('created', 'edited', 'status');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete restrict,
  event_id uuid references public.events (id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 140),
  description text check (description is null or length(description) <= 2000),
  owner_id uuid references public.profiles (id) on delete set null,
  due_on date,
  status public.task_status not null default 'todo',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index tasks_department_idx on public.tasks (department_id, status);
create index tasks_owner_idx on public.tasks (owner_id, status);
create index tasks_event_idx on public.tasks (event_id);
create index tasks_created_by_idx on public.tasks (created_by);

create table public.task_log (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete restrict,
  action public.task_action not null,
  actor_id uuid references public.profiles (id) on delete set null,
  details jsonb,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now()
);
create index task_log_task_idx on public.task_log (task_id, created_at);
create index task_log_actor_idx on public.task_log (actor_id);

-- Is the signed-in user an active member of this department?
create or replace function private.in_department(p_department_id uuid)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from public.team_memberships m
    where m.user_id = (select auth.uid()) and m.department_id = p_department_id
      and private.hk_today() between m.starts_on and m.ends_on
  )
$$;
revoke execute on function private.in_department(uuid) from public;
grant execute on function private.in_department(uuid) to authenticated;

create or replace function private.check_task_fields(p_department_id uuid, p_title text, p_owner_id uuid, p_event_id uuid)
returns void
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if private.clean(p_title) is null then
    raise exception 'Give the task a title.' using errcode = 'P0001';
  end if;
  if length(trim(p_title)) > 140 then
    raise exception 'Keep the title under 140 characters (use the description for details).' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.departments where id = p_department_id) then
    raise exception 'Pick a department.' using errcode = 'P0001';
  end if;
  if not (private.is_admin() or private.in_department(p_department_id)) then
    raise exception 'You can only add or move tasks into your own departments.' using errcode = 'P0001';
  end if;
  if p_owner_id is not null and not exists (
    select 1 from public.team_memberships m
    where m.user_id = p_owner_id and private.hk_today() between m.starts_on and m.ends_on
  ) then
    raise exception 'Tasks can only be assigned to current team members.' using errcode = 'P0001';
  end if;
  if p_event_id is not null and not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'That event no longer exists.' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function private.check_task_fields(uuid, text, uuid, uuid) from public;

create or replace function public.create_task(
  p_department_id uuid,
  p_title text,
  p_description text default null,
  p_event_id uuid default null,
  p_owner_id uuid default null,
  p_due_on date default null
)
returns public.tasks
language plpgsql security definer set search_path = public, extensions
as $$
declare v_task public.tasks;
begin
  if not private.is_team() then
    raise exception 'Team members only.' using errcode = 'P0001';
  end if;
  perform private.check_task_fields(p_department_id, p_title, p_owner_id, p_event_id);
  insert into public.tasks (department_id, event_id, title, description, owner_id, due_on, created_by)
  values (p_department_id, p_event_id, trim(p_title), private.clean(p_description), p_owner_id, p_due_on, auth.uid())
  returning * into v_task;
  insert into public.task_log (task_id, action, actor_id, details)
  values (v_task.id, 'created', auth.uid(), jsonb_build_object('owner_id', p_owner_id, 'due_on', p_due_on));
  return v_task;
exception when check_violation then
  raise exception 'The description is too long (2000 characters max).' using errcode = 'P0001';
end;
$$;

create or replace function public.update_task(
  p_task_id uuid,
  p_department_id uuid,
  p_title text,
  p_description text,
  p_event_id uuid,
  p_owner_id uuid,
  p_due_on date
)
returns public.tasks
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_old public.tasks;
  v_task public.tasks;
  v_changes jsonb := '{}'::jsonb;
begin
  if not private.is_team() then
    raise exception 'Team members only.' using errcode = 'P0001';
  end if;
  select * into v_old from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found.' using errcode = 'P0001';
  end if;
  if not (private.is_admin() or private.in_department(v_old.department_id)) then
    raise exception 'Only that department or ExCo can edit this task.' using errcode = 'P0001';
  end if;
  perform private.check_task_fields(p_department_id, p_title, p_owner_id, p_event_id);

  update public.tasks
     set department_id = p_department_id, title = trim(p_title), description = private.clean(p_description),
         event_id = p_event_id, owner_id = p_owner_id, due_on = p_due_on, updated_at = now()
   where id = p_task_id
  returning * into v_task;

  if v_task.department_id is distinct from v_old.department_id then v_changes := v_changes || jsonb_build_object('department_id', jsonb_build_array(v_old.department_id, v_task.department_id)); end if;
  if v_task.title is distinct from v_old.title then v_changes := v_changes || jsonb_build_object('title', jsonb_build_array(v_old.title, v_task.title)); end if;
  if v_task.description is distinct from v_old.description then v_changes := v_changes || jsonb_build_object('description', true); end if;
  if v_task.event_id is distinct from v_old.event_id then v_changes := v_changes || jsonb_build_object('event_id', jsonb_build_array(v_old.event_id, v_task.event_id)); end if;
  if v_task.owner_id is distinct from v_old.owner_id then v_changes := v_changes || jsonb_build_object('owner_id', jsonb_build_array(v_old.owner_id, v_task.owner_id)); end if;
  if v_task.due_on is distinct from v_old.due_on then v_changes := v_changes || jsonb_build_object('due_on', jsonb_build_array(v_old.due_on, v_task.due_on)); end if;
  if v_changes <> '{}'::jsonb then
    insert into public.task_log (task_id, action, actor_id, details) values (p_task_id, 'edited', auth.uid(), v_changes);
  end if;
  return v_task;
exception when check_violation then
  raise exception 'The description is too long (2000 characters max).' using errcode = 'P0001';
end;
$$;

-- Owner, the department, or ExCo can move a task between statuses.
-- "Blocked" needs a reason so others know what's holding it up.
create or replace function public.set_task_status(p_task_id uuid, p_status public.task_status, p_note text default null)
returns public.tasks
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_task public.tasks;
  v_from public.task_status;
begin
  if not private.is_team() then
    raise exception 'Team members only.' using errcode = 'P0001';
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found.' using errcode = 'P0001';
  end if;
  if not (private.is_admin() or private.in_department(v_task.department_id) or v_task.owner_id = auth.uid()) then
    raise exception 'Only the owner, that department or ExCo can change this task.' using errcode = 'P0001';
  end if;
  if p_status is null or p_status = v_task.status then
    return v_task;
  end if;
  if p_status = 'blocked' and private.clean(p_note) is null then
    raise exception 'Say what it''s blocked on.' using errcode = 'P0001';
  end if;
  v_from := v_task.status;
  update public.tasks
     set status = p_status, updated_at = now(),
         completed_at = case when p_status = 'done' then now() else null end
   where id = p_task_id
  returning * into v_task;
  insert into public.task_log (task_id, action, actor_id, details, note)
  values (p_task_id, 'status', auth.uid(), jsonb_build_object('from', v_from, 'to', p_status), private.clean(p_note));
  return v_task;
end;
$$;

revoke execute on function public.create_task(uuid, text, text, uuid, uuid, date) from public, anon;
revoke execute on function public.update_task(uuid, uuid, text, text, uuid, uuid, date) from public, anon;
revoke execute on function public.set_task_status(uuid, public.task_status, text) from public, anon;
grant execute on function public.create_task(uuid, text, text, uuid, uuid, date) to authenticated;
grant execute on function public.update_task(uuid, uuid, text, text, uuid, uuid, date) to authenticated;
grant execute on function public.set_task_status(uuid, public.task_status, text) to authenticated;

-- Which departments the signed-in user can add tasks to (for the form).
create or replace function public.my_task_departments()
returns setof uuid
language sql stable security definer set search_path = public, extensions
as $$
  select d.id from public.departments d
  where private.is_admin() or private.in_department(d.id)
$$;
revoke execute on function public.my_task_departments() from public, anon;
grant execute on function public.my_task_departments() to authenticated;

alter table public.tasks enable row level security;
alter table public.task_log enable row level security;

create policy tasks_select on public.tasks for select to authenticated
  using ((select private.is_team()));
create policy task_log_select on public.task_log for select to authenticated
  using ((select private.is_team()));

revoke insert, update, delete on public.tasks, public.task_log from authenticated;
revoke all on public.tasks, public.task_log from anon;
