-- Finance access for a department without the VP of Finance's self-approval.
--
-- departments.handles_finance (unchanged): the Finance department. Its ExCo
--   (the VP of Finance) get Finance AND may approve/pay their own claims,
--   always flagged as self-approved.
-- departments.finance_access (new): its ExCo get Finance (claims, receipts,
--   approve and pay others' claims, Accounts) but can't approve their own.
--   Used for Leadership (the Presidents).
-- Owners still count as Finance.

alter table public.departments add column if not exists finance_access boolean not null default false;

create or replace function private.is_finance()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select private.is_owner() or exists (
    select 1 from public.team_memberships m
    join public.departments d on d.id = m.department_id
    where m.user_id = (select auth.uid())
      and m.position = 'exco'
      and (d.handles_finance or d.finance_access)
      and private.hk_today() between m.starts_on and m.ends_on
  )
$$;
