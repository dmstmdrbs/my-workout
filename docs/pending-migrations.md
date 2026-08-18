# 적용해야 할 마이그레이션 (2026-08-19)

푸시 전에 **DB를 먼저** 적용해야 하는 파일 목록입니다. 둘 다 비파괴적이고, 지금 배포된 프론트엔드는 새 컬럼을 읽지 않으므로 DB만 먼저 적용해도 안전합니다. 반대 순서(프론트 먼저)는 안 됩니다 — 새 프론트엔드가 없는 컬럼에 값을 보내 저장이 실패합니다.

Supabase 대시보드 → **SQL Editor**에 파일 내용을 그대로 붙여 실행하시면 됩니다.

---

## 1. `20260819140000_routine_cardio_prescription.sql`

루틴이 유산소를 처방할 수 있게 합니다.

- `routine_set_prescriptions`에 `target_duration_seconds`, `target_distance_km` 추가
- **`save_routine` 함수 재정의**

### 왜 함수까지 고치나

`save_routine`은 INSERT할 컬럼을 **명시**합니다. 컬럼만 추가하고 함수를 그대로 두면 **저장은 성공하는데 처방한 시간·거리만 조용히 사라집니다.** 오류가 나지 않아 알아채기 어려운 종류입니다.

함수 본문은 `20260816090000_atomic_writes.sql`의 것과 같고, 세트 INSERT의 컬럼 목록과 값 두 줄만 늘렸습니다(`diff`로 대조했습니다).

### 적용 후 확인

```sql
select column_name from information_schema.columns
where table_name = 'routine_set_prescriptions'
  and column_name in ('target_duration_seconds', 'target_distance_km');
```

두 행이 나와야 합니다.

---

## 2. 이미 적용하신 것 (기록용)

- `20260818120000_exercise_brand.sql` — 종목 브랜드. **적용 완료**
- `20260819090000_cardio_set_metrics.sql` — 유산소 기록(시간·거리) + `save_workout_session` 재정의. **적용 완료**

---

## 배포 후 손으로 확인할 것

이 저장소의 테스트는 전부 mock 어댑터로 돌기 때문에, **초록불은 Supabase 동작의 증거가 아닙니다.** 아래는 실제 DB에서만 드러납니다.

1. **루틴에 유산소 종목을 넣고 시간·거리를 처방한 뒤 저장 → 다시 열어 값이 남아 있는지.** 비어 있으면 `save_routine` 재정의가 안 들어간 것입니다.
2. 그 루틴으로 운동을 시작했을 때 세트에 처방한 시간·거리가 미리 채워지는지.
3. **운동을 완료해 저장한 뒤 기록 화면에 `30분 · 5.2km`로 남는지.** (`save_workout_session` 경로)
4. `/exercises`에서 브랜드를 넣어 만든 종목이 새로고침 후에도 브랜드를 유지하는지.

## 마이그레이션이 필요 없는 이번 변경

- 화면 켜 두기(`keepScreenAwake`) · 실제 RIR 입력(`rirInputEnabled`) — 컬럼이 이미 있었고 값을 읽지 않던 것뿐입니다.
- 휴식 알림 — 클라이언트 전용입니다.
- RIR 기반 중량 제안 — 기존 조회(`getLastCompletedSetForExercise`)가 이미 목표·실제 RIR을 담아 줍니다.
