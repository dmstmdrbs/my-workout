-- User-entered exercise 1RM values. Program runs copy calculated target
-- weights into their JSON snapshots, so changing a max never rewrites an
-- already-started program cycle.
create table public.exercise_one_rep_maxes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  one_rep_max_kg numeric(7, 2) not null check (one_rep_max_kg > 0 and one_rep_max_kg <= 1000),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table public.exercise_one_rep_maxes enable row level security;

revoke all on table public.exercise_one_rep_maxes from anon, authenticated;
grant select, insert, update, delete on table public.exercise_one_rep_maxes to authenticated;

create policy "exercise_maxes_select_own"
  on public.exercise_one_rep_maxes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "exercise_maxes_insert_own"
  on public.exercise_one_rep_maxes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "exercise_maxes_update_own"
  on public.exercise_one_rep_maxes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "exercise_maxes_delete_own"
  on public.exercise_one_rep_maxes for delete to authenticated
  using ((select auth.uid()) = user_id);
