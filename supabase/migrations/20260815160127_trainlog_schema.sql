-- Trainlog's browser client uses only the Supabase publishable key.  Every
-- table in the exposed public schema is protected by RLS and scoped to its
-- authenticated owner.  Child rows duplicate user_id deliberately: it keeps
-- ownership checks simple and prevents cross-user parent relationships.

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  week_starts_on smallint not null default 1 check (week_starts_on in (0, 1)),
  timezone text not null default 'Asia/Seoul',
  default_rest_seconds integer not null default 90 check (default_rest_seconds between 0 and 3600),
  default_rir numeric(3, 1) check (default_rir is null or default_rir between 0 and 5),
  rir_input_enabled boolean not null default true,
  share_rir_by_default boolean not null default true,
  keep_screen_awake boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  primary_muscle text not null,
  secondary_muscles text[] not null default '{}',
  equipment text not null,
  default_rest_seconds integer not null default 90 check (default_rest_seconds between 0 and 3600),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  routine_id uuid not null references public.routines (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  exercise_order integer not null check (exercise_order >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (routine_id, exercise_order)
);

create table public.routine_set_prescriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  routine_exercise_id uuid not null references public.routine_exercises (id) on delete cascade,
  set_order integer not null check (set_order >= 0),
  set_type text not null check (set_type in ('warmup', 'working', 'dropset')),
  target_weight_kg numeric(8, 2) check (target_weight_kg is null or target_weight_kg >= 0),
  target_reps_min integer check (target_reps_min is null or target_reps_min >= 0),
  target_reps_max integer check (target_reps_max is null or target_reps_max >= 0),
  target_rir numeric(3, 1) check (target_rir is null or target_rir between 0 and 5),
  rest_seconds integer check (rest_seconds is null or rest_seconds between 0 and 3600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (routine_exercise_id, set_order),
  check (target_reps_min is null or target_reps_max is null or target_reps_min <= target_reps_max)
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  routine_id uuid references public.routines (id) on delete set null,
  routine_name text,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null))
);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  exercise_name text not null,
  primary_muscle text not null,
  exercise_order integer not null check (exercise_order >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, exercise_order)
);

create table public.workout_set_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  set_order integer not null check (set_order >= 0),
  set_type text not null check (set_type in ('warmup', 'working', 'dropset')),
  weight_kg numeric(8, 2) check (weight_kg is null or weight_kg >= 0),
  reps integer check (reps is null or reps >= 0),
  target_rir numeric(3, 1) check (target_rir is null or target_rir between 0 and 5),
  actual_rir numeric(3, 1) check (actual_rir is null or actual_rir between 0 and 5),
  rest_seconds integer check (rest_seconds is null or rest_seconds between 0 and 3600),
  is_completed boolean not null default false,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_exercise_id, set_order),
  check ((is_completed and completed_at is not null) or (not is_completed and completed_at is null))
);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg >= 0),
  skeletal_muscle_mass_kg numeric(6, 2) check (skeletal_muscle_mass_kg is null or skeletal_muscle_mass_kg >= 0),
  body_fat_percentage numeric(5, 2) check (body_fat_percentage is null or body_fat_percentage between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exercises_owner_idx on public.exercises (user_id) where user_id is not null;
create index routines_owner_updated_idx on public.routines (user_id, updated_at desc);
create index routine_exercises_routine_idx on public.routine_exercises (routine_id, exercise_order);
create index routine_set_prescriptions_exercise_idx on public.routine_set_prescriptions (routine_exercise_id, set_order);
create index workout_sessions_owner_started_idx on public.workout_sessions (user_id, started_at desc);
create index workout_exercises_session_idx on public.workout_exercises (session_id, exercise_order);
create index workout_set_records_exercise_idx on public.workout_set_records (workout_exercise_id, set_order);
create index body_measurements_owner_date_idx on public.body_measurements (user_id, measured_on desc);

-- Supabase's new default keeps SQL-created public tables out of the Data API.
-- Grant only the authenticated application role; RLS below then scopes rows.
grant select, insert, update, delete on table
  public.profiles,
  public.user_settings,
  public.exercises,
  public.routines,
  public.routine_exercises,
  public.routine_set_prescriptions,
  public.workout_sessions,
  public.workout_exercises,
  public.workout_set_records,
  public.body_measurements
to authenticated;

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.exercises enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.routine_set_prescriptions enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_set_records enable row level security;
alter table public.body_measurements enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "settings_select_own" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "settings_insert_own" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "settings_update_own" on public.user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "exercises_select_visible" on public.exercises for select to authenticated using (user_id is null or (select auth.uid()) = user_id);
create policy "exercises_insert_own" on public.exercises for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "exercises_update_own" on public.exercises for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "exercises_delete_own" on public.exercises for delete to authenticated using ((select auth.uid()) = user_id);

create policy "routines_select_own" on public.routines for select to authenticated using ((select auth.uid()) = user_id);
create policy "routines_insert_own" on public.routines for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "routines_update_own" on public.routines for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "routines_delete_own" on public.routines for delete to authenticated using ((select auth.uid()) = user_id);

create policy "routine_exercises_select_own" on public.routine_exercises for select to authenticated using ((select auth.uid()) = user_id);
create policy "routine_exercises_insert_own" on public.routine_exercises for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.routines where id = routine_id and user_id = (select auth.uid())));
create policy "routine_exercises_update_own" on public.routine_exercises for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.routines where id = routine_id and user_id = (select auth.uid())));
create policy "routine_exercises_delete_own" on public.routine_exercises for delete to authenticated using ((select auth.uid()) = user_id);

