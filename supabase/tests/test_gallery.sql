-- Gallery (0018).
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
  ('00000000-0000-0000-0000-00000000000b', 'sub@test');
insert into public.departments (id, name) values ('10000000-0000-0000-0000-000000000001', 'Marketing');
insert into public.team_memberships (user_id, department_id, position, starts_on, ends_on) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'exco', current_date - 30, current_date + 300),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'subcommittee', current_date - 30, current_date + 300);
insert into storage.objects (bucket_id, name) values
  ('gallery', '00000000-0000-0000-0000-00000000000a/one.webp'),
  ('gallery', '00000000-0000-0000-0000-00000000000a/two.webp'),
  ('gallery', '00000000-0000-0000-0000-00000000000b/sub.webp'),
  ('receipts', '00000000-0000-0000-0000-00000000000a/r.jpg');

select pg_temp.check((select public from storage.buckets where id = 'gallery'), 'bucket is public');

-- subcommittee can't add
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.add_gallery_photo('00000000-0000-0000-0000-00000000000b/sub.webp')$$, 'ExCo only');
-- ExCo adds; wrong folder / missing file / other bucket refused
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.add_gallery_photo('00000000-0000-0000-0000-00000000000a/one.webp', 'Diwali 2025');
select public.add_gallery_photo('00000000-0000-0000-0000-00000000000a/two.webp');
select pg_temp.fails($$select public.add_gallery_photo('00000000-0000-0000-0000-00000000000b/sub.webp')$$, 'didn''t finish');
select pg_temp.fails($$select public.add_gallery_photo('00000000-0000-0000-0000-00000000000a/missing.webp')$$, 'didn''t finish');
select pg_temp.fails($$select public.add_gallery_photo('00000000-0000-0000-0000-00000000000a/r.jpg')$$, 'didn''t finish');
select pg_temp.fails($$select public.add_gallery_photo('00000000-0000-0000-0000-00000000000a/one.webp')$$, 'already in the gallery');
select pg_temp.fails($$select public.add_gallery_photo('00000000-0000-0000-0000-00000000000a/two.webp', repeat('x', 121))$$, 'under 120');

-- everyone sees visible photos; hide one
select pg_temp.as_user(null);
select pg_temp.check((select count(*) = 2 from public.gallery_photos), 'anon sees 2');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$select public.hide_gallery_photo((select id from public.gallery_photos where caption = 'Diwali 2025'))$$, 'ExCo only');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.hide_gallery_photo((select id from public.gallery_photos where caption = 'Diwali 2025'));
select pg_temp.fails($$select public.hide_gallery_photo((select id from public.gallery_photos where caption = 'Diwali 2025'))$$, 'already removed');
select pg_temp.check((select count(*) = 2 from public.gallery_photos), 'exco still sees hidden');
select pg_temp.as_user(null);
select pg_temp.check((select count(*) = 1 from public.gallery_photos), 'anon sees 1 after hide');
-- nobody writes directly
select pg_temp.fails($$insert into public.gallery_photos (path) values ('x')$$, 'permission denied');
reset role;
rollback;
