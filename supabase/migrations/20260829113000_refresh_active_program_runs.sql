-- Let a signed-in owner opt an active run into a newer static template without
-- rewriting history. Past days, completed rest days, and every day with any
-- linked workout session remain byte-for-byte unchanged.

grant update (
  day_type,
  title,
  instructions,
  routine_snapshot,
  cardio_target,
  is_optional,
  updated_at
) on table public.program_run_days to authenticated;

create or replace function public.refresh_active_program_run(
  target_run_id uuid,
  preserve_before_date date,
  payload jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.program_runs%rowtype;
  v_day jsonb;
  v_day_number integer;
  v_day_type text;
  v_new_version integer;
  v_expected_days integer;
  v_updated_days integer := 0;
  v_row_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if preserve_before_date is null then
    raise exception 'preserve date is required';
  end if;

  select * into v_run
  from public.program_runs
  where id = target_run_id
    and user_id = v_user_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'active program run not found or not owned by caller';
  end if;

  v_new_version := (payload ->> 'templateVersion')::integer;
  v_expected_days := v_run.duration_weeks * 7;

  if payload ->> 'programKey' is distinct from v_run.program_key
     or (payload ->> 'startDate')::date is distinct from v_run.start_date
     or (payload ->> 'durationWeeks')::integer is distinct from v_run.duration_weeks then
    raise exception 'template does not match active program run';
  end if;
  if v_new_version <= v_run.template_version then
    return 0;
  end if;
  if jsonb_typeof(payload -> 'days') <> 'array'
     or jsonb_array_length(payload -> 'days') <> v_expected_days then
    raise exception 'program must include exactly % days', v_expected_days;
  end if;
  if (
    select count(distinct (item ->> 'dayNumber')::integer)
    from jsonb_array_elements(payload -> 'days') item
  ) <> v_expected_days then
    raise exception 'program day numbers must be unique and complete';
  end if;
  if (
    select count(*)
    from public.program_run_days
    where program_run_id = v_run.id
      and user_id = v_user_id
  ) <> v_expected_days then
    raise exception 'active program run has an incomplete day snapshot';
  end if;

  for v_day in select value from jsonb_array_elements(payload -> 'days')
  loop
    v_day_number := (v_day ->> 'dayNumber')::integer;
    v_day_type := v_day ->> 'dayType';

    if v_day_number < 1 or v_day_number > v_expected_days then
      raise exception 'invalid day number';
    end if;
    if v_day_type not in ('strength', 'cardio', 'rest') then
      raise exception 'invalid day type';
    end if;

    update public.program_run_days d
    set day_type = v_day_type,
        title = v_day ->> 'title',
        instructions = v_day ->> 'instructions',
        routine_snapshot = case when v_day_type = 'strength' then v_day -> 'routineSnapshot' else null end,
        cardio_target = case when v_day_type = 'cardio' then v_day -> 'cardioTarget' else null end,
        is_optional = coalesce((v_day ->> 'isOptional')::boolean, false),
        updated_at = now()
    where d.program_run_id = v_run.id
      and d.user_id = v_user_id
      and d.day_number = v_day_number
      and d.scheduled_on >= preserve_before_date
      and d.completed_at is null
      and not exists (
        select 1
        from public.workout_sessions s
        where s.program_run_day_id = d.id
      );

    get diagnostics v_row_count = row_count;
    v_updated_days := v_updated_days + v_row_count;
  end loop;

  update public.program_runs
  set program_name = payload ->> 'programName',
      template_version = v_new_version,
      updated_at = now()
  where id = v_run.id
    and user_id = v_user_id;

  return v_updated_days;
end;
$$;

revoke execute on function public.refresh_active_program_run(uuid, date, jsonb) from public;
revoke execute on function public.refresh_active_program_run(uuid, date, jsonb) from anon;
grant execute on function public.refresh_active_program_run(uuid, date, jsonb) to authenticated;
