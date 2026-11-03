-- The "waiting for first login" list (team_invites: names, UST emails and
-- personal Gmails) is for hub owners only, the people who can act on it.
-- Other ExCo no longer read it. Matching invites on login is unaffected
-- (it runs inside security definer functions).

drop policy if exists team_invites_select on public.team_invites;
create policy team_invites_select on public.team_invites for select to authenticated
  using ((select private.is_owner()));
