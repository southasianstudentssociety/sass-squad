-- Finance access without self-approval (0020).
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
grant execute on all functions in schema pg_temp to authenticated, anon;

insert into public.departments (id, name, handles_finance, finance_access) values
  ('10000000-0000-0000-0000-000000000001', 'Leadership', false, true),
  ('10000000-0000-0000-0000-000000000002', 'Finance', true, false),
  ('10000000-0000-0000-0000-000000000003', 'Marketing', false, false);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'president@test'),
  ('00000000-0000-0000-0000-00000000000b', 'vpf@test'),
  ('00000000-0000-0000-0000-00000000000c', 'mkt@test'),
  ('00000000-0000-0000-0000-00000000000d', 'leadsub@test');
insert into public.team_memberships (user_id, department_id, position, starts_on, ends_on) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'exco', current_date - 1, current_date + 300),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000002', 'exco', current_date - 1, current_date + 300),
  ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000003', 'exco', current_date - 1, current_date + 300),
  ('00000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 1, current_date + 300);

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select (a->>'is_finance')::bool and not (a->>'is_finance_exco')::bool from public.my_access() a), 'president: finance, no self-approval');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select (a->>'is_finance')::bool and (a->>'is_finance_exco')::bool from public.my_access() a), 'VP finance: finance + self-approval');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select not (a->>'is_finance')::bool from public.my_access() a), 'other exco: no finance');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select not (a->>'is_finance')::bool from public.my_access() a), 'leadership subcommittee: no finance');
reset role;
rollback;
