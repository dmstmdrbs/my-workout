-- 완료된 운동 기록을 나중에 고친 흔적.
--
-- 기록 편집 기능이 생기면서 "이 기록은 그때 적은 그대로인가, 나중에 손을 봤나"를
-- 구분할 수 없게 됐다. `updated_at`으로는 안 된다 -- 운동 진행 중 저장으로도
-- 갱신되므로 완료 직후에도 이미 `completed_at`보다 나중이다.
--
-- 그래서 판정을 컬럼 하나로 못 박는다: `edited_at`은 **이미 `completed`로
-- 저장돼 있던 세션을 다시 UPDATE할 때만** 채워진다. 운동을 끝내며 처음
-- 저장하는 경로(INSERT, 또는 `in_progress`였던 행의 UPDATE)에서는 null로
-- 남는다.
--
-- 컬럼 추가만으로는 부족하다. `save_workout_session`이 세션 행을 쓰는 유일한
-- 경로이므로, 함수를 함께 갱신하지 않으면 컬럼은 생겨도 영원히 null이다.
-- 아래 함수 본문은 20260819090000의 것과 같고, 기존 행의 상태를 읽는 select에
-- `status`를 한 칸 더하고 UPDATE에 `edited_at` 한 줄을 더했다.
--
-- 비파괴적이다. 기존 행은 `edited_at`이 null이 되고, 프론트엔드는 이 값을
-- 읽기만 하며(`select('*')`이라 컬럼이 없어도 null로 읽힌다) null이면 아무
-- 표시도 하지 않는다. 그래서 프론트를 먼저 배포해도 안전하다 -- 이 파일을
-- 적용하기 전까지 "수정됨" 표시만 뜨지 않는다.
alter table public.workout_sessions
  add column if not exists edited_at timestamptz;

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
    -- status도 함께 읽는다. UPDATE의 SET 절 우변에서도 이전 값을 볼 수 있지만,
    -- "편집이었는지"를 판정하는 근거를 변수 하나로 드러내 두는 편이 낫다.
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
        status = payload ->> 'status',
        started_at = (payload ->> 'startedAt')::timestamptz,
        completed_at = (payload ->> 'completedAt')::timestamptz,
        notes = payload ->> 'notes',
        -- pausedSeconds는 saveSession에서 선택 입력이다. 이미 저장된 세션을
        -- 그 필드 없이 다시 저장하는 호출도 있을 수 있으므로, 없으면 0이
        -- 아니라 이미 저장돼 있던 값을 그대로 둔다. 0은 새 행에만 맞는
        -- 기본값이다(아래 두 insert에서만 coalesce(..., 0)을 쓴다).
        paused_seconds = coalesce(v_paused_seconds, paused_seconds),
        -- 이미 완료돼 있던 기록을 다시 저장하는 것만 "편집"이다. 운동을
        -- 끝내며 처음 저장하는 경로(in_progress 행의 UPDATE, 또는 아래
        -- INSERT)에서는 손대지 않아 null로 남는다. 클라이언트가 보낸 값은
        -- 쓰지 않는다 -- 그러면 고친 흔적을 지운 채 저장할 수도 있다.
        edited_at = case when v_existing_status = 'completed' then now() else edited_at end,
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
