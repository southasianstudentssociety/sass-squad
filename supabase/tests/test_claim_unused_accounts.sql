-- Tickets on unused accounts move to the account that links their email (0032).
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

insert into public.events (id, slug, title, starts_at, member_price_cents, public_price_cents, is_published) values
  ('20000000-0000-0000-0000-000000000001', 'diwali', 'Diwali', now() + interval '10 days', 5000, 10000, true),
  ('20000000-0000-0000-0000-000000000002', 'henna', 'Henna', now() + interval '5 days', 0, 2000, true);

-- Import accounts, never signed in, each holding a ticket
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'arham@gmail.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'krishi@gmail.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'neil1@gmail.com');
-- an import account that HAS been used
insert into auth.users (id, email, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000000a4', 'used@gmail.com', now() - interval '1 day');
insert into public.tickets (event_id, user_id, holder_name, holder_email, price_cents, status, payment_reference, confirmed_at) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Arham', 'arham@gmail.com', 10000, 'confirmed', 'T-1', now()),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'Arham', 'arham@gmail.com', 0, 'cancelled', 'T-2', null),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'Krishi', 'krishi@gmail.com', 10000, 'confirmed', 'T-3', now()),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'Neil', 'neil1@gmail.com', 10000, 'confirmed', 'T-4', now()),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'Used', 'used@gmail.com', 10000, 'confirmed', 'T-5', now());

-- Arham signs up with UST: nothing moves yet (the Gmail isn't proven his)
insert into auth.users (id, email, last_sign_in_at) values ('00000000-0000-0000-0000-0000000000b1', 'arham@connect.ust.hk', now());
select pg_temp.check((select user_id = '00000000-0000-0000-0000-0000000000a1' from public.tickets where payment_reference = 'T-1'), 'not moved before linking');
-- he links the Gmail with Google: the live ticket moves, the cancelled one doesn't
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'google', 'g-arham', '{"email": "Arham@Gmail.com"}');
select pg_temp.check((select user_id = '00000000-0000-0000-0000-0000000000b1' from public.tickets where payment_reference = 'T-1'), 'moved on Google link');
select pg_temp.check((select user_id = '00000000-0000-0000-0000-0000000000a1' from public.tickets where payment_reference = 'T-2'), 'cancelled ticket stays');
-- and he can see it
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) = 1 from public.tickets where status <> 'cancelled'), 'he sees his ticket');
reset role;

-- Krishi already booked Diwali on his UST account: the import-account ticket stays put
insert into auth.users (id, email, last_sign_in_at) values ('00000000-0000-0000-0000-0000000000b2', 'krishi@connect.ust.hk', now());
insert into public.tickets (event_id, user_id, holder_name, holder_email, price_cents, status, payment_reference) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'Krishi', 'krishi@connect.ust.hk', 10000, 'awaiting_payment', 'T-6');
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  ('00000000-0000-0000-0000-0000000000b2', 'google', 'g-krishi', '{"email": "krishi@gmail.com"}');
select pg_temp.check((select user_id = '00000000-0000-0000-0000-0000000000a2' from public.tickets where payment_reference = 'T-3'), 'no second live ticket');

-- Someone links a Gmail whose account has been used: nothing moves
insert into auth.users (id, email, last_sign_in_at) values ('00000000-0000-0000-0000-0000000000b4', 'other@connect.ust.hk', now());
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  ('00000000-0000-0000-0000-0000000000b4', 'google', 'g-used', '{"email": "used@gmail.com"}');
select pg_temp.check((select user_id = '00000000-0000-0000-0000-0000000000a4' from public.tickets where payment_reference = 'T-5'), 'used account keeps its ticket');

-- A stranger with an unrelated email takes nothing
insert into auth.users (id, email, last_sign_in_at) values ('00000000-0000-0000-0000-0000000000b5', 'stranger@connect.ust.hk', now());
select pg_temp.check(private.claim_tickets('00000000-0000-0000-0000-0000000000b5') = 0, 'stranger claims nothing');
select pg_temp.check((select user_id = '00000000-0000-0000-0000-0000000000a3' from public.tickets where payment_reference = 'T-4'), 'Neil ticket untouched');

-- Neil changes his login email to the Gmail's address: also proof, the ticket moves
insert into auth.users (id, email, last_sign_in_at) values ('00000000-0000-0000-0000-0000000000b3', 'neil@connect.ust.hk', now());
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  ('00000000-0000-0000-0000-0000000000b3', 'email', 'e-neil', '{"email": "neil1@gmail.com"}');
select pg_temp.check((select user_id = '00000000-0000-0000-0000-0000000000b3' from public.tickets where payment_reference = 'T-4'), 'moved when email identity added');

-- clients still can't call it
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b5');
select pg_temp.fails($$select private.claim_tickets('00000000-0000-0000-0000-0000000000b5')$$, 'permission denied');
reset role;
rollback;
