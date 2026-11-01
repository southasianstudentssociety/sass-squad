-- 1. Two-step check-in: look first, admit on swipe.
--    preview_ticket runs every check_in rule but changes nothing, so door staff
--    see a result that stays put until they swipe to admit (check_in by ticket id).
--    check_in's atomic UPDATE ... WHERE checked_in_at IS NULL still decides the
--    winner if two scanners preview the same ticket: the second swipe gets
--    "already_used".
--    Rejections are logged here (they're final); admissions are logged by check_in.
--
-- 2. Task kinds and times for the calendar: a task can be a plain task, a
--    scheduled upload (social post) or an errand (buy / pick up), with an
--    optional time of day.

create or replace function public.preview_ticket(
  p_event_id uuid,
  p_qr text default null,
  p_ticket_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_token text;
  v_ticket public.tickets;
  v_result text;
begin
  if not private.is_staff() then
    raise exception 'Staff only.' using errcode = 'P0001';
  end if;
  if not private.can_work_event(p_event_id) then
    raise exception 'Scanning for this event opens 24 hours before it starts.' using errcode = 'P0001';
  end if;

  if p_qr is not null then
    v_token := lower(trim(regexp_replace(p_qr, '^SASS1:', '', 'i')));
  end if;

  select * into v_ticket from public.tickets t
   where (v_token is not null and t.qr_token = v_token) or (p_ticket_id is not null and t.id = p_ticket_id);

  if not found then
    v_result := 'invalid';
  elsif v_ticket.event_id <> p_event_id then
    v_result := 'wrong_event';
  elsif v_ticket.status = 'cancelled' then
    v_result := 'cancelled';
  elsif v_ticket.status = 'awaiting_payment' then
    v_result := 'unpaid';
  elsif v_ticket.checked_in_at is not null then
    v_result := 'already_used';
  else
    v_result := 'valid';
  end if;

  if v_result <> 'valid' then
    insert into public.scan_logs (event_id, ticket_id, scanned_by, result)
    values (p_event_id, v_ticket.id, auth.uid(), v_result);
  end if;

  if v_result in ('wrong_event', 'invalid') then
    return jsonb_build_object('result', v_result, 'ticket', null);
  end if;

  return jsonb_build_object(
    'result', v_result,
    'ticket', jsonb_build_object(
      'id', v_ticket.id,
      'holder_name', v_ticket.holder_name,
      'holder_email', v_ticket.holder_email,
      'is_member', v_ticket.is_member,
      'member_now', public.is_member_email(v_ticket.holder_email),
      'price_cents', v_ticket.price_cents,
      'status', v_ticket.status,
      'source', v_ticket.source,
      'payment_reference', v_ticket.payment_reference,
      'checked_in_at', v_ticket.checked_in_at
    )
  );
end;
$$;
revoke execute on function public.preview_ticket(uuid, text, uuid) from public, anon;
grant execute on function public.preview_ticket(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Task kinds and optional time of day
-- ---------------------------------------------------------------------------
create type public.task_kind as enum ('task', 'upload', 'errand');
alter table public.tasks add column kind public.task_kind not null default 'task';
alter table public.tasks add column due_time time;
create index tasks_due_idx on public.tasks (due_on) where due_on is not null;

-- Replace (not overload) so calls without the new arguments stay unambiguous.
drop function if exists public.create_task(uuid, text, text, uuid, uuid, date);
drop function if exists public.update_task(uuid, uuid, text, text, uuid, uuid, date);

create or replace function public.create_task(
  p_department_id uuid,
  p_title text,
  p_description text default null,
  p_event_id uuid default null,
  p_owner_id uuid default null,
  p_due_on date default null,
  p_kind public.task_kind default 'task',
  p_due_time time default null
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
  if p_due_time is not null and p_due_on is null then
    raise exception 'Pick a date for that time.' using errcode = 'P0001';
  end if;
  insert into public.tasks (department_id, event_id, title, description, owner_id, due_on, due_time, kind, created_by)
  values (p_department_id, p_event_id, trim(p_title), private.clean(p_description), p_owner_id, p_due_on, p_due_time,
          coalesce(p_kind, 'task'), auth.uid())
  returning * into v_task;
  insert into public.task_log (task_id, action, actor_id, details)
  values (v_task.id, 'created', auth.uid(), jsonb_build_object('owner_id', p_owner_id, 'due_on', p_due_on, 'kind', v_task.kind));
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
  p_due_on date,
  p_kind public.task_kind default null,
  p_due_time time default null
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
  if p_due_time is not null and p_due_on is null then
    raise exception 'Pick a date for that time.' using errcode = 'P0001';
  end if;

  update public.tasks
     set department_id = p_department_id, title = trim(p_title), description = private.clean(p_description),
         event_id = p_event_id, owner_id = p_owner_id, due_on = p_due_on, due_time = p_due_time,
         kind = coalesce(p_kind, kind), updated_at = now()
   where id = p_task_id
  returning * into v_task;

  if v_task.department_id is distinct from v_old.department_id then v_changes := v_changes || jsonb_build_object('department_id', jsonb_build_array(v_old.department_id, v_task.department_id)); end if;
  if v_task.title is distinct from v_old.title then v_changes := v_changes || jsonb_build_object('title', jsonb_build_array(v_old.title, v_task.title)); end if;
  if v_task.description is distinct from v_old.description then v_changes := v_changes || jsonb_build_object('description', true); end if;
  if v_task.event_id is distinct from v_old.event_id then v_changes := v_changes || jsonb_build_object('event_id', jsonb_build_array(v_old.event_id, v_task.event_id)); end if;
  if v_task.owner_id is distinct from v_old.owner_id then v_changes := v_changes || jsonb_build_object('owner_id', jsonb_build_array(v_old.owner_id, v_task.owner_id)); end if;
  if v_task.due_on is distinct from v_old.due_on then v_changes := v_changes || jsonb_build_object('due_on', jsonb_build_array(v_old.due_on, v_task.due_on)); end if;
  if v_task.due_time is distinct from v_old.due_time then v_changes := v_changes || jsonb_build_object('due_time', jsonb_build_array(v_old.due_time, v_task.due_time)); end if;
  if v_task.kind is distinct from v_old.kind then v_changes := v_changes || jsonb_build_object('kind', jsonb_build_array(v_old.kind, v_task.kind)); end if;
  if v_changes <> '{}'::jsonb then
    insert into public.task_log (task_id, action, actor_id, details) values (p_task_id, 'edited', auth.uid(), v_changes);
  end if;
  return v_task;
exception when check_violation then
  raise exception 'The description is too long (2000 characters max).' using errcode = 'P0001';
end;
$$;

revoke execute on function public.create_task(uuid, text, text, uuid, uuid, date, public.task_kind, time) from public, anon;
revoke execute on function public.update_task(uuid, uuid, text, text, uuid, uuid, date, public.task_kind, time) from public, anon;
grant execute on function public.create_task(uuid, text, text, uuid, uuid, date, public.task_kind, time) to authenticated;
grant execute on function public.update_task(uuid, uuid, text, text, uuid, uuid, date, public.task_kind, time) to authenticated;
