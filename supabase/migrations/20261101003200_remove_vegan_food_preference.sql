-- Remove "vegan" as a profile food preference.
-- Nobody had picked it when this was written; any row that has it is cleared
-- (set to null) so the new check can be added, and the person can pick again
-- in Settings.

update public.profiles set food_preference = null where food_preference = 'vegan';

alter table public.profiles drop constraint if exists profiles_food_preference_check;
alter table public.profiles add constraint profiles_food_preference_check
  check (food_preference is null or food_preference in ('non_veg', 'veg', 'veg_jain'));
