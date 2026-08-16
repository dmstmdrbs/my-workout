-- 운동 기록/루틴 저장을 한 트랜잭션으로 묶는다.
-- 기존 어댑터는 세션 upsert → 자식 DELETE → 자식 INSERT를 세 번의 요청으로 수행해,
-- DELETE 성공 후 INSERT가 실패하면 기록이 통째로 사라질 수 있었다.
-- 함수 본문은 하나의 트랜잭션이므로 중간 실패 시 전체가 롤백된다.
--
-- security invoker: 호출자의 권한과 RLS를 그대로 적용한다.
-- definer로 두면 RLS를 우회하므로 쓰지 않는다.
--
-- 클라이언트(WorkoutRunner/RoutineManager)는 id를 로컬에서 미리 생성해두고,
-- 실제로 행이 존재하기 전에 그 id로 저장을 시도한다(운동 기록은 시작 시점에
-- id가 생기고 종료 시점에야 처음 저장된다). 그래서 이 함수는 "id가 있으면
-- update"가 아니라 "그 id로 upsert"로 동작해야 한다: 행이 있으면 소유권을
-- 확인한 뒤 update, 없으면 그 id로 insert한다.

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
  v_exercise jsonb;
  v_exercise_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  -- 클라이언트의 createId()는 crypto.randomUUID가 없는 환경(비보안 origin,
  -- 구형 Safari 등)에서 "workout-<ts>-<rand>" 같은 비-uuid 문자열로 대체된다.
  -- 그런 값은 캐스트에서 예외를 던지는 대신 "id 없음"으로 취급해 서버가
  -- 새 id를 생성하도록 한다.
  begin
    v_input_id := nullif(payload ->> 'id', '')::uuid;
  exception when invalid_text_representation then
    v_input_id := null;
  end;

  if v_input_id is not null then
    select user_id into v_existing_user_id
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
        status = payload ->> 'status',
        started_at = (payload ->> 'startedAt')::timestamptz,
        completed_at = (payload ->> 'completedAt')::timestamptz,
        notes = payload ->> 'notes',
        updated_at = now()
      where id = v_session_id and user_id = v_user_id;
    else
      -- 아직 DB에 없는 행: 클라이언트가 미리 만들어 둔 id로 그대로 insert한다.
      -- user_id는 여전히 auth.uid()에서만 오고, insert RLS 정책도 그대로
      -- 적용되며, 기본키 제약이 이미 존재하는 id를 가로채는 것을 막는다.
      insert into public.workout_sessions (id, user_id, routine_id, routine_name, status, started_at, completed_at, notes)
      values (
        v_input_id,
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
    select value from jsonb_array_elements(
      case when jsonb_typeof(payload -> 'exercises') = 'array' then payload -> 'exercises' else '[]'::jsonb end
    )
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
    from jsonb_array_elements(
      case when jsonb_typeof(v_exercise -> 'sets') = 'array' then v_exercise -> 'sets' else '[]'::jsonb end
    ) as s;
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
  v_input_id uuid;
  v_existing_user_id uuid;
  v_exercise jsonb;
  v_routine_exercise_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  -- RoutineManager의 createId() 역시 crypto.randomUUID가 없으면 비-uuid
  -- 문자열로 대체된다. save_workout_session과 동일하게 방어적으로 처리한다.
  begin
    v_input_id := nullif(payload ->> 'id', '')::uuid;
  exception when invalid_text_representation then
    v_input_id := null;
  end;

  if v_input_id is not null then
    select user_id into v_existing_user_id
    from public.routines
    where id = v_input_id;

    if found then
      if v_existing_user_id <> v_user_id then
        raise exception 'routine not found or not owned by caller';
      end if;

      v_routine_id := v_input_id;
      update public.routines set
        name = payload ->> 'name',
        description = payload ->> 'description',
        color = payload ->> 'color',
        updated_at = now()
      where id = v_routine_id and user_id = v_user_id;
    else
      insert into public.routines (id, user_id, name, description, color)
      values (v_input_id, v_user_id, payload ->> 'name', payload ->> 'description', payload ->> 'color')
      returning id into v_routine_id;
    end if;
  else
    insert into public.routines (user_id, name, description, color)
    values (v_user_id, payload ->> 'name', payload ->> 'description', payload ->> 'color')
    returning id into v_routine_id;
  end if;

  delete from public.routine_exercises
  where routine_id = v_routine_id and user_id = v_user_id;

  for v_exercise in
    select value from jsonb_array_elements(
      case when jsonb_typeof(payload -> 'exercises') = 'array' then payload -> 'exercises' else '[]'::jsonb end
    )
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
    from jsonb_array_elements(
      case when jsonb_typeof(v_exercise -> 'sets') = 'array' then v_exercise -> 'sets' else '[]'::jsonb end
    ) as s;
  end loop;

  return v_routine_id;
end;
$$;

-- Supabase's default keeps SQL-created functions callable only by the roles
-- granted explicitly (matches the explicit-grant style used for tables in
-- 20260815160127_trainlog_schema.sql). Revoke the implicit PUBLIC grant so
-- anon can never invoke these, then grant to authenticated only.
revoke execute on function public.save_workout_session(jsonb) from public;
revoke execute on function public.save_routine(jsonb) from public;
grant execute on function public.save_workout_session(jsonb) to authenticated;
grant execute on function public.save_routine(jsonb) to authenticated;
