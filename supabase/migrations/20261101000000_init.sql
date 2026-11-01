-- SASS Squad: core schema (profiles, members, events, tickets, scan logs)
-- All ticket mutations go through SECURITY DEFINER functions so the rules
-- (membership, sales windows, capacity, single-use check-in) are enforced in
-- the database, not just in the UI.

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('user', 'staff', 'admin');
create type public.ticket_status as enum ('awaiting_payment', 'confirmed', 'cancelled');
create type public.ticket_source as enum ('online', 'walk_in', 'comp');
create type public.event_access as enum ('everyone', 'members_only');

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null,
  full_name text,
  phone text,
  role public.user_role not null default 'user',
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Members (source of truth for membership; imported from the old Google Sheet)
-- ---------------------------------------------------------------------------
create table public.members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email citext not null unique,
  alt_email citext unique,
  student_id text,
  purchased_at date,
  valid_until date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  description text,
  venue text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  cover_image_url text,
  is_published boolean not null default false,
  access public.event_access not null default 'everyone',
  member_price_pence integer not null default 0 check (member_price_pence >= 0),
  public_price_pence integer not null default 0 check (public_price_pence >= 0),
  capacity integer check (capacity is null or capacity > 0),
  member_sales_open_at timestamptz,
  public_sales_open_at timestamptz,
  sales_close_at timestamptz,
  payment_instructions text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------------
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  holder_name text not null,
  holder_email citext,
  is_member boolean not null default false,
  price_pence integer not null default 0,
  status public.ticket_status not null,
  source public.ticket_source not null default 'online',
  payment_reference text not null unique,
  qr_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id),
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id),
  notes text,
  created_at timestamptz not null default now()
);

-- One live ticket per account per event.
create unique index tickets_one_per_user_per_event
  on public.tickets (event_id, user_id)
  where status <> 'cancelled' and user_id is not null;
create index tickets_event_idx on public.tickets (event_id);
create index tickets_user_idx on public.tickets (user_id);

-- ---------------------------------------------------------------------------
-- Scan log (every scan attempt, accepted or not)
-- ---------------------------------------------------------------------------
create table public.scan_logs (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  ticket_id uuid references public.tickets (id) on delete set null,
  scanned_by uuid references public.profiles (id),
  result text not null,
  created_at timestamptz not null default now()
);
create index scan_logs_event_idx on public.scan_logs (event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.current_role_name()
returns public.user_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role in ('staff', 'admin') from public.profiles where id = auth.uid()), false) $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false) $$;

create or replace function public.is_member_email(p_email citext)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_email is not null and exists (
    select 1 from public.members m
    where (m.email = p_email or m.alt_email = p_email)
      and m.valid_until >= (now() at time zone 'Europe/London')::date
  )
$$;

create or replace function public.current_user_is_member()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.is_member_email((auth.jwt() ->> 'email')::citext) $$;

create or replace function public.gen_payment_reference()
returns text
language plpgsql volatile set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L
  ref text;
begin
  loop
    ref := 'SASS-';
    for i in 1..5 loop
      ref := ref || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.tickets where payment_reference = ref);
  end loop;
  return ref;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: claim / buy a ticket for the signed-in user
-- ---------------------------------------------------------------------------
create or replace function public.claim_ticket(p_event_id uuid)
returns public.tickets
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_event public.events;
  v_member boolean;
  v_open timestamptz;
  v_price integer;
  v_taken integer;
  v_ticket public.tickets;
