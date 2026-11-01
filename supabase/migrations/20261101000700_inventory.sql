-- Phase 4: inventory.
--
-- Things the society owns (decorations, equipment, leftover stock), how many,
-- where they are, what state they're in, and who has them.
--   * Any current team member can see inventory, check items out to a team
--     member and record returns.
--   * ExCo can add, edit, recount (adjust quantity) and retire items.
--   * Loans can be partial ("10 of 40 diyas"). On return, anything not brought
--     back is recorded as lost and taken off the owned count.
--   * Every change is written to inventory_log with who, when and why.
-- All writes go through the RPCs below; the tables have no write policies.

-- ---------------------------------------------------------------------------
-- Types and tables
-- ---------------------------------------------------------------------------
create type public.item_condition as enum ('new', 'good', 'worn', 'damaged');
create type public.inventory_action as enum (
  'created', 'edited', 'adjusted', 'checked_out', 'returned', 'lost', 'retired'
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  category text check (category is null or length(trim(category)) between 1 and 50),
  location text check (location is null or length(location) <= 200),
  condition public.item_condition not null default 'good',
  quantity integer not null check (quantity >= 0),
  notes text check (notes is null or length(notes) <= 1000),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inventory_items_name_idx on public.inventory_items (lower(name));

create table public.inventory_loans (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items (id) on delete restrict,
  borrower_id uuid not null references public.profiles (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  event_id uuid references public.events (id) on delete set null,
  due_on date,
  note text check (note is null or length(note) <= 500),
  checked_out_at timestamptz not null default now(),
  checked_out_by uuid references public.profiles (id) on delete set null,
  returned_at timestamptz,
  returned_quantity integer check (returned_quantity is null or returned_quantity between 0 and quantity),
  returned_by uuid references public.profiles (id) on delete set null
);
create index inventory_loans_item_idx on public.inventory_loans (item_id) where returned_at is null;
create index inventory_loans_borrower_idx on public.inventory_loans (borrower_id);
create index inventory_loans_event_idx on public.inventory_loans (event_id);
create index inventory_loans_out_by_idx on public.inventory_loans (checked_out_by);
create index inventory_loans_ret_by_idx on public.inventory_loans (returned_by);

create table public.inventory_log (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.inventory_items (id) on delete restrict,
  loan_id uuid references public.inventory_loans (id) on delete restrict,
  action public.inventory_action not null,
  quantity_delta integer not null default 0,
  actor_id uuid references public.profiles (id) on delete set null,
  note text check (note is null or length(note) <= 500),
  details jsonb,
  created_at timestamptz not null default now()
);
create index inventory_log_item_idx on public.inventory_log (item_id, created_at desc);
create index inventory_log_loan_idx on public.inventory_log (loan_id);
create index inventory_log_actor_idx on public.inventory_log (actor_id);

-- How many are on loan right now (unreturned loans).
create or replace function private.on_loan(p_item_id uuid)
returns integer
language sql stable security definer set search_path = public, extensions
as $$ select coalesce(sum(quantity), 0)::int from public.inventory_loans where item_id = p_item_id and returned_at is null $$;
revoke execute on function private.on_loan(uuid) from public;
grant execute on function private.on_loan(uuid) to authenticated;

-- Items with live availability, for the app to read.
create or replace view public.inventory_overview
with (security_invoker = true) as
select i.*,
       coalesce(l.out, 0)::int as on_loan,
       (i.quantity - coalesce(l.out, 0))::int as available
from public.inventory_items i
left join (
  select item_id, sum(quantity) as out from public.inventory_loans where returned_at is null group by item_id
) l on l.item_id = i.id;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function private.clean(p text) returns text
language sql immutable set search_path = public, extensions
as $$ select nullif(trim(p), '') $$;
revoke execute on function private.clean(text) from public;
grant execute on function private.clean(text) to authenticated;

create or replace function public.create_inventory_item(
  p_name text,
  p_category text,
  p_location text,
  p_condition public.item_condition,
  p_quantity integer,
  p_notes text default null
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
  insert into public.inventory_items (name, category, location, condition, quantity, notes)
  values (private.clean(p_name), private.clean(p_category), private.clean(p_location),
          coalesce(p_condition, 'good'), p_quantity, private.clean(p_notes))
  returning * into v_item;
  insert into public.inventory_log (item_id, action, quantity_delta, actor_id)
  values (v_item.id, 'created', p_quantity, auth.uid());
  return v_item;
exception when check_violation then
  raise exception 'Check the lengths: name up to 100, category 50, location 200, notes 1000 characters.' using errcode = 'P0001';
end;
$$;

-- Edits descriptive fields only. Quantity changes go through adjust_inventory.
create or replace function public.update_inventory_item(
  p_item_id uuid,
  p_name text,
  p_category text,
  p_location text,
  p_condition public.item_condition,
  p_notes text
)
returns public.inventory_items
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_old public.inventory_items;
  v_item public.inventory_items;
  v_changes jsonb := '{}'::jsonb;
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  select * into v_old from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found.' using errcode = 'P0001';
  end if;
  if private.clean(p_name) is null then
    raise exception 'Give the item a name.' using errcode = 'P0001';
  end if;

  update public.inventory_items
     set name = private.clean(p_name), category = private.clean(p_category), location = private.clean(p_location),
         condition = coalesce(p_condition, condition), notes = private.clean(p_notes), updated_at = now()
   where id = p_item_id
  returning * into v_item;

  if v_item.name is distinct from v_old.name then v_changes := v_changes || jsonb_build_object('name', jsonb_build_array(v_old.name, v_item.name)); end if;
  if v_item.category is distinct from v_old.category then v_changes := v_changes || jsonb_build_object('category', jsonb_build_array(v_old.category, v_item.category)); end if;
  if v_item.location is distinct from v_old.location then v_changes := v_changes || jsonb_build_object('location', jsonb_build_array(v_old.location, v_item.location)); end if;
  if v_item.condition is distinct from v_old.condition then v_changes := v_changes || jsonb_build_object('condition', jsonb_build_array(v_old.condition, v_item.condition)); end if;
  if v_item.notes is distinct from v_old.notes then v_changes := v_changes || jsonb_build_object('notes', jsonb_build_array(v_old.notes, v_item.notes)); end if;

  if v_changes <> '{}'::jsonb then
    insert into public.inventory_log (item_id, action, actor_id, details) values (p_item_id, 'edited', auth.uid(), v_changes);
  end if;
  return v_item;
exception when check_violation then
  raise exception 'Check the lengths: name up to 100, category 50, location 200, notes 1000 characters.' using errcode = 'P0001';
end;
$$;

-- Recount: bought more (+), used up / broken / thrown away (-). Reason required.
create or replace function public.adjust_inventory(p_item_id uuid, p_delta integer, p_reason text)
returns public.inventory_items
language plpgsql security definer set search_path = public, extensions
as $$
declare v_item public.inventory_items;
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'Enter how many to add or remove.' using errcode = 'P0001';
  end if;
  if private.clean(p_reason) is null then
    raise exception 'Say why the count changed (e.g. bought 20 more, 5 broke).' using errcode = 'P0001';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found.' using errcode = 'P0001';
  end if;
  if v_item.retired_at is not null then
    raise exception 'This item is retired.' using errcode = 'P0001';
  end if;
  if v_item.quantity + p_delta < private.on_loan(p_item_id) then
    raise exception 'That leaves fewer than are currently checked out (%). Record the returns first.', private.on_loan(p_item_id) using errcode = 'P0001';
  end if;

  update public.inventory_items set quantity = quantity + p_delta, updated_at = now() where id = p_item_id returning * into v_item;
  insert into public.inventory_log (item_id, action, quantity_delta, actor_id, note)
  values (p_item_id, 'adjusted', p_delta, auth.uid(), private.clean(p_reason));
  return v_item;
end;
$$;

create or replace function public.check_out_item(
  p_item_id uuid,
  p_borrower_id uuid,
  p_quantity integer,
  p_event_id uuid default null,
  p_due_on date default null,
  p_note text default null
)
returns public.inventory_loans
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_item public.inventory_items;
  v_loan public.inventory_loans;
  v_available integer;
begin
  if not private.is_team() then
    raise exception 'Team members only.' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter how many they''re taking.' using errcode = 'P0001';
  end if;
  -- Lock the item so two people can't check out the last ones at the same time.
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found.' using errcode = 'P0001';
  end if;
  if v_item.retired_at is not null then
    raise exception 'This item is retired.' using errcode = 'P0001';
  end if;
  v_available := v_item.quantity - private.on_loan(p_item_id);
  if p_quantity > v_available then
    raise exception 'Only % available right now.', v_available using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.team_memberships m
    where m.user_id = p_borrower_id and private.hk_today() between m.starts_on and m.ends_on
  ) then
    raise exception 'Items can only be checked out to current team members.' using errcode = 'P0001';
  end if;
  if p_due_on is not null and p_due_on < private.hk_today() then
    raise exception 'The return date is in the past.' using errcode = 'P0001';
  end if;

  insert into public.inventory_loans (item_id, borrower_id, quantity, event_id, due_on, note, checked_out_by)
  values (p_item_id, p_borrower_id, p_quantity, p_event_id, p_due_on, private.clean(p_note), auth.uid())
  returning * into v_loan;
  insert into public.inventory_log (item_id, loan_id, action, quantity_delta, actor_id, note, details)
  values (p_item_id, v_loan.id, 'checked_out', -p_quantity, auth.uid(), private.clean(p_note),
          jsonb_build_object('borrower_id', p_borrower_id, 'event_id', p_event_id, 'due_on', p_due_on));
  return v_loan;
end;
$$;

-- Records a return. Anything not brought back is logged as lost and removed
-- from the owned count. Optionally updates the item's condition.
create or replace function public.return_item(
  p_loan_id uuid,
  p_returned_quantity integer,
  p_condition public.item_condition default null,
  p_note text default null
)
returns public.inventory_loans
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_loan public.inventory_loans;
  v_missing integer;
begin
  if not private.is_team() then
    raise exception 'Team members only.' using errcode = 'P0001';
  end if;
  select * into v_loan from public.inventory_loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found.' using errcode = 'P0001';
  end if;
  if v_loan.returned_at is not null then
    raise exception 'That has already been returned.' using errcode = 'P0001';
  end if;
  if p_returned_quantity is null or p_returned_quantity < 0 or p_returned_quantity > v_loan.quantity then
    raise exception 'Enter how many came back (0 to %).', v_loan.quantity using errcode = 'P0001';
  end if;
  v_missing := v_loan.quantity - p_returned_quantity;
  if v_missing > 0 and private.clean(p_note) is null then
    raise exception 'Say what happened to the % that didn''t come back.', v_missing using errcode = 'P0001';
  end if;

  perform 1 from public.inventory_items where id = v_loan.item_id for update;

  update public.inventory_loans
     set returned_at = now(), returned_quantity = p_returned_quantity, returned_by = auth.uid()
   where id = p_loan_id
  returning * into v_loan;
  insert into public.inventory_log (item_id, loan_id, action, quantity_delta, actor_id, note)
  values (v_loan.item_id, p_loan_id, 'returned', p_returned_quantity, auth.uid(), private.clean(p_note));

  if v_missing > 0 then
    update public.inventory_items set quantity = quantity - v_missing, updated_at = now() where id = v_loan.item_id;
    insert into public.inventory_log (item_id, loan_id, action, quantity_delta, actor_id, note)
    values (v_loan.item_id, p_loan_id, 'lost', -v_missing, auth.uid(), private.clean(p_note));
  end if;

  if p_condition is not null then
    update public.inventory_items set condition = p_condition, updated_at = now()
     where id = v_loan.item_id and condition is distinct from p_condition;
    if found then
      insert into public.inventory_log (item_id, loan_id, action, actor_id, details)
      values (v_loan.item_id, p_loan_id, 'edited', auth.uid(), jsonb_build_object('condition', p_condition));
    end if;
  end if;
  return v_loan;
end;
$$;

create or replace function public.retire_inventory_item(p_item_id uuid, p_reason text)
returns public.inventory_items
language plpgsql security definer set search_path = public, extensions
as $$
declare v_item public.inventory_items;
begin
  if not private.is_admin() then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  if private.clean(p_reason) is null then
    raise exception 'Say why it''s being retired.' using errcode = 'P0001';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found.' using errcode = 'P0001';
  end if;
  if v_item.retired_at is not null then
    raise exception 'Already retired.' using errcode = 'P0001';
  end if;
  if private.on_loan(p_item_id) > 0 then
    raise exception 'Some are still checked out. Record the returns first.' using errcode = 'P0001';
  end if;
  update public.inventory_items set retired_at = now(), updated_at = now() where id = p_item_id returning * into v_item;
  insert into public.inventory_log (item_id, action, actor_id, note) values (p_item_id, 'retired', auth.uid(), private.clean(p_reason));
  return v_item;
end;
$$;

revoke execute on function public.create_inventory_item(text, text, text, public.item_condition, integer, text) from public, anon;
revoke execute on function public.update_inventory_item(uuid, text, text, text, public.item_condition, text) from public, anon;
revoke execute on function public.adjust_inventory(uuid, integer, text) from public, anon;
revoke execute on function public.check_out_item(uuid, uuid, integer, uuid, date, text) from public, anon;
revoke execute on function public.return_item(uuid, integer, public.item_condition, text) from public, anon;
revoke execute on function public.retire_inventory_item(uuid, text) from public, anon;
grant execute on function public.create_inventory_item(text, text, text, public.item_condition, integer, text) to authenticated;
grant execute on function public.update_inventory_item(uuid, text, text, text, public.item_condition, text) to authenticated;
grant execute on function public.adjust_inventory(uuid, integer, text) to authenticated;
grant execute on function public.check_out_item(uuid, uuid, integer, uuid, date, text) to authenticated;
grant execute on function public.return_item(uuid, integer, public.item_condition, text) to authenticated;
grant execute on function public.retire_inventory_item(uuid, text) to authenticated;

-- Current team members, for the "check out to" picker. Team only.
create or replace function public.team_directory()
returns table (user_id uuid, full_name text, email text)
language sql stable security definer set search_path = public, extensions
as $$
  select distinct p.id, p.full_name, p.email::text
  from public.team_memberships m join public.profiles p on p.id = m.user_id
  where private.is_team() and private.hk_today() between m.starts_on and m.ends_on
  order by p.full_name nulls last
$$;
revoke execute on function public.team_directory() from public, anon;
grant execute on function public.team_directory() to authenticated;

-- Names for people shown in inventory (borrowers, who checked out, history).
-- Subcommittee can't read profiles directly, so this returns names only, only
-- to team members, and only for people who have ever been on the team.
create or replace function public.team_member_names(p_ids uuid[])
returns table (user_id uuid, full_name text)
language sql stable security definer set search_path = public, extensions
as $$
  select p.id, coalesce(p.full_name, split_part(p.email::text, '@', 1))
  from public.profiles p
  where private.is_team()
    and p.id = any(p_ids)
    and exists (select 1 from public.team_memberships m where m.user_id = p.id)
$$;
revoke execute on function public.team_member_names(uuid[]) from public, anon;
grant execute on function public.team_member_names(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security: team reads, nobody writes directly.
-- ---------------------------------------------------------------------------
alter table public.inventory_items enable row level security;
alter table public.inventory_loans enable row level security;
alter table public.inventory_log enable row level security;

create policy inventory_items_select on public.inventory_items for select to authenticated
  using ((select private.is_team()));
create policy inventory_loans_select on public.inventory_loans for select to authenticated
  using ((select private.is_team()) or borrower_id = (select auth.uid()));
create policy inventory_log_select on public.inventory_log for select to authenticated
  using ((select private.is_team()));

revoke insert, update, delete on public.inventory_items, public.inventory_loans, public.inventory_log from authenticated;
revoke all on public.inventory_items, public.inventory_loans, public.inventory_log, public.inventory_overview from anon;
grant select on public.inventory_overview to authenticated;
