-- my_membership_plan (0025).
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

-- bought 3 years in Oct 2025 (AY 2025) -> until 31 May 2028
insert into public.members (full_name, email, alt_email, purchased_at, valid_until) values
  ('Asha', 'asha@connect.ust.hk', 'asha@gmail.com', '2025-10-30', ((extract(year from current_date)::int + 2) || '-05-31')::date);
insert into public.members (full_name, email, purchased_at, valid_until, notes) values
  ('Ravi', 'ravi@connect.ust.hk', current_date, ((extract(year from current_date)::int + 1) || '-05-31')::date, 'ExCo 2026-27: member until graduation (Year 4)');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'asha@gmail.com'),
  ('00000000-0000-0000-0000-00000000000b', 'ravi@connect.ust.hk'),
  ('00000000-0000-0000-0000-00000000000c', 'nobody@gmail.com');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select (p->>'years')::int = (extract(year from current_date)::int + 2) - 2025 and not (p->>'exco')::bool from public.my_membership_plan() p), 'plan years from dates, via gmail');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select (p->>'exco')::bool from public.my_membership_plan() p), 'exco flagged');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check(public.my_membership_plan() is null, 'non-member: null');
reset role;
rollback;
