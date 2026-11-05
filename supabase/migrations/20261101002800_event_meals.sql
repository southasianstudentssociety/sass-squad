-- Meal choice per event.
--
-- ExCo switch meals on for an event and set its options (label + colour). The
-- defaults are Vegetarian (Non-Jain) green, Vegetarian (Jain) light green and
-- Non-Vegetarian red. When meals are on, getting a ticket online needs a meal,
-- saved on the ticket. Later imports (e.g. Diwali's sales) set it the same way.
--
--   * events.meals_enabled, public.event_meal_options, tickets.meal_option_id
--   * set_event_meals(event, enabled, options): ExCo. Saves the list; an option
--     tickets already use is hidden (archived), never deleted, so nobody loses
--     their choice. Switching on with no options adds the three defaults.
--   * claim_ticket_with_meal / claim_team_ticket_with_meal: check the meal,
--     then call claim_ticket / claim_team_ticket UNCHANGED (claim_ticket is
--     deliberately not edited before Diwali) and save the meal on the ticket.
--   * set_ticket_meal(ticket, option): the holder until the event starts
--     (e.g. a ticket from before meals were on, or a change of mind); ExCo any
--     time (door, imports).

alter table public.events add column if not exists meals_enabled boolean not null default false;

create table if not exists public.event_meal_options (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 40),
  color text not null default 'grey' check (color in ('green', 'light_green', 'red', 'amber', 'blue', 'purple', 'grey')),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists event_meal_options_label_uniq
  on public.event_meal_options (event_id, lower(trim(label))) where archived_at is null;
create index if not exists event_meal_options_event_idx on public.event_meal_options (event_id, sort_order);

alter table public.event_meal_options enable row level security;
-- Same visibility as the event; no write policies (RPC only).
drop policy if exists event_meal_options_select on public.event_meal_options;
create policy event_meal_options_select on public.event_meal_options for select to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id and (e.is_published or private.is_staff())));
grant select on public.event_meal_options to anon, authenticated;

alter table public.tickets add column if not exists meal_option_id uuid references public.event_meal_options (id);
create index if not exists tickets_meal_option_idx on public.tickets (meal_option_id);

-- The option must be an active option of this event.
create or replace function private.valid_meal(p_event_id uuid, p_option_id uuid)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from public.event_meal_options o
     where o.id = p_option_id and o.event_id = p_event_id and o.archived_at is null
  )
$$;
revoke execute on function private.valid_meal(uuid, uuid) from public, anon, authenticated;

-- p_options: [{"id": uuid|null, "label": text, "color": text}, ...] in display order.
create or replace function public.set_event_meals(p_event_id uuid, p_enabled boolean, p_options jsonb default '[]'::jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_opt jsonb;
  v_i integer := 0;
  v_keep uuid[] := '{}';
  v_id uuid;
  v_label text;
  v_color text;
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'ExCo only.' using errcode = 'P0001';
  end if;
  perform 1 from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_options, '[]'::jsonb)) <> 'array' then
    raise exception 'Meal options look wrong.' using errcode = 'P0001';
  end if;

  -- Labels must be unique (ignoring case) within the list.
  if (select count(*) from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) o where length(trim(o ->> 'label')) > 0)
     <> (select count(distinct lower(trim(o ->> 'label'))) from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) o where length(trim(o ->> 'label')) > 0) then
    raise exception 'Two meal options have the same name.' using errcode = 'P0001';
  end if;

  -- Hide options that were removed first, so a label can move to a new row.
  for v_opt in select * from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    if nullif(v_opt ->> 'id', '') is not null and length(trim(coalesce(v_opt ->> 'label', ''))) > 0 then
      v_keep := v_keep || (v_opt ->> 'id')::uuid;
    end if;
  end loop;
  delete from public.event_meal_options o
   where o.event_id = p_event_id and o.archived_at is null and not (o.id = any (v_keep))
     and not exists (select 1 from public.tickets t where t.meal_option_id = o.id);
  update public.event_meal_options o set archived_at = now()
   where o.event_id = p_event_id and o.archived_at is null and not (o.id = any (v_keep));

  for v_opt in select * from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    v_label := trim(coalesce(v_opt ->> 'label', ''));
    continue when v_label = '';
    if length(v_label) > 40 then
      raise exception 'Meal names can be up to 40 characters.' using errcode = 'P0001';
    end if;
    v_color := coalesce(nullif(v_opt ->> 'color', ''), 'grey');
    if v_color not in ('green', 'light_green', 'red', 'amber', 'blue', 'purple', 'grey') then
      raise exception 'Unknown colour for %.', v_label using errcode = 'P0001';
    end if;
    v_i := v_i + 1;
    v_id := nullif(v_opt ->> 'id', '')::uuid;
    if v_id is not null then
      update public.event_meal_options set label = v_label, color = v_color, sort_order = v_i
       where id = v_id and event_id = p_event_id and archived_at is null;
      if not found then
        raise exception 'A meal option changed while you were editing. Reload and try again.' using errcode = 'P0001';
      end if;
    else
      insert into public.event_meal_options (event_id, label, color, sort_order) values (p_event_id, v_label, v_color, v_i);
    end if;
  end loop;

  if p_enabled and not exists (select 1 from public.event_meal_options where event_id = p_event_id and archived_at is null) then
    insert into public.event_meal_options (event_id, label, color, sort_order) values
      (p_event_id, 'Vegetarian (Non-Jain)', 'green', 1),
      (p_event_id, 'Vegetarian (Jain)', 'light_green', 2),
      (p_event_id, 'Non-Vegetarian', 'red', 3);
  end if;

  update public.events set meals_enabled = coalesce(p_enabled, false) where id = p_event_id;
