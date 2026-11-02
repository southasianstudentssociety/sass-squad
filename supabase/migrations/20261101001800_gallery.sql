-- Gallery: photos from past events, shown as a scrolling collage on the home
-- page, with a "View all photos" link to the full Google Drive folder.
--
--   * Photos live in a PUBLIC Storage bucket, "gallery". The browser shrinks
--     each photo before uploading (about 1600 px, ~150-300 KB), so the home
--     page stays fast on mobile data.
--   * ExCo upload and remove photos (Admin -> Gallery). Removing hides the
--     photo from the site; the file stays in Storage.
--   * Anyone (logged in or not) can see photos that aren't hidden.
-- Writes to the table go through the RPCs below.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ExCo upload into their own folder: gallery/<user id>/<uuid>.<ext>
drop policy if exists gallery_insert on storage.objects;
create policy gallery_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'gallery'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_admin())
  );

create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  caption text check (caption is null or length(caption) <= 120),
  event_id uuid references public.events (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null
);
create index if not exists gallery_photos_visible_idx on public.gallery_photos (created_at desc) where hidden_at is null;
create index if not exists gallery_photos_event_idx on public.gallery_photos (event_id);
create index if not exists gallery_photos_created_by_idx on public.gallery_photos (created_by);
create index if not exists gallery_photos_hidden_by_idx on public.gallery_photos (hidden_by);

alter table public.gallery_photos enable row level security;
drop policy if exists gallery_photos_select on public.gallery_photos;
create policy gallery_photos_select on public.gallery_photos for select to anon, authenticated
  using (hidden_at is null or (select private.is_admin()));
revoke insert, update, delete on public.gallery_photos from anon, authenticated;
grant select on public.gallery_photos to anon, authenticated;

create or replace function public.add_gallery_photo(p_path text, p_caption text default null, p_event_id uuid default null)
returns public.gallery_photos
language plpgsql security definer set search_path = public, extensions
as $$
declare v_row public.gallery_photos;
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  if private.clean(p_path) is null
     or split_part(p_path, '/', 1) <> (select auth.uid())::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'gallery' and o.name = p_path) then
    raise exception 'The upload didn''t finish. Try that photo again.' using errcode = 'P0001';
  end if;
  if p_event_id is not null and not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'That event no longer exists.' using errcode = 'P0001';
  end if;
  insert into public.gallery_photos (path, caption, event_id, created_by)
  values (p_path, private.clean(p_caption), p_event_id, auth.uid())
  returning * into v_row;
  return v_row;
exception
  when unique_violation then raise exception 'That photo is already in the gallery.' using errcode = 'P0001';
  when check_violation then raise exception 'Keep the caption under 120 characters.' using errcode = 'P0001';
end;
$$;

create or replace function public.hide_gallery_photo(p_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  update public.gallery_photos set hidden_at = now(), hidden_by = auth.uid()
   where id = p_id and hidden_at is null;
  if not found then
    raise exception 'Photo not found, or already removed.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.add_gallery_photo(text, text, uuid) from public, anon;
revoke execute on function public.hide_gallery_photo(uuid) from public, anon;
grant execute on function public.add_gallery_photo(text, text, uuid) to authenticated;
grant execute on function public.hide_gallery_photo(uuid) to authenticated;
