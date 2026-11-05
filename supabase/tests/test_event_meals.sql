-- Meal choice per event (0028).
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

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'exco@test'),
  ('00000000-0000-0000-0000-00000000000b', 'sub@test'),
  ('00000000-0000-0000-0000-00000000000d', 'public@test'),
  ('00000000-0000-0000-0000-00000000000e', 'other@test');
update public.profiles set onboarded = true, full_name = split_part(email::text, '@', 1);
insert into public.departments (id, name) values ('10000000-0000-0000-0000-000000000001', 'Logistics');
insert into public.team_memberships (user_id, department_id, position, starts_on, ends_on) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'exco', current_date - 30, current_date + 300),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 30, current_date + 300);
insert into public.events (id, slug, title, starts_at, member_price_cents, public_price_cents, is_published) values
  ('20000000-0000-0000-0000-000000000001', 'diwali', 'Diwali', now() + interval '10 days', 23000, 29000, true),
  ('20000000-0000-0000-0000-000000000002', 'plain', 'Plain', now() + interval '10 days', 0, 0, true),
  ('20000000-0000-0000-0000-000000000003', 'started', 'Started', now() - interval '1 hour', 0, 0, true);

-- Off by default: buying works as before, a meal is refused
select pg_temp.check((select not meals_enabled from public.events where slug = 'plain'), 'off by default');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select meal_option_id is null from public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000002')), 'no meal needed when off');

-- Only ExCo set meals
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.set_event_meals('20000000-0000-0000-0000-000000000001', true)$$, 'ExCo only');

-- Switching on with no options adds the three defaults, in order, with their colours
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.set_event_meals('20000000-0000-0000-0000-000000000001', true);
select pg_temp.check((select meals_enabled from public.events where slug = 'diwali'), 'switched on');
select pg_temp.check((select string_agg(label || ':' || color, ',' order by sort_order) from public.event_meal_options where event_id = '20000000-0000-0000-0000-000000000001' and archived_at is null)
  = 'Vegetarian (Non-Jain):green,Vegetarian (Jain):light_green,Non-Vegetarian:red', 'defaults');
reset role;
create temp table opt on commit drop as
  select label, id from public.event_meal_options where event_id = '20000000-0000-0000-0000-000000000001';
grant select on opt to authenticated, anon;

-- Everyone can see a published event's options
select pg_temp.as_user(null);
select pg_temp.check((select count(*) = 3 from public.event_meal_options where event_id = '20000000-0000-0000-0000-000000000001'), 'anon sees options');

-- Buying needs a meal now
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$select public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000001')$$, 'Pick your meal');
select pg_temp.fails($$select public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000001', (select id from opt where label = 'x'))$$, 'Pick your meal');
-- Another event's option is refused
select pg_temp.fails($$select public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000001', gen_random_uuid())$$, 'isn''t available');
create temp table t1 on commit drop as
  select * from public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000001', (select id from opt where label = 'Vegetarian (Jain)'));
select pg_temp.check((select price_cents = 29000 and status = 'awaiting_payment' and meal_option_id = (select id from opt where label = 'Vegetarian (Jain)') from t1), 'ticket with meal');
-- Holder changes their mind before the event
select pg_temp.check((select meal_option_id = (select id from opt where label = 'Non-Vegetarian') from public.set_ticket_meal((select id from t1), (select id from opt where label = 'Non-Vegetarian'))), 'holder changes meal');
select pg_temp.fails($$select public.set_ticket_meal((select id from t1), null)$$, 'Pick your meal');

-- Someone else can't touch it
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.fails($$select public.set_ticket_meal((select id from t1), (select id from opt where label = 'Vegetarian (Jain)'))$$, 'Ticket not found');

-- Team tickets need a meal too, and still get their team price
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.set_event_team_price('20000000-0000-0000-0000-000000000001', 15000);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.claim_team_ticket_with_meal('20000000-0000-0000-0000-000000000001')$$, 'Pick your meal');
select pg_temp.check((select price_cents = 15000 and team_rate and meal_option_id is not null
  from public.claim_team_ticket_with_meal('20000000-0000-0000-0000-000000000001', (select id from opt where label = 'Vegetarian (Non-Jain)'))), 'team ticket with meal');

-- Editing: rename one, remove a used one (hidden, kept on tickets), remove an unused one (deleted), add one
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.set_event_meals('20000000-0000-0000-0000-000000000001', true, jsonb_build_array(
  jsonb_build_object('id', (select id from opt where label = 'Vegetarian (Non-Jain)'), 'label', 'Veg', 'color', 'green'),
  jsonb_build_object('label', 'Vegan', 'color', 'amber')
));
reset role;
select pg_temp.check((select string_agg(label, ',' order by sort_order) from public.event_meal_options where event_id = '20000000-0000-0000-0000-000000000001' and archived_at is null) = 'Veg,Vegan', 'edited list');
select pg_temp.check((select archived_at is not null from public.event_meal_options where id = (select id from opt where label = 'Non-Vegetarian')), 'used option hidden, not deleted');
select pg_temp.check((select count(*) = 0 from public.event_meal_options where id = (select id from opt where label = 'Vegetarian (Jain)')), 'unused option deleted');
select pg_temp.check((select meal_option_id = (select id from opt where label = 'Non-Vegetarian') from public.tickets where id = (select id from t1)), 'ticket keeps its choice');
-- A hidden option can't be picked again
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$select public.set_ticket_meal((select id from t1), (select id from opt where label = 'Non-Vegetarian'))$$, 'isn''t available');
-- Duplicate names refused
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select public.set_event_meals('20000000-0000-0000-0000-000000000001', true, '[{"label":"Veg","color":"green"},{"label":"veg ","color":"red"}]')$$, 'same name');
select pg_temp.fails($$select public.set_event_meals('20000000-0000-0000-0000-000000000001', true, '[{"label":"Veg","color":"pink"}]')$$, 'Unknown colour');

-- After the start: holder can't change, ExCo can (door, imports)
select public.set_event_meals('20000000-0000-0000-0000-000000000003', true);
reset role;
insert into public.tickets (id, event_id, user_id, holder_name, price_cents, status, payment_reference)
  values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000d', 'public', 0, 'confirmed', 'SASS-MEAL1');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$select public.set_ticket_meal('30000000-0000-0000-0000-000000000001', (select id from public.event_meal_options where event_id = '20000000-0000-0000-0000-000000000003' order by sort_order limit 1))$$, 'has started');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select meal_option_id is not null from public.set_ticket_meal('30000000-0000-0000-0000-000000000001', (select id from public.event_meal_options where event_id = '20000000-0000-0000-0000-000000000003' order by sort_order limit 1))), 'exco sets after start');

-- Switching off: buying needs no meal, choices already made are kept
select public.set_event_meals('20000000-0000-0000-0000-000000000001', false, (select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'color', color) order by sort_order) from public.event_meal_options where event_id = '20000000-0000-0000-0000-000000000001' and archived_at is null));
reset role;
select pg_temp.check((select not meals_enabled from public.events where slug = 'diwali'), 'switched off');
select pg_temp.check((select count(*) = 2 from public.event_meal_options where event_id = '20000000-0000-0000-0000-000000000001' and archived_at is null), 'options kept when off');
select pg_temp.check((select meal_option_id is not null from public.tickets where id = (select id from t1)), 'choice kept when off');

-- No direct writes
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$insert into public.event_meal_options (event_id, label) values ('20000000-0000-0000-0000-000000000002', 'x')$$, 'row-level security');
reset role;

rollback;
