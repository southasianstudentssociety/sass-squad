-- Several emails per account: membership, team invites, email change (0022).
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

insert into public.departments (id, name) values ('10000000-0000-0000-0000-000000000001', 'Logistics');
insert into public.members (full_name, email, valid_until) values ('Asha', 'asha@connect.ust.hk', current_date + 100);
insert into public.team_invites (full_name, email, alt_email, department_id, position, starts_on, ends_on) values
  ('Ravi', 'ravi@connect.ust.hk', null, '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 1, current_date + 300);

-- Asha signs up with her Gmail: not a member yet (membership is under UST)
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'asha@gmail.com');
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  ('00000000-0000-0000-0000-00000000000a', 'google', 'g-asha', '{"email": "asha@gmail.com"}');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check(not public.current_user_is_member(), 'gmail only: not member');
reset role;
-- she changes her login email to UST: member, profile email follows
update auth.users set email = 'asha@connect.ust.hk' where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check((select email = 'asha@connect.ust.hk' from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'profile email follows');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check(public.current_user_is_member(), 'member after email change');
select pg_temp.check(public.my_membership() = current_date + 100, 'my_membership date');
reset role;

-- Ravi signs up with a Gmail the invite doesn't know: no team place...
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000b', 'ravi.personal@gmail.com');
select pg_temp.check((select count(*) = 0 from public.team_memberships where user_id = '00000000-0000-0000-0000-00000000000b'), 'no place yet');
-- ...until an identity with the invited email is linked (email-type identity, as when the UST address is added)
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  ('00000000-0000-0000-0000-00000000000b', 'email', 'e-ravi', '{"email": "ravi@connect.ust.hk"}');
select pg_temp.check((select count(*) = 1 from public.team_memberships where user_id = '00000000-0000-0000-0000-00000000000b'), 'claimed on link');

-- a member linked via Google identity only (member row under the Gmail as alt)
insert into public.members (full_name, email, alt_email, valid_until) values ('Mira', 'mira@connect.ust.hk', 'mira@gmail.com', current_date + 50);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'mira@connect.ust.hk');
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  ('00000000-0000-0000-0000-00000000000c', 'google', 'g-mira', '{"email": "Mira@Gmail.com"}');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check(public.current_user_is_member(), 'member via login email');
-- a stranger is not a member
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000d', 'nobody@gmail.com');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check(not public.current_user_is_member() and public.my_membership() is null, 'stranger not member');
-- food preference: own row only, valid values only
update public.profiles set food_preference = 'veg_jain' where id = '00000000-0000-0000-0000-00000000000d';
select pg_temp.check((select food_preference = 'veg_jain' from public.profiles where id = '00000000-0000-0000-0000-00000000000d'), 'food saved');
reset role;
rollback;
