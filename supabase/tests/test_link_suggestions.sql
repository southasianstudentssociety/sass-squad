-- Link suggestions and discarding brand-new duplicate Google accounts (0023).
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

insert into public.members (full_name, email, alt_email, valid_until) values ('Asha', 'asha@connect.ust.hk', 'asha@gmail.com', current_date + 100);

-- Asha's real account: UST login, set up
insert into auth.users (id, email, created_at) values ('00000000-0000-0000-0000-00000000000a', 'asha@connect.ust.hk', now() - interval '3 days');
insert into auth.identities (user_id, provider, provider_id, identity_data) values ('00000000-0000-0000-0000-00000000000a', 'email', 'e-asha', '{"email": "asha@connect.ust.hk"}');
update public.profiles set onboarded = true, full_name = 'Asha' where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select public.my_link_suggestion() = '{"kind": "google", "email": "asha@gmail.com"}'::jsonb), 'suggest linking gmail');
select pg_temp.check(public.discard_new_duplicate_login() is null, 'real account never discarded');
reset role;
select pg_temp.check((select count(*) = 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a'), 'still there');

-- She taps Continue with Google with her Gmail: a new empty account appears
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000b', 'asha@gmail.com');
insert into auth.identities (user_id, provider, provider_id, identity_data) values ('00000000-0000-0000-0000-00000000000b', 'google', 'g-asha', '{"email": "asha@gmail.com"}');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check(public.discard_new_duplicate_login() = 'a•••@connect.ust.hk', 'duplicate discarded, masked email returned');
reset role;
select pg_temp.check((select count(*) = 0 from auth.users where id = '00000000-0000-0000-0000-00000000000b'), 'deleted');
select pg_temp.check((select count(*) = 0 from auth.identities where provider_id = 'g-asha'), 'google identity freed');

-- Someone new with no paired account: kept
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'new@gmail.com');
insert into auth.identities (user_id, provider, provider_id, identity_data) values ('00000000-0000-0000-0000-00000000000c', 'google', 'g-new', '{"email": "new@gmail.com"}');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check(public.discard_new_duplicate_login() is null and public.my_link_suggestion() is null, 'unpaired new account kept');
reset role;

-- Paired Gmail but the account is older than 15 minutes, or already set up: kept
insert into public.members (full_name, email, alt_email, valid_until) values ('Bo', 'bo@connect.ust.hk', 'bo@gmail.com', current_date + 100);
insert into auth.users (id, email, created_at) values ('00000000-0000-0000-0000-00000000000d', 'bo@connect.ust.hk', now() - interval '2 days');
insert into auth.users (id, email, created_at) values ('00000000-0000-0000-0000-00000000000e', 'bo@gmail.com', now() - interval '1 hour');
insert into auth.identities (user_id, provider, provider_id, identity_data) values ('00000000-0000-0000-0000-00000000000e', 'google', 'g-bo', '{"email": "bo@gmail.com"}');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.check(public.discard_new_duplicate_login() is null, 'old account kept');
-- Gmail-login account: suggest switching login email to UST
select pg_temp.check((select public.my_link_suggestion() = '{"kind": "login_email", "email": "bo@connect.ust.hk"}'::jsonb), 'suggest UST login email');
reset role;

-- Email-code duplicate: account exists under the Gmail; logging in by UST code makes a new one
insert into public.members (full_name, email, alt_email, valid_until) values ('Cy', 'cy@connect.ust.hk', 'cy@gmail.com', current_date + 100);
insert into auth.users (id, email, created_at) values ('00000000-0000-0000-0000-0000000000f1', 'cy@gmail.com', now() - interval '5 days');
update public.profiles set onboarded = true where id = '00000000-0000-0000-0000-0000000000f1';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'cy@connect.ust.hk');
insert into auth.identities (user_id, provider, provider_id, identity_data) values ('00000000-0000-0000-0000-0000000000f2', 'email', 'e-cy', '{"email": "cy@connect.ust.hk"}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check(public.discard_new_duplicate_login() = 'c••@gmail.com', 'email-code duplicate discarded');
reset role;
select pg_temp.check((select count(*) = 1 from auth.users where email in ('cy@gmail.com', 'cy@connect.ust.hk')), 'one account left');
rollback;
