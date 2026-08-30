-- Give every profile its own editable copy of the system exercise catalog.
--
-- Rows with user_id = null remain internal templates. They are no longer
-- visible through the Data API, but a profile insert trigger copies every
-- current template for the new user. Existing profiles are backfilled and all
-- relational references are moved to the matching owned copy so progress and
-- 1RM history stay continuous.

alter table public.exercises
  add column template_exercise_id uuid references public.exercises (id) on delete restrict;

create unique index exercises_owner_template_unique_idx
  on public.exercises (user_id, template_exercise_id)
  where template_exercise_id is not null;

comment on column public.exercises.template_exercise_id is
  'System template that this user-owned default exercise was copied from. Null for templates and custom exercises.';

create or replace function private.assign_default_exercises_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.exercises (
    user_id,
    name,
    primary_muscle,
    secondary_muscles,
    equipment,
    brand,
    default_rest_seconds,
    is_archived,
    template_exercise_id
  )
  select
    new.id,
    template.name,
    template.primary_muscle,
    template.secondary_muscles,
    template.equipment,
    template.brand,
    template.default_rest_seconds,
    false,
    template.id
  from public.exercises as template
  where template.user_id is null
  on conflict (user_id, template_exercise_id)
    where template_exercise_id is not null
    do nothing;

  return new;
end;
$$;

revoke all on function private.assign_default_exercises_to_profile()
  from public, anon, authenticated;

drop trigger if exists assign_default_exercises_after_profile_insert on public.profiles;
create trigger assign_default_exercises_after_profile_insert
after insert on public.profiles
for each row execute function private.assign_default_exercises_to_profile();

-- Backfill every current profile. Existing custom exercises have no template
-- link, so they remain separate and keep their IDs.
insert into public.exercises (
  user_id,
  name,
  primary_muscle,
  secondary_muscles,
  equipment,
  brand,
  default_rest_seconds,
  is_archived,
  template_exercise_id
)
select
  profile.id,
  template.name,
  template.primary_muscle,
  template.secondary_muscles,
  template.equipment,
  template.brand,
  template.default_rest_seconds,
  false,
  template.id
from public.profiles as profile
cross join public.exercises as template
where template.user_id is null
on conflict (user_id, template_exercise_id)
  where template_exercise_id is not null
  do nothing;

-- Relink every normalized exercise reference to the user's owned copy.
update public.routine_exercises as routine_exercise
set exercise_id = owned.id,
    updated_at = now()
from public.exercises as template,
     public.exercises as owned
where routine_exercise.exercise_id = template.id
  and template.user_id is null
  and owned.user_id = routine_exercise.user_id
  and owned.template_exercise_id = template.id;

update public.workout_exercises as workout_exercise
set exercise_id = owned.id,
    updated_at = now()
from public.exercises as template,
     public.exercises as owned
where workout_exercise.exercise_id = template.id
  and template.user_id is null
  and owned.user_id = workout_exercise.user_id
  and owned.template_exercise_id = template.id;

update public.exercise_one_rep_maxes as exercise_max
set exercise_id = owned.id,
    updated_at = now()
from public.exercises as template,
     public.exercises as owned
where exercise_max.exercise_id = template.id
  and template.user_id is null
  and owned.user_id = exercise_max.user_id
  and owned.template_exercise_id = template.id;

-- System templates are implementation details. Authenticated clients can now
-- read and mutate only their own catalog rows.
drop policy if exists "exercises_select_visible" on public.exercises;
create policy "exercises_select_own"
  on public.exercises for select to authenticated
  using ((select auth.uid()) = user_id);
