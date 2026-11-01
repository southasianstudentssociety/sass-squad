-- Door staff only need attendee data around the event they're working.
-- Staff (non-admin) can see/scan/add tickets only from 24h before an event
-- starts until 12h after it ends (or 12h after start if no end time).
-- Admins keep full access.

create or replace function private.event_in_scan_window(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select coalesce((
    select now() >= e.starts_at - interval '24 hours'
       and now() <= coalesce(e.ends_at, e.starts_at + interval '12 hours') + interval '12 hours'
    from public.events e where e.id = p_event_id
  ), false)
$$;
revoke execute on function private.event_in_scan_window(uuid) from public;
grant execute on function private.event_in_scan_window(uuid) to authenticated;

create or replace function private.can_work_event(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$ select private.is_admin() or (private.is_staff() and private.event_in_scan_window(p_event_id)) $$;
revoke execute on function private.can_work_event(uuid) from public;
grant execute on function private.can_work_event(uuid) to authenticated;

drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select to authenticated
  using (user_id = (select auth.uid()) or private.can_work_event(event_id));

drop policy if exists scan_logs_select on public.scan_logs;
create policy scan_logs_select on public.scan_logs for select to authenticated
  using (private.can_work_event(event_id));

-- Enforce the same window inside the staff RPCs.
create or replace function public.check_in(
  p_event_id uuid,
  p_qr text default null,
  p_ticket_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_ticket public.tickets;
  v_result text;
begin
  if not private.is_staff() then
    raise exception 'Staff only.' using errcode = 'P0001';
  end if;
  if not private.can_work_event(p_event_id) then
    raise exception 'Scanning for this event opens 24 hours before it starts.' using errcode = 'P0001';
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

  -- A ticket for a different event: say so, but don't reveal whose it is.
  if v_result = 'wrong_event' then
    return jsonb_build_object('result', v_result, 'ticket', null);
  end if;

  return jsonb_build_object(
    'result', v_result,
    'ticket', case when v_ticket.id is null then null else jsonb_build_object(
      'id', v_ticket.id,
      'holder_name', v_ticket.holder_name,
      'holder_email', v_ticket.holder_email,
      'is_member', v_ticket.is_member,
      'member_now', public.is_member_email(v_ticket.holder_email),
      'price_cents', v_ticket.price_cents,
      'status', v_ticket.status,
      'source', v_ticket.source,
      'payment_reference', v_ticket.payment_reference,
      'checked_in_at', v_ticket.checked_in_at
    ) end
  );
end;
$$;

create or replace function public.create_door_ticket(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_price_cents integer,
  p_source public.ticket_source default 'walk_in',
  p_check_in boolean default true,
  p_notes text default null
)
returns public.tickets
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket public.tickets;
  v_email citext := nullif(trim(p_email), '')::citext;
begin
  if not private.is_staff() then
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
  if not private.can_work_event(p_event_id) then
    raise exception 'Door tickets for this event open 24 hours before it starts.' using errcode = 'P0001';
  end if;

  insert into public.tickets (
    event_id, user_id, holder_name, holder_email, is_member, price_cents, status, source,
    payment_reference, confirmed_at, confirmed_by, checked_in_at, checked_in_by, notes
  ) values (
    p_event_id, null, trim(p_name), v_email, public.is_member_email(v_email),
    greatest(coalesce(p_price_cents, 0), 0), 'confirmed', p_source,
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
