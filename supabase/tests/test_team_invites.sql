-- Team invites, department-scoped tasks, inventory for the team (0019).
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
-- owner (ExCo Logistics) and an existing account that will be invited
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@gmail.com'),
  ('00000000-0000-0000-0000-00000000000e', 'existing@connect.ust.hk');
insert into public.team_memberships (user_id, department_id, position, starts_on, ends_on) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'exco', current_date - 1, current_date + 300);
insert into public.hub_owners (user_id) values ('00000000-0000-0000-0000-00000000000a');

-- only owners invite
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.fails($$select public.invite_team_member('X', 'x@connect.ust.hk', null, '10000000-0000-0000-0000-000000000001', 'subcommittee')$$, 'Only hub owners');
select pg_temp.check((select count(*) = 0 from public.team_invites), 'non-admin cannot read invites');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
-- someone who has never logged in: UST + Gmail
select pg_temp.check((select (r->>'added_now')::int = 0 from public.invite_team_member('Log Sub', 'logsub@connect.ust.hk', 'logsub@gmail.com', '10000000-0000-0000-0000-000000000001', 'subcommittee') r), 'not added yet');
-- marketing subcommittee, UST only
select public.invite_team_member('Mkt Sub', 'MktSub@Connect.UST.hk ', '', '10000000-0000-0000-0000-000000000002', 'subcommittee');
-- an existing account gets it straight away
select pg_temp.check((select (r->>'added_now')::int = 1 from public.invite_team_member('Existing', 'existing@connect.ust.hk', null, '10000000-0000-0000-0000-000000000002', 'exco') r), 'existing added now');
-- owner already ExCo in Logistics: inviting again doesn't duplicate
select public.invite_team_member('Owner', 'owner@gmail.com', null, '10000000-0000-0000-0000-000000000001', 'exco');
select pg_temp.check((select count(*) = 1 from public.team_memberships where user_id = '00000000-0000-0000-0000-00000000000a'), 'no duplicate for owner');
select pg_temp.fails($$select public.invite_team_member('Log Sub', 'logsub@connect.ust.hk', null, '10000000-0000-0000-0000-000000000001', 'subcommittee')$$, 'already invited');
select pg_temp.fails($$select public.invite_team_member('Bad', 'not-an-email', null, '10000000-0000-0000-0000-000000000001', 'subcommittee')$$, 'valid email');
reset role;

-- first login with the GMAIL claims the Logistics invite; email stored lowercase/trimmed
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000b', 'logsub@gmail.com');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'mktsub@connect.ust.hk');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000d', 'stranger@gmail.com');
select pg_temp.check((select count(*) = 1 and bool_and(position = 'subcommittee') from public.team_memberships where user_id = '00000000-0000-0000-0000-00000000000b' and department_id = '10000000-0000-0000-0000-000000000001'), 'gmail login claimed logistics');
select pg_temp.check((select count(*) = 1 from public.team_memberships where user_id = '00000000-0000-0000-0000-00000000000c' and department_id = '10000000-0000-0000-0000-000000000002'), 'ust login claimed marketing');
select pg_temp.check((select count(*) = 0 from public.team_memberships where user_id = '00000000-0000-0000-0000-00000000000d'), 'stranger gets nothing');

-- revoked invites aren't claimed
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.invite_team_member('Late', 'late@connect.ust.hk', null, '10000000-0000-0000-0000-000000000002', 'subcommittee');
select public.revoke_team_invite((select id from public.team_invites where email = 'late@connect.ust.hk'));
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000f', 'late@connect.ust.hk');
select pg_temp.check((select count(*) = 0 from public.team_memberships where user_id = '00000000-0000-0000-0000-00000000000f'), 'revoked not claimed');

-- ------------------------------------------------------------ tasks by department
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.create_task('10000000-0000-0000-0000-000000000001', 'Logistics task', null, null, null, null, 'task', null);
select public.create_task('10000000-0000-0000-0000-000000000002', 'Marketing task', null, null, null, null, 'task', null);
select public.create_task('10000000-0000-0000-0000-000000000002', 'Marketing task for logsub', null, null, '00000000-0000-0000-0000-00000000000b', null, 'task', null);
select pg_temp.check((select count(*) = 3 from public.tasks), 'exco sees all');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- logistics sub
select pg_temp.check((select array_agg(title order by title) = array['Logistics task', 'Marketing task for logsub'] from public.tasks), 'logistics sub: own dept + assigned');
select pg_temp.check((select count(*) > 0 from public.task_log), 'sees own task log');
select pg_temp.check((select count(*) = 0 from public.task_log l join public.tasks t on t.id = l.task_id where t.title = 'Marketing task'), 'no log of hidden task');
select public.create_task('10000000-0000-0000-0000-000000000001', 'Sub adds own', null, null, null, null, 'task', null);
select pg_temp.fails($$select public.create_task('10000000-0000-0000-0000-000000000002', 'Sub adds other', null, null, null, null, 'task', null)$$, 'own departments');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); -- marketing sub
select pg_temp.check((select count(*) = 2 and bool_and(title like 'Marketing%') from public.tasks), 'marketing sub sees marketing only');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); -- not on team
select pg_temp.check((select count(*) = 0 from public.tasks), 'outsider sees none');

-- ------------------------------------------------------------ inventory
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
create temp table it on commit drop as select * from public.create_inventory_item('Diyas', 'Decor', 'Box 3', 'good', 40, null, null);
select public.update_inventory_item((select id from it), 'Clay diyas', 'Decor', 'Box 4', 'worn', 'chipped');
select public.adjust_inventory((select id from it), 10, 'bought more');
select pg_temp.check((select quantity = 50 and name = 'Clay diyas' from public.inventory_items where id = (select id from it)), 'sub amended item');
select pg_temp.fails($$select public.retire_inventory_item((select id from it), 'old')$$, 'ExCo only');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$select public.create_inventory_item('X', null, null, 'good', 1)$$, 'Team members only');
reset role;
rollback;
