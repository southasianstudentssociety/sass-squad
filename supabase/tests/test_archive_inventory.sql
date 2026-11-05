-- Task archive, dated handovers, location moves, last activity (0021).
\set ON_ERROR_STOP 1
\o /dev/null
begin;
create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), true);
  execute 'set local role ' || case when p is null then 'anon' else 'authenticated' end;
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; end $$;
create function pg_temp.fails(sql text, expect text) returns void language plpgsql as $$
begin
  begin execute sql;
  exception when others then
    if sqlerrm not ilike '%' || expect || '%' then raise exception 'FAIL: expected "%" got "%" for %', expect, sqlerrm, sql; end if;
    return;
  end;
  raise exception 'FAIL: expected an error "%" for %', expect, sql;
end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

insert into public.departments (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Logistics'),
  ('10000000-0000-0000-0000-000000000002', 'Marketing');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'exco@test'),
  ('00000000-0000-0000-0000-00000000000b', 'logsub@test'),
  ('00000000-0000-0000-0000-00000000000c', 'mktsub@test');
insert into public.team_memberships (user_id, department_id, position, starts_on, ends_on) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'exco', current_date - 30, current_date + 300),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 30, current_date + 300),
  ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000002', 'subcommittee', current_date - 30, current_date + 300);

-- ------------------------------------------------------------ archive
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
create temp table t on commit drop as select * from public.create_task('10000000-0000-0000-0000-000000000001', 'Book van', null, null, null, null, 'task', null);
grant all on t to authenticated;
select pg_temp.fails($$select public.set_task_archived((select id from t), true)$$, 'Only Done or Cancelled');
select public.set_task_status((select id from t), 'done');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails($$select public.set_task_archived((select id from t), true)$$, 'Only the owner');  -- unassigned, other dept
select pg_temp.fails($$select public.set_task_status((select id from t), 'todo')$$, 'Only the owner');      -- the old hole
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.set_task_archived((select id from t), true);
select pg_temp.check((select archived_at is not null from public.tasks where id = (select id from t)), 'archived');
select pg_temp.fails($$select public.set_task_archived((select id from t), true)$$, 'Already archived');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.set_task_archived((select id from t), false);
select pg_temp.check((select archived_at is null from public.tasks where id = (select id from t)), 'unarchived by exco');
select pg_temp.check((select array_agg(action::text order by id) = array['created','status','archived','unarchived'] from public.task_log where task_id = (select id from t)), 'logged');
-- reopening an archived task unarchives it
select public.set_task_archived((select id from t), true);
select public.set_task_status((select id from t), 'doing');
select pg_temp.check((select archived_at is null and status = 'doing' from public.tasks where id = (select id from t)), 'reopen unarchives');
reset role;

-- ------------------------------------------------------------ inventory
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
create temp table it on commit drop as select * from public.create_inventory_item('Speaker', 'Equipment', 'Society room', 'good', 1, null, '00000000-0000-0000-0000-00000000000b');
grant all on it to authenticated;
-- move: any team member, logged with old/new
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.set_inventory_location((select id from it), 'LG7 storage', 'moved for Diwali');
select pg_temp.check((select location = 'LG7 storage' from public.inventory_items where id = (select id from it)), 'moved');
select pg_temp.check((select details->'location' = '["Society room", "LG7 storage"]'::jsonb and note = 'moved for Diwali' from public.inventory_log where item_id = (select id from it) and action = 'edited'), 'move logged');
select pg_temp.fails($$select public.set_inventory_location((select id from it), 'LG7 storage')$$, 'already where');
-- dated handover by the keeper; future and before-creation refused
reset role;
update public.inventory_items set created_at = now() - interval '10 days' where id = (select id from it);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.transfer_inventory_item((select id from it), '00000000-0000-0000-0000-00000000000c', null, private.hk_today() + 1)$$, 'future');
select pg_temp.fails($$select public.transfer_inventory_item((select id from it), '00000000-0000-0000-0000-00000000000c', null, current_date - 30)$$, 'before the item was added');
select public.transfer_inventory_item((select id from it), '00000000-0000-0000-0000-00000000000c', 'after Diwali', current_date - 3);
select pg_temp.check((select details->>'on' = (current_date - 3)::text from public.inventory_log where item_id = (select id from it) and action = 'transferred'), 'handover date stored');
-- old 3-argument call still works (today)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.transfer_inventory_item((select id from it), '00000000-0000-0000-0000-00000000000b', 'back');
select pg_temp.check((select count(*) = 2 from public.inventory_log where item_id = (select id from it) and action = 'transferred'), 'two transfers');
-- last activity follows the log (a loan doesn't touch updated_at)
reset role;
update public.inventory_items set updated_at = now() - interval '5 days' where id = (select id from it);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.check_out_item((select id from it), '00000000-0000-0000-0000-00000000000b', 1);
select pg_temp.check((select last_activity_at > now() - interval '1 minute' from public.inventory_overview where id = (select id from it)), 'last activity = latest log');
reset role;
rollback;