begin
  if v_uid is null then
    raise exception 'You need to log in first.' using errcode = 'P0001';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not v_profile.onboarded or v_profile.full_name is null then
    raise exception 'Finish setting up your profile first.' using errcode = 'P0001';
  end if;

  -- Lock the event row so concurrent claims can't oversell capacity.
  select * into v_event from public.events where id = p_event_id and is_published for update;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0001';
  end if;

  -- Already have a live ticket? Return it instead of creating a second one.
  select * into v_ticket from public.tickets
  where event_id = p_event_id and user_id = v_uid and status <> 'cancelled';
  if found then
    return v_ticket;
  end if;

  v_member := public.current_user_is_member();

  if v_event.access = 'members_only' and not v_member then
    raise exception 'This event is for members only.' using errcode = 'P0001';
  end if;

  v_open := case when v_member
                 then coalesce(v_event.member_sales_open_at, v_event.public_sales_open_at)
                 else v_event.public_sales_open_at end;
  if v_open is not null and now() < v_open then
    raise exception 'Tickets are not on sale for you yet.' using errcode = 'P0001';
  end if;

  if v_event.sales_close_at is not null and now() > v_event.sales_close_at then
    raise exception 'Ticket sales for this event have closed.' using errcode = 'P0001';
  end if;

  if v_event.capacity is not null then
    select count(*) into v_taken from public.tickets
    where event_id = p_event_id and status <> 'cancelled';
    if v_taken >= v_event.capacity then
      raise exception 'Sorry, this event is sold out.' using errcode = 'P0001';
    end if;
  end if;

  v_price := case when v_member then v_event.member_price_pence else v_event.public_price_pence end;

  insert into public.tickets (
    event_id, user_id, holder_name, holder_email, is_member, price_pence,
    status, source, payment_reference, confirmed_at
  ) values (
    p_event_id, v_uid, v_profile.full_name, v_profile.email, v_member, v_price,
    case when v_price = 0 then 'confirmed'::public.ticket_status else 'awaiting_payment'::public.ticket_status end,
    'online', public.gen_payment_reference(),
    case when v_price = 0 then now() else null end
  )
  returning * into v_ticket;

  return v_ticket;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: check a ticket in (staff). Pass either the scanned QR value or a ticket id.
