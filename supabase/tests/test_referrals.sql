-- Referrals for events and membership offers (0029).
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
  ('00000000-0000-0000-0000-00000000000b', 'zara@connect.ust.hk'),
  ('00000000-0000-0000-0000-00000000000d', 'buyer@test'),
  ('00000000-0000-0000-0000-00000000000e', 'buyer2@test');
update public.profiles set onboarded = true, full_name = split_part(email::text, '@', 1);
insert into public.departments (id, name) values ('10000000-0000-0000-0000-000000000001', 'Logistics'), ('10000000-0000-0000-0000-000000000002', 'Marketing');
insert into public.team_memberships (user_id, department_id, position, starts_on, ends_on) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'exco', current_date - 30, current_date + 300);
-- Team list: Zara (logged in, two departments), Aman (never logged in), an ExCo, a revoked and an ended one
insert into public.team_invites (id, full_name, email, department_id, position, starts_on, ends_on, revoked_at) values
  ('40000000-0000-0000-0000-000000000001', 'Zara Khan', 'zara@connect.ust.hk', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 30, current_date + 300, null),
  ('40000000-0000-0000-0000-000000000002', 'Zara Khan', 'zara@connect.ust.hk', '10000000-0000-0000-0000-000000000002', 'subcommittee', current_date - 30, current_date + 300, null),
  ('40000000-0000-0000-0000-000000000003', 'aman Shah', 'aman@connect.ust.hk', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 30, current_date + 300, null),
  ('40000000-0000-0000-0000-000000000004', 'Big Boss', 'boss@connect.ust.hk', '10000000-0000-0000-0000-000000000001', 'exco', current_date - 30, current_date + 300, null),
  ('40000000-0000-0000-0000-000000000005', 'Gone Person', 'gone@connect.ust.hk', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 30, current_date + 300, now()),
  ('40000000-0000-0000-0000-000000000006', 'Old Timer', 'old@connect.ust.hk', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 400, current_date - 1, null);
-- Zara has logged in: give her the place (as the invite claim would)
insert into public.team_memberships (user_id, department_id, position, starts_on, ends_on) values
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 30, current_date + 300);

insert into public.events (id, slug, title, starts_at, member_price_cents, public_price_cents, is_published, referrals_enabled) values
  ('20000000-0000-0000-0000-000000000001', 'diwali', 'Diwali', now() + interval '10 days', 23000, 29000, true, true),
  ('20000000-0000-0000-0000-000000000002', 'plain', 'Plain', now() + interval '10 days', 0, 0, true, false);
insert into public.membership_offers (id, name, price_cents, valid_until, referrals_enabled) values
  ('50000000-0000-0000-0000-000000000001', '1 year', 10000, current_date + 200, true),
  ('50000000-0000-0000-0000-000000000002', '2 years', 18000, current_date + 500, false);

-- Picker: current subcommittee only, one per person, A-Z ignoring case; logged-in only
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select string_agg(name, ',' order by lower(name)) from public.referral_options()) = 'aman Shah,Zara Khan', 'picker list');
select pg_temp.check((select count(*) = 2 from public.referral_options()), 'one row per person');
reset role;
select pg_temp.as_user(null);
select pg_temp.fails($$select * from public.referral_options()$$, 'permission denied');
reset role;

-- Event with referrals on: buyer picks Zara
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
create temp table t1 on commit drop as
  select * from public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000001', null, (select id from public.referral_options() where name = 'Zara Khan'));
select pg_temp.check((select referrer_invite_id is not null and price_cents = 29000 from t1), 'ticket has referrer');
-- Asking again with someone else doesn't change it
select pg_temp.check((select referrer_invite_id = (select referrer_invite_id from t1) from public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000001', null, '40000000-0000-0000-0000-000000000003')), 'first referrer stays');
-- An ExCo, a revoked or an ended person can't be the referrer
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.fails($$select public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000001', null, '40000000-0000-0000-0000-000000000004')$$, 'isn''t on the subcommittee list');
select pg_temp.fails($$select public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000001', null, '40000000-0000-0000-0000-000000000005')$$, 'isn''t on the subcommittee list');
select pg_temp.fails($$select public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000001', null, '40000000-0000-0000-0000-000000000006')$$, 'isn''t on the subcommittee list');
-- Optional: no referrer is fine
select pg_temp.check((select referrer_invite_id is null from public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000001')), 'optional');
-- Referrals off: the referrer is ignored
select pg_temp.check((select referrer_invite_id is null from public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000002', null, '40000000-0000-0000-0000-000000000003')), 'ignored when off');
reset role;

-- Team members aren't referred (a subcommittee member buying a normal ticket)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select referrer_invite_id is null from public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000001', null, '40000000-0000-0000-0000-000000000003')), 'team not referred');
reset role;

-- Membership
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select referrer_invite_id = '40000000-0000-0000-0000-000000000003' and status = 'awaiting_payment'
  from public.apply_for_membership_with_referral('50000000-0000-0000-0000-000000000001', null, '40000000-0000-0000-0000-000000000003')), 'membership referrer');
select pg_temp.check((select referrer_invite_id is null from public.apply_for_membership_with_referral('50000000-0000-0000-0000-000000000002', null, '40000000-0000-0000-0000-000000000003')), 'offer without referrals ignores it');
reset role;

-- ExCo see who referred; others can't
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select string_agg(referrer, ',') from public.event_referrals('20000000-0000-0000-0000-000000000001')) = 'Zara Khan', 'event referrals');
select pg_temp.check((select string_agg(referrer, ',') from public.membership_referrals()) = 'aman Shah', 'membership referrals');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$select * from public.event_referrals('20000000-0000-0000-0000-000000000001')$$, 'ExCo only');
select pg_temp.fails($$select * from public.membership_referrals()$$, 'ExCo only');
reset role;

-- Meals still work through the same function (two-argument call)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.set_event_meals('20000000-0000-0000-0000-000000000002', true);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.fails($$select public.claim_ticket_with_meal('20000000-0000-0000-0000-000000000002')$$, 'Pick your meal');
reset role;

rollback;
