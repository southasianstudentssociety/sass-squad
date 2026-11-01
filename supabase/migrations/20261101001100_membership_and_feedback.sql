-- Batch 2: buy membership in the app, event feedback, membership income in budgets.
--
-- MEMBERSHIP
--   ExCo publishes an offer (name, price, valid-until date, FPS details).
--   A logged-in user applies and gets a MEM-XXXXX reference; free offers are
--   confirmed at once. When an ExCo marks it paid, the member list is updated
--   automatically: an existing row (by email, then alt email) is renewed,
--   otherwise a new one is added. Member pricing applies immediately, because
--   it reads the member list.
--
-- FEEDBACK
--   Only people who were checked in can rate an event (1-5, optional comment),
--   from the start of the event until 30 days later. They can stay anonymous:
--   ExCo reads feedback only through event_feedback_report(), which hides the
--   name, so anonymity holds even for admins using the API.

-- ---------------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------------
create type public.membership_status as enum ('awaiting_payment', 'confirmed', 'cancelled');

create table public.membership_offers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  description text check (description is null or length(description) <= 1000),
  price_cents integer not null check (price_cents >= 0 and price_cents <= 10000000),
  valid_until date not null,
  is_open boolean not null default true,
  payment_instructions text check (payment_instructions is null or length(payment_instructions) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.membership_offers (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  full_name text not null,
  email extensions.citext not null,
  student_id text check (student_id is null or length(student_id) <= 30),
  price_cents integer not null,
  status public.membership_status not null,
  payment_reference text not null unique,
  member_id uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null
);
create unique index membership_applications_one_live
  on public.membership_applications (offer_id, user_id) where status <> 'cancelled';
create index membership_applications_user_idx on public.membership_applications (user_id);
create index membership_applications_status_idx on public.membership_applications (status, created_at);
create index membership_applications_member_idx on public.membership_applications (member_id);
create index membership_applications_confirmed_by_idx on public.membership_applications (confirmed_by);
create index membership_applications_cancelled_by_idx on public.membership_applications (cancelled_by);

create or replace function private.gen_membership_reference()
returns text
language plpgsql volatile set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  ref text;
begin
  loop
    ref := 'MEM-';
    for i in 1..5 loop
      ref := ref || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.membership_applications where payment_reference = ref);
  end loop;
  return ref;
end;
$$;
revoke execute on function private.gen_membership_reference() from public;

-- Writes the paid membership into the member list. Internal only.
create or replace function private.grant_membership(p_app_id uuid)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_app public.membership_applications;
  v_until date;
  v_member uuid;
  v_note text;
begin
  select * into v_app from public.membership_applications where id = p_app_id;
  select valid_until into v_until from public.membership_offers where id = v_app.offer_id;
  v_note := 'Bought in the app, ref ' || v_app.payment_reference;

  select id into v_member from public.members where email = v_app.email;
  if not found then
    select id into v_member from public.members where alt_email = v_app.email;
  end if;

  if found then
    update public.members
       set full_name = v_app.full_name,
           student_id = coalesce(v_app.student_id, student_id),
           purchased_at = private.hk_today(),
           valid_until = greatest(valid_until, v_until),
           notes = left(coalesce(notes || E'\n', '') || v_note, 1000),
           updated_at = now()
     where id = v_member;
  else
    insert into public.members (full_name, email, student_id, purchased_at, valid_until, notes)
    values (v_app.full_name, v_app.email, v_app.student_id, private.hk_today(), v_until, v_note)
    returning id into v_member;
  end if;

  update public.membership_applications set member_id = v_member where id = p_app_id;
  return v_member;
end;
$$;
revoke execute on function private.grant_membership(uuid) from public;

create or replace function public.apply_for_membership(p_offer_id uuid, p_student_id text default null)
returns public.membership_applications
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_offer public.membership_offers;
  v_current date;
  v_app public.membership_applications;
