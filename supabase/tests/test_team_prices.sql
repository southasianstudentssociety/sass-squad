-- Team ticket prices and team-only membership offers (0016).
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
  ('00000000-0000-0000-0000-00000000000d', 'public@test'),
  ('00000000-0000-0000-0000-00000000000e', 'oldsub@test');
update public.profiles set onboarded = true, full_name = split_part(email::text, '@', 1);
insert into public.departments (id, name) values ('10000000-0000-0000-0000-000000000001', 'Logistics');
insert into public.team_memberships (user_id, department_id, position, starts_on, ends_on) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'exco', current_date - 30, current_date + 300),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 30, current_date + 300),
  ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 30, current_date + 300),
  ('00000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 400, current_date - 1);
-- Sold out (capacity 1, taken), members-only, sales not open yet: team still gets in.
insert into public.events (id, slug, title, starts_at, member_price_cents, public_price_cents, is_published, capacity, access, public_sales_open_at, member_sales_open_at) values
  ('20000000-0000-0000-0000-000000000001', 'diwali', 'Diwali', now() + interval '10 days', 5000, 10000, true, 1, 'members_only', now() + interval '5 days', now() + interval '5 days'),
  ('20000000-0000-0000-0000-000000000002', 'open', 'Open', now() + interval '10 days', 5000, 10000, true, null, 'everyone', null, null),
  ('20000000-0000-0000-0000-000000000003', 'past', 'Past', now() - interval '3 days', 0, 0, true, null, 'everyone', null, null);
insert into public.tickets (event_id, holder_name, price_cents, status, payment_reference) values
  ('20000000-0000-0000-0000-000000000001', 'Someone', 5000, 'confirmed', 'SASS-X1');

-- Only ExCo sets the price
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.set_event_team_price('20000000-0000-0000-0000-000000000001', 2000)$$, 'ExCo only');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.set_event_team_price('20000000-0000-0000-0000-000000000001', 2000);
select public.set_event_team_price('20000000-0000-0000-0000-000000000001', 3000); -- update
select public.set_event_team_price('20000000-0000-0000-0000-000000000002', 0);
select public.set_event_team_price('20000000-0000-0000-0000-000000000003', 0);
select pg_temp.fails($$select public.set_event_team_price('20000000-0000-0000-0000-000000000001', -1)$$, 'looks wrong');

-- Who can see it
select pg_temp.check((select count(*) = 3 from public.event_team_prices), 'exco sees');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select price_cents = 3000 from public.event_team_prices where event_id = '20000000-0000-0000-0000-000000000001'), 'sub sees');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select count(*) = 0 from public.event_team_prices), 'public cannot see');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.check((select count(*) = 0 from public.event_team_prices), 'expired sub cannot see');
reset role;
select pg_temp.as_user(null);
select pg_temp.fails($$select * from public.event_team_prices$$, 'permission denied');
reset role;

-- Who can buy
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$select public.claim_team_ticket('20000000-0000-0000-0000-000000000001')$$, 'current team members only');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.fails($$select public.claim_team_ticket('20000000-0000-0000-0000-000000000001')$$, 'current team members only');
-- normal route still blocks the public (sold out / members only) - claim_ticket unchanged
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$select public.claim_ticket('20000000-0000-0000-0000-000000000001')$$, 'members only');

-- Reserved: sold out + members-only + not open yet, sub still gets a team ticket
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
create temp table t1 on commit drop as select * from public.claim_team_ticket('20000000-0000-0000-0000-000000000001');
select pg_temp.check((select price_cents = 3000 and team_rate and status = 'awaiting_payment' and payment_reference like 'SASS-%' from t1), 'team ticket created');
-- second call returns the same ticket
select pg_temp.check((select id from public.claim_team_ticket('20000000-0000-0000-0000-000000000001')) = (select id from t1), 'one per person');
-- normal claim returns the existing ticket rather than a second one
select pg_temp.check((select id from public.claim_ticket('20000000-0000-0000-0000-000000000001')) = (select id from t1), 'claim_ticket returns team ticket');

-- Switch: sub2 bought at the normal price first, unpaid -> switches to team price
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
create temp table t2 on commit drop as select * from public.claim_ticket('20000000-0000-0000-0000-000000000002');
select pg_temp.check((select price_cents = 10000 and not team_rate from t2), 'normal price first');
create temp table t3 on commit drop as select * from public.claim_team_ticket('20000000-0000-0000-0000-000000000002');
select pg_temp.check((select id from t3) = (select id from t2), 'same ticket');
select pg_temp.check((select price_cents = 0 and team_rate and status = 'confirmed' and confirmed_at is not null from t3), 'switched to free team ticket');

-- No team price / finished event
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.set_event_team_price('20000000-0000-0000-0000-000000000002', null);
select pg_temp.check((select count(*) = 0 from public.event_team_prices where event_id = '20000000-0000-0000-0000-000000000002'), 'removed');
select pg_temp.fails($$select public.claim_team_ticket('20000000-0000-0000-0000-000000000002')$$, 'no team price');
select pg_temp.fails($$select public.claim_team_ticket('20000000-0000-0000-0000-000000000003')$$, 'finished');
reset role;

-- ------------------------------------------------ team-only membership offers
insert into public.membership_offers (id, name, price_cents, valid_until, is_open, team_only) values
  ('30000000-0000-0000-0000-000000000001', 'Team membership', 5000, current_date + 200, true, true),
  ('30000000-0000-0000-0000-000000000002', 'Public membership', 15000, current_date + 200, true, false),
  ('30000000-0000-0000-0000-000000000003', 'Closed team', 5000, current_date + 200, false, true);
select pg_temp.as_user(null);
select pg_temp.check((select count(*) = 1 from public.membership_offers), 'anon sees public only');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select count(*) = 1 and bool_and(not team_only) from public.membership_offers), 'public sees public only');
select pg_temp.fails($$select public.apply_for_membership('30000000-0000-0000-0000-000000000001')$$, 'isn''t on sale');
select public.apply_for_membership('30000000-0000-0000-0000-000000000002');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) = 2 from public.membership_offers), 'sub sees both open offers');
select pg_temp.check((select price_cents = 5000 and status = 'awaiting_payment' from public.apply_for_membership('30000000-0000-0000-0000-000000000001')), 'sub applies team offer');
select pg_temp.fails($$select public.apply_for_membership('30000000-0000-0000-0000-000000000003')$$, 'isn''t on sale');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) = 3 from public.membership_offers), 'exco sees all');
reset role;

rollback;
