-- 20260827090000_workout_session_edited_at.sql가 최신 RPC를 덮어쓰던 기간에
-- 저장된 프로그램 운동은 program_run_day_id가 비어 있다. 당시 화면에 남긴
-- `Day N · 제목`과 회차 생존 기간으로 역추적하되, 후보가 정확히 하나인 행만
-- 갱신한다. 후보가 없거나 여러 개인 기록은 잘못 연결하지 않고 그대로 둔다.
with legacy_sessions as (
  select
    s.id as session_id,
    s.user_id,
    s.started_at,
    (regexp_match(s.routine_name, '^Day ([1-9][0-9]*) · (.+)$'))[1]::integer as day_number,
    (regexp_match(s.routine_name, '^Day ([1-9][0-9]*) · (.+)$'))[2] as day_title
  from public.workout_sessions s
  where s.status = 'completed'
    and s.program_run_day_id is null
    and s.routine_id is null
    and regexp_match(s.routine_name, '^Day ([1-9][0-9]*) · (.+)$') is not null
), candidate_days as (
  select
    s.session_id,
    d.id as program_run_day_id,
    count(*) over (partition by s.session_id) as candidate_count
  from legacy_sessions s
  join public.program_runs r
    on r.user_id = s.user_id
    and r.created_at <= s.started_at
    and (r.ended_at is null or s.started_at <= r.ended_at)
  join public.program_run_days d
    on d.program_run_id = r.id
    and d.user_id = s.user_id
    and d.day_number = s.day_number
    and d.title = s.day_title
    and d.day_type in ('strength', 'cardio')
)
update public.workout_sessions s
set program_run_day_id = candidate_days.program_run_day_id,
    updated_at = now()
from candidate_days
where s.id = candidate_days.session_id
  and candidate_days.candidate_count = 1
  and s.program_run_day_id is null;