end;
$$;
revoke execute on function public.set_event_meals(uuid, boolean, jsonb) from public, anon;
grant execute on function public.set_event_meals(uuid, boolean, jsonb) to authenticated;

create or replace function private.require_meal(p_event_id uuid, p_option_id uuid)
returns void
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.events where id = p_event_id and meals_enabled) then
    if p_option_id is null then
      raise exception 'Pick your meal first.' using errcode = 'P0001';
    end if;
    if not private.valid_meal(p_event_id, p_option_id) then
      raise exception 'That meal option isn''t available any more. Pick another.' using errcode = 'P0001';
    end if;
  elsif p_option_id is not null then
    raise exception 'This event doesn''t take meal choices.' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function private.require_meal(uuid, uuid) from public, anon, authenticated;

create or replace function public.claim_ticket_with_meal(p_event_id uuid, p_meal_option_id uuid default null)
returns public.tickets
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_ticket public.tickets;
begin
  perform private.require_meal(p_event_id, p_meal_option_id);
  v_ticket := public.claim_ticket(p_event_id);
  if p_meal_option_id is not null and v_ticket.status <> 'cancelled' then
    update public.tickets set meal_option_id = p_meal_option_id where id = v_ticket.id returning * into v_ticket;
  end if;
  return v_ticket;
end;
$$;
revoke execute on function public.claim_ticket_with_meal(uuid, uuid) from public, anon;
grant execute on function public.claim_ticket_with_meal(uuid, uuid) to authenticated;

create or replace function public.claim_team_ticket_with_meal(p_event_id uuid, p_meal_option_id uuid default null)
returns public.tickets
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_ticket public.tickets;
begin
  perform private.require_meal(p_event_id, p_meal_option_id);
  v_ticket := public.claim_team_ticket(p_event_id);
  if p_meal_option_id is not null and v_ticket.status <> 'cancelled' then
    update public.tickets set meal_option_id = p_meal_option_id where id = v_ticket.id returning * into v_ticket;
  end if;
  return v_ticket;
end;
$$;
revoke execute on function public.claim_team_ticket_with_meal(uuid, uuid) from public, anon;
grant execute on function public.claim_team_ticket_with_meal(uuid, uuid) to authenticated;

create or replace function public.set_ticket_meal(p_ticket_id uuid, p_meal_option_id uuid)
returns public.tickets
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_ticket public.tickets;
  v_event public.events;
  v_admin boolean := coalesce(private.is_admin(), false);
begin
  if auth.uid() is null then
    raise exception 'You need to log in first.' using errcode = 'P0001';
  end if;
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found or not (v_admin or coalesce(v_ticket.user_id = auth.uid(), false)) then
    raise exception 'Ticket not found.' using errcode = 'P0001';
  end if;
  select * into v_event from public.events where id = v_ticket.event_id;
  if not v_event.meals_enabled then
    raise exception 'This event doesn''t take meal choices.' using errcode = 'P0001';
  end if;
  if v_ticket.status = 'cancelled' then
    raise exception 'This ticket was cancelled.' using errcode = 'P0001';
  end if;
  if not v_admin and v_event.starts_at <= now() then
    raise exception 'The event has started, so meals can''t be changed now. Ask ExCo.' using errcode = 'P0001';
  end if;
  if p_meal_option_id is null then
    if not v_admin then
      raise exception 'Pick your meal.' using errcode = 'P0001';
    end if;
  elsif not private.valid_meal(v_ticket.event_id, p_meal_option_id) then
    raise exception 'That meal option isn''t available any more. Pick another.' using errcode = 'P0001';
  end if;
  update public.tickets set meal_option_id = p_meal_option_id where id = p_ticket_id returning * into v_ticket;
  return v_ticket;
end;
$$;
revoke execute on function public.set_ticket_meal(uuid, uuid) from public, anon;
grant execute on function public.set_ticket_meal(uuid, uuid) to authenticated;
