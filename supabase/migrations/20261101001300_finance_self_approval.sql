-- The Finance department's ExCo (the VP of Finance) may approve and pay their
-- own reimbursement claims. Nobody else may, owners included.
--
-- Self-approval removes the usual two-person check, so it is never silent:
-- every review or payment by the claimant is stored with by_claimant = true,
-- shown as "self-approved" on the claim, in the Finance list and in the CSV,
-- and counted for hub owners on the Finance page.

alter table public.claim_events add column by_claimant boolean not null default false;

-- ExCo in a department that handles finance (not owners).
create or replace function private.is_finance_exco()
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
revoke execute on function private.is_finance_exco() from public;
grant execute on function private.is_finance_exco() to authenticated;

create or replace function public.my_access()
returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'is_admin', private.is_admin(),
    'is_staff', private.is_staff(),
    'is_team', private.is_team(),
    'is_finance', private.is_finance(),
    'is_finance_exco', private.is_finance_exco(),
    'is_owner', private.is_owner(),
    'term_end', private.current_term_end()
  )
$$;

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
  v_self boolean;
begin
  if not private.is_finance() then
    raise exception 'Finance only.' using errcode = 'P0001';
  end if;
  select * into v_claim from public.claims where id = p_claim_id for update;
  if not found then
    raise exception 'Claim not found.' using errcode = 'P0001';
  end if;
  v_self := v_claim.claimant_id = auth.uid();
  if v_self and not private.is_finance_exco() then
    raise exception 'You can''t review your own claim. The Finance ExCo or another owner has to.' using errcode = 'P0001';
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
  insert into public.claim_events (claim_id, revision, from_status, to_status, actor_id, note, by_claimant)
  values (p_claim_id, p_revision, 'submitted', v_to, auth.uid(), nullif(trim(p_note), ''), v_self);
  return v_claim;
end;
$$;

create or replace function public.mark_claim_paid(p_claim_id uuid, p_reference text default null)
returns public.claims
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_claim public.claims;
  v_self boolean;
begin
  if not private.is_finance() then
    raise exception 'Finance only.' using errcode = 'P0001';
  end if;
  select * into v_claim from public.claims where id = p_claim_id for update;
  if not found then
    raise exception 'Claim not found.' using errcode = 'P0001';
  end if;
  v_self := v_claim.claimant_id = auth.uid();
  if v_self and not private.is_finance_exco() then
    raise exception 'You can''t mark your own claim as paid. The Finance ExCo or another owner has to.' using errcode = 'P0001';
  end if;
  if v_claim.status <> 'approved' then
    raise exception 'Only approved claims can be marked paid (this one is %).', v_claim.status using errcode = 'P0001';
  end if;

  update public.claims set status = 'paid', updated_at = now() where id = p_claim_id returning * into v_claim;
  insert into public.claim_events (claim_id, revision, from_status, to_status, actor_id, note, by_claimant)
  values (p_claim_id, v_claim.current_revision, 'approved', 'paid', auth.uid(), nullif(trim(p_reference), ''), v_self);
  return v_claim;
end;
$$;
