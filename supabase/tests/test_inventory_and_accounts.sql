-- Inventory person in charge / transfers (0014) and accounts (0015).
-- Runs as superuser for setup, then impersonates users with `set role authenticated`.
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
  ('00000000-0000-0000-0000-00000000000c', 'sub2@test'),
  ('00000000-0000-0000-0000-00000000000d', 'outsider@test'),
  ('00000000-0000-0000-0000-00000000000f', 'vpf@test');
insert into public.departments (id, name, handles_finance) values
  ('10000000-0000-0000-0000-000000000001', 'Logistics', false),
  ('10000000-0000-0000-0000-000000000002', 'Finance', true);
insert into public.team_memberships (user_id, department_id, position, starts_on, ends_on) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'exco', current_date - 30, current_date + 300),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 30, current_date + 300),
  ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 30, current_date + 300),
  ('00000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-000000000002', 'exco', current_date - 30, current_date + 300);

-- ---------------------------------------------------------------- inventory
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
-- old 6-argument call (deployed app) still works
select pg_temp.check((select keeper_id is null from public.create_inventory_item('Old call', null, null, 'good', 3, null)), 'old create call');
create temp table it on commit drop as
  select * from public.create_inventory_item('Diyas', 'Decor', 'Box 3', 'good', 40, null, '00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select keeper_id = '00000000-0000-0000-0000-00000000000b' from public.inventory_overview where name = 'Diyas'), 'view has keeper');
select pg_temp.fails($$select public.create_inventory_item('X', null, null, 'good', 1, null, '00000000-0000-0000-0000-00000000000d')$$, 'current team member');

-- nobody in charge: only ExCo can assign it
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails($$select public.transfer_inventory_item((select id from public.inventory_items where name = 'Old call'), '00000000-0000-0000-0000-00000000000c')$$, 'Only the person in charge');
-- sub2 is not in charge: can't transfer
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails($$select public.transfer_inventory_item((select id from public.inventory_items where name = 'Diyas'), '00000000-0000-0000-0000-00000000000c')$$, 'Only the person in charge');
-- keeper hands on to sub2
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.transfer_inventory_item((select id from public.inventory_items where name = 'Diyas'), '00000000-0000-0000-0000-00000000000c', 'after Diwali');
select pg_temp.check((select keeper_id = '00000000-0000-0000-0000-00000000000c' from public.inventory_items where name = 'Diyas'), 'transferred');
select pg_temp.check((select details->>'from' = '00000000-0000-0000-0000-00000000000b' and details->>'to' = '00000000-0000-0000-0000-00000000000c'
                      from public.inventory_log where action = 'transferred'), 'log from/to');
-- old keeper can no longer transfer
select pg_temp.fails($$select public.transfer_inventory_item((select id from public.inventory_items where name = 'Diyas'), '00000000-0000-0000-0000-00000000000b')$$, 'Only the person in charge');
-- same person / outsider
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select public.transfer_inventory_item((select id from public.inventory_items where name = 'Diyas'), '00000000-0000-0000-0000-00000000000c')$$, 'already in charge');
select pg_temp.fails($$select public.transfer_inventory_item((select id from public.inventory_items where name = 'Diyas'), '00000000-0000-0000-0000-00000000000d')$$, 'current team member');
-- ExCo can clear it
select public.transfer_inventory_item((select id from public.inventory_items where name = 'Diyas'), null);
select pg_temp.check((select keeper_id is null from public.inventory_items where name = 'Diyas'), 'cleared');
-- non-team can't
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$select public.transfer_inventory_item((select id from public.inventory_overview limit 1), null)$$, 'Team members only');
reset role;

-- ---------------------------------------------------------------- accounts
insert into public.events (id, slug, title, starts_at, member_price_cents, public_price_cents, is_published) values
  ('20000000-0000-0000-0000-000000000001', 'diwali', 'Diwali', '2026-11-21 11:05+00', 5000, 10000, true),
  ('20000000-0000-0000-0000-000000000002', 'holi', 'Holi', '2027-03-20 06:00+00', 0, 0, true),
  ('20000000-0000-0000-0000-000000000003', 'old', 'Old', '2026-05-01 06:00+00', 0, 0, true);
