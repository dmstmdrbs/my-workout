# 데이터 레이어 안정화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운동 기록 저장을 원자화하고, 세션 조회를 실제 필요 범위로 줄이며, 신체 측정 중복을 DB에서 막는다.

**Architecture:** `saveSession`/`saveRoutine`의 delete-then-insert를 Postgres 함수(RPC)로 옮겨 한 트랜잭션에 담는다. `listSessions`에 커서(`startedBefore`)와 기간(`startedAfter`)을 추가해 화면별로 필요한 만큼만 조회하고, 기록 화면은 무한 스크롤로 전환한다. `body_measurements`에 unique 제약을 걸어 같은 날짜 중복을 DB가 보장한다.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Query 5(`useInfiniteQuery`), Supabase(Postgres RPC, RLS), Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-08-16-data-layer-hardening-design.md`

## Global Constraints

- UI는 `useAppServices()`로만 서비스에 접근한다. 컴포넌트에서 Supabase 클라이언트를 직접 호출하지 않는다.
- `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`가 없을 때 mock adapter로 동작해야 한다.
- `contracts.ts`와 `types/domain.ts`가 저장소 경계다. 계약 변경은 mock과 Supabase 구현 **양쪽**에 반영한다.
- 목표 RIR(`targetRir`)과 실제 RIR(`actualRir`)은 독립 값이다.
- 무게 단위는 kg 고정이다.
- 설정은 `useSettings()`로만 읽는다. 화면별 쿼리에서 `getSettings()`를 직접 호출하지 않는다.
- 테마는 `applyTheme()`으로만 적용한다.
- 이미 적용된 migration은 수정하지 않는다. 새 파일을 추가한다.
- `public` 스키마의 사용자 데이터 테이블은 RLS를 켜고 `auth.uid()` 소유권 정책을 유지한다. RPC 함수는 `security invoker`로 정의한다 — `security definer`는 RLS를 우회하므로 쓰지 않는다.
- 모든 사용자 노출 문구는 한국어이며 기존 존댓말 어조를 따른다.
- 정상 종료 전 검증: `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`. 기존 30개 테스트가 모두 통과해야 한다.

## 테스트 환경 주의사항 (전 태스크 공통)

`src/services/mock/localStorageServices.ts`의 `inMemoryStore`는 모듈 레벨 변수이고 `readStore()`가 그 값을 먼저 반환하므로 `localStorage.clear()`로 리셋되지 않는다. 테스트 격리는 Vitest의 파일별 모듈 그래프에 의존한다. **새 시나리오는 기존 파일에 끼워 넣지 말고 새 테스트 파일을 만든다.** 파일 안에서는 `beforeAll`을 쓰고, 상태가 테스트 간 이어진다는 전제로 단언을 작성한다(절대 개수 대신 변화량).

기존 테스트 파일: `app-user-flows`, `settings-flows`, `signout-flows`, `body-flows`, `theme-session-flows`.

---

### Task 1: 조회 계약 확장

`listSessions`에 커서·기간을 추가하고, 종목별 마지막 완료 세트 전용 조회를 만든다. 소비자는 아직 바꾸지 않는다 — 이 태스크는 계약과 두 어댑터 구현만 담당한다.

**Files:**
- Modify: `src/services/contracts.ts:47`
- Modify: `src/services/mock/localStorageServices.ts:139`
- Modify: `src/services/supabase/supabaseServices.ts:474`
- Test: `src/test/repository-query-flows.test.ts` (신규)

**Interfaces:**
- Produces:
  - `listSessions(options?: { status?: SessionStatus; limit?: number; startedBefore?: IsoDateTime; startedAfter?: IsoDateTime }): Promise<WorkoutSession[]>` — `started_at` 내림차순 유지
  - `getLastCompletedSetForExercise(exerciseId: Id): Promise<WorkoutSetRecord | null>`

- [ ] **Step 1: 기준선 확인**

Run: `npm test`
Expected: 30 passed. 실패가 있으면 멈추고 보고한다.

- [ ] **Step 2: 실패하는 테스트 작성**

Create `src/test/repository-query-flows.test.ts`. mock adapter를 직접 쓰는 단위 테스트다(컴포넌트 렌더 없음).

```ts
import { beforeAll, describe, expect, test } from 'vitest'
import { createLocalStorageServices } from '../services'
import type { WorkoutRepository } from '../services'

