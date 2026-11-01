-- Door staff don't need other people's profiles (the scanner reads ticket data),
-- so only admins can read everyone's profile. Users can still read their own.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
