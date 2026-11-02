-- Accounts: income as well as expenses, a statement per event and per
-- academic year, and an opening bank balance for each year.
--
-- What's counted, and where it comes from:
--   * Ticket sales     automatic, from confirmed tickets (by event)
--   * Memberships      automatic, from confirmed membership applications
--   * Reimbursements   automatic, from approved and paid claims (one line)
--   * Everything else  entered by Finance: expenses (venue, alcohol, ...) and
--                      income (sponsorship, Students' Union grant, ...), each
--                      for an event or for the year in general.
-- Automatic lines are live: they can't be "imported" twice or go stale.
--
-- Academic year: 1 Sep to 31 Aug, Hong Kong time. An event's money belongs to
-- the year the event is in. General entries go by their date.
--
-- Additive: event_expenses gains a "kind" column (existing rows are
-- expenses), and event_finance_summary gains an other_income column and stops
-- counting income entries as costs. Finance only, as before.

alter table public.event_expenses
  add column if not exists kind text not null default 'expense' check (kind in ('expense', 'income'));

-- 1 Sep 2026 -> 2026; 31 Aug 2027 -> 2026.
create or replace function private.academic_year(p_date date)
returns integer
language sql immutable set search_path = public, extensions
as $$ select case when extract(month from p_date) >= 9 then extract(year from p_date)::int else extract(year from p_date)::int - 1 end $$;
revoke execute on function private.academic_year(date) from public;
grant execute on function private.academic_year(date) to authenticated;

create or replace function private.hk_date(p_at timestamptz)
returns date
language sql immutable set search_path = public, extensions
as $$ select (p_at at time zone 'Asia/Hong_Kong')::date $$;
revoke execute on function private.hk_date(timestamptz) from public;
grant execute on function private.hk_date(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Entries (income or expense)
-- ---------------------------------------------------------------------------
create or replace function public.add_finance_entry(
  p_kind text,
  p_event_id uuid,
  p_category text,
  p_description text,
  p_amount_cents integer,
  p_entry_date date,
  p_party text default null,
  p_receipt_path text default null
)
returns public.event_expenses
language plpgsql security definer set search_path = public, extensions
as $$
declare v_row public.event_expenses;
begin
  if not private.is_finance() then
    raise exception 'Finance only.' using errcode = 'P0001';
  end if;
  if p_kind is null or p_kind not in ('expense', 'income') then
    raise exception 'Choose income or expense.' using errcode = 'P0001';
  end if;
  if private.clean(p_category) is null then
    raise exception 'Pick a category.' using errcode = 'P0001';
  end if;
  if private.clean(p_description) is null then
    raise exception 'Say what it was for.' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter the amount.' using errcode = 'P0001';
  end if;
  if p_amount_cents > 100000000 then
    raise exception 'That amount looks wrong (over HK$1,000,000).' using errcode = 'P0001';
  end if;
  if p_entry_date is null then
    raise exception 'Enter the date.' using errcode = 'P0001';
  end if;
  if p_event_id is not null and not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'That event no longer exists.' using errcode = 'P0001';
  end if;
  if private.clean(p_receipt_path) is not null and (
       split_part(p_receipt_path, '/', 1) <> (select auth.uid())::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'receipts' and o.name = p_receipt_path)) then
    raise exception 'The receipt upload didn''t finish. Attach it again.' using errcode = 'P0001';
  end if;

  insert into public.event_expenses (kind, event_id, category, description, payee, amount_cents, paid_on, receipt_path, created_by)
  values (p_kind, p_event_id, trim(p_category), trim(p_description), private.clean(p_party), p_amount_cents, p_entry_date,
          private.clean(p_receipt_path), auth.uid())
  returning * into v_row;
  return v_row;
exception when check_violation then
  raise exception 'Check the lengths: category up to 40, description 300, name 100 characters.' using errcode = 'P0001';
end;
$$;
revoke execute on function public.add_finance_entry(text, uuid, text, text, integer, date, text, text) from public, anon;
grant execute on function public.add_finance_entry(text, uuid, text, text, integer, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Opening bank balance per academic year
-- ---------------------------------------------------------------------------
create table if not exists public.finance_years (
  year_start integer primary key check (year_start between 2000 and 2100),
  opening_cents bigint not null check (opening_cents between -100000000 and 1000000000),
  note text check (note is null or length(note) <= 300),
  set_by uuid references public.profiles (id) on delete set null,
  set_at timestamptz not null default now()
);
create index if not exists finance_years_set_by_idx on public.finance_years (set_by);
alter table public.finance_years enable row level security;
drop policy if exists finance_years_select on public.finance_years;
create policy finance_years_select on public.finance_years for select to authenticated
  using ((select private.is_finance()));
revoke insert, update, delete on public.finance_years from authenticated;
revoke all on public.finance_years from anon;

create or replace function public.set_opening_balance(p_year_start integer, p_opening_cents bigint, p_note text default null)
returns public.finance_years
language plpgsql security definer set search_path = public, extensions
as $$
declare v_row public.finance_years;
begin
  if not private.is_finance() then
    raise exception 'Finance only.' using errcode = 'P0001';
  end if;
  if p_year_start is null or p_year_start not between 2000 and 2100 then
    raise exception 'Pick an academic year.' using errcode = 'P0001';
  end if;
  if p_opening_cents is null then
    raise exception 'Enter the bank balance.' using errcode = 'P0001';
  end if;
  insert into public.finance_years (year_start, opening_cents, note, set_by, set_at)
  values (p_year_start, p_opening_cents, private.clean(p_note), auth.uid(), now())
  on conflict (year_start) do update
    set opening_cents = excluded.opening_cents, note = excluded.note, set_by = excluded.set_by, set_at = excluded.set_at
  returning * into v_row;
  return v_row;
exception when check_violation then
  raise exception 'That balance looks wrong. Check the amount, and keep the note under 300 characters.' using errcode = 'P0001';
end;
$$;
revoke execute on function public.set_opening_balance(integer, bigint, text) from public, anon;
grant execute on function public.set_opening_balance(integer, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Statement lines. One row per (event, kind, category, source).
-- p_year_start null = every year.
--   amount_cents   counted
--   pending_cents  not counted yet (unpaid tickets/memberships, claims waiting for review)
--   owed_cents     reimbursements approved but not paid out yet (included in amount)
-- ---------------------------------------------------------------------------
create or replace function public.finance_lines(p_year_start integer default null)
returns table (
  event_id uuid,
  year_start integer,
  kind text,
  category text,
  source text,
  amount_cents bigint,
  pending_cents bigint,
  owed_cents bigint
)
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if not private.is_finance() then
    raise exception 'Finance only.' using errcode = 'P0001';
  end if;
  return query
  with ev as (
    select e.id, private.academic_year(private.hk_date(e.starts_at)) as yr from public.events e
  ),
  lines as (
    -- Ticket sales
    select tk.event_id, ev.yr, 'income'::text as kind, 'Ticket sales'::text as category, 'tickets'::text as source,
           coalesce(sum(tk.price_cents) filter (where tk.status = 'confirmed'), 0)::bigint as amount,
           coalesce(sum(tk.price_cents) filter (where tk.status = 'awaiting_payment'), 0)::bigint as pending,
           0::bigint as owed
    from public.tickets tk join ev on ev.id = tk.event_id
    group by tk.event_id, ev.yr
    union all
    -- Memberships
    select null::uuid, private.academic_year(private.hk_date(coalesce(a.confirmed_at, a.created_at))), 'income', 'Memberships', 'memberships',
           coalesce(sum(a.price_cents) filter (where a.status = 'confirmed'), 0)::bigint,
           coalesce(sum(a.price_cents) filter (where a.status = 'awaiting_payment'), 0)::bigint,
           0::bigint
    from public.membership_applications a
    group by 2
    union all
    -- Reimbursements (current revision of each claim)
    select r.event_id, coalesce(ev.yr, private.academic_year(private.hk_date(cl.created_at))), 'expense', 'Reimbursements', 'claims',
           coalesce(sum(r.amount_cents) filter (where cl.status in ('approved', 'paid')), 0)::bigint,
           coalesce(sum(r.amount_cents) filter (where cl.status = 'submitted'), 0)::bigint,
           coalesce(sum(r.amount_cents) filter (where cl.status = 'approved'), 0)::bigint
    from public.claims cl
    join public.claim_revisions r on r.claim_id = cl.id and r.revision = cl.current_revision
    left join ev on ev.id = r.event_id
    group by r.event_id, 2
    union all
    -- Entered by Finance
    select x.event_id, coalesce(ev.yr, private.academic_year(x.paid_on)), x.kind, x.category, 'manual',
           sum(x.amount_cents)::bigint, 0::bigint, 0::bigint
    from public.event_expenses x
    left join ev on ev.id = x.event_id
    where x.voided_at is null
    group by x.event_id, 2, x.kind, x.category
  )
  select l.event_id, l.yr, l.kind, l.category, l.source, l.amount, l.pending, l.owed
  from lines l
  where (p_year_start is null or l.yr = p_year_start)
    and (l.amount <> 0 or l.pending <> 0);
end;
$$;
revoke execute on function public.finance_lines(integer) from public, anon;
grant execute on function public.finance_lines(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Keep the per-event summary right now that entries can be income.
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
  other_income integer,
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
    select ex.event_id,
           coalesce(sum(ex.amount_cents) filter (where ex.kind = 'expense'), 0)::int as spent,
           coalesce(sum(ex.amount_cents) filter (where ex.kind = 'income'), 0)::int as earned
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
         coalesce(t.n, 0), coalesce(t.income, 0), coalesce(m.income, 0), coalesce(x.earned, 0),
         coalesce(t.unpaid, 0) + coalesce(m.unpaid, 0),
         coalesce(x.spent, 0), coalesce(c.reimb, 0), coalesce(c.pending, 0),
         coalesce(t.income, 0) + coalesce(m.income, 0) + coalesce(x.earned, 0) - coalesce(x.spent, 0) - coalesce(c.reimb, 0)
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
