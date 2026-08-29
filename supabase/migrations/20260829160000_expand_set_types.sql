-- 루틴 처방과 실제 운동 기록에서 웜업/본/탑/백오프/드롭 세트를 구분한다.
-- 기존 'working' 값은 그대로 본세트로 표시하므로 데이터 변환은 필요 없다.

alter table public.routine_set_prescriptions
  drop constraint if exists routine_set_prescriptions_set_type_check,
  add constraint routine_set_prescriptions_set_type_check
    check (set_type in ('warmup', 'working', 'topset', 'backoff', 'dropset'));

alter table public.workout_set_records
  drop constraint if exists workout_set_records_set_type_check,
  add constraint workout_set_records_set_type_check
    check (set_type in ('warmup', 'working', 'topset', 'backoff', 'dropset'));