begin
  if v_uid is null then
    raise exception 'You need to log in first.' using errcode = 'P0001';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not v_profile.onboarded or v_profile.full_name is null then
    raise exception 'Finish setting up your profile first.' using errcode = 'P0001';
  end if;
  select * into v_offer from public.membership_offers where id = p_offer_id for update;
  if not found or not v_offer.is_open or v_offer.valid_until < private.hk_today() then
    raise exception 'This membership isn''t on sale.' using errcode = 'P0001';
  end if;

  select max(m.valid_until) into v_current from public.members m
   where m.email = v_profile.email or m.alt_email = v_profile.email;
  if v_current is not null and v_current >= v_offer.valid_until then
    raise exception 'You''re already a member until %.', to_char(v_current, 'FMDD Mon YYYY') using errcode = 'P0001';
  end if;

  select * into v_app from public.membership_applications
   where offer_id = p_offer_id and user_id = v_uid and status <> 'cancelled';
  if found then
    return v_app;
  end if;

  insert into public.membership_applications (offer_id, user_id, full_name, email, student_id, price_cents, status, payment_reference, confirmed_at)
  values (p_offer_id, v_uid, v_profile.full_name, v_profile.email, private.clean(p_student_id), v_offer.price_cents,
          case when v_offer.price_cents = 0 then 'confirmed'::public.membership_status else 'awaiting_payment'::public.membership_status end,
          private.gen_membership_reference(),
          case when v_offer.price_cents = 0 then now() end)
  returning * into v_app;

  if v_app.status = 'confirmed' then
    perform private.grant_membership(v_app.id);
    select * into v_app from public.membership_applications where id = v_app.id;
  end if;
  return v_app;
exception when check_violation then
  raise exception 'Student ID is too long.' using errcode = 'P0001';
end;
$$;

create or replace function public.confirm_membership_payment(p_app_id uuid)
returns public.membership_applications
language plpgsql security definer set search_path = public, extensions
as $$
declare v_app public.membership_applications;
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  update public.membership_applications
     set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
   where id = p_app_id and status = 'awaiting_payment'
  returning * into v_app;
  if not found then
    raise exception 'That application isn''t waiting for payment.' using errcode = 'P0001';
  end if;
  perform private.grant_membership(p_app_id);
  select * into v_app from public.membership_applications where id = p_app_id;
  return v_app;
end;
$$;

-- ExCo can cancel any unpaid application; a user can cancel their own.
create or replace function public.cancel_membership_application(p_app_id uuid)
returns public.membership_applications
language plpgsql security definer set search_path = public, extensions
as $$
declare v_app public.membership_applications;
begin
  update public.membership_applications
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
   where id = p_app_id and status = 'awaiting_payment'
     and (private.is_admin() or user_id = auth.uid())
  returning * into v_app;
  if not found then
    raise exception 'That application can''t be cancelled.' using errcode = 'P0001';
  end if;
  return v_app;
end;
$$;

revoke execute on function public.apply_for_membership(uuid, text) from public, anon;
revoke execute on function public.confirm_membership_payment(uuid) from public, anon;
revoke execute on function public.cancel_membership_application(uuid) from public, anon;
grant execute on function public.apply_for_membership(uuid, text) to authenticated;
grant execute on function public.confirm_membership_payment(uuid) to authenticated;
grant execute on function public.cancel_membership_application(uuid) to authenticated;

alter table public.membership_offers enable row level security;
alter table public.membership_applications enable row level security;

create policy membership_offers_select on public.membership_offers for select to anon, authenticated
  using (is_open or (select private.is_admin()));
create policy membership_offers_admin_insert on public.membership_offers for insert to authenticated
  with check ((select private.is_admin()));
create policy membership_offers_admin_update on public.membership_offers for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy membership_applications_select on public.membership_applications for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

revoke delete on public.membership_offers from anon, authenticated;
revoke insert, update, delete on public.membership_offers from anon;
revoke insert, update, delete on public.membership_applications from anon, authenticated;
revoke all on public.membership_applications from anon;

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------
create table public.event_feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 1000),
  anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index event_feedback_user_idx on public.event_feedback (user_id);

alter table public.event_feedback enable row level security;
-- People only ever read their own row directly; ExCo uses the report below.
create policy event_feedback_select_own on public.event_feedback for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.event_feedback from authenticated;
revoke all on public.event_feedback from anon;

create or replace function public.submit_feedback(p_event_id uuid, p_rating integer, p_comment text default null, p_anonymous boolean default false)
returns public.event_feedback
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_start timestamptz;
  v_row public.event_feedback;
