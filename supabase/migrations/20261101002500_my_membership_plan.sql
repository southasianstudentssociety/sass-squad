-- The signed-in member's plan, for the membership page ("your plan" tick and
-- the membership pass). Derived from the member list, so nothing new to keep
-- in step: plan years = expiry year - academic year of purchase (memberships
-- run to 31 May of academic-year-of-purchase + years). ExCo granted
-- membership until graduation are flagged instead.

create or replace function public.my_membership_plan()
returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
           'valid_until', m.valid_until,
           'purchased_at', m.purchased_at,
           'years', case when m.purchased_at is null then null
                         else extract(year from m.valid_until)::int - private.academic_year(m.purchased_at) end,
           'exco', coalesce(m.notes ilike '%ExCo 20%until graduation%', false)
         )
  from public.members m
  where auth.uid() is not null
    and m.valid_until >= private.hk_today()
    and (m.email in (select private.user_emails(auth.uid())) or m.alt_email in (select private.user_emails(auth.uid())))
  order by m.valid_until desc
  limit 1
$$;
revoke execute on function public.my_membership_plan() from public, anon;
grant execute on function public.my_membership_plan() to authenticated;
