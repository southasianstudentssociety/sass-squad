-- Phase 2 cleanup: remove the old single-role model.
-- Apply only after the app version that uses my_access() is deployed;
-- the previous app version reads profiles.role.

drop function if exists public.set_user_role(text, public.user_role);
alter table public.profiles drop column if exists role;
drop type if exists public.user_role;
