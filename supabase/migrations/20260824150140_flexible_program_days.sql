-- Program days are a flexible sequence: a workout may be repeated on any
-- calendar date, while rest-day completion is stored directly on the day.

alter table public.program_run_days
  add column completed_at timestamptz,
  add constraint program_run_days_rest_completion_check
    check (completed_at is null or day_type = 'rest');

-- Keep every review session instead of replacing or rejecting the first
-- workout attached to a program day.
drop index if exists public.workout_sessions_program_day_unique_idx;
create index workout_sessions_program_day_completed_idx
  on public.workout_sessions (program_run_day_id, completed_at desc)
  where program_run_day_id is not null;

grant update (completed_at, updated_at) on table public.program_run_days to authenticated;

create policy "program_days_update_own"
  on public.program_run_days for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.complete_program_rest_day(target_day_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  update public.program_run_days d
  set completed_at = coalesce(d.completed_at, now()),
      updated_at = now()
  where d.id = target_day_id
    and d.user_id = v_user_id
    and d.day_type = 'rest'
    and exists (
      select 1
      from public.program_runs r
      where r.id = d.program_run_id
        and r.user_id = v_user_id
        and r.status = 'active'
    );

  if not found then
    raise exception 'active rest day not found or not owned by caller';
  end if;
end;
$$;

revoke execute on function public.complete_program_rest_day(uuid) from public;
grant execute on function public.complete_program_rest_day(uuid) to authenticated;
