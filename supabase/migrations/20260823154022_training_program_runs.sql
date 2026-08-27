-- Fixed-calendar training programs.
--
-- A program run is an immutable participation cycle. Stopping a run changes
-- only its status; completed workout sessions remain attached to that run.
-- Starting again creates a new run and a fresh Day 1-56 schedule.

-- Program exercises are shared catalog rows. Keep any existing catalog row
-- with the same name and add only missing entries.
with required_exercises(name, primary_muscle, secondary_muscles, equipment, default_rest_seconds) as (
  values
    ('바벨 오버헤드 프레스', 'shoulders', array['triceps']::text[], 'barbell', 150),
    ('케이블 레터럴 레이즈', 'shoulders', array[]::text[], 'cable', 75),
    ('케이블 오버헤드 트라이셉스 익스텐션', 'triceps', array[]::text[], 'cable', 75),
    ('케이블 컬', 'biceps', array[]::text[], 'cable', 75),
    ('스탠딩 카프 레이즈', 'calves', array[]::text[], 'machine', 75),
    ('케이블 크런치', 'core', array[]::text[], 'cable', 75),
    ('플랫 체스트 프레스 머신', 'chest', array['triceps', 'shoulders']::text[], 'machine', 120),
    ('원 암 케이블 랫 풀다운', 'back', array['biceps']::text[], 'cable', 90),
    ('하이 투 로우 케이블 플라이', 'chest', array[]::text[], 'cable', 75),
    ('일시정지 스쿼트', 'quadriceps', array['glutes', 'hamstrings']::text[], 'barbell', 150),
    ('레그 익스텐션', 'quadriceps', array[]::text[], 'machine', 75),
    ('러닝', 'cardio', array[]::text[], 'cardio', 0)
)
insert into public.exercises (
  name, primary_muscle, secondary_muscles, equipment, default_rest_seconds
)
select r.name, r.primary_muscle, r.secondary_muscles, r.equipment, r.default_rest_seconds
from required_exercises r
where not exists (
  select 1 from public.exercises e where e.user_id is null and e.name = r.name
);

create table public.program_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_key text not null check (char_length(program_key) between 1 and 80),
  program_name text not null check (char_length(program_name) between 1 and 120),
  template_version integer not null default 1 check (template_version > 0),
  duration_weeks integer not null default 8 check (duration_weeks between 1 and 52),
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'withdrawn')),
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'active' and ended_at is null)
    or (status in ('completed', 'withdrawn') and ended_at is not null)
  )
);

create table public.program_run_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_run_id uuid not null references public.program_runs (id) on delete cascade,
  day_number integer not null check (day_number between 1 and 364),
  week_number integer not null check (week_number between 1 and 52),
  day_of_week integer not null check (day_of_week between 1 and 7),
  scheduled_on date not null,
  day_type text not null check (day_type in ('strength', 'cardio', 'rest')),
  title text not null check (char_length(title) between 1 and 120),
  instructions text,
  routine_snapshot jsonb,
  cardio_target jsonb,
  is_optional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_run_id, day_number),
  unique (program_run_id, scheduled_on),
  check ((day_type = 'strength') = (routine_snapshot is not null)),
  check ((day_type = 'cardio') = (cardio_target is not null))
);

alter table public.workout_sessions
  add column program_run_day_id uuid references public.program_run_days (id) on delete set null;

create unique index workout_sessions_program_day_unique_idx
  on public.workout_sessions (program_run_day_id)
  where program_run_day_id is not null;
create unique index program_runs_one_active_per_user_idx
  on public.program_runs (user_id)
  where status = 'active';
create index program_runs_owner_created_idx
  on public.program_runs (user_id, created_at desc);
create index program_run_days_run_day_idx
  on public.program_run_days (program_run_id, day_number);
create index program_run_days_owner_date_idx
  on public.program_run_days (user_id, scheduled_on);

alter table public.program_runs enable row level security;
alter table public.program_run_days enable row level security;

