-- Gallery covers and the home page "photos are out" banner.
--
--   * cover_rank: ExCo pick up to 6 cover photos per album, in order. The
--     first 3 make the album card on /gallery and the album page hero; all 6
--     make the photo pile on the home banner. Unfilled places fall back to
--     the album's first uploads. Ranks stay 1..n with no gaps: unticking or
--     removing a cover moves the later ones up.
--   * home_banner: one row (or none) saying which album the home banner
--     announces, its theme and wording, and when it stops showing. Replaces
--     the hard-coded PHOTO_BANNER in src/lib/albums.ts, so ExCo can run a new
--     "It's a Wrap" for every event from Admin -> Gallery.
-- Writes go through the RPCs below, ExCo only.

alter table public.gallery_photos
  add column if not exists cover_rank smallint check (cover_rank between 1 and 6);
create unique index if not exists gallery_photos_cover_rank_idx
  on public.gallery_photos (event_id, cover_rank)
  where cover_rank is not null and hidden_at is null;

-- Close the gaps in one album's cover ranks (1, 3, 4 -> 1, 2, 3). Clears them
-- first, because the unique index is checked row by row during an update.
create or replace function private.renumber_gallery_covers(p_event_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_ids uuid[];
begin
  select array_agg(id order by cover_rank) into v_ids
    from public.gallery_photos
   where event_id = p_event_id and cover_rank is not null and hidden_at is null;
  if v_ids is null then return; end if;
  update public.gallery_photos set cover_rank = null where id = any (v_ids);
  update public.gallery_photos g set cover_rank = u.n
    from unnest(v_ids) with ordinality as u(id, n)
   where g.id = u.id;
end;
$$;
revoke execute on function private.renumber_gallery_covers(uuid) from public;

create or replace function public.set_gallery_photo_cover(p_id uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_photo public.gallery_photos;
  v_count int;
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  select * into v_photo from public.gallery_photos where id = p_id and hidden_at is null for update;
  if not found then
    raise exception 'Photo not found, or already removed.' using errcode = 'P0001';
  end if;
  if v_photo.event_id is null then
    raise exception 'Only photos in an event''s album can be covers.' using errcode = 'P0001';
  end if;
  -- One album at a time, so two ExCo ticking at once can't both take the same place.
  perform pg_advisory_xact_lock(hashtext('gallery_covers:' || v_photo.event_id::text));

  if coalesce(p_on, false) then
    if v_photo.cover_rank is not null then return; end if;
    select count(*) into v_count from public.gallery_photos
     where event_id = v_photo.event_id and cover_rank is not null and hidden_at is null;
    if v_count >= 6 then
      raise exception 'An album has 6 covers at most. Untick one first.' using errcode = 'P0001';
    end if;
    update public.gallery_photos set cover_rank = v_count + 1 where id = p_id;
  else
    if v_photo.cover_rank is null then return; end if;
    update public.gallery_photos set cover_rank = null where id = p_id;
    perform private.renumber_gallery_covers(v_photo.event_id);
  end if;
end;
$$;
revoke execute on function public.set_gallery_photo_cover(uuid, boolean) from public, anon;
grant execute on function public.set_gallery_photo_cover(uuid, boolean) to authenticated;

-- Removing a photo also takes it out of its album's covers.
create or replace function public.hide_gallery_photo(p_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_event uuid;
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  update public.gallery_photos set hidden_at = now(), hidden_by = auth.uid(), cover_rank = null
   where id = p_id and hidden_at is null
  returning event_id into v_event;
  if not found then
    raise exception 'Photo not found, or already removed.' using errcode = 'P0001';
  end if;
  if v_event is not null then
    perform pg_advisory_xact_lock(hashtext('gallery_covers:' || v_event::text));
    perform private.renumber_gallery_covers(v_event);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Home banner
-- ---------------------------------------------------------------------------
create table if not exists public.home_banner (
  id boolean primary key default true check (id),
  event_id uuid not null references public.events (id) on delete cascade,
  theme text not null default 'diwali' check (theme ~ '^[a-z0-9-]{1,30}$'),
  eyebrow text not null check (length(eyebrow) between 1 and 40),
  headline text not null check (length(headline) between 1 and 40),
  blurb text not null check (length(blurb) between 1 and 160),
  cta text not null check (length(cta) between 1 and 30),
  ends_at timestamptz not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists home_banner_event_idx on public.home_banner (event_id);
create index if not exists home_banner_updated_by_idx on public.home_banner (updated_by);

alter table public.home_banner enable row level security;
drop policy if exists home_banner_select on public.home_banner;
create policy home_banner_select on public.home_banner for select to anon, authenticated using (true);
revoke insert, update, delete on public.home_banner from anon, authenticated;
grant select on public.home_banner to anon, authenticated;

create or replace function public.set_home_banner(
  p_event_id uuid,
  p_theme text,
  p_eyebrow text,
  p_headline text,
  p_blurb text,
  p_cta text,
  p_ends_at timestamptz
)
returns public.home_banner
language plpgsql security definer set search_path = public, extensions
as $$
declare v_row public.home_banner;
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  if p_event_id is null or not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Pick the event the banner is for.' using errcode = 'P0001';
  end if;
  if private.clean(p_eyebrow) is null or private.clean(p_headline) is null
     or private.clean(p_blurb) is null or private.clean(p_cta) is null then
    raise exception 'Fill in every line of the banner.' using errcode = 'P0001';
  end if;
  if p_ends_at is null or p_ends_at <= now() then
    raise exception 'Pick a "show until" date in the future.' using errcode = 'P0001';
  end if;
  insert into public.home_banner (id, event_id, theme, eyebrow, headline, blurb, cta, ends_at, updated_by, updated_at)
  values (true, p_event_id, coalesce(private.clean(p_theme), 'diwali'), private.clean(p_eyebrow), private.clean(p_headline),
          private.clean(p_blurb), private.clean(p_cta), p_ends_at, auth.uid(), now())
  on conflict (id) do update set
    event_id = excluded.event_id, theme = excluded.theme, eyebrow = excluded.eyebrow, headline = excluded.headline,
    blurb = excluded.blurb, cta = excluded.cta, ends_at = excluded.ends_at,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into v_row;
  return v_row;
exception
  when check_violation then
    raise exception 'Too long, or a theme that doesn''t exist. Keep the label and headline under 40 characters, the line under the headline under 160 and the button under 30.' using errcode = 'P0001';
end;
$$;

create or replace function public.clear_home_banner()
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  delete from public.home_banner where id;
end;
$$;

revoke execute on function public.set_home_banner(uuid, text, text, text, text, text, timestamptz) from public, anon;
revoke execute on function public.clear_home_banner() from public, anon;
grant execute on function public.set_home_banner(uuid, text, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.clear_home_banner() to authenticated;

-- Carry over the banner that was hard-coded in src/lib/albums.ts.
insert into public.home_banner (id, event_id, theme, eyebrow, headline, blurb, cta, ends_at)
select true, e.id, 'diwali', 'Diwali 2026', 'It''s a Wrap!!',
       'The photos are in. Find yourself, your friends and the best moments from the night.',
       'Relive the night', '2026-12-07T23:59:59+08:00'
  from public.events e
 where e.slug = 'diwali-2026'
on conflict (id) do nothing;
