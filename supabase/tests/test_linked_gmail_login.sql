-- Linked Gmail typed into the code box, and the general link banner (0027).
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

-- Dev: UST login, Google (dev@gmail.com) linked. Not on any list.
insert into auth.users (id, email, created_at) values ('00000000-0000-0000-0000-00000000000a', 'dev@connect.ust.hk', now() - interval '3 days');
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  ('00000000-0000-0000-0000-00000000000a', 'email', 'e-dev', '{"email": "dev@connect.ust.hk"}'),
  ('00000000-0000-0000-0000-00000000000a', 'google', 'g-dev', '{"email": "Dev@Gmail.com"}');
update public.profiles set onboarded = true, full_name = 'Dev' where id = '00000000-0000-0000-0000-00000000000a';

-- Hint, logged out: linked Gmail says google; main emails and strangers say nothing
select pg_temp.as_user(null);
select pg_temp.check(public.login_email_hint('dev@gmail.com') = 'google', 'linked gmail -> google');
select pg_temp.check(public.login_email_hint('  DEV@gmail.com ') = 'google', 'case and spaces');
select pg_temp.check(public.login_email_hint('dev@connect.ust.hk') is null, 'main email -> normal code');
select pg_temp.check(public.login_email_hint('nobody@gmail.com') is null, 'unknown -> normal code');
reset role;

-- Backstop: a code login made a new empty account under the linked Gmail anyway
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000b', 'dev@gmail.com');
insert into auth.identities (user_id, provider, provider_id, identity_data) values ('00000000-0000-0000-0000-00000000000b', 'email', 'e-devg', '{"email": "dev@gmail.com"}');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select public.discard_duplicate_login() = '{"existing": "d••@connect.ust.hk", "use_google": true}'::jsonb), 'duplicate of linked gmail discarded');
reset role;
select pg_temp.check((select count(*) = 0 from auth.users where id = '00000000-0000-0000-0000-00000000000b'), 'deleted');
select pg_temp.check((select count(*) = 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a'), 'real account kept');
-- The real account is never discarded
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check(public.discard_duplicate_login() is null, 'real account untouched');
-- Fully linked (UST + Google): no banner
select pg_temp.check(public.my_link_nudge() is null, 'fully linked: no nudge');
reset role;

-- List-paired duplicate still caught (same as before), use_google false
insert into public.members (full_name, email, alt_email, valid_until) values ('Cy', 'cy@connect.ust.hk', 'cy@gmail.com', current_date + 100);
insert into auth.users (id, email, created_at) values ('00000000-0000-0000-0000-0000000000c1', 'cy@gmail.com', now() - interval '5 days');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c2', 'cy@connect.ust.hk');
insert into auth.identities (user_id, provider, provider_id, identity_data) values ('00000000-0000-0000-0000-0000000000c2', 'email', 'e-cy', '{"email": "cy@connect.ust.hk"}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check((select public.discard_duplicate_login() = '{"existing": "c••@gmail.com", "use_google": false}'::jsonb), 'list-paired duplicate');
reset role;

-- UST-only, not on the lists: link Gmail
insert into auth.users (id, email, created_at) values ('00000000-0000-0000-0000-00000000000d', 'ust@connect.ust.hk', now() - interval '3 days');
insert into auth.identities (user_id, provider, provider_id, identity_data) values ('00000000-0000-0000-0000-00000000000d', 'email', 'e-ust', '{"email": "ust@connect.ust.hk"}');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select public.my_link_nudge() = '{"kind": "add_google", "email": null}'::jsonb), 'ust-only -> add_google');
-- X: quiet for 14 days, but Settings still sees it
select public.snooze_link_nudge(false);
select pg_temp.check(public.my_link_nudge() is null, 'snoozed');
select pg_temp.check((select public.my_link_nudge(true) ->> 'kind' = 'add_google'), 'settings ignores snooze');
reset role;
select pg_temp.check((select link_nudge_snoozed_until between now() + interval '13 days' and now() + interval '15 days' from public.profiles where id = '00000000-0000-0000-0000-00000000000d'), '14 days');

-- Gmail-only (Google login), not at UST: add UST; "I'm not at HKUST" hides it for good
insert into auth.users (id, email, created_at) values ('00000000-0000-0000-0000-00000000000e', 'alum@gmail.com', now() - interval '3 days');
insert into auth.identities (user_id, provider, provider_id, identity_data) values ('00000000-0000-0000-0000-00000000000e', 'google', 'g-alum', '{"email": "alum@gmail.com"}');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.check((select public.my_link_nudge() = '{"kind": "add_ust", "email": null}'::jsonb), 'gmail-only -> add_ust');
select public.snooze_link_nudge(true);
select pg_temp.check(public.my_link_nudge() is null, 'never again');
reset role;
select pg_temp.check((select link_nudge_snoozed_until = 'infinity'::timestamptz from public.profiles where id = '00000000-0000-0000-0000-00000000000e'), 'infinity');

-- List-based suggestions still come first
insert into public.members (full_name, email, alt_email, valid_until) values ('Asha', 'asha@connect.ust.hk', 'asha@gmail.com', current_date + 100);
insert into auth.users (id, email, created_at) values ('00000000-0000-0000-0000-00000000000f', 'asha@connect.ust.hk', now() - interval '3 days');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.check((select public.my_link_nudge() = '{"kind": "google", "email": "asha@gmail.com"}'::jsonb), 'list suggestion first');
-- Old function unchanged for the deployed app
select pg_temp.check((select public.my_link_suggestion() = '{"kind": "google", "email": "asha@gmail.com"}'::jsonb), 'old function unchanged');
reset role;

-- Logged out can't snooze or read nudges
select pg_temp.as_user(null);
do $$ begin
  begin perform public.my_link_nudge(); raise exception 'FAIL: anon read nudge';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