create policy "program_runs_select_own"
  on public.program_runs for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "program_runs_insert_own"
  on public.program_runs for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "program_runs_update_own"
  on public.program_runs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "program_days_select_own"
  on public.program_run_days for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "program_days_insert_own"
  on public.program_run_days for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.program_runs r
      where r.id = program_run_id
        and r.user_id = (select auth.uid())
    )
  );

-- New public-schema tables are not automatically exposed to the Data API on
-- current Supabase projects. The RPCs run as the caller, so the caller also
-- needs the matching table privileges while RLS enforces ownership.
grant select, insert, update on table public.program_runs to authenticated;
grant select, insert on table public.program_run_days to authenticated;

create or replace function public.start_program_run(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_run_id uuid;
  v_start_date date;
  v_duration_weeks integer;
  v_expected_days integer;
  v_day jsonb;
  v_day_number integer;
  v_day_type text;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if exists (
    select 1 from public.program_runs
    where user_id = v_user_id and status = 'active'
  ) then
    raise exception 'an active program run already exists';
  end if;

  v_start_date := (payload ->> 'startDate')::date;
  v_duration_weeks := coalesce((payload ->> 'durationWeeks')::integer, 8);
  v_expected_days := v_duration_weeks * 7;

  if v_duration_weeks < 1 or v_duration_weeks > 52 then
    raise exception 'invalid program duration';
  end if;

  if jsonb_typeof(payload -> 'days') <> 'array'
     or jsonb_array_length(payload -> 'days') <> v_expected_days then
    raise exception 'program must include exactly % days', v_expected_days;
  end if;

  insert into public.program_runs (
    user_id, program_key, program_name, template_version,
    duration_weeks, start_date
  ) values (
    v_user_id,
    payload ->> 'programKey',
    payload ->> 'programName',
    coalesce((payload ->> 'templateVersion')::integer, 1),
    v_duration_weeks,
    v_start_date
  ) returning id into v_run_id;

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

    insert into public.program_run_days (
      user_id, program_run_id, day_number, week_number, day_of_week,
      scheduled_on, day_type, title, instructions, routine_snapshot,
      cardio_target, is_optional
    ) values (
      v_user_id,
      v_run_id,
      v_day_number,
      ((v_day_number - 1) / 7) + 1,
      ((v_day_number - 1) % 7) + 1,
      v_start_date + (v_day_number - 1),
      v_day_type,
      v_day ->> 'title',
      v_day ->> 'instructions',
      case when v_day_type = 'strength' then v_day -> 'routineSnapshot' else null end,
      case when v_day_type = 'cardio' then v_day -> 'cardioTarget' else null end,
      coalesce((v_day ->> 'isOptional')::boolean, false)
    );
  end loop;

  if (
    select count(*) from public.program_run_days where program_run_id = v_run_id
  ) <> v_expected_days then
    raise exception 'program day numbers must be unique and complete';
  end if;

  return v_run_id;
end;
$$;

create or replace function public.end_program_run(
  target_run_id uuid,
  outcome text,
  reason text default null
)
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
  if outcome not in ('completed', 'withdrawn') then
    raise exception 'invalid program outcome';
  end if;

  update public.program_runs
  set status = outcome,
      ended_at = now(),
      end_reason = nullif(reason, ''),
      updated_at = now()
  where id = target_run_id
    and user_id = v_user_id
    and status = 'active';

  if not found then
    raise exception 'active program run not found or not owned by caller';
  end if;
end;
$$;

-- Keep workout persistence atomic with the program Day link. The function is
-- based on 20260819090000_cardio_set_metrics.sql and adds only the validated
-- program_run_day_id value to the session write.
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
        program_run_day_id = v_program_run_day_id,
        status = payload ->> 'status',
        started_at = (payload ->> 'startedAt')::timestamptz,
        completed_at = (payload ->> 'completedAt')::timestamptz,
        notes = payload ->> 'notes',
        paused_seconds = coalesce(v_paused_seconds, paused_seconds),
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

revoke execute on function public.start_program_run(jsonb) from public;
revoke execute on function public.end_program_run(uuid, text, text) from public;
grant execute on function public.start_program_run(jsonb) to authenticated;
grant execute on function public.end_program_run(uuid, text, text) to authenticated;
