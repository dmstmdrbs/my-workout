# 데이터 레이어 안정화 설계

작성일: 2026-08-16
상태: 승인 대기

## 배경

설정·신체 기록 단계를 마친 뒤 남은 데이터 계층 문제 셋을 정리한다. 사용자에게 새 기능이 보이지는 않지만, 데이터 유실 위험과 조회 범위 문제를 해소한다.

### 1. `saveSession`이 비원자적이다

`supabaseServices.ts`의 `saveSession`은 저장할 때마다

1. `workout_sessions`를 upsert하고
2. 해당 세션의 `workout_exercises`를 **전부 DELETE**한 뒤
3. 종목과 세트를 다시 INSERT한다

세 요청이 서로 다른 트랜잭션이다. 2가 성공하고 3이 실패하면 **완료한 운동 기록이 통째로 사라진다.** 네트워크가 끊기기 쉬운 헬스장 환경에서 운동 종료 시점에 이 경로를 탄다.

`saveRoutine`도 같은 구조(`routine_exercises` DELETE 후 재INSERT)라 같은 위험이 있다.

### 2. 세션 조회에 범위가 없다

`listSessions({ status: 'completed' })`가 세 곳에서 제한 없이 호출된다.

| 호출처 | 실제로 필요한 것 | 현재 받아오는 것 |
|---|---|---|
| `Dashboard.tsx:45` | 이번 주 집계 + 최근 4개 | 전 세션 × 전 종목 × 전 세트 |
| `WorkoutRunner.tsx:71` | 종목 하나의 마지막 완료 세트 | 전 세션 × 전 종목 × 전 세트 |
| `Records.tsx:32` | 화면에 보이는 만큼 | 전 세션 × 전 종목 × 전 세트 |

1년치가 쌓이면 수백 세션에 수천 세트다. 특히 `WorkoutRunner`는 "지난 기록 62.5kg × 9" 한 줄을 그리려고 전체를 받는다.

### 3. 신체 측정에 unique 제약이 없다

`body_measurements`에는 비유니크 인덱스만 있다(`20260815160127_trainlog_schema.sql:150`). 같은 날짜 중복 방지가 클라이언트의 "목록에서 같은 날짜 찾기"에만 의존한다. 앞 단계에서 목록 미로딩 시 저장을 막는 가드를 넣었지만, 기기 두 대가 각자 오래된 목록을 들고 있으면 여전히 중복이 만들어진다.

## 목표

데이터 유실 경로를 없애고, 조회량을 실제 필요에 맞추고, 중복 방지를 DB에서 보장한다.

## 범위

### 포함

- `saveSession`과 `saveRoutine`을 Postgres 함수(RPC)로 옮겨 원자화
- `listSessions`에 커서 기반 페이지네이션 추가
- 기록 화면 무한 스크롤
- 대시보드·운동 화면의 조회 범위 축소
- `body_measurements`에 `unique (user_id, measured_on)` 추가

### 비포함

- 오프라인 저장·동기화(`dexie`). 별도 단계로 남긴다.
- `zod` 런타임 검증 도입. 별도 단계로 남긴다.
- 통계 화면. 다음 단계에서 이 문서의 조회 API를 사용한다.

## 설계

### 1. 원자적 저장 (RPC)

Supabase JS 클라이언트는 여러 요청을 한 트랜잭션으로 묶을 수 없다. Postgres 함수 본문은 그 자체가 하나의 트랜잭션이므로, 중간 실패 시 전체가 자동 롤백된다.

새 마이그레이션에 함수 두 개를 추가한다.

```sql
create function public.save_workout_session(payload jsonb) returns jsonb
create function public.save_routine(payload jsonb) returns jsonb
```

**보안:** 두 함수 모두 `security invoker`로 정의한다. `security definer`를 쓰면 RLS를 우회하므로 쓰지 않는다. 함수 안에서도 `auth.uid()`와 payload의 소유자가 일치하는지 검증하고, 불일치하면 예외를 던진다.

**동작:** 기존 TypeScript 코드와 같은 순서(세션 upsert → 자식 DELETE → 자식 INSERT)를 함수 안에서 수행한다. 로직을 바꾸지 않고 위치만 옮기는 것이 이번 범위다.

**반환값:** 저장된 세션의 `id`(uuid)만 반환한다. 어댑터는 지금처럼 `getSession(id)`으로 다시 조회해 도메인 객체를 만든다.

중첩 구조 전체를 `jsonb`로 반환하면 조회 왕복 한 번을 줄일 수 있지만, 함수 안에서 세션·종목·세트를 다시 조립하는 SQL이 필요하고 그 조립 로직이 `getSession`의 select와 이중으로 관리된다. 이번 목표는 원자성이지 왕복 최적화가 아니므로 단순한 쪽을 택한다.

**스키마 제약 준수:** 함수는 기존 테이블 제약을 그대로 만족시켜야 한다.
- `workout_sessions`: `(status = 'completed') = (completed_at is not null)`
- `workout_exercises`: `unique (session_id, exercise_order)`
- `workout_set_records`: `unique (workout_exercise_id, set_order)`, 그리고 `is_completed`와 `completed_at`이 함께 참/거짓이어야 한다

지금도 클라이언트가 이 값들을 맞춰 보내고 있으므로 함수는 받은 값을 그대로 넣되, 제약 위반은 예외로 올라와 트랜잭션이 롤백된다.

**테스트 한계:** mock adapter는 RPC를 쓰지 않으므로 자동 테스트가 이 경로를 검증하지 못한다. 실제 Supabase에 적용한 뒤 수동으로 확인해야 하며, 이 한계를 계획과 보고에 명시한다.

**mock adapter:** 이미 동기 업데이트라 원자적이다. 변경하지 않는다. 계약이 같으므로 테스트도 그대로 통과해야 한다.

