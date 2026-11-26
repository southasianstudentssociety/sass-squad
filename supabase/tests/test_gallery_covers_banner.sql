-- Gallery covers and the home banner (0034).
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
create function pg_temp.ranks() returns text language sql as $$
  select string_agg(split_part(path, '/', 2) || '=' || cover_rank, ',' order by cover_rank)
    from public.gallery_photos where cover_rank is not null and hidden_at is null and event_id = '20000000-0000-0000-0000-000000000001'
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'exco@test'),
  ('00000000-0000-0000-0000-00000000000b', 'sub@test');
insert into public.departments (id, name) values ('10000000-0000-0000-0000-000000000001', 'Marketing');
insert into public.team_memberships (user_id, department_id, position, starts_on, ends_on) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'exco', current_date - 30, current_date + 300),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 30, current_date + 300);
insert into public.events (id, slug, title, starts_at, member_price_cents, public_price_cents, is_published) values
  ('20000000-0000-0000-0000-000000000001', 'holi-2027', 'Holi', now() - interval '2 days', 0, 0, true);
insert into storage.objects (bucket_id, name)
select 'gallery', '00000000-0000-0000-0000-00000000000a/p' || i || '.webp' from generate_series(1, 8) i;
insert into storage.objects (bucket_id, name) values ('gallery', '00000000-0000-0000-0000-00000000000a/loose.webp');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.add_gallery_photo('00000000-0000-0000-0000-00000000000a/p' || i || '.webp', null, '20000000-0000-0000-0000-000000000001') from generate_series(1, 8) i;
select public.add_gallery_photo('00000000-0000-0000-0000-00000000000a/loose.webp');
create temp table ids on commit drop as select split_part(path, '/', 2) as f, id from public.gallery_photos;
grant select on ids to authenticated, anon;

-- covers: ExCo only, in the order picked, 6 at most, event photos only
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.set_gallery_photo_cover((select id from ids where f = 'p1.webp'), true)$$, 'ExCo only');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.set_gallery_photo_cover((select id from ids where f = 'p' || i || '.webp'), true) from unnest(array[5, 2, 7, 1, 3, 4]) i;
select pg_temp.check(pg_temp.ranks() = 'p5.webp=1,p2.webp=2,p7.webp=3,p1.webp=4,p3.webp=5,p4.webp=6', 'ranks in pick order: ' || pg_temp.ranks());
select pg_temp.fails($$select public.set_gallery_photo_cover((select id from ids where f = 'p8.webp'), true)$$, '6 covers at most');
select public.set_gallery_photo_cover((select id from ids where f = 'p5.webp'), true); -- already a cover: no-op
select pg_temp.check(pg_temp.ranks() like 'p5.webp=1,%', 'retick keeps rank');
select pg_temp.fails($$select public.set_gallery_photo_cover((select id from ids where f = 'loose.webp'), true)$$, 'event''s album');
-- untick closes the gap; the next pick goes to the end
select public.set_gallery_photo_cover((select id from ids where f = 'p2.webp'), false);
select pg_temp.check(pg_temp.ranks() = 'p5.webp=1,p7.webp=2,p1.webp=3,p3.webp=4,p4.webp=5', 'untick renumbers: ' || pg_temp.ranks());
select public.set_gallery_photo_cover((select id from ids where f = 'p2.webp'), false); -- not a cover: no-op
select public.set_gallery_photo_cover((select id from ids where f = 'p8.webp'), true);
select pg_temp.check(pg_temp.ranks() like '%,p8.webp=6', 'new pick last');
-- removing a cover photo takes it out and closes the gap
select public.hide_gallery_photo((select id from ids where f = 'p5.webp'));
select pg_temp.check(pg_temp.ranks() = 'p7.webp=1,p1.webp=2,p3.webp=3,p4.webp=4,p8.webp=5', 'hide renumbers: ' || pg_temp.ranks());
select pg_temp.fails($$select public.set_gallery_photo_cover((select id from ids where f = 'p5.webp'), true)$$, 'already removed');
select pg_temp.as_user(null);
select pg_temp.fails($$update public.gallery_photos set cover_rank = 1$$, 'permission denied');
select pg_temp.fails($$select public.set_gallery_photo_cover(gen_random_uuid(), true)$$, 'permission denied');

-- home banner: everyone reads it; ExCo set and clear it
reset role;
delete from public.home_banner;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.set_home_banner('20000000-0000-0000-0000-000000000001', 'holi', 'Holi', 'It''s a Wrap!!', 'Photos are in.', 'See them', now() + interval '7 days')$$, 'ExCo only');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select public.set_home_banner(null, 'holi', 'Holi', 'Wrap', 'x', 'Go', now() + interval '7 days')$$, 'Pick the event');
select pg_temp.fails($$select public.set_home_banner('20000000-0000-0000-0000-000000000001', 'holi', 'Holi', '  ', 'x', 'Go', now() + interval '7 days')$$, 'every line');
select pg_temp.fails($$select public.set_home_banner('20000000-0000-0000-0000-000000000001', 'holi', 'Holi', 'Wrap', 'x', 'Go', now() - interval '1 day')$$, 'in the future');
select pg_temp.fails($$select public.set_home_banner('20000000-0000-0000-0000-000000000001', 'holi', 'Holi', repeat('x', 41), 'x', 'Go', now() + interval '7 days')$$, 'Too long');
select pg_temp.fails($$select public.set_home_banner('20000000-0000-0000-0000-000000000001', 'Not A Theme!', 'Holi', 'Wrap', 'x', 'Go', now() + interval '7 days')$$, 'theme');
select public.set_home_banner('20000000-0000-0000-0000-000000000001', 'holi', ' Holi 2027 ', 'It''s a Wrap!!', 'Photos are in.', 'See them', now() + interval '7 days');
select public.set_home_banner('20000000-0000-0000-0000-000000000001', 'midnight', 'Holi 2027', 'Round two', 'Photos are in.', 'See them', now() + interval '7 days');
select pg_temp.as_user(null);
select pg_temp.check((select count(*) = 1 and min(theme) = 'midnight' and min(headline) = 'Round two' and min(eyebrow) = 'Holi 2027' from public.home_banner), 'one row, updated, trimmed');
select pg_temp.fails($$delete from public.home_banner$$, 'permission denied');
select pg_temp.fails($$select public.clear_home_banner()$$, 'permission denied');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.clear_home_banner()$$, 'ExCo only');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.clear_home_banner();
select pg_temp.check((select count(*) = 0 from public.home_banner), 'cleared');
reset role;
rollback;