describe.sequential('저장소 조회 계약', () => {
  let repo: WorkoutRepository

  beforeAll(() => {
    localStorage.clear()
    repo = createLocalStorageServices().workoutRepository
  })

  test('limit은 최근 세션부터 그 개수만 돌려준다', async () => {
    const all = await repo.listSessions({ status: 'completed' })
    expect(all.length).toBeGreaterThan(1)

    const limited = await repo.listSessions({ status: 'completed', limit: 1 })
    expect(limited).toHaveLength(1)
    expect(limited[0].id).toBe(all[0].id)
  })

  test('결과는 startedAt 내림차순이다', async () => {
    const sessions = await repo.listSessions({ status: 'completed' })
    const times = sessions.map((session) => new Date(session.startedAt).getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  test('startedBefore는 커서로 동작해 그 시각 이전 세션만 준다', async () => {
    const all = await repo.listSessions({ status: 'completed' })
    const cursor = all[0].startedAt

    const page = await repo.listSessions({ status: 'completed', startedBefore: cursor })
    expect(page.every((session) => new Date(session.startedAt) < new Date(cursor))).toBe(true)
    expect(page.some((session) => session.id === all[0].id)).toBe(false)
  })

  test('startedAfter는 그 시각 이후 세션만 준다', async () => {
    const all = await repo.listSessions({ status: 'completed' })
    const cursor = all.at(-1)!.startedAt

    const page = await repo.listSessions({ status: 'completed', startedAfter: cursor })
    expect(page.every((session) => new Date(session.startedAt) >= new Date(cursor))).toBe(true)
  })

  test('커서로 페이지를 이어 붙이면 전체와 같아진다', async () => {
    const all = await repo.listSessions({ status: 'completed' })
    const collected = []
    let cursor: string | undefined

    for (let guard = 0; guard < 20; guard += 1) {
      const page = await repo.listSessions({ status: 'completed', limit: 1, startedBefore: cursor })
      if (!page.length) break
      collected.push(...page)
      cursor = page.at(-1)!.startedAt
    }

    expect(collected.map((session) => session.id)).toEqual(all.map((session) => session.id))
  })

  test('종목별 마지막 완료 세트를 돌려준다', async () => {
    const sessions = await repo.listSessions({ status: 'completed' })
    const exercise = sessions.flatMap((session) => session.exercises).find((item) => item.sets.some((set) => set.isCompleted))
    expect(exercise).toBeTruthy()

    const set = await repo.getLastCompletedSetForExercise(exercise!.exerciseId)
    expect(set).not.toBeNull()
    expect(set!.isCompleted).toBe(true)
  })

  test('기록이 없는 종목이면 null을 돌려준다', async () => {
    expect(await repo.getLastCompletedSetForExercise('없는-종목-id')).toBeNull()
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/test/repository-query-flows.test.ts`
Expected: FAIL — `getLastCompletedSetForExercise is not a function`, 그리고 `startedBefore`가 무시되어 커서 테스트가 실패한다.

- [ ] **Step 4: 계약 갱신**

`src/services/contracts.ts`에서 `listSessions` 시그니처를 바꾸고 새 메서드를 추가한다. `WorkoutSetRecord`를 import에 더한다.

```ts
  listSessions(options?: {
    status?: WorkoutSession['status']
    limit?: number
    /** 이 시각보다 이전에 시작한 세션만. 페이지네이션 커서로 쓴다. */
    startedBefore?: IsoDateTime
    /** 이 시각 이후에 시작한 세션만. 기간 집계에 쓴다. */
    startedAfter?: IsoDateTime
  }): Promise<WorkoutSession[]>
  getSession(id: Id): Promise<WorkoutSession | null>
  /** 지난 기록 표시용. 세션 목록 전체를 받지 않고 필요한 한 세트만 가져온다. */
  getLastCompletedSetForExercise(exerciseId: Id): Promise<WorkoutSetRecord | null>
```

`IsoDateTime`과 `WorkoutSetRecord`를 `../types/domain`에서 import한다.

- [ ] **Step 5: mock 구현**

`src/services/mock/localStorageServices.ts`의 `listSessions`를 필터 체인으로 바꾼다. 기존 정렬(내림차순)을 유지하고, 필터를 적용한 뒤 마지막에 `limit`을 자른다.

```ts
  async listSessions(options: { status?: WorkoutSession['status']; limit?: number; startedBefore?: string; startedAfter?: string } = {}) {
    const at = (value: string) => new Date(value).getTime()
    let sessions = clone(this.requireStore().sessions)
      .sort((a, b) => at(b.startedAt) - at(a.startedAt))
    if (options.status) sessions = sessions.filter((session) => session.status === options.status)
    if (options.startedBefore) sessions = sessions.filter((session) => at(session.startedAt) < at(options.startedBefore!))
    if (options.startedAfter) sessions = sessions.filter((session) => at(session.startedAt) >= at(options.startedAfter!))
    if (options.limit !== undefined) sessions = sessions.slice(0, options.limit)
    return sessions
  }

  async getLastCompletedSetForExercise(exerciseId: Id) {
    const at = (value: string) => new Date(value).getTime()
    const sessions = clone(this.requireStore().sessions)
      .filter((session) => session.status === 'completed')
      .sort((a, b) => at(b.startedAt) - at(a.startedAt))
    for (const session of sessions) {
      const exercise = session.exercises.find((item) => item.exerciseId === exerciseId)
      const set = exercise?.sets.filter((item) => item.isCompleted).at(-1)
      if (set) return set
    }
    return null
  }
```

**문자열 비교를 쓰지 말 것.** 시드 데이터의 `startedAt`은 `'2026-08-14T10:05:00.000+09:00'`처럼 오프셋 표기를 쓰는 반면, 앱이 만드는 값은 `toISOString()`이라 `Z` 접미사를 쓴다. 두 표기가 섞여 있으므로 `localeCompare`나 `<` 문자열 비교는 같은 시각을 다르게 판정한다. 반드시 `new Date(...).getTime()`으로 비교한다.

기존 `localStorageServices.ts`의 `listBodyMeasurements`가 `measuredOn.localeCompare`를 쓰는데, 그쪽은 `YYYY-MM-DD` 날짜 문자열이라 안전하다. 혼동하지 말 것.

- [ ] **Step 6: Supabase 구현**

`src/services/supabase/supabaseServices.ts`의 `listSessions`에 필터를 추가한다.

```ts
  async listSessions(options: { status?: WorkoutSession['status']; limit?: number; startedBefore?: string; startedAfter?: string } = {}) {
    await this.requireUser()
    let query = this.client.from('workout_sessions').select('*, workout_exercises(*, exercises(name, primary_muscle), workout_set_records(*))').order('started_at', { ascending: false })
    if (options.status) query = query.eq('status', options.status)
    if (options.startedBefore) query = query.lt('started_at', options.startedBefore)
    if (options.startedAfter) query = query.gte('started_at', options.startedAfter)
    if (options.limit !== undefined) query = query.limit(options.limit)
    const { data, error } = await query
    if (error) throw toError(error, '운동 기록을 불러오지 못했어요.')
    return asRows(data).map(mapWorkoutSession)
  }

  async getLastCompletedSetForExercise(exerciseId: Id) {
    await this.requireUser()
    const { data, error } = await this.client
      .from('workout_set_records')
      .select('*, workout_exercises!inner(exercise_id, session_id, workout_sessions!inner(started_at, status))')
      .eq('workout_exercises.exercise_id', exerciseId)
      .eq('workout_exercises.workout_sessions.status', 'completed')
      .eq('is_completed', true)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    if (error) throw toError(error, '지난 기록을 불러오지 못했어요.')
    return data ? mapWorkoutSet(data as Row) : null
  }
```

**`!inner` 표기:** 조인된 행이 조건을 만족할 때만 부모 행을 반환한다. 없으면 조건이 걸린 조인이 outer가 되어 무관한 세트가 섞인다.

- [ ] **Step 7: 테스트 통과 확인**

Run: `npx vitest run src/test/repository-query-flows.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 8: 전체 검증**

Run: `npm test && npm run lint && npx tsc -b && npm run build`
Expected: 37 passed (기존 30 + 신규 7). 기존 테스트는 옵션을 추가하지 않았으므로 그대로 통과해야 한다.

- [ ] **Step 9: 커밋**

```bash
git add src/services src/test/repository-query-flows.test.ts
git commit -m "feat: 세션 조회에 커서·기간 옵션과 종목별 마지막 세트 조회 추가

화면 세 곳이 지난 기록 한 줄이나 이번 주 집계를 위해 전 세션과 전 세트를
받아오고 있었다. 커서(startedBefore)와 기간(startedAfter)을 계약에 추가하고,
지난 기록 표시용 단건 조회를 별도로 둔다. 소비자 전환은 다음 태스크에서 한다."
```

---

### Task 2: 원자적 저장 (RPC)

`saveSession`과 `saveRoutine`의 delete-then-insert를 Postgres 함수로 옮긴다.

**Files:**
- Create: `supabase/migrations/<timestamp>_atomic_writes.sql`
- Modify: `src/services/supabase/supabaseServices.ts` (`saveSession`, `saveRoutine`)

**Interfaces:**
- Consumes: 없음
- Produces: RPC `save_workout_session(payload jsonb) returns uuid`, `save_routine(payload jsonb) returns uuid`

**이 태스크의 검증 한계 (반드시 보고서에 명시):** mock adapter는 RPC를 쓰지 않으므로 자동 테스트가 이 경로를 검증하지 못한다. 기존 테스트가 통과하는 것은 mock 경로가 깨지지 않았다는 뜻일 뿐이다. RPC 자체는 실제 Supabase 적용 후 수동 확인이 필요하다. **"테스트가 통과했으니 RPC가 동작한다"고 쓰지 말 것.**

- [ ] **Step 1: 마이그레이션 파일 생성**

파일명은 `supabase/migrations/` 안의 기존 파일과 같은 형식(`YYYYMMDDHHMMSS_이름.sql`)으로, 기존 것보다 **뒤선 타임스탬프**를 쓴다. 기존은 `20260815160127_trainlog_schema.sql`이다.

```sql
-- 운동 기록/루틴 저장을 한 트랜잭션으로 묶는다.
-- 기존 어댑터는 세션 upsert → 자식 DELETE → 자식 INSERT를 세 번의 요청으로 수행해,
-- DELETE 성공 후 INSERT가 실패하면 기록이 통째로 사라질 수 있었다.
-- 함수 본문은 하나의 트랜잭션이므로 중간 실패 시 전체가 롤백된다.
--
-- security invoker: 호출자의 권한과 RLS를 그대로 적용한다.
-- definer로 두면 RLS를 우회하므로 쓰지 않는다.

create or replace function public.save_workout_session(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_exercise jsonb;
  v_exercise_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if payload ? 'id' and payload ->> 'id' is not null then
    v_session_id := (payload ->> 'id')::uuid;
    update public.workout_sessions set
      routine_id = (payload ->> 'routineId')::uuid,
      routine_name = payload ->> 'routineName',
      status = payload ->> 'status',
      started_at = (payload ->> 'startedAt')::timestamptz,
      completed_at = (payload ->> 'completedAt')::timestamptz,
      notes = payload ->> 'notes',
      updated_at = now()
    where id = v_session_id and user_id = v_user_id;

    if not found then
      raise exception 'workout session not found or not owned by caller';
    end if;
  else
    insert into public.workout_sessions (user_id, routine_id, routine_name, status, started_at, completed_at, notes)
    values (
      v_user_id,
      (payload ->> 'routineId')::uuid,
      payload ->> 'routineName',
      payload ->> 'status',
      (payload ->> 'startedAt')::timestamptz,
      (payload ->> 'completedAt')::timestamptz,
      payload ->> 'notes'
    )
    returning id into v_session_id;
  end if;

  delete from public.workout_exercises
  where session_id = v_session_id and user_id = v_user_id;

  for v_exercise in
    select value from jsonb_array_elements(coalesce(payload -> 'exercises', '[]'::jsonb))
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
    from jsonb_array_elements(coalesce(v_exercise -> 'sets', '[]'::jsonb)) as s;
  end loop;

  return v_session_id;
end;
$$;

create or replace function public.save_routine(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_routine_id uuid;
  v_exercise jsonb;
  v_routine_exercise_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if payload ? 'id' and payload ->> 'id' is not null then
    v_routine_id := (payload ->> 'id')::uuid;
    update public.routines set
      name = payload ->> 'name',
      description = payload ->> 'description',
      color = payload ->> 'color',
      updated_at = now()
    where id = v_routine_id and user_id = v_user_id;

    if not found then
      raise exception 'routine not found or not owned by caller';
    end if;
  else
    insert into public.routines (user_id, name, description, color)
    values (v_user_id, payload ->> 'name', payload ->> 'description', payload ->> 'color')
    returning id into v_routine_id;
  end if;

  delete from public.routine_exercises
  where routine_id = v_routine_id and user_id = v_user_id;

  for v_exercise in
    select value from jsonb_array_elements(coalesce(payload -> 'exercises', '[]'::jsonb))
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
      target_weight_kg, target_reps_min, target_reps_max, target_rir, rest_seconds
    )
    select
      v_routine_exercise_id,
      v_user_id,
      (s ->> 'setOrder')::integer,
      s ->> 'setType',
      (s ->> 'targetWeightKg')::numeric,
      (s ->> 'targetRepsMin')::integer,
      (s ->> 'targetRepsMax')::integer,
      (s ->> 'targetRir')::numeric,
      (s ->> 'restSeconds')::integer
    from jsonb_array_elements(coalesce(v_exercise -> 'sets', '[]'::jsonb)) as s;
  end loop;

  return v_routine_id;
end;
$$;
```

**작성 전 반드시 확인할 것:** `routine_exercises`와 `routine_set_prescriptions`의 실제 컬럼명을 `supabase/migrations/20260815160127_trainlog_schema.sql`에서 읽고, 위 INSERT의 컬럼 목록이 정확한지 대조한다. 위 SQL은 스키마를 근거로 작성했지만, 컬럼 하나라도 어긋나면 런타임에만 드러난다.

- [ ] **Step 2: `saveSession`을 RPC 호출로 교체**

`supabaseServices.ts`의 `saveSession`에서 세션 upsert·자식 DELETE·`insertWorkoutExercises` 호출을 없애고 RPC 한 번으로 바꾼다. 마지막의 `getSession` 재조회는 유지한다.

```ts
  async saveSession(input: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }) {
    await this.requireUser()
    const { data, error } = await this.client.rpc('save_workout_session', { payload: input })
    if (error) throw toError(error, '운동 기록을 저장하지 못했어요.')
    const sessionId = typeof data === 'string' ? data : ''
    if (!sessionId) throw new Error('운동 기록을 저장하지 못했어요.')
    const session = await this.getSession(sessionId)
    if (!session) throw new Error('저장한 운동 기록을 다시 불러오지 못했어요.')
    return session
  }
```

`input`은 도메인 객체(camelCase)이고 함수가 그 키를 읽으므로 변환 없이 그대로 넘긴다.

`saveRoutine`도 같은 방식으로 `save_routine` 호출로 바꾼다.

- [ ] **Step 3: 죽은 코드 제거**

`insertWorkoutExercises`와 `insertRoutineExercises`가 더 이상 호출되지 않으면 삭제한다. 다른 호출처가 없는지 grep으로 확인한 뒤 지운다.

- [ ] **Step 4: 검증**

Run: `npm test && npm run lint && npx tsc -b && npm run build`
Expected: 37 passed. mock 경로만 검증된다는 사실을 보고서에 쓴다.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations src/services/supabase/supabaseServices.ts
git commit -m "fix: 운동 기록·루틴 저장을 트랜잭션으로 원자화

저장이 세션 upsert, 자식 DELETE, 자식 INSERT의 세 요청으로 나뉘어 있어
DELETE 성공 후 INSERT가 실패하면 기록이 통째로 사라질 수 있었다.
Postgres 함수로 옮겨 한 트랜잭션에 담는다. security invoker로 두어
RLS를 그대로 적용하고 함수 안에서도 소유권을 검증한다."
```

---

### Task 3: 기록 화면 무한 스크롤

**Files:**
- Modify: `src/features/records/Records.tsx`
- Modify: `src/features/records/Records.css`
- Test: `src/test/records-pagination-flows.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 1의 `listSessions({ limit, startedBefore })`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `src/test/records-pagination-flows.test.tsx`.

**mock 시드에는 완료 세션이 3개뿐이다** (`src/services/mock/seed.ts`의 `mockSessions`). 페이지 크기 20으로는 한 페이지에 다 들어가 페이지네이션이 발동하지 않는다. 따라서 테스트는 세션을 추가로 만들어야 한다.

`Records.tsx`에서 페이지 크기를 `export const recordsPageSize = 20`으로 내보내고, 테스트가 그 값을 import해 `recordsPageSize + 1`개가 되도록 `saveSession`으로 세션을 채운다(시드 3개를 감안해 필요한 만큼만). 숫자를 테스트에 하드코딩하면 페이지 크기를 바꿀 때 조용히 무의미해진다.

세션을 만들 때 `startedAt`은 서로 다른 시각이어야 커서가 동작한다. 인덱스별로 하루씩 뒤로 물리는 식으로 만들고, `status: 'completed'`와 `completedAt`을 함께 채운다(도메인 규칙상 완료 세션은 `completedAt`이 있어야 한다).

검증할 것:
- 처음에는 페이지 크기만큼만 목록에 렌더된다
- 감시 요소가 화면에 들어오면 다음 페이지가 이어 붙는다(jsdom에는 `IntersectionObserver`가 없으므로 `src/test/setup.ts`에 스텁을 추가하고, 테스트에서 콜백을 직접 호출해 교차를 시뮬레이션한다)
- 마지막 페이지 이후로는 더 부르지 않는다
- 첫 페이지에 없는 세션 주소로 직접 진입해도 상세가 열린다

`renderApp` 헬퍼는 기존 테스트 파일에서 복사한다.

- [ ] **Step 2: `IntersectionObserver` 스텁 추가**

`src/test/setup.ts`에 추가한다. 생성된 인스턴스를 배열에 모아 테스트에서 콜백을 호출할 수 있게 한다.

```ts
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
Object.defineProperty(globalThis, 'IntersectionObserver', { writable: true, value: MockIntersectionObserver })
```

테스트에서는 `(globalThis.IntersectionObserver as unknown as typeof MockIntersectionObserver).instances.at(-1)`의 콜백을 `[{ isIntersecting: true }]`로 호출한다.

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/test/records-pagination-flows.test.tsx`
Expected: FAIL — 현재는 전 세션이 한 번에 렌더되므로 "페이지 크기만큼만" 단언이 실패한다.

- [ ] **Step 4: `useInfiniteQuery`로 전환**

`Records.tsx`의 `useQuery`를 바꾼다.

```tsx
const recordsPageSize = 20

const recordsQuery = useInfiniteQuery({
  queryKey: ['completed-workout-records'],
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => workoutRepository.listSessions({
    status: 'completed',
    limit: recordsPageSize,
    startedBefore: pageParam,
  }),
  getNextPageParam: (lastPage) =>
    lastPage.length < recordsPageSize ? undefined : lastPage.at(-1)?.startedAt,
})

const sessions = useMemo(
  () => recordsQuery.data?.pages.flat() ?? emptySessions,
  [recordsQuery.data],
)
```

`WorkoutRunner`가 저장 후 무효화하는 키(`['completed-workout-records']`)를 그대로 유지해 기존 무효화가 계속 동작하게 한다.

- [ ] **Step 5: 감시 요소와 관찰자 연결**

목록 하단에 `<div ref={loadMoreRef} />`를 두고, `useEffect`에서 `IntersectionObserver`를 만들어 `isIntersecting`이면 `fetchNextPage()`를 호출한다. `hasNextPage`가 false이거나 `isFetchingNextPage`면 호출하지 않는다. 언마운트 시 `disconnect()`한다.

목록 하단에 상태를 표시한다 — 불러오는 중이면 "불러오는 중…", 더 없으면 "모든 기록을 불러왔어요."

- [ ] **Step 6: 개수 문구와 직접 진입 처리**

`records-list-title`의 `{sessions.length}회`는 이제 "불러온 개수"다. 문구를 그 뜻에 맞게 바꾼다(예: `{sessions.length}회 불러옴`).

`initialSelectedSessionId`가 불러온 페이지들에 없으면 `getSession(id)`으로 단건 조회해 상세를 그린다. 별도 `useQuery`(키에 세션 id 포함)를 두고, 목록에서 찾은 세션이 있으면 그것을 우선 쓴다.

- [ ] **Step 7: 테스트 통과와 전체 검증**

Run: `npx vitest run src/test/records-pagination-flows.test.tsx` → PASS
Run: `npm test && npm run lint && npx tsc -b && npm run build` → 전부 통과

- [ ] **Step 8: 커밋**

```bash
git add src/features/records src/test/records-pagination-flows.test.tsx src/test/setup.ts
git commit -m "feat: 기록 화면 무한 스크롤

완료 세션 전체를 중첩 세트까지 한 번에 받아오던 것을 20개 단위 커서
페이지네이션으로 바꾼다. 목록에 없는 오래된 세션 주소로 직접 진입해도
단건 조회로 상세가 열린다."
```

---

### Task 4: 대시보드 조회 범위 축소

**Files:**
- Modify: `src/features/dashboard/Dashboard.tsx`
- Test: `src/test/app-user-flows.test.tsx` (기존, 회귀 확인만)

- [ ] **Step 1: 주 시작 계산을 쿼리로 끌어올리기**

현재 `getOverview(sessions)` 안에서 주 시작을 계산하고 전체 세션을 필터한다. 주 시작 계산을 쿼리 함수 쪽으로 옮기고, 두 요청으로 나눈다.

```tsx
function weekStartIso() {
  const today = new Date()
  const day = (today.getDay() + 6) % 7
  const monday = new Date(today)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - day)
  return monday.toISOString()
}
```

```tsx
queryFn: async (): Promise<DashboardData> => {
  const [profile, routines, weekSessions, recentSessions] = await Promise.all([
    workoutRepository.getProfile(),
    workoutRepository.listRoutines(),
    workoutRepository.listSessions({ status: 'completed', startedAfter: weekStartIso() }),
    workoutRepository.listSessions({ status: 'completed', limit: 4 }),
  ])
  return { profile, routines, weekSessions, recentSessions }
}
```

`getOverview`는 이제 이미 이번 주로 걸러진 목록을 받으므로 내부 필터를 제거한다. 최근 기록 목록은 `recentSessions`를 쓴다(현재 `sessions.slice(0, 4)`).

**주의:** `getOverview`가 주 필터를 하지 않게 되므로, 함수에 넘기는 것이 반드시 주간 세션이어야 한다. 이름을 그에 맞게 바꾼다.

- [ ] **Step 2: 회귀 확인**

Run: `npm test`
Expected: 기존 대시보드 테스트가 그대로 통과. `app-user-flows.test.tsx`가 최근 기록 행 개수와 이동을 검증하므로 여기서 깨지면 범위 축소가 잘못된 것이다.

- [ ] **Step 3: 전체 검증과 커밋**

```bash
npm run lint && npx tsc -b && npm run build
git add src/features/dashboard/Dashboard.tsx
git commit -m "perf: 대시보드가 이번 주와 최근 4건만 조회하도록 축소

이번 주 집계와 최근 기록 4건을 그리려고 완료 세션 전체를 중첩 세트까지
받아오고 있었다. 기간 조회와 limit 조회 두 번으로 나눈다."
```

---

### Task 5: 운동 화면 지난 기록 조회 전환

**Files:**
- Modify: `src/features/workout/WorkoutRunner.tsx`
- Test: `src/test/app-user-flows.test.tsx` (기존, 회귀 확인)

- [ ] **Step 1: `previousSessions` 제거**

`WorkoutSetupData`에서 `previousSessions`를 없애고 `listSessions` 호출을 제거한다. 지난 기록이 필요한 두 지점을 전용 조회로 바꾼다.

- `getPreviousExercise(previousSessions, exerciseId)`로 지난 기록 문구를 그리던 곳 → 활성 종목의 `exerciseId`로 `getLastCompletedSetForExercise`를 조회하는 `useQuery`(키: `['last-completed-set', exerciseId]`)
- `createFreeWorkoutExercise`가 이전 세트값을 초기값으로 쓰던 곳 → 종목 추가 시점에 같은 메서드를 호출해 받아온 값을 쓴다

`getPreviousExercise`와 `formatPrevious`의 시그니처를 `WorkoutSetRecord | null`을 받도록 조정하고, 쓰이지 않게 된 헬퍼는 제거한다.

**종목 추가는 비동기가 된다.** `addExercise`가 조회를 기다려야 하므로 async로 바꾸고, 조회 실패 시에는 이전 값 없이(빈 세트로) 추가한다 — 지난 기록을 못 불러왔다고 종목 추가가 막히면 안 된다.

- [ ] **Step 2: 회귀 확인**

Run: `npm test`
Expected: `app-user-flows.test.tsx`의 UF-09(자유 운동 종목 추가)와 `settings-flows.test.tsx`의 기본 RIR 전파 테스트가 그대로 통과해야 한다. 후자는 새 종목의 `targetRir`이 설정값에서 오는지 보므로, 지난 기록 조회 경로를 바꿔도 결과가 같아야 한다.

- [ ] **Step 3: 전체 검증과 커밋**

```bash
npm run lint && npx tsc -b && npm run build
git add src/features/workout/WorkoutRunner.tsx
git commit -m "perf: 지난 기록을 종목별 단건 조회로 전환

'지난 기록 62.5kg × 9' 한 줄과 새 종목 초기값을 위해 완료 세션 전체를
중첩 세트까지 받아오고 있었다. 종목별 마지막 완료 세트만 조회한다."
```

---

### Task 6: 신체 측정 unique 제약

**Files:**
- Modify: `supabase/migrations/<Task 2에서 만든 파일>` 또는 Create: 새 마이그레이션
- Modify: `src/services/supabase/supabaseServices.ts` (`saveBodyMeasurement`)
- Modify: `src/features/body/BodyMeasurements.tsx` (가드 문구 조정 가능)

**파괴적 변경 주의:** 이 태스크는 중복 행을 삭제한다. 마이그레이션 파일 작성은 안전하지만, **실제 DB 적용은 사용자 승인이 필요하다.** 구현자는 파일만 만들고 적용하지 않는다.

- [ ] **Step 1: 마이그레이션 작성**

Task 2의 마이그레이션 파일에 이어서 쓰거나 새 파일을 만든다.

```sql
-- 같은 날짜 중복을 DB가 막는다.
-- 제약 추가 전에 기존 중복을 정리한다. 하나라도 남아 있으면 제약 추가가
-- 실패해 마이그레이션 전체가 롤백된다.
-- 같은 (user_id, measured_on) 그룹에서 updated_at이 가장 최근인 행만 남긴다.

delete from public.body_measurements a
using public.body_measurements b
where a.user_id = b.user_id
  and a.measured_on = b.measured_on
  and (a.updated_at, a.id) < (b.updated_at, b.id);

alter table public.body_measurements
  add constraint body_measurements_owner_date_key unique (user_id, measured_on);

-- 제약이 만드는 인덱스와 중복되므로 기존 인덱스를 제거한다.
drop index if exists public.body_measurements_owner_date_idx;
```

`(a.updated_at, a.id) < (b.updated_at, b.id)` 복합 비교는 `updated_at`이 같을 때도 정확히 한 행만 남긴다.

**인덱스 제거 판단:** 기존 인덱스는 `(user_id, measured_on desc)`이고 새 제약은 `(user_id, measured_on)` 오름차순이다. 정렬 방향이 달라도 Postgres는 인덱스를 양방향으로 스캔할 수 있으므로 목록 조회(`order by measured_on desc`)는 여전히 인덱스를 쓴다.

- [ ] **Step 2: `saveBodyMeasurement`를 upsert로**

`id`가 없을 때 `on conflict`로 갱신되게 바꾼다. 그러면 클라이언트가 기존 행을 못 찾은 경우에도 중복 오류 대신 자연스러운 갱신이 된다.

```ts
    const { data, error } = input.id
      ? await this.client.from('body_measurements').update(values).eq('id', input.id).select('*').single()
      : await this.client.from('body_measurements').upsert(values, { onConflict: 'user_id,measured_on' }).select('*').single()
```

- [ ] **Step 3: 검증과 커밋**

Run: `npm test && npm run lint && npx tsc -b && npm run build`
Expected: 37 passed. mock 경로는 이미 같은 날짜를 갱신하므로 동작이 같다.

```bash
git add supabase/migrations src/services/supabase/supabaseServices.ts
git commit -m "fix: 신체 측정 같은 날짜 중복을 DB 제약으로 차단

중복 방지가 클라이언트의 목록 조회에만 의존해, 기기 두 대가 각자 오래된
목록을 들고 있으면 같은 날짜 행이 두 개 만들어질 수 있었다.
unique 제약을 추가하고 저장을 upsert로 바꾼다. 제약 추가 전에 기존
중복을 정리한다."
```

---

### Task 7: 문서 갱신

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/user-flow-test-plan.md`

- [ ] **Step 1: AGENTS.md 아키텍처 규칙 추가**

기존 규칙(1~9)에 이어 두 항목을 한국어로, 같은 번호 규칙 형식으로 추가한다.

- 여러 테이블을 함께 바꾸는 저장은 Postgres 함수(RPC)로 한 트랜잭션에 담는다. 어댑터에서 DELETE 후 INSERT를 나눠 호출하지 않는다. 함수는 `security invoker`로 정의하고 함수 안에서도 `auth.uid()` 소유권을 검증한다.
- 세션 목록은 필요한 범위만 조회한다. `listSessions`를 옵션 없이 호출해 전체를 받지 않는다. 목록은 커서(`startedBefore`), 기간 집계는 `startedAfter`, 단건 참조는 전용 조회를 쓴다.

**작성 전 확인:** 현재 AGENTS.md의 마지막 규칙 번호를 읽고 이어지는 번호를 쓴다.

- [ ] **Step 2: 저장소 구조 블록 갱신**

새 테스트 파일(`repository-query-flows.test.ts`, `records-pagination-flows.test.tsx`)과 새 마이그레이션을 구조 블록에 추가한다.

- [ ] **Step 3: 테스트 계획에 UF-14 추가**

`docs/user-flow-test-plan.md`에 기록 화면 페이지네이션 시나리오를 기존 형식(번호 절차 + `기대 결과:` 불릿)으로 추가한다. 자동 테스트가 덮는 항목과 수동 확인 항목(실제 DB에서의 RPC 롤백 동작)을 함께 적는다.

- [ ] **Step 4: 검증과 커밋**

Run: `npm run lint && npx tsc -b && npm test && npm run build`

```bash
git add AGENTS.md docs/user-flow-test-plan.md
git commit -m "docs: 데이터 레이어 규칙과 페이지네이션 시나리오 추가"
```

---

## 완료 기준

- `saveSession`/`saveRoutine`이 RPC 한 번으로 저장되고, 어댑터에 delete-then-insert가 남아 있지 않다.
- `listSessions`를 옵션 없이 호출하는 화면이 없다.
- 기록 화면이 20개 단위로 이어 붙고, 마지막에서 멈추며, 목록에 없는 세션도 주소로 열린다.
- `body_measurements`에 `unique (user_id, measured_on)`이 있다.
- `npm run lint`, `npx tsc -b`, `npm test`, `npm run build` 통과.

## 수동 확인 (자동 테스트로 덮이지 않음)

**마이그레이션 적용 전, 사용자 승인 필요:**

- 운영 DB의 `body_measurements` 중복 건수 조회 → 삭제될 행이 몇 개인지 보고
- 마이그레이션 적용은 프론트엔드 배포보다 **먼저** 한다. RPC 함수가 없는 상태로 새 프론트엔드가 뜨면 저장이 전부 실패한다.

**적용 후:**

- 운동을 완료 저장하고 기록에 정상 반영되는지
- 저장 도중 네트워크를 끊었을 때 부분 저장이 남지 않는지(세션만 있고 세트가 없는 상태가 없어야 한다)
- 루틴 편집 저장이 정상 동작하는지
- 기록 화면 스크롤로 다음 페이지가 붙는지
- 같은 날짜로 신체 측정을 두 번 저장했을 때 행이 하나로 유지되는지