create policy "routine_sets_select_own" on public.routine_set_prescriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "routine_sets_insert_own" on public.routine_set_prescriptions for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.routine_exercises where id = routine_exercise_id and user_id = (select auth.uid())));
create policy "routine_sets_update_own" on public.routine_set_prescriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.routine_exercises where id = routine_exercise_id and user_id = (select auth.uid())));
create policy "routine_sets_delete_own" on public.routine_set_prescriptions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "sessions_select_own" on public.workout_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "sessions_insert_own" on public.workout_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sessions_update_own" on public.workout_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sessions_delete_own" on public.workout_sessions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "workout_exercises_select_own" on public.workout_exercises for select to authenticated using ((select auth.uid()) = user_id);
create policy "workout_exercises_insert_own" on public.workout_exercises for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.workout_sessions where id = session_id and user_id = (select auth.uid())));
create policy "workout_exercises_update_own" on public.workout_exercises for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.workout_sessions where id = session_id and user_id = (select auth.uid())));
create policy "workout_exercises_delete_own" on public.workout_exercises for delete to authenticated using ((select auth.uid()) = user_id);

create policy "workout_sets_select_own" on public.workout_set_records for select to authenticated using ((select auth.uid()) = user_id);
create policy "workout_sets_insert_own" on public.workout_set_records for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.workout_exercises where id = workout_exercise_id and user_id = (select auth.uid())));
create policy "workout_sets_update_own" on public.workout_set_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.workout_exercises where id = workout_exercise_id and user_id = (select auth.uid())));
create policy "workout_sets_delete_own" on public.workout_set_records for delete to authenticated using ((select auth.uid()) = user_id);

create policy "measurements_select_own" on public.body_measurements for select to authenticated using ((select auth.uid()) = user_id);
create policy "measurements_insert_own" on public.body_measurements for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "measurements_update_own" on public.body_measurements for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "measurements_delete_own" on public.body_measurements for delete to authenticated using ((select auth.uid()) = user_id);

-- The common exercise catalog is intentionally global (user_id is null).  It
-- is read-only to clients; users can create, edit, or archive only their own.
insert into public.exercises (name, primary_muscle, secondary_muscles, equipment, default_rest_seconds) values
  ('바벨 벤치프레스', 'chest', array['triceps', 'shoulders'], 'barbell', 120),
  ('인클라인 덤벨 프레스', 'chest', array['triceps', 'shoulders'], 'dumbbell', 90),
  ('체스트 서포티드 시티드 로우', 'back', array['biceps'], 'machine', 90),
  ('와이드 그립 랫 풀다운', 'back', array['biceps'], 'cable', 90),
  ('원 암 덤벨 로우', 'back', array['biceps'], 'dumbbell', 90),
  ('토쳐 하이로우 머신', 'back', array['biceps'], 'machine', 90),
  ('이지바 컬', 'biceps', array[]::text[], 'barbell', 75),
  ('인클라인 덤벨 컬', 'biceps', array[]::text[], 'dumbbell', 75),
  ('리버스 펙 덱 플라이', 'shoulders', array['back'], 'machine', 75),
  ('스쿼트', 'quadriceps', array['glutes', 'hamstrings'], 'barbell', 150),
  ('레그 프레스', 'quadriceps', array['glutes'], 'machine', 120),
  ('루마니안 데드리프트', 'hamstrings', array['glutes', 'back'], 'barbell', 120),
  ('레그 컬', 'hamstrings', array[]::text[], 'machine', 75),
  ('케이블 트라이셉스 푸시다운', 'triceps', array[]::text[], 'cable', 75);
