-- `20260827090000_workout_session_edited_at.sql`가 save_workout_session을
-- 다시 정의하면서, 앞선 프로그램 migration이 추가한 program_run_day_id 처리가
-- 사라졌다. 프로그램 운동을 끝내도 세션은 완료되지만 Day와 연결되지 않아
-- 프로그램 화면은 미완료로 남는다. 두 동작을 하나의 최신 RPC 정의에 함께 둔다.
create or replace function public.save_workout_session(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_input_id uuid;
  v_existing_user_id uuid;
  v_existing_status text;
  v_exercise jsonb;
  v_exercise_id uuid;
  v_paused_seconds integer;
  v_program_run_day_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  begin
    v_input_id := nullif(payload ->> 'id', '')::uuid;
  exception when invalid_text_representation then
    v_input_id := null;
  end;

  begin
    v_paused_seconds := floor((payload ->> 'pausedSeconds')::numeric)::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    v_paused_seconds := null;
  end;

  -- 프로그램 Day는 서버에서 소유권, 활성 회차, 수행 가능한 Day 타입까지
  -- 검증한다. 클라이언트가 보낸 다른 사용자의 Day id를 연결할 수 없다.
  begin
    v_program_run_day_id := nullif(payload ->> 'programRunDayId', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid program run day';
  end;

  if v_program_run_day_id is not null and not exists (
    select 1
    from public.program_run_days d
    join public.program_runs r on r.id = d.program_run_id
    where d.id = v_program_run_day_id
      and d.user_id = v_user_id
      and d.day_type in ('strength', 'cardio')
      and r.user_id = v_user_id
      and r.status = 'active'
  ) then
    raise exception 'active program run day not found or not owned by caller';
  end if;

  if v_input_id is not null then
    select user_id, status into v_existing_user_id, v_existing_status
    from public.workout_sessions
    where id = v_input_id;

    if found then
      if v_existing_user_id <> v_user_id then
        raise exception 'workout session not found or not owned by caller';
      end if;

      v_session_id := v_input_id;
      update public.workout_sessions set
        routine_id = (payload ->> 'routineId')::uuid,
        routine_name = payload ->> 'routineName',
        program_run_day_id = v_program_run_day_id,
        status = payload ->> 'status',
        started_at = (payload ->> 'startedAt')::timestamptz,
        completed_at = (payload ->> 'completedAt')::timestamptz,
        notes = payload ->> 'notes',
        paused_seconds = coalesce(v_paused_seconds, paused_seconds),
        edited_at = case when v_existing_status = 'completed' then now() else edited_at end,
        updated_at = now()
      where id = v_session_id and user_id = v_user_id;
    else
      insert into public.workout_sessions (
        id, user_id, routine_id, routine_name, program_run_day_id,
        status, started_at, completed_at, notes, paused_seconds
      ) values (
        v_input_id,
        v_user_id,
        (payload ->> 'routineId')::uuid,
        payload ->> 'routineName',
        v_program_run_day_id,
        payload ->> 'status',
        (payload ->> 'startedAt')::timestamptz,
        (payload ->> 'completedAt')::timestamptz,
        payload ->> 'notes',
        coalesce(v_paused_seconds, 0)
      ) returning id into v_session_id;
    end if;
  else
    insert into public.workout_sessions (
      user_id, routine_id, routine_name, program_run_day_id,
      status, started_at, completed_at, notes, paused_seconds
    ) values (
      v_user_id,
      (payload ->> 'routineId')::uuid,
      payload ->> 'routineName',
      v_program_run_day_id,
      payload ->> 'status',
      (payload ->> 'startedAt')::timestamptz,
      (payload ->> 'completedAt')::timestamptz,
      payload ->> 'notes',
      coalesce(v_paused_seconds, 0)
    ) returning id into v_session_id;
  end if;

  delete from public.workout_exercises
  where session_id = v_session_id and user_id = v_user_id;

  for v_exercise in
    select value from jsonb_array_elements(
      case when jsonb_typeof(payload -> 'exercises') = 'array' then payload -> 'exercises' else '[]'::jsonb end
    )
  loop
    insert into public.workout_exercises (
      user_id, session_id, exercise_id, exercise_name,
      primary_muscle, exercise_order, notes
    ) values (
      v_user_id,
      v_session_id,
      (v_exercise ->> 'exerciseId')::uuid,
      v_exercise ->> 'exerciseName',
      v_exercise ->> 'primaryMuscle',
      (v_exercise ->> 'exerciseOrder')::integer,
      v_exercise ->> 'notes'
    ) returning id into v_exercise_id;

    insert into public.workout_set_records (
      user_id, workout_exercise_id, set_order, set_type, weight_kg, reps,
      duration_seconds, distance_km,
      target_rir, actual_rir, rest_seconds, is_completed, completed_at, notes
    )
    select
      v_user_id,
      v_exercise_id,
      (s ->> 'setOrder')::integer,
      s ->> 'setType',
      (s ->> 'weightKg')::numeric,
      (s ->> 'reps')::integer,
      (s ->> 'durationSeconds')::integer,
      (s ->> 'distanceKm')::numeric,
      (s ->> 'targetRir')::numeric,
      (s ->> 'actualRir')::numeric,
      (s ->> 'restSeconds')::integer,
      coalesce((s ->> 'isCompleted')::boolean, false),
      (s ->> 'completedAt')::timestamptz,
      s ->> 'notes'
    from jsonb_array_elements(
      case when jsonb_typeof(v_exercise -> 'sets') = 'array' then v_exercise -> 'sets' else '[]'::jsonb end
    ) as s;
  end loop;

  return v_session_id;
end;
$$;
