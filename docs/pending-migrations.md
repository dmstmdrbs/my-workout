# 적용해야 할 마이그레이션 (2026-08-19, 2026-08-27 추가)

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

## 2. `20260827090000_workout_session_edited_at.sql`

완료된 기록을 나중에 고쳤다는 흔적을 남깁니다.

- `workout_sessions`에 `edited_at timestamptz` 추가
- **`save_workout_session` 함수 재정의**

### 왜 컬럼이 따로 필요한가

`updated_at`으로는 안 됩니다. 운동 진행 중 저장으로도 갱신되므로 완료 직후에도 이미 `completed_at`보다 나중입니다. `edited_at`은 **이미 `completed`로 저장돼 있던 세션을 다시 UPDATE할 때만** 채워집니다.

함수 본문은 `20260819090000_cardio_set_metrics.sql`의 것과 같고, 기존 행의 상태를 읽는 select에 `status`를 한 칸 더하고 UPDATE에 `edited_at` 한 줄을 더했습니다(`diff`로 대조했습니다).

### 프론트엔드를 먼저 배포해도 안전한 이유

프론트엔드는 이 값을 **읽기만** 합니다. `select('*')`이라 컬럼이 없으면 키 자체가 없고 어댑터가 `null`로 읽으며, `null`이면 아무 표시도 하지 않습니다. 이 파일을 적용하기 전까지 기록 화면의 `수정됨` 배지만 뜨지 않고, 편집·저장은 그대로 동작합니다.

### 적용 후 확인

```sql
select column_name from information_schema.columns
where table_name = 'workout_sessions' and column_name = 'edited_at';
```

한 행이 나와야 합니다. 함수도 `security invoker`로 남아 있어야 합니다.

```sql
select proname, prosecdef from pg_proc where proname = 'save_workout_session';
```

`prosecdef`가 **`false`** 여야 합니다.

---

## 3. 이미 적용하신 것 (기록용)

- `20260818120000_exercise_brand.sql` — 종목 브랜드. **적용 완료**
- `20260819090000_cardio_set_metrics.sql` — 유산소 기록(시간·거리) + `save_workout_session` 재정의. **적용 완료**

---

## 배포 후 손으로 확인할 것

이 저장소의 테스트는 전부 mock 어댑터로 돌기 때문에, **초록불은 Supabase 동작의 증거가 아닙니다.** 아래는 실제 DB에서만 드러납니다.

1. **루틴에 유산소 종목을 넣고 시간·거리를 처방한 뒤 저장 → 다시 열어 값이 남아 있는지.** 비어 있으면 `save_routine` 재정의가 안 들어간 것입니다.
2. 그 루틴으로 운동을 시작했을 때 세트에 처방한 시간·거리가 미리 채워지는지.
3. **운동을 완료해 저장한 뒤 기록 화면에 `30분 · 5.2km`로 남는지.** (`save_workout_session` 경로)
4. `/exercises`에서 브랜드를 넣어 만든 종목이 새로고침 후에도 브랜드를 유지하는지.
5. **완료된 기록을 `기록 수정`으로 고쳐 저장한 뒤, 다시 열어 값이 남아 있고 `수정됨` 배지가 붙는지.** 값은 남는데 배지가 없으면 `20260827090000`이 적용되지 않은 것입니다. 저장 자체가 실패하면 그건 컬럼 문제가 아니라 `save_workout_session`의 UPDATE 경로 문제입니다.
6. 그 기록에서 세트를 하나 더하고 하나 지운 뒤 저장 → 세트 번호가 1부터 빈칸 없이 남는지. (`unique (workout_exercise_id, set_order)`가 걸려 있어 번호가 겹치면 저장이 실패합니다.)

## 마이그레이션이 필요 없는 이번 변경

- 화면 켜 두기(`keepScreenAwake`) · 실제 RIR 입력(`rirInputEnabled`) — 컬럼이 이미 있었고 값을 읽지 않던 것뿐입니다.
- 휴식 알림 — 클라이언트 전용입니다.
- RIR 기반 중량 제안 — 기존 조회(`getLastCompletedSetForExercise`)가 이미 목표·실제 RIR을 담아 줍니다.
