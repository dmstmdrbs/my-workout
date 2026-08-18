-- 루틴이 유산소를 처방할 수 있게 한다.
--
-- 2026-08-19에 유산소 기록(시간·거리)을 넣었지만 루틴 처방에는 자리가 없어,
-- 유산소 종목을 루틴에 넣으면 처방이 빈 채로 들어갔다. 기록 쪽과 같은 단위를
-- 쓴다(초, km).
--
-- 컬럼 추가만으로는 부족하다. save_routine은 컬럼을 **명시해** INSERT하므로,
-- 함수를 함께 갱신하지 않으면 저장은 성공하는데 처방만 조용히 사라진다.
-- 아래 함수 본문은 20260816090000의 것과 같고, 세트 INSERT의 컬럼 목록과
-- 값 두 줄만 늘렸다.
--
-- 비파괴적이다. 기존 행은 두 값이 null이 되고, 이 컬럼을 읽지 않는 지금
-- 프론트엔드는 그대로 동작하므로 DB를 먼저 적용해도 안전하다.
alter table public.routine_set_prescriptions
  add column if not exists target_duration_seconds integer check (target_duration_seconds is null or target_duration_seconds between 0 and 86400),
  add column if not exists target_distance_km numeric(7, 3) check (target_distance_km is null or target_distance_km >= 0);

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
      target_weight_kg, target_reps_min, target_reps_max,
      target_duration_seconds, target_distance_km,
      target_rir, rest_seconds
    )
    select
      v_routine_exercise_id,
      v_user_id,
      (s ->> 'setOrder')::integer,
      s ->> 'setType',
      (s ->> 'targetWeightKg')::numeric,
      (s ->> 'targetRepsMin')::integer,
      (s ->> 'targetRepsMax')::integer,
      (s ->> 'targetDurationSeconds')::integer,
      (s ->> 'targetDistanceKm')::numeric,
      (s ->> 'targetRir')::numeric,
      (s ->> 'restSeconds')::integer
    from jsonb_array_elements(
      case when jsonb_typeof(v_exercise -> 'sets') = 'array' then v_exercise -> 'sets' else '[]'::jsonb end
    ) as s;
  end loop;

  return v_routine_id;
end;
$$;
