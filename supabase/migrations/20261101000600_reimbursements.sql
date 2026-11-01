-- Phase 3: reimbursements.
--
-- A team member submits a claim (event, amount, description, receipt, how to be
-- paid). Finance approves or rejects it, then marks it paid.
--   * Finance = an active ExCo membership in a department flagged handles_finance.
--   * Nobody can approve or pay their own claim.
--   * Claims are never edited. A change is a new revision; only the claimant can
--     add one, and only while the claim is submitted or rejected.
--   * Every status change is logged with who, when and which revision.
--   * Receipts live in a private Storage bucket, readable only by the claimant
--     and Finance. Files can't be overwritten or deleted through the API.
-- All writes go through the RPCs below; the tables have no write policies.

-- ---------------------------------------------------------------------------
-- Types and tables
-- ---------------------------------------------------------------------------
alter table public.departments add column handles_finance boolean not null default false;

create type public.claim_status as enum ('submitted', 'approved', 'rejected', 'paid', 'withdrawn');
create type public.payout_method as enum ('fps', 'bank_transfer', 'payme', 'cash');

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  claimant_id uuid not null references public.profiles (id) on delete restrict,
  status public.claim_status not null default 'submitted',
  current_revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index claims_claimant_idx on public.claims (claimant_id);
create index claims_status_idx on public.claims (status, updated_at desc);

create table public.claim_revisions (
  claim_id uuid not null references public.claims (id) on delete restrict,
  revision integer not null check (revision >= 1),
  event_id uuid references public.events (id) on delete set null,
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 10000000),
  description text not null check (length(trim(description)) between 3 and 1000),
  payout_method public.payout_method not null,
  payout_details text check (payout_details is null or length(payout_details) <= 200),
  receipt_path text not null,
  created_at timestamptz not null default now(),
  primary key (claim_id, revision)
);
create index claim_revisions_event_idx on public.claim_revisions (event_id);
create index claim_revisions_receipt_idx on public.claim_revisions (receipt_path);

create table public.claim_events (
  id bigint generated always as identity primary key,
  claim_id uuid not null references public.claims (id) on delete restrict,
  revision integer not null,
  from_status public.claim_status,
  to_status public.claim_status not null,
  actor_id uuid references public.profiles (id) on delete set null,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now()
);
create index claim_events_claim_idx on public.claim_events (claim_id, created_at);
create index claim_events_actor_idx on public.claim_events (actor_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.is_finance()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from public.team_memberships m
    join public.departments d on d.id = m.department_id
    where m.user_id = (select auth.uid())
      and m.position = 'exco'
      and d.handles_finance
      and private.hk_today() between m.starts_on and m.ends_on
  )
$$;
revoke execute on function private.is_finance() from public;
grant execute on function private.is_finance() to authenticated;

create or replace function private.gen_claim_reference()
returns text
language plpgsql volatile set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  ref text;
begin
  loop
    ref := 'CLM-';
    for i in 1..5 loop
      ref := ref || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.claims where reference = ref);
  end loop;
  return ref;
end;
$$;
revoke execute on function private.gen_claim_reference() from public;

-- Validates one revision's fields. Raises a friendly error or returns nothing.
create or replace function private.check_claim_fields(
  p_claim_id uuid,
  p_event_id uuid,
  p_amount_cents integer,
  p_description text,
  p_payout_method public.payout_method,
  p_payout_details text,
  p_receipt_path text
)
returns void
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter the amount you paid.' using errcode = 'P0001';
  end if;
  if p_amount_cents > 10000000 then
    raise exception 'That amount looks wrong (over HK$100,000).' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_description, ''))) < 3 then
    raise exception 'Say what you bought and why.' using errcode = 'P0001';
  end if;
  if length(p_description) > 1000 then
    raise exception 'Keep the description under 1000 characters.' using errcode = 'P0001';
  end if;
  if p_payout_method is null then
    raise exception 'Choose how you want to be paid.' using errcode = 'P0001';
  end if;
  if p_payout_method <> 'cash' and length(trim(coalesce(p_payout_details, ''))) = 0 then
    raise exception 'Add your FPS ID, PayMe number or bank account so Finance can pay you.' using errcode = 'P0001';
  end if;
  if length(coalesce(p_payout_details, '')) > 200 then
    raise exception 'Payment details are too long.' using errcode = 'P0001';
  end if;
  if p_event_id is not null and not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'That event no longer exists.' using errcode = 'P0001';
  end if;

  -- The receipt must be a file this user uploaded to their own folder...
  if p_receipt_path is null
     or split_part(p_receipt_path, '/', 1) <> (select auth.uid())::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'receipts' and o.name = p_receipt_path) then
    raise exception 'Attach a photo or PDF of the receipt.' using errcode = 'P0001';
  end if;
  -- ...and not one already used on a different claim.
  if exists (
    select 1 from public.claim_revisions r
    where r.receipt_path = p_receipt_path and r.claim_id is distinct from p_claim_id
  ) then
    raise exception 'That receipt is already attached to another claim.' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function private.check_claim_fields(uuid, uuid, integer, text, public.payout_method, text, text) from public;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.my_access()
returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'is_admin', private.is_admin(),
    'is_staff', private.is_staff(),
    'is_team', private.is_team(),
    'is_finance', private.is_finance(),
    'term_end', private.current_term_end()
  )
$$;

create or replace function public.submit_claim(
  p_event_id uuid,
  p_amount_cents integer,
  p_description text,
  p_payout_method public.payout_method,
  p_payout_details text,
  p_receipt_path text
)
returns public.claims
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_claim public.claims;
begin
  if not private.is_team() then
    raise exception 'Only current team members can submit claims.' using errcode = 'P0001';
  end if;
  perform private.check_claim_fields(null, p_event_id, p_amount_cents, p_description, p_payout_method, p_payout_details, p_receipt_path);

  insert into public.claims (reference, claimant_id)
  values (private.gen_claim_reference(), v_uid)
  returning * into v_claim;

  insert into public.claim_revisions (claim_id, revision, event_id, amount_cents, description, payout_method, payout_details, receipt_path)
  values (v_claim.id, 1, p_event_id, p_amount_cents, trim(p_description), p_payout_method, nullif(trim(p_payout_details), ''), p_receipt_path);

  insert into public.claim_events (claim_id, revision, from_status, to_status, actor_id)
  values (v_claim.id, 1, null, 'submitted', v_uid);

  return v_claim;
end;
$$;

-- Claimant adds a new revision (e.g. after a rejection). Goes back to "submitted".
create or replace function public.revise_claim(
  p_claim_id uuid,
  p_event_id uuid,
  p_amount_cents integer,
  p_description text,
  p_payout_method public.payout_method,
  p_payout_details text,
  p_receipt_path text,
  p_note text default null
)
returns public.claims
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_claim public.claims;
  v_from public.claim_status;
begin
  select * into v_claim from public.claims where id = p_claim_id for update;
  if not found or v_claim.claimant_id <> v_uid then
    raise exception 'Claim not found.' using errcode = 'P0001';
  end if;
  if v_claim.status not in ('submitted', 'rejected') then
    raise exception 'This claim can''t be changed any more (it''s %).', v_claim.status using errcode = 'P0001';
  end if;
  perform private.check_claim_fields(p_claim_id, p_event_id, p_amount_cents, p_description, p_payout_method, p_payout_details, p_receipt_path);

  v_from := v_claim.status;
  insert into public.claim_revisions (claim_id, revision, event_id, amount_cents, description, payout_method, payout_details, receipt_path)
  values (p_claim_id, v_claim.current_revision + 1, p_event_id, p_amount_cents, trim(p_description), p_payout_method, nullif(trim(p_payout_details), ''), p_receipt_path);

  update public.claims
     set current_revision = current_revision + 1, status = 'submitted', updated_at = now()
   where id = p_claim_id
  returning * into v_claim;

  insert into public.claim_events (claim_id, revision, from_status, to_status, actor_id, note)
  values (p_claim_id, v_claim.current_revision, v_from, 'submitted', v_uid, nullif(trim(p_note), ''));

  return v_claim;
end;
$$;

create or replace function public.withdraw_claim(p_claim_id uuid)
returns public.claims
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_claim public.claims;
  v_from public.claim_status;
begin
  select * into v_claim from public.claims where id = p_claim_id for update;
  if not found or v_claim.claimant_id <> auth.uid() then
    raise exception 'Claim not found.' using errcode = 'P0001';
  end if;
  if v_claim.status not in ('submitted', 'rejected') then
    raise exception 'This claim can''t be withdrawn (it''s %).', v_claim.status using errcode = 'P0001';
  end if;
  v_from := v_claim.status;
  update public.claims set status = 'withdrawn', updated_at = now() where id = p_claim_id returning * into v_claim;
  insert into public.claim_events (claim_id, revision, from_status, to_status, actor_id)
  values (p_claim_id, v_claim.current_revision, v_from, 'withdrawn', auth.uid());
  return v_claim;
end;
$$;

-- Finance approves or rejects. p_revision must be the revision they looked at,
-- so a claimant can't swap in new numbers between "view" and "approve".
create or replace function public.review_claim(
  p_claim_id uuid,
  p_revision integer,
  p_approve boolean,
  p_note text default null
)
returns public.claims
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_claim public.claims;
  v_to public.claim_status := case when p_approve then 'approved'::public.claim_status else 'rejected'::public.claim_status end;
