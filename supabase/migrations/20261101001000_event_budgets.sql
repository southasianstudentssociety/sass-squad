-- Event budgets: Finance records the society's own spending (venue, alcohol,
-- food, decor, ...) per event, and sees each event's profit and loss:
--   income   = confirmed tickets (online, walk-in, comp at their price)
--   costs    = recorded expenses + approved/paid reimbursement claims
--   net      = income - costs
-- Also shown: unpaid ticket money and claims still waiting for review.
--
-- Expenses are never deleted. A mistake is voided with a reason, and stays in
-- the record. Only Finance (ExCo in a finance department) can see or change any
-- of this. Writes go through the RPCs below.

create table public.event_expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete restrict, -- null = general, not tied to an event
  category text not null check (length(trim(category)) between 1 and 40),
  description text not null check (length(trim(description)) between 1 and 300),
  payee text check (payee is null or length(payee) <= 100),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  paid_on date not null,
  receipt_path text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text check (void_reason is null or length(void_reason) <= 300)
);
create index event_expenses_event_idx on public.event_expenses (event_id) where voided_at is null;
create index event_expenses_created_by_idx on public.event_expenses (created_by);
create index event_expenses_voided_by_idx on public.event_expenses (voided_by);

alter table public.event_expenses enable row level security;
create policy event_expenses_select on public.event_expenses for select to authenticated
  using ((select private.is_finance()));
revoke insert, update, delete on public.event_expenses from authenticated;
revoke all on public.event_expenses from anon;

create or replace function public.add_expense(
  p_event_id uuid,
  p_category text,
  p_description text,
  p_amount_cents integer,
  p_paid_on date,
  p_payee text default null,
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
  if private.clean(p_category) is null then
    raise exception 'Pick a category.' using errcode = 'P0001';
  end if;
  if private.clean(p_description) is null then
    raise exception 'Say what it was for.' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter the amount paid.' using errcode = 'P0001';
  end if;
  if p_amount_cents > 100000000 then
    raise exception 'That amount looks wrong (over HK$1,000,000).' using errcode = 'P0001';
  end if;
  if p_paid_on is null then
    raise exception 'Enter the date it was paid.' using errcode = 'P0001';
  end if;
  if p_event_id is not null and not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'That event no longer exists.' using errcode = 'P0001';
  end if;
  if private.clean(p_receipt_path) is not null and (
       split_part(p_receipt_path, '/', 1) <> (select auth.uid())::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'receipts' and o.name = p_receipt_path)) then
    raise exception 'The receipt upload didn''t finish. Attach it again.' using errcode = 'P0001';
  end if;

  insert into public.event_expenses (event_id, category, description, payee, amount_cents, paid_on, receipt_path, created_by)
  values (p_event_id, trim(p_category), trim(p_description), private.clean(p_payee), p_amount_cents, p_paid_on,
          private.clean(p_receipt_path), auth.uid())
  returning * into v_row;
  return v_row;
exception when check_violation then
  raise exception 'Check the lengths: category up to 40, description 300, payee 100 characters.' using errcode = 'P0001';
end;
$$;

create or replace function public.void_expense(p_id uuid, p_reason text)
returns public.event_expenses
language plpgsql security definer set search_path = public, extensions
as $$
declare v_row public.event_expenses;
begin
  if not private.is_finance() then
    raise exception 'Finance only.' using errcode = 'P0001';
  end if;
  if private.clean(p_reason) is null then
    raise exception 'Say why it''s being voided.' using errcode = 'P0001';
  end if;
  update public.event_expenses
     set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
   where id = p_id and voided_at is null
  returning * into v_row;
  if not found then
    raise exception 'Expense not found, or already voided.' using errcode = 'P0001';
  end if;
  return v_row;
end;
$$;

-- One row per event (plus one "general" row with a null event_id).
create or replace function public.event_finance_summary()
returns table (
  event_id uuid,
  title text,
  starts_at timestamptz,
  tickets_confirmed integer,
  ticket_income integer,
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
         coalesce(t.n, 0), coalesce(t.income, 0), coalesce(t.unpaid, 0),
         coalesce(x.spent, 0), coalesce(c.reimb, 0), coalesce(c.pending, 0),
         coalesce(t.income, 0) - coalesce(x.spent, 0) - coalesce(c.reimb, 0)
  from ev
  left join t on t.event_id is not distinct from ev.id
  left join x on x.event_id is not distinct from ev.id
  left join c on c.event_id is not distinct from ev.id
  order by ev.starts_at desc nulls last;
end;
$$;

revoke execute on function public.add_expense(uuid, text, text, integer, date, text, text) from public, anon;
revoke execute on function public.void_expense(uuid, text) from public, anon;
revoke execute on function public.event_finance_summary() from public, anon;
grant execute on function public.add_expense(uuid, text, text, integer, date, text, text) to authenticated;
grant execute on function public.void_expense(uuid, text) to authenticated;
grant execute on function public.event_finance_summary() to authenticated;
