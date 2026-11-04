-- Manual sold-out switch (0026).
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
  ('00000000-0000-0000-0000-00000000000f', 'early@test');
update public.profiles set onboarded = true, full_name = split_part(email::text, '@', 1);
insert into public.departments (id, name) values ('10000000-0000-0000-0000-000000000001', 'Logistics');
insert into public.team_memberships (user_id, department_id, position, starts_on, ends_on) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'exco', current_date - 30, current_date + 300),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 30, current_date + 300);
insert into public.events (id, slug, title, starts_at, member_price_cents, public_price_cents, is_published) values
  ('20000000-0000-0000-0000-000000000001', 'diwali', 'Diwali', now() + interval '10 days', 23000, 29000, true),
  ('20000000-0000-0000-0000-000000000002', 'other', 'Other', now() + interval '10 days', 0, 0, true);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.set_event_team_price('20000000-0000-0000-0000-000000000001', 15000);
reset role;

-- Default is off and nothing changes
select pg_temp.check((select not sold_out from public.events where slug = 'diwali'), 'default off');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
create temp table early on commit drop as select * from public.claim_ticket('20000000-0000-0000-0000-000000000001');
select pg_temp.check((select price_cents = 29000 from early), 'sells while off');
reset role;

-- Only ExCo can switch it on (admins write events directly under RLS)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
update public.events set sold_out = true where id = '20000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.check((select not sold_out from public.events where slug = 'diwali'), 'public cannot switch');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.events set sold_out = true where id = '20000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.check((select sold_out from public.events where slug = 'diwali'), 'exco switched on');

-- Public buyer refused with the friendly message
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$select public.claim_ticket('20000000-0000-0000-0000-000000000001')$$, 'sold out');
-- other events unaffected
select pg_temp.check((select status = 'confirmed' from public.claim_ticket('20000000-0000-0000-0000-000000000002')), 'other event still sells');

-- Someone who already has a ticket keeps it
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.check((select id from public.claim_ticket('20000000-0000-0000-0000-000000000001')) = (select id from early), 'existing ticket returned');

-- Team places still reserved
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select price_cents = 15000 and team_rate from public.claim_team_ticket('20000000-0000-0000-0000-000000000001')), 'sub team ticket');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select price_cents = 0 and team_rate from public.claim_team_ticket('20000000-0000-0000-0000-000000000001')), 'exco free ticket');

-- Door tickets still work
select pg_temp.check((select source = 'comp' from public.create_door_ticket('20000000-0000-0000-0000-000000000001', 'Guest', null, 0, 'comp', false, null)), 'door comp');
reset role;

-- Switch off: sales resume
update public.events set sold_out = false where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select price_cents = 29000 from public.claim_ticket('20000000-0000-0000-0000-000000000001')), 'sells again when off');
reset role;

rollback;