### 2. 커서 기반 페이지네이션

`WorkoutRepository.listSessions`의 옵션을 확장한다.

```ts
listSessions(options?: {
  status?: WorkoutSession['status']
  limit?: number
  /** 이 시각보다 이전에 시작한 세션만. 커서로 쓴다. */
  startedBefore?: IsoDateTime
  /** 이 시각 이후에 시작한 세션만. 기간 집계에 쓴다. */
  startedAfter?: IsoDateTime
}): Promise<WorkoutSession[]>
```

`started_at` 내림차순 정렬은 유지한다. 커서는 마지막 항목의 `startedAt`이다.

**오프셋이 아니라 커서를 쓰는 이유:** 오프셋은 목록 앞쪽에 새 세션이 추가되면 페이지 경계가 밀려 항목이 중복되거나 누락된다. 커서는 그 문제가 없다.

**동점 처리:** 같은 밀리초에 시작한 세션 둘은 개인 앱에서 발생하지 않으므로 `started_at` 단일 커서로 충분하다. 발생하더라도 한쪽이 누락될 뿐 데이터는 안전하다.

### 3. 종목별 마지막 기록 전용 조회

`WorkoutRunner`가 세션 목록 전체를 받는 대신 필요한 것만 조회하도록 메서드를 추가한다.

```ts
getLastCompletedSetForExercise(exerciseId: Id): Promise<WorkoutSetRecord | null>
```

Supabase 구현은 `workout_set_records`를 `workout_exercises`로 조인해 해당 `exercise_id`의 완료 세트 중 가장 최근 것 하나만 가져온다. mock 구현은 기존 `getPreviousExercise` 로직과 같은 결과를 내야 한다.

`WorkoutRunner`의 종목 추가 시점에 호출하므로, 종목 목록 전체를 미리 조회하지 않는다.

### 4. 기록 화면 무한 스크롤

`Records.tsx`의 `useQuery`를 `useInfiniteQuery`로 바꾼다.

- 페이지 크기 20
- `getNextPageParam`은 마지막 페이지의 마지막 세션 `startedAt`을 반환하고, 페이지가 20개 미만이면 `undefined`(끝)
- 목록 하단에 감시 요소를 두고 `IntersectionObserver`로 화면에 들어오면 `fetchNextPage()`
- 로딩 중에는 목록 하단에 상태를 표시하고, 마지막 페이지에 도달하면 더 부르지 않는다

**목록 개수 표시:** 현재 `완료한 운동 {sessions.length}회`는 페이지네이션에서 "지금까지 불러온 수"가 되어 오해를 준다. 총 개수를 따로 세지 않고, 문구를 불러온 개수를 뜻하도록 바꾼다.

**선택 상태:** 직접 주소 진입(`/records/:sessionId`)한 세션이 첫 페이지에 없을 수 있다. 이 경우 `getSession(id)`으로 단건 조회해 상세를 그린다. 목록에 없더라도 상세는 열려야 한다.

### 5. 대시보드 조회 범위

`Dashboard`는 두 가지를 쓴다.

- 이번 주 집계: `startedAfter`를 주 시작으로 지정해 조회
- 최근 기록 4개: `limit: 4`로 조회

두 요청으로 나눈다. 주 시작 계산은 현재 `getOverview` 안에 있으므로 쿼리 함수로 끌어올린다.

### 6. 신체 측정 unique 제약

새 마이그레이션에서

1. 같은 `(user_id, measured_on)` 중복 행이 있으면 가장 최근 `updated_at`만 남기고 삭제
2. `unique (user_id, measured_on)` 제약 추가
3. 기존 비유니크 인덱스는 제약이 만드는 인덱스와 중복되므로 제거

**정리 단계가 먼저 필요한 이유:** 중복이 하나라도 있으면 제약 추가가 실패해 마이그레이션 전체가 롤백된다. 운영 데이터에 중복이 있을 수 있으므로(앞 단계 가드 이전에 만들어진 것) 정리를 선행한다.

어댑터의 `saveBodyMeasurement`는 `id`가 없을 때 `on conflict (user_id, measured_on) do update`로 바꿔, 제약 위반이 사용자에게 오류로 보이지 않고 자연스러운 갱신이 되게 한다.

## 마이그레이션 안전성

새 마이그레이션 파일 하나에 위 변경을 담는다. 기존 마이그레이션은 수정하지 않는다.

적용 순서상 **DB 먼저, 프론트엔드 나중**이다. RPC 함수가 없는 상태로 새 프론트엔드가 배포되면 저장이 전부 실패한다. 반대로 함수만 먼저 있으면 구 프론트엔드는 기존 경로로 계속 동작한다.

파괴적 요소는 6-1의 중복 삭제뿐이다. 적용 전 중복 건수를 조회해 확인하고, 결과를 사용자에게 보고한 뒤 진행한다.

## 검증

```bash
npm run lint
npx tsc -b
npm test
npm run build
```

기존 30개 테스트가 모두 통과해야 한다. 계약이 바뀌는 부분(페이지네이션, 전용 조회)은 mock adapter 기준 테스트를 추가한다.

수동 확인:

- 기록 화면에서 스크롤해 다음 페이지가 붙는지, 마지막에서 멈추는지
- 첫 페이지에 없는 오래된 세션 주소로 직접 진입했을 때 상세가 열리는지
- 운동 종료 중 네트워크를 끊었을 때 기록이 남아 있는지(부분 저장이 없는지)

## 이후 단계

3. 통계 화면 — 이 문서의 `startedAfter`/`startedBefore` 조회를 사용한다
4. 운동 중 UX — 휴식 타이머 알림, Wake Lock, `window.confirm` 교체, ErrorBoundary
