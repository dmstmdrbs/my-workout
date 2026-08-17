-- 운동을 잠시 멈춘 시간(전화, 기구 대기, 잠깐 자리 비움 등)을 기록해
-- 경과/소요 시간 계산에서 제외한다. 추가만 하는 컬럼이라 기존 행은
-- 전부 기본값 0을 받는데, 일시정지 기능이 있기 전에 기록된 운동이므로
-- 0이 정확한 값이다.

alter table public.workout_sessions
  add column paused_seconds integer not null default 0
  check (paused_seconds >= 0);

-- save_workout_session은 세션 행을 쓰는 RPC라 새 컬럼도 함께 반영해야
-- 한다. 이미 적용된 20260816090000_atomic_writes.sql은 수정하지 않고,
-- 여기서 같은 함수를 create or replace로 다시 정의한다. 시그니처가
-- 그대로라 기존에 부여된 execute 권한도 유지된다.
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
  v_paused_seconds integer;
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

  -- pausedSeconds도 같은 이유로 방어적으로 파싱한다: 정상적인 클라이언트는
  -- 항상 정수를 보내지만, 손상되었거나 변조된 초안이 12.5 같은 소수나
  -- 문자열을 보내면 ::integer 캐스트가 예외를 던져 저장 전체가 실패한다.
  -- numeric을 거쳐 floor로 내림한 뒤 정수로 바꾸고, 그래도 실패하면(값이
  -- 아예 숫자가 아니면) null로 취급해 아래 coalesce가 안전한 기본값을
  -- 쓰게 한다.
  begin
    v_paused_seconds := floor((payload ->> 'pausedSeconds')::numeric)::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    v_paused_seconds := null;
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
        -- pausedSeconds는 saveSession에서 선택 입력이다. 이미 저장된 세션을
        -- 그 필드 없이 다시 저장하는 호출도 있을 수 있으므로, 없으면 0이
        -- 아니라 이미 저장돼 있던 값을 그대로 둔다. 0은 새 행에만 맞는
        -- 기본값이다(아래 두 insert에서만 coalesce(..., 0)을 쓴다).
        paused_seconds = coalesce(v_paused_seconds, paused_seconds),
        updated_at = now()
      where id = v_session_id and user_id = v_user_id;
    else
      -- 아직 DB에 없는 행: 클라이언트가 미리 만들어 둔 id로 그대로 insert한다.
      -- user_id는 여전히 auth.uid()에서만 오고, insert RLS 정책도 그대로
      -- 적용되며, 기본키 제약이 이미 존재하는 id를 가로채는 것을 막는다.
      insert into public.workout_sessions (id, user_id, routine_id, routine_name, status, started_at, completed_at, notes, paused_seconds)
      values (
        v_input_id,
        v_user_id,
        (payload ->> 'routineId')::uuid,
        payload ->> 'routineName',
        payload ->> 'status',
        (payload ->> 'startedAt')::timestamptz,
        (payload ->> 'completedAt')::timestamptz,
        payload ->> 'notes',
        coalesce(v_paused_seconds, 0)
      )
      returning id into v_session_id;
    end if;
  else
    insert into public.workout_sessions (user_id, routine_id, routine_name, status, started_at, completed_at, notes, paused_seconds)
    values (
      v_user_id,
      (payload ->> 'routineId')::uuid,
      payload ->> 'routineName',
      payload ->> 'status',
      (payload ->> 'startedAt')::timestamptz,
      (payload ->> 'completedAt')::timestamptz,
      payload ->> 'notes',
      coalesce(v_paused_seconds, 0)
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
