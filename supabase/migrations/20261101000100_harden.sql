-- Hardening after Supabase advisor review.
-- 1. Move role/membership helpers used by RLS into a schema that is NOT exposed
--    through the REST API, so they can't be called as /rpc endpoints.
-- 2. Wrap auth.*() calls in (select ...) so RLS evaluates them once per query.
-- 3. Split "for all" admin policies so SELECT has a single permissive policy.
-- 4. Index remaining foreign keys.

create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.is_staff()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$ select coalesce((select role in ('staff', 'admin') from public.profiles where id = (select auth.uid())), false) $$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$ select coalesce((select role = 'admin' from public.profiles where id = (select auth.uid())), false) $$;

revoke execute on function private.is_staff() from public;
revoke execute on function private.is_admin() from public;
grant execute on function private.is_staff() to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;

-- Re-point the public RPCs' internal checks at the private helpers.
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$ select private.is_staff() $$;
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public, extensions
as $$ select private.is_admin() $$;
-- Only the database functions themselves need these; nobody calls them over the API.
revoke execute on function public.is_staff() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon, authenticated;

-- Trigger function: never callable directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Unused helper.
drop function if exists public.current_role_name();

-- Membership check is only meaningful when signed in.
revoke execute on function public.current_user_is_member() from public, anon;
grant execute on function public.current_user_is_member() to authenticated;

-- Policies -------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists members_admin_all on public.members;
drop policy if exists members_select_self on public.members;
create policy members_select on public.members for select to authenticated
  using (
    (select private.is_admin())
    or email = ((select auth.jwt()) ->> 'email')::extensions.citext
    or alt_email = ((select auth.jwt()) ->> 'email')::extensions.citext
  );
create policy members_admin_insert on public.members for insert to authenticated
  with check ((select private.is_admin()));
create policy members_admin_update on public.members for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy members_admin_delete on public.members for delete to authenticated
  using ((select private.is_admin()));

drop policy if exists events_select on public.events;
drop policy if exists events_admin_write on public.events;
create policy events_select on public.events for select to anon, authenticated
  using (is_published or (select private.is_staff()));
create policy events_admin_insert on public.events for insert to authenticated
  with check ((select private.is_admin()));
create policy events_admin_update on public.events for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy events_admin_delete on public.events for delete to authenticated
  using ((select private.is_admin()));

drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));

drop policy if exists scan_logs_select on public.scan_logs;
create policy scan_logs_select on public.scan_logs for select to authenticated
  using ((select private.is_staff()));

-- Foreign key indexes ----------------------------------------------------------
create index if not exists scan_logs_scanned_by_idx on public.scan_logs (scanned_by);
create index if not exists scan_logs_ticket_idx on public.scan_logs (ticket_id);
create index if not exists tickets_checked_in_by_idx on public.tickets (checked_in_by);
create index if not exists tickets_confirmed_by_idx on public.tickets (confirmed_by);
