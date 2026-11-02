-- Inventory: a person in charge of each item, and transfers between people.
--
-- "Where" says where an item is kept. "Person in charge" says who answers for
-- it (keeps it, knows where it is, hands it on). Responsibility moves with a
-- transfer, which is logged like every other inventory change.
--   * ExCo can set or change the person in charge of any item.
--   * The current person in charge can hand their item to another team member.
--   * The person in charge must be a current team member (or nobody).
-- Loans ("who has it right now") are unchanged.
--
-- Additive: the deployed app keeps working. create_inventory_item gains an
-- optional last parameter, so existing calls still match.

alter type public.inventory_action add value if not exists 'transferred';

alter table public.inventory_items
  add column if not exists keeper_id uuid references public.profiles (id) on delete set null;
create index if not exists inventory_items_keeper_idx on public.inventory_items (keeper_id);

-- The view was created with i.*, which Postgres expands once. Recreate it so
-- it includes the new column.
drop view if exists public.inventory_overview;
create view public.inventory_overview
with (security_invoker = true) as
select i.*,
       coalesce(l.out, 0)::int as on_loan,
       (i.quantity - coalesce(l.out, 0))::int as available
from public.inventory_items i
left join (
  select item_id, sum(quantity) as out from public.inventory_loans where returned_at is null group by item_id
) l on l.item_id = i.id;
revoke all on public.inventory_overview from anon;
grant select on public.inventory_overview to authenticated;

create or replace function private.is_current_team_member(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from public.team_memberships m
    where m.user_id = p_user_id and private.hk_today() between m.starts_on and m.ends_on
  )
$$;
revoke execute on function private.is_current_team_member(uuid) from public;
grant execute on function private.is_current_team_member(uuid) to authenticated;

drop function if exists public.create_inventory_item(text, text, text, public.item_condition, integer, text);
create or replace function public.create_inventory_item(
  p_name text,
  p_category text,
  p_location text,
  p_condition public.item_condition,
  p_quantity integer,
  p_notes text default null,
  p_keeper_id uuid default null
)
returns public.inventory_items
language plpgsql security definer set search_path = public, extensions
as $$
declare v_item public.inventory_items;
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  if private.clean(p_name) is null then
    raise exception 'Give the item a name.' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'Quantity can''t be negative.' using errcode = 'P0001';
  end if;
  if p_keeper_id is not null and not private.is_current_team_member(p_keeper_id) then
    raise exception 'The person in charge must be a current team member.' using errcode = 'P0001';
  end if;
  insert into public.inventory_items (name, category, location, condition, quantity, notes, keeper_id)
  values (private.clean(p_name), private.clean(p_category), private.clean(p_location),
          coalesce(p_condition, 'good'), p_quantity, private.clean(p_notes), p_keeper_id)
  returning * into v_item;
  insert into public.inventory_log (item_id, action, quantity_delta, actor_id, details)
  values (v_item.id, 'created', p_quantity, auth.uid(),
          case when p_keeper_id is null then null else jsonb_build_object('keeper_id', p_keeper_id) end);
  return v_item;
exception when check_violation then
  raise exception 'Check the lengths: name up to 100, category 50, location 200, notes 1000 characters.' using errcode = 'P0001';
end;
$$;

-- Hand an item to someone else (or to nobody). ExCo, or the current person in charge.
create or replace function public.transfer_inventory_item(p_item_id uuid, p_keeper_id uuid, p_note text default null)
returns public.inventory_items
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_item public.inventory_items;
  v_from uuid;
begin
  if not private.is_team() then
    raise exception 'Team members only.' using errcode = 'P0001';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found.' using errcode = 'P0001';
  end if;
  if v_item.retired_at is not null then
    raise exception 'This item is retired.' using errcode = 'P0001';
  end if;
  if not (private.is_admin() or coalesce(v_item.keeper_id = auth.uid(), false)) then
    raise exception 'Only the person in charge of this item, or an ExCo, can hand it on.' using errcode = 'P0001';
  end if;
  if p_keeper_id is not distinct from v_item.keeper_id then
    raise exception 'They''re already in charge of it.' using errcode = 'P0001';
  end if;
  if p_keeper_id is not null and not private.is_current_team_member(p_keeper_id) then
    raise exception 'The person in charge must be a current team member.' using errcode = 'P0001';
  end if;

  v_from := v_item.keeper_id;
  update public.inventory_items set keeper_id = p_keeper_id, updated_at = now()
   where id = p_item_id returning * into v_item;
  insert into public.inventory_log (item_id, action, actor_id, note, details)
  values (p_item_id, 'transferred', auth.uid(), private.clean(p_note),
          jsonb_build_object('from', v_from, 'to', p_keeper_id));
  return v_item;
end;
$$;

revoke execute on function public.create_inventory_item(text, text, text, public.item_condition, integer, text, uuid) from public, anon;
revoke execute on function public.transfer_inventory_item(uuid, uuid, text) from public, anon;
grant execute on function public.create_inventory_item(text, text, text, public.item_condition, integer, text, uuid) to authenticated;
grant execute on function public.transfer_inventory_item(uuid, uuid, text) to authenticated;