begin
  if v_uid is null then
    raise exception 'You need to log in first.' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Pick a rating from 1 to 5.' using errcode = 'P0001';
  end if;
  if length(coalesce(p_comment, '')) > 1000 then
    raise exception 'Keep the comment under 1000 characters.' using errcode = 'P0001';
  end if;
  select starts_at into v_start from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.tickets t where t.event_id = p_event_id and t.user_id = v_uid and t.checked_in_at is not null
  ) then
    raise exception 'Only people who came to this event can rate it.' using errcode = 'P0001';
  end if;
  if now() < v_start then
    raise exception 'You can rate it once the event has started.' using errcode = 'P0001';
  end if;
  if now() > v_start + interval '30 days' then
    raise exception 'Feedback for this event has closed.' using errcode = 'P0001';
  end if;

  insert into public.event_feedback (event_id, user_id, rating, comment, anonymous)
  values (p_event_id, v_uid, p_rating, private.clean(p_comment), coalesce(p_anonymous, false))
  on conflict (event_id, user_id) do update
     set rating = excluded.rating, comment = excluded.comment, anonymous = excluded.anonymous, updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.event_feedback_report(p_event_id uuid)
returns table (rating smallint, comment text, name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  return query
  select f.rating, f.comment,
         case when f.anonymous then null else coalesce(p.full_name, p.email::text) end,
         f.updated_at
  from public.event_feedback f join public.profiles p on p.id = f.user_id
  where f.event_id = p_event_id
  order by f.updated_at desc;
end;
$$;

revoke execute on function public.submit_feedback(uuid, integer, text, boolean) from public, anon;
revoke execute on function public.event_feedback_report(uuid) from public, anon;
grant execute on function public.submit_feedback(uuid, integer, text, boolean) to authenticated;
grant execute on function public.event_feedback_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Budgets: membership income on the "general" row
-- ---------------------------------------------------------------------------
drop function if exists public.event_finance_summary();
create or replace function public.event_finance_summary()
returns table (
  event_id uuid,
  title text,
  starts_at timestamptz,
  tickets_confirmed integer,
  ticket_income integer,
  membership_income integer,
  unpaid_income integer,
  expenses integer,
  reimbursements integer,
  pending_reimbursements integer,
  net integer
)
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if not private.is_finance() then
    raise exception 'Finance only.' using errcode = 'P0001';
  end if;
  return query
  with ev as (
    select e.id, e.title, e.starts_at from public.events e
    union all
    select null::uuid, 'General (not tied to an event)', null::timestamptz
  ),
  t as (
    select tk.event_id,
           count(*) filter (where tk.status = 'confirmed')::int as n,
           coalesce(sum(tk.price_cents) filter (where tk.status = 'confirmed'), 0)::int as income,
           coalesce(sum(tk.price_cents) filter (where tk.status = 'awaiting_payment'), 0)::int as unpaid
    from public.tickets tk group by tk.event_id
  ),
  m as (
    select null::uuid as event_id,
           coalesce(sum(a.price_cents) filter (where a.status = 'confirmed'), 0)::int as income,
           coalesce(sum(a.price_cents) filter (where a.status = 'awaiting_payment'), 0)::int as unpaid
    from public.membership_applications a
  ),
  x as (
    select ex.event_id, coalesce(sum(ex.amount_cents), 0)::int as spent
    from public.event_expenses ex where ex.voided_at is null group by ex.event_id
  ),
  c as (
    select r.event_id,
           coalesce(sum(r.amount_cents) filter (where cl.status in ('approved', 'paid')), 0)::int as reimb,
           coalesce(sum(r.amount_cents) filter (where cl.status = 'submitted'), 0)::int as pending
    from public.claims cl
    join public.claim_revisions r on r.claim_id = cl.id and r.revision = cl.current_revision
    group by r.event_id
  )
  select ev.id, ev.title, ev.starts_at,
         coalesce(t.n, 0), coalesce(t.income, 0), coalesce(m.income, 0),
         coalesce(t.unpaid, 0) + coalesce(m.unpaid, 0),
         coalesce(x.spent, 0), coalesce(c.reimb, 0), coalesce(c.pending, 0),
         coalesce(t.income, 0) + coalesce(m.income, 0) - coalesce(x.spent, 0) - coalesce(c.reimb, 0)
  from ev
  left join t on t.event_id is not distinct from ev.id
  left join m on m.event_id is not distinct from ev.id
  left join x on x.event_id is not distinct from ev.id
  left join c on c.event_id is not distinct from ev.id
  order by ev.starts_at desc nulls last;
end;
$$;
revoke execute on function public.event_finance_summary() from public, anon;
grant execute on function public.event_finance_summary() to authenticated;
