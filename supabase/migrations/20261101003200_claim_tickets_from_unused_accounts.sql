-- Tickets left on accounts nobody uses.
--
-- The Diwali form import created an account for each buyer's form email
-- (usually a Gmail) and put the ticket on it. Many of those people later sign
-- up with their UST email and link the Gmail through Google. 0031 only claims
-- tickets with no account at all, so the ticket stayed on the unused Gmail
-- account and never showed up for them.
--
-- private.claim_tickets(user) now also takes live tickets from another
-- account when BOTH:
--   * that account has never been signed into (auth.users.last_sign_in_at is
--     null), so nobody is using it; and
--   * its login email is one of the claiming account's verified emails
--     (private.user_emails: the login email or a linked identity such as
--     Google). Linking the Gmail proves the person owns it.
-- The rules from 0031 still apply: cancelled tickets are never touched, and an
-- account never ends up with two live tickets for one event (if it already
-- has one, the other stays where it is for ExCo to sort out).
--
-- The trigger functions from 0031 already call claim_tickets, so only the
-- function changes. A backfill runs it for accounts that already qualify.

create or replace function private.claim_tickets(p_user_id uuid)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare v_count integer;
begin
  with emails as (
    select e from private.user_emails(p_user_id) e
  ),
  unused_accounts as (
    select u.id from auth.users u
    where u.id <> p_user_id
      and u.last_sign_in_at is null
      and lower(u.email)::citext in (select e from emails)
  ),
  pick as (
    select distinct on (t.event_id) t.id
    from public.tickets t
    where t.status <> 'cancelled'
      and (
        (t.user_id is null and t.holder_email in (select e from emails))
        or t.user_id in (select id from unused_accounts)
      )
      and not exists (
        select 1 from public.tickets x
        where x.event_id = t.event_id and x.user_id = p_user_id and x.status <> 'cancelled'
      )
    order by t.event_id, t.created_at, t.id
  )
  update public.tickets t set user_id = p_user_id
  from pick where t.id = pick.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function private.claim_tickets(uuid) from public, anon, authenticated;

-- Backfill: accounts that have already linked the email of an unused account
-- holding a ticket.
do $$
declare r record;
begin
  for r in
    select distinct i.user_id
    from auth.identities i
    join auth.users u on lower(u.email) = lower(i.identity_data ->> 'email')
                     and u.id <> i.user_id and u.last_sign_in_at is null
    join public.tickets t on t.user_id = u.id and t.status <> 'cancelled'
    join public.profiles p on p.id = i.user_id
  loop
    perform private.claim_tickets(r.user_id);
  end loop;
end $$;