insert into public.tickets (event_id, holder_name, price_cents, status, payment_reference) values
  ('20000000-0000-0000-0000-000000000001', 'A', 5000, 'confirmed', 'SASS-T1'),
  ('20000000-0000-0000-0000-000000000001', 'B', 10000, 'confirmed', 'SASS-T2'),
  ('20000000-0000-0000-0000-000000000001', 'C', 10000, 'awaiting_payment', 'SASS-T3');

-- non-finance can't use any of it
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select * from public.finance_lines(2026)$$, 'Finance only');
select pg_temp.fails($$select public.add_finance_entry('income', null, 'Grant', 'SU grant', 100000, '2026-10-01')$$, 'Finance only');
select pg_temp.fails($$select public.set_opening_balance(2026, 100)$$, 'Finance only');
select pg_temp.check((select count(*) = 0 from public.finance_years), 'finance_years hidden');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select public.add_finance_entry('expense', '20000000-0000-0000-0000-000000000001', 'Venue', 'E11 Space', 120000, '2026-11-01', 'HKUST');
select public.add_finance_entry('income', '20000000-0000-0000-0000-000000000001', 'Sponsorship', 'Restaurant sponsor', 50000, '2026-11-02');
select public.add_finance_entry('income', null, 'Students'' Union grant', 'Term 1 grant', 300000, '2026-10-01');
select public.add_finance_entry('expense', null, 'Union fee', 'Affiliation fee', 20000, '2027-01-10');
select public.add_finance_entry('expense', null, 'Union fee', 'Last year fee', 7000, '2026-08-31'); -- 2025/26
select pg_temp.fails($$select public.add_finance_entry('gift', null, 'X', 'Y', 1, '2026-10-01')$$, 'income or expense');
select pg_temp.fails($$select public.add_finance_entry('income', null, 'X', 'Y', 0, '2026-10-01')$$, 'Enter the amount');
-- old add_expense still works and is an expense
select public.add_expense('20000000-0000-0000-0000-000000000001', 'Alcohol', 'Drinks', 30000, '2026-11-20');
select pg_temp.check((select kind = 'expense' from public.event_expenses where category = 'Alcohol'), 'old add_expense = expense');

select pg_temp.check((select amount_cents = 15000 and pending_cents = 10000 from public.finance_lines(2026) where source = 'tickets' and event_id = '20000000-0000-0000-0000-000000000001'), 'ticket line');
select pg_temp.check((select sum(amount_cents) = 150000 from public.finance_lines(2026) where kind = 'expense' and event_id = '20000000-0000-0000-0000-000000000001'), 'diwali expenses');
select pg_temp.check((select amount_cents = 50000 from public.finance_lines(2026) where kind = 'income' and source = 'manual' and event_id = '20000000-0000-0000-0000-000000000001'), 'diwali other income');
select pg_temp.check((select amount_cents = 20000 from public.finance_lines(2026) where category = 'Union fee'), 'general by date in year');
select pg_temp.check((select amount_cents = 7000 from public.finance_lines(2025) where category = 'Union fee'), 'previous year by date');
select pg_temp.check((select count(*) = 0 from public.finance_lines(2025) where event_id = '20000000-0000-0000-0000-000000000001'), 'event not in other year');

-- summary: income entries are not costs
select pg_temp.check((select expenses = 150000 and other_income = 50000 and net = 15000 + 50000 - 150000
                      from public.event_finance_summary() where event_id = '20000000-0000-0000-0000-000000000001'), 'summary net');

-- opening balance upsert
select public.set_opening_balance(2026, 1234500, 'Bank statement 1 Sep');
select public.set_opening_balance(2026, 1234600, null);
select pg_temp.check((select opening_cents = 1234600 and note is null from public.finance_years where year_start = 2026), 'opening upsert');
select pg_temp.check(private.academic_year('2026-09-01') = 2026 and private.academic_year('2027-08-31') = 2026, 'academic year');
reset role;

-- owners count as finance
insert into public.hub_owners (user_id) values ('00000000-0000-0000-0000-00000000000d');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select count(*) > 0 from public.finance_lines(null)), 'owner sees accounts');
reset role;

rollback;