begin
  if not private.is_finance() then
    raise exception 'Finance only.' using errcode = 'P0001';
  end if;
  select * into v_claim from public.claims where id = p_claim_id for update;
  if not found then
    raise exception 'Claim not found.' using errcode = 'P0001';
  end if;
  if v_claim.claimant_id = auth.uid() then
    raise exception 'You can''t review your own claim. Another Finance ExCo has to.' using errcode = 'P0001';
  end if;
  if v_claim.status <> 'submitted' then
    raise exception 'This claim isn''t waiting for review (it''s %).', v_claim.status using errcode = 'P0001';
  end if;
  if v_claim.current_revision <> p_revision then
    raise exception 'The claimant changed this claim while you were looking. Check the new version.' using errcode = 'P0001';
  end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'Say why it''s rejected, so they can fix it.' using errcode = 'P0001';
  end if;

  update public.claims set status = v_to, updated_at = now() where id = p_claim_id returning * into v_claim;
  insert into public.claim_events (claim_id, revision, from_status, to_status, actor_id, note)
  values (p_claim_id, p_revision, 'submitted', v_to, auth.uid(), nullif(trim(p_note), ''));
  return v_claim;
end;
$$;

create or replace function public.mark_claim_paid(p_claim_id uuid, p_reference text default null)
returns public.claims
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_claim public.claims;
begin
  if not private.is_finance() then
    raise exception 'Finance only.' using errcode = 'P0001';
  end if;
  select * into v_claim from public.claims where id = p_claim_id for update;
  if not found then
    raise exception 'Claim not found.' using errcode = 'P0001';
  end if;
  if v_claim.claimant_id = auth.uid() then
    raise exception 'You can''t mark your own claim as paid. Another Finance ExCo has to.' using errcode = 'P0001';
  end if;
  if v_claim.status <> 'approved' then
    raise exception 'Only approved claims can be marked paid (this one is %).', v_claim.status using errcode = 'P0001';
  end if;

  update public.claims set status = 'paid', updated_at = now() where id = p_claim_id returning * into v_claim;
  insert into public.claim_events (claim_id, revision, from_status, to_status, actor_id, note)
  values (p_claim_id, v_claim.current_revision, 'approved', 'paid', auth.uid(), nullif(trim(p_reference), ''));
  return v_claim;
end;
$$;

revoke execute on function public.submit_claim(uuid, integer, text, public.payout_method, text, text) from public, anon;
revoke execute on function public.revise_claim(uuid, uuid, integer, text, public.payout_method, text, text, text) from public, anon;
revoke execute on function public.withdraw_claim(uuid) from public, anon;
revoke execute on function public.review_claim(uuid, integer, boolean, text) from public, anon;
revoke execute on function public.mark_claim_paid(uuid, text) from public, anon;
grant execute on function public.submit_claim(uuid, integer, text, public.payout_method, text, text) to authenticated;
grant execute on function public.revise_claim(uuid, uuid, integer, text, public.payout_method, text, text, text) to authenticated;
grant execute on function public.withdraw_claim(uuid) to authenticated;
grant execute on function public.review_claim(uuid, integer, boolean, text) to authenticated;
grant execute on function public.mark_claim_paid(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security (read only; writes go through the RPCs)
-- ---------------------------------------------------------------------------
alter table public.claims enable row level security;
alter table public.claim_revisions enable row level security;
alter table public.claim_events enable row level security;

create policy claims_select on public.claims for select to authenticated
  using (claimant_id = (select auth.uid()) or (select private.is_finance()));
create policy claim_revisions_select on public.claim_revisions for select to authenticated
  using (exists (
    select 1 from public.claims c where c.id = claim_id
      and (c.claimant_id = (select auth.uid()) or (select private.is_finance()))
  ));
create policy claim_events_select on public.claim_events for select to authenticated
  using (exists (
    select 1 from public.claims c where c.id = claim_id
      and (c.claimant_id = (select auth.uid()) or (select private.is_finance()))
  ));

revoke insert, update, delete on public.claims, public.claim_revisions, public.claim_events from authenticated;
revoke all on public.claims, public.claim_revisions, public.claim_events from anon;

-- ---------------------------------------------------------------------------
-- Receipts bucket: private, 10 MB, images and PDFs.
-- Files go in <user id>/<random>.<ext>. Team members upload to their own folder;
-- the claimant and Finance can read. No update/delete policies, so receipts
-- can't be swapped after a claim is submitted.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

create policy receipts_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_team())
  );
create policy receipts_select on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_finance()))
  );
