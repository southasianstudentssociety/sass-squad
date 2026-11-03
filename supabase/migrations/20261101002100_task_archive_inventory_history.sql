-- Task archive; inventory handover dates, location moves, last-updated.
--
-- TASKS
--   A Done or Cancelled task can be archived by anyone who could change its
--   status (its owner, its department, ExCo). Archived tasks leave the board,
--   table and calendar but stay in the Archive view and can be unarchived.
--   Both are logged in the task's history. Nothing is ever deleted.
--
-- INVENTORY
--   * transfer_inventory_item takes the date the handover happened, so late
--     entries are dated correctly in the history (defaults to today).
--   * set_inventory_location: any team member can change where an item is
--     kept, with an optional note; logged like other edits.
--   * inventory_overview gains last_activity_at: the latest of the item's
--     own updates and anything in its history (loans, returns, transfers...).
-- FIX: set_task_status let any team member change an UNASSIGNED task in
--   another department (owner_id = auth.uid() is NULL there, and NOT(... OR
--   NULL) is NULL, so the check didn't fire). Now coalesced. Moving an
--   archived task back to an open status also unarchives it.
-- Additive: the deployed app keeps working.

alter type public.task_action add value if not exists 'archived';
alter type public.task_action add value if not exists 'unarchived';

alter table public.tasks
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles (id) on delete set null;
create index if not exists tasks_archived_by_idx on public.tasks (archived_by);
create index if not exists tasks_not_archived_idx on public.tasks (department_id, status) where archived_at is null;

create or replace function public.set_task_archived(p_task_id uuid, p_archived boolean)
returns public.tasks
language plpgsql security definer set search_path = public, extensions
as $$
declare v_task public.tasks;
begin
  if not private.is_team() then
    raise exception 'Team members only.' using errcode = 'P0001';
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found.' using errcode = 'P0001';
  end if;
  if not (private.is_admin() or private.in_department(v_task.department_id) or coalesce(v_task.owner_id = auth.uid(), false)) then
    raise exception 'Only the owner, that department or ExCo can archive this task.' using errcode = 'P0001';
  end if;
  if p_archived then
    if v_task.archived_at is not null then
      raise exception 'Already archived.' using errcode = 'P0001';
    end if;
    if v_task.status not in ('done', 'cancelled') then
      raise exception 'Only Done or Cancelled tasks can be archived.' using errcode = 'P0001';
    end if;
    update public.tasks set archived_at = now(), archived_by = auth.uid() where id = p_task_id returning * into v_task;
    insert into public.task_log (task_id, action, actor_id) values (p_task_id, 'archived', auth.uid());
  else
    if v_task.archived_at is null then
      raise exception 'That task isn''t archived.' using errcode = 'P0001';
    end if;
    update public.tasks set archived_at = null, archived_by = null where id = p_task_id returning * into v_task;
    insert into public.task_log (task_id, action, actor_id) values (p_task_id, 'unarchived', auth.uid());
  end if;
  return v_task;
end;
$$;
revoke execute on function public.set_task_archived(uuid, boolean) from public, anon;
grant execute on function public.set_task_archived(uuid, boolean) to authenticated;

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
  if not (private.is_admin() or private.in_department(v_task.department_id) or coalesce(v_task.owner_id = auth.uid(), false)) then
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
  -- Reopened while archived: bring it back.
  if v_task.archived_at is not null and p_status not in ('done', 'cancelled') then
    update public.tasks set archived_at = null, archived_by = null where id = p_task_id returning * into v_task;
    insert into public.task_log (task_id, action, actor_id) values (p_task_id, 'unarchived', auth.uid());
  end if;
  return v_task;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inventory: dated handovers
-- ---------------------------------------------------------------------------
drop function if exists public.transfer_inventory_item(uuid, uuid, text);
create or replace function public.transfer_inventory_item(p_item_id uuid, p_keeper_id uuid, p_note text default null, p_handed_on date default null)
returns public.inventory_items
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_item public.inventory_items;
  v_from uuid;
  v_on date := coalesce(p_handed_on, private.hk_today());
begin
  if not private.is_team() then
    raise exception 'Team members only.' using errcode = 'P0001';
  end if;
  if v_on > private.hk_today() then
    raise exception 'The handover date can''t be in the future.' using errcode = 'P0001';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found.' using errcode = 'P0001';
  end if;
  if v_item.retired_at is not null then
    raise exception 'This item is retired.' using errcode = 'P0001';
  end if;
  if v_on < private.hk_date(v_item.created_at) then
    raise exception 'The handover date is before the item was added.' using errcode = 'P0001';
  end if;
  if not (private.is_admin() or coalesce(v_item.keeper_id = auth.uid(), false)) then
    raise exception 'Only the person in charge of this item, or an ExCo, can hand it on.' using errcode = 'P0001';
  end if;
  if p_keeper_id is not distinct from v_item.keeper_id then
    raise exception 'They''re already in charge of it.' using errcode = 'P0001';
  end if;
  if p_keeper_id is not null and not private.is_current_team_member(p_keeper_id) then
    raise exception 'The person in charge must be a current team member.' using errcode = 'P0001';
  end if;

  v_from := v_item.keeper_id;
  update public.inventory_items set keeper_id = p_keeper_id, updated_at = now()
   where id = p_item_id returning * into v_item;
  insert into public.inventory_log (item_id, action, actor_id, note, details)
  values (p_item_id, 'transferred', auth.uid(), private.clean(p_note),
          jsonb_build_object('from', v_from, 'to', p_keeper_id, 'on', v_on));
  return v_item;
end;
$$;
revoke execute on function public.transfer_inventory_item(uuid, uuid, text, date) from public, anon;
grant execute on function public.transfer_inventory_item(uuid, uuid, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Inventory: move an item (any team member)
-- ---------------------------------------------------------------------------
create or replace function public.set_inventory_location(p_item_id uuid, p_location text, p_note text default null)
returns public.inventory_items
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_old public.inventory_items;
  v_item public.inventory_items;
begin
  if not private.is_team() then
    raise exception 'Team members only.' using errcode = 'P0001';
  end if;
  select * into v_old from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found.' using errcode = 'P0001';
  end if;
  if v_old.retired_at is not null then
    raise exception 'This item is retired.' using errcode = 'P0001';
  end if;
  if private.clean(p_location) is not distinct from v_old.location then
    raise exception 'That''s already where it''s kept.' using errcode = 'P0001';
  end if;
  update public.inventory_items set location = private.clean(p_location), updated_at = now()
   where id = p_item_id returning * into v_item;
  insert into public.inventory_log (item_id, action, actor_id, note, details)
  values (p_item_id, 'edited', auth.uid(), private.clean(p_note),
          jsonb_build_object('location', jsonb_build_array(v_old.location, v_item.location)));
  return v_item;
exception when check_violation then
  raise exception 'Keep the location under 200 characters.' using errcode = 'P0001';
end;
$$;
revoke execute on function public.set_inventory_location(uuid, text, text) from public, anon;
grant execute on function public.set_inventory_location(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Inventory: last activity per item
-- ---------------------------------------------------------------------------
drop view if exists public.inventory_overview;
create view public.inventory_overview
with (security_invoker = true) as
select i.*,
       coalesce(l.out, 0)::int as on_loan,
       (i.quantity - coalesce(l.out, 0))::int as available,
       greatest(i.updated_at, g.last_log) as last_activity_at
from public.inventory_items i
left join (
  select item_id, sum(quantity) as out from public.inventory_loans where returned_at is null group by item_id
) l on l.item_id = i.id
left join (
  select item_id, max(created_at) as last_log from public.inventory_log group by item_id
) g on g.item_id = i.id;
revoke all on public.inventory_overview from anon;
grant select on public.inventory_overview to authenticated;
