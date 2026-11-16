-- Unlinked tickets are linked to the account when its email appears (0031).
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
  ('20000000-0000-0000-0000-000000000002', 'henna', 'Henna', now() + interval '5 days', 0, 2000, true),
  ('20000000-0000-0000-0000-000000000003', 'holi', 'Holi', now() + interval '20 days', 0, 2000, true);

-- Tickets made for people with no account yet
insert into public.tickets (event_id, holder_name, holder_email, price_cents, status, payment_reference, confirmed_at) values
  ('20000000-0000-0000-0000-000000000001', 'Nupur', 'ndua@connect.ust.hk', 15000, 'confirmed', 'T-1', now()),
  ('20000000-0000-0000-0000-000000000002', 'Nupur', 'nupurdua05@gmail.com', 0, 'confirmed', 'T-2', now()),
  ('20000000-0000-0000-0000-000000000003', 'Nupur', 'ndua@connect.ust.hk', 0, 'cancelled', 'T-3', null),
  -- Parv: two unlinked tickets for one event (UST + Gmail)
  ('20000000-0000-0000-0000-000000000001', 'Parv', 'pjaluka@connect.ust.hk', 15000, 'confirmed', 'T-4', now()),
  ('20000000-0000-0000-0000-000000000001', 'Parv', 'jalukaparv@gmail.com', 15000, 'confirmed', 'T-5', now()),
  -- Radhika: unlinked Diwali ticket, but she'll have booked her own first
  ('20000000-0000-0000-0000-000000000001', 'Radhika', 'rjhawar@connect.ust.hk', 15000, 'confirmed', 'T-6', now()),
  -- someone else's ticket
  ('20000000-0000-0000-0000-000000000001', 'Other', 'other@connect.ust.hk', 15000, 'confirmed', 'T-7', now());

-- Nupur signs up with her UST: the UST ticket links, the Gmail one doesn't yet, cancelled is never touched
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'ndua@connect.ust.hk');
select pg_temp.check((select user_id = '00000000-0000-0000-0000-00000000000a' from public.tickets where payment_reference = 'T-1'), 'UST ticket linked on sign-up');
select pg_temp.check((select user_id is null from public.tickets where payment_reference = 'T-2'), 'Gmail ticket not linked yet');
select pg_temp.check((select user_id is null from public.tickets where payment_reference = 'T-3'), 'cancelled ticket untouched');
-- she links her Google account: the Gmail ticket links
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  ('00000000-0000-0000-0000-00000000000a', 'google', 'g-nupur', '{"email": "NupurDua05@gmail.com"}');
select pg_temp.check((select user_id = '00000000-0000-0000-0000-00000000000a' from public.tickets where payment_reference = 'T-2'), 'Gmail ticket linked on Google link');
-- and she can see both
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) = 2 from public.tickets where status <> 'cancelled'), 'she sees her two tickets');
reset role;

-- Parv: Gmail login links the Gmail ticket; linking his UST later doesn't add a second one
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000b', 'jalukaparv@gmail.com');
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  ('00000000-0000-0000-0000-00000000000b', 'email', 'e-parv', '{"email": "pjaluka@connect.ust.hk"}');
select pg_temp.check((select count(*) = 1 from public.tickets where user_id = '00000000-0000-0000-0000-00000000000b'), 'one live ticket per event');
select pg_temp.check((select user_id = '00000000-0000-0000-0000-00000000000b' from public.tickets where payment_reference = 'T-5'), 'first email to appear wins');

-- Radhika signs up with a Gmail, books Diwali herself, then changes login email to UST: the unlinked one stays unlinked
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'radhika@gmail.com');
insert into public.tickets (event_id, user_id, holder_name, holder_email, price_cents, status, payment_reference) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'Radhika', 'radhika@gmail.com', 15000, 'awaiting_payment', 'T-8');
update auth.users set email = 'rjhawar@connect.ust.hk' where id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((select user_id is null from public.tickets where payment_reference = 'T-6'), 'no second live ticket linked');
-- ...but a later event's unlinked ticket would link on the email change
insert into public.tickets (event_id, holder_name, holder_email, price_cents, status, payment_reference, confirmed_at) values
  ('20000000-0000-0000-0000-000000000002', 'Radhika', 'rjhawar@connect.ust.hk', 0, 'confirmed', 'T-9', now());
select pg_temp.check(private.claim_tickets('00000000-0000-0000-0000-00000000000c') = 1, 'claim returns count');
select pg_temp.check((select user_id = '00000000-0000-0000-0000-00000000000c' from public.tickets where payment_reference = 'T-9'), 'linked');

-- nobody else's ticket moved; users cannot call the claim directly
select pg_temp.check((select user_id is null from public.tickets where payment_reference = 'T-7'), 'stranger ticket untouched');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select private.claim_tickets('00000000-0000-0000-0000-00000000000a')$$, 'permission denied');
reset role;
rollback;