-- The UPDATE ... WHERE checked_in_at IS NULL is atomic, so two scanners can
-- never both accept the same ticket.
-- ---------------------------------------------------------------------------
create or replace function public.check_in(
  p_event_id uuid,
  p_qr text default null,
  p_ticket_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_ticket public.tickets;
  v_result text;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = 'P0001';
  end if;

  if p_qr is not null then
    v_token := lower(trim(regexp_replace(p_qr, '^SASS1:', '', 'i')));
  end if;

  update public.tickets t
     set checked_in_at = now(), checked_in_by = v_uid
   where t.event_id = p_event_id
     and t.status = 'confirmed'
     and t.checked_in_at is null
     and ((v_token is not null and t.qr_token = v_token) or (p_ticket_id is not null and t.id = p_ticket_id))
  returning * into v_ticket;

  if found then
    v_result := 'ok';
  else
    select * into v_ticket from public.tickets t
     where (v_token is not null and t.qr_token = v_token) or (p_ticket_id is not null and t.id = p_ticket_id);
    if not found then
      v_result := 'invalid';
    elsif v_ticket.event_id <> p_event_id then
      v_result := 'wrong_event';
    elsif v_ticket.status = 'cancelled' then
      v_result := 'cancelled';
    elsif v_ticket.status = 'awaiting_payment' then
      v_result := 'unpaid';
    else
      v_result := 'already_used';
    end if;
  end if;

  insert into public.scan_logs (event_id, ticket_id, scanned_by, result)
  values (p_event_id, v_ticket.id, v_uid, v_result);

  return jsonb_build_object(
    'result', v_result,
    'ticket', case when v_ticket.id is null then null else jsonb_build_object(
      'id', v_ticket.id,
      'holder_name', v_ticket.holder_name,
      'holder_email', v_ticket.holder_email,
      'is_member', v_ticket.is_member,
      'member_now', public.is_member_email(v_ticket.holder_email),
      'price_pence', v_ticket.price_pence,
      'status', v_ticket.status,
      'source', v_ticket.source,
      'payment_reference', v_ticket.payment_reference,
      'checked_in_at', v_ticket.checked_in_at
    ) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: walk-in / door ticket (staff). Created as confirmed, optionally checked in.
-- ---------------------------------------------------------------------------
create or replace function public.create_door_ticket(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_price_pence integer,
  p_source public.ticket_source default 'walk_in',
  p_check_in boolean default true,
  p_notes text default null
)
returns public.tickets
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket public.tickets;
  v_email citext := nullif(trim(p_email), '')::citext;
begin
  if not public.is_staff() then
    raise exception 'Staff only.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Name is required.' using errcode = 'P0001';
  end if;
  if p_source = 'online' then
    raise exception 'Door tickets must be walk_in or comp.' using errcode = 'P0001';
  end if;
  perform 1 from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0001';
  end if;

  insert into public.tickets (
    event_id, user_id, holder_name, holder_email, is_member, price_pence, status, source,
    payment_reference, confirmed_at, confirmed_by, checked_in_at, checked_in_by, notes
  ) values (
    p_event_id, null, trim(p_name), v_email, public.is_member_email(v_email),
    greatest(coalesce(p_price_pence, 0), 0), 'confirmed', p_source,
    public.gen_payment_reference(), now(), v_uid,
    case when p_check_in then now() end, case when p_check_in then v_uid end, p_notes
  )
  returning * into v_ticket;

  if p_check_in then
    insert into public.scan_logs (event_id, ticket_id, scanned_by, result)
    values (p_event_id, v_ticket.id, v_uid, 'ok_door');
  end if;

  return v_ticket;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: admin ticket management
-- ---------------------------------------------------------------------------
create or replace function public.confirm_payment(p_ticket_id uuid)
returns public.tickets
language plpgsql security definer set search_path = public
as $$
declare v_ticket public.tickets;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  update public.tickets
     set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
   where id = p_ticket_id and status = 'awaiting_payment'
  returning * into v_ticket;
  if not found then
    raise exception 'Ticket is not awaiting payment.' using errcode = 'P0001';
  end if;
  return v_ticket;
end;
$$;

create or replace function public.cancel_ticket(p_ticket_id uuid)
returns public.tickets
language plpgsql security definer set search_path = public
as $$
declare v_ticket public.tickets;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  update public.tickets set status = 'cancelled'
   where id = p_ticket_id and status <> 'cancelled' and checked_in_at is null
  returning * into v_ticket;
  if not found then
    raise exception 'Ticket cannot be cancelled (already cancelled or already checked in).' using errcode = 'P0001';
  end if;
  return v_ticket;
end;
$$;

create or replace function public.undo_check_in(p_ticket_id uuid)
returns public.tickets
language plpgsql security definer set search_path = public
as $$
declare v_ticket public.tickets;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  update public.tickets set checked_in_at = null, checked_in_by = null
   where id = p_ticket_id and checked_in_at is not null
  returning * into v_ticket;
  if not found then
    raise exception 'Ticket is not checked in.' using errcode = 'P0001';
  end if;
  return v_ticket;
end;
$$;

create or replace function public.set_user_role(p_email text, p_role public.user_role)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = 'P0001';
  end if;
  update public.profiles set role = p_role where email = p_email::citext
  returning * into v_profile;
  if not found then
    raise exception 'No account with that email. They need to log in once first.' using errcode = 'P0001';
  end if;
  if v_profile.id = auth.uid() and p_role <> 'admin' then
    raise exception 'You cannot remove your own admin role.' using errcode = 'P0001';
  end if;
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.tickets enable row level security;
alter table public.scan_logs enable row level security;

-- profiles: read own (staff read all); users may only edit name/phone/onboarded.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone, onboarded) on public.profiles to authenticated;

-- members: admins manage; a user may see their own record.
create policy members_admin_all on public.members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy members_select_self on public.members for select to authenticated
  using (email = (auth.jwt() ->> 'email')::citext or alt_email = (auth.jwt() ->> 'email')::citext);

-- events: anyone sees published; staff see all; admins write.
create policy events_select on public.events for select to anon, authenticated
  using (is_published or public.is_staff());
create policy events_admin_write on public.events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- tickets: own tickets, or staff. No direct writes (RPCs only).
create policy tickets_select on public.tickets for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- scan logs: staff read only.
create policy scan_logs_select on public.scan_logs for select to authenticated
  using (public.is_staff());

-- Lock down function execution to signed-in users.
revoke execute on function public.claim_ticket(uuid) from public, anon;
revoke execute on function public.check_in(uuid, text, uuid) from public, anon;
revoke execute on function public.create_door_ticket(uuid, text, text, integer, public.ticket_source, boolean, text) from public, anon;
revoke execute on function public.confirm_payment(uuid) from public, anon;
revoke execute on function public.cancel_ticket(uuid) from public, anon;
revoke execute on function public.undo_check_in(uuid) from public, anon;
revoke execute on function public.set_user_role(text, public.user_role) from public, anon;
revoke execute on function public.gen_payment_reference() from public, anon, authenticated;
-- Do not let anyone probe whether an arbitrary email belongs to a member.
revoke execute on function public.is_member_email(citext) from public, anon, authenticated;
grant execute on function public.claim_ticket(uuid) to authenticated;
grant execute on function public.check_in(uuid, text, uuid) to authenticated;
grant execute on function public.create_door_ticket(uuid, text, text, integer, public.ticket_source, boolean, text) to authenticated;
grant execute on function public.confirm_payment(uuid) to authenticated;
grant execute on function public.cancel_ticket(uuid) to authenticated;
grant execute on function public.undo_check_in(uuid) to authenticated;
grant execute on function public.set_user_role(text, public.user_role) to authenticated;
