-- Gallery: ExCo choose which photos appear in the home page strip.
--
--   * on_home: picked for the home page. The strip mixes events equally
--     (one photo from each event in turn). For an event with any picked
--     photos only those are used; otherwise its first-uploaded photos are.
--   * Writes go through set_gallery_photo_on_home(), ExCo only.

alter table public.gallery_photos add column if not exists on_home boolean not null default false;

create or replace function public.set_gallery_photo_on_home(p_id uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  update public.gallery_photos set on_home = coalesce(p_on, false)
   where id = p_id and hidden_at is null;
  if not found then
    raise exception 'Photo not found, or already removed.' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.set_gallery_photo_on_home(uuid, boolean) from public, anon;
grant execute on function public.set_gallery_photo_on_home(uuid, boolean) to authenticated;
