-- 운동 기록/루틴 저장을 한 트랜잭션으로 묶는다.
-- 기존 어댑터는 세션 upsert → 자식 DELETE → 자식 INSERT를 세 번의 요청으로 수행해,
-- DELETE 성공 후 INSERT가 실패하면 기록이 통째로 사라질 수 있었다.
-- 함수 본문은 하나의 트랜잭션이므로 중간 실패 시 전체가 롤백된다.
--
-- security invoker: 호출자의 권한과 RLS를 그대로 적용한다.
-- definer로 두면 RLS를 우회하므로 쓰지 않는다.

create or replace function public.save_workout_session(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_exercise jsonb;
  v_exercise_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if payload ? 'id' and payload ->> 'id' is not null then
    v_session_id := (payload ->> 'id')::uuid;
    update public.workout_sessions set
      routine_id = (payload ->> 'routineId')::uuid,
      routine_name = payload ->> 'routineName',
      status = payload ->> 'status',
      started_at = (payload ->> 'startedAt')::timestamptz,
      completed_at = (payload ->> 'completedAt')::timestamptz,
      notes = payload ->> 'notes',
      updated_at = now()
    where id = v_session_id and user_id = v_user_id;

    if not found then
      raise exception 'workout session not found or not owned by caller';
    end if;
  else
    insert into public.workout_sessions (user_id, routine_id, routine_name, status, started_at, completed_at, notes)
    values (
      v_user_id,
      (payload ->> 'routineId')::uuid,
      payload ->> 'routineName',
      payload ->> 'status',
      (payload ->> 'startedAt')::timestamptz,
      (payload ->> 'completedAt')::timestamptz,
      payload ->> 'notes'
    )
    returning id into v_session_id;
  end if;

  delete from public.workout_exercises
  where session_id = v_session_id and user_id = v_user_id;

  for v_exercise in
    select value from jsonb_array_elements(coalesce(payload -> 'exercises', '[]'::jsonb))
  loop
    insert into public.workout_exercises (user_id, session_id, exercise_id, exercise_name, primary_muscle, exercise_order, notes)
    values (
      v_user_id,
      v_session_id,
      (v_exercise ->> 'exerciseId')::uuid,
      v_exercise ->> 'exerciseName',
      v_exercise ->> 'primaryMuscle',
      (v_exercise ->> 'exerciseOrder')::integer,
      v_exercise ->> 'notes'
    )
    returning id into v_exercise_id;

    insert into public.workout_set_records (
      user_id, workout_exercise_id, set_order, set_type, weight_kg, reps,
      target_rir, actual_rir, rest_seconds, is_completed, completed_at, notes
    )
    select
      v_user_id,
      v_exercise_id,
      (s ->> 'setOrder')::integer,
      s ->> 'setType',
      (s ->> 'weightKg')::numeric,
      (s ->> 'reps')::integer,
      (s ->> 'targetRir')::numeric,
      (s ->> 'actualRir')::numeric,
      (s ->> 'restSeconds')::integer,
      coalesce((s ->> 'isCompleted')::boolean, false),
      (s ->> 'completedAt')::timestamptz,
      s ->> 'notes'
    from jsonb_array_elements(coalesce(v_exercise -> 'sets', '[]'::jsonb)) as s;
  end loop;

  return v_session_id;
end;
$$;

create or replace function public.save_routine(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_routine_id uuid;
  v_exercise jsonb;
  v_routine_exercise_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if payload ? 'id' and payload ->> 'id' is not null then
    v_routine_id := (payload ->> 'id')::uuid;
    update public.routines set
      name = payload ->> 'name',
      description = payload ->> 'description',
      color = payload ->> 'color',
      updated_at = now()
    where id = v_routine_id and user_id = v_user_id;

    if not found then
      raise exception 'routine not found or not owned by caller';
    end if;
  else
    insert into public.routines (user_id, name, description, color)
    values (v_user_id, payload ->> 'name', payload ->> 'description', payload ->> 'color')
    returning id into v_routine_id;
  end if;

  delete from public.routine_exercises
  where routine_id = v_routine_id and user_id = v_user_id;

  for v_exercise in
    select value from jsonb_array_elements(coalesce(payload -> 'exercises', '[]'::jsonb))
  loop
    insert into public.routine_exercises (routine_id, user_id, exercise_id, exercise_order, notes)
    values (
      v_routine_id,
      v_user_id,
      (v_exercise ->> 'exerciseId')::uuid,
      (v_exercise ->> 'exerciseOrder')::integer,
      v_exercise ->> 'notes'
    )
    returning id into v_routine_exercise_id;

    insert into public.routine_set_prescriptions (
      routine_exercise_id, user_id, set_order, set_type,
      target_weight_kg, target_reps_min, target_reps_max, target_rir, rest_seconds
    )
    select
      v_routine_exercise_id,
      v_user_id,
      (s ->> 'setOrder')::integer,
      s ->> 'setType',
      (s ->> 'targetWeightKg')::numeric,
      (s ->> 'targetRepsMin')::integer,
      (s ->> 'targetRepsMax')::integer,
      (s ->> 'targetRir')::numeric,
      (s ->> 'restSeconds')::integer
    from jsonb_array_elements(coalesce(v_exercise -> 'sets', '[]'::jsonb)) as s;
  end loop;

  return v_routine_id;
end;
$$;
