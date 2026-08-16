# 설정 화면과 신체 측정 기록 설계

작성일: 2026-08-16
상태: 승인 대기

## 배경

`UserSettings` 모델과 `updateSettings()`, `updateProfile()`, `listBodyMeasurements()`, `saveBodyMeasurement()`는 mock·Supabase 양쪽 adapter에 모두 구현돼 있으나 화면이 없다. 그 결과:

- `/settings`는 `App.tsx:270`의 placeholder다. 테마·기본 휴식 시간·기본 목표 RIR이 하드코딩 기본값으로만 동작한다.
- `AuthAdapter.signOut()`은 구현돼 있지만 호출하는 코드가 없다. 로그인 후 계정을 바꿀 방법이 없다.
- `BodyMeasurement`는 도메인 타입·저장소 메서드·테이블·인덱스가 모두 있으나 UI가 없다.
- `getSettings()`가 `Dashboard:46`, `Records:35`, `RoutineManager:49`, `WorkoutRunner:74` 네 곳에서 각기 다른 쿼리 키 안에 중복 호출된다. 설정을 저장해도 네 키를 모두 무효화하지 않으면 화면마다 값이 어긋난다.

## 목표

설정 화면과 로그아웃, 신체 측정 기록을 완성한다. 동시에 설정값 공급 경로를 단일화해 이후 통계 화면이 같은 경로를 재사용할 수 있게 한다.

## 범위

### 포함

- 설정 화면: 프로필 이름, 테마, 기본 휴식 시간, 기본 목표 RIR
- 로그아웃
- 신체 측정 기록 화면: 목록과 추가/수정
- 공용 설정 훅 도입과 기존 네 화면의 호출부 정리
- 테마 적용을 위한 CSS 계층 확장

### 비포함

- **무게 단위(kg/lb) 전환.** 도메인 전체가 `weightKg`로 통일돼 있고 개인용 한국어 앱이므로 kg로 고정한다. `UserSettings.weightUnit` 필드는 DB와 타입에 그대로 두되 설정 화면에 노출하지 않는다.

  현재 코드는 값 변환 없이 단위 라벨만 바꾼다(`WorkoutRunner.tsx:488`, `Records.tsx:245`). 즉 `weightUnit`을 `lb`로 바꾸면 100kg 기록이 100lb로 표시된다. 이번 단계에서 UI를 노출하지 않으므로 이 결함은 드러나지 않는다. 훗날 lb를 지원한다면 표시·입력 변환 계층을 먼저 만들어야 한다.
- `rirInputEnabled`, `shareRirByDefault`, `weekStartsOn`, `timezone`, `keepScreenAwake`. 필드는 유지하되 이번 화면에 노출하지 않는다. `shareRirByDefault`는 `Records.tsx:48`이 이미 읽어 공유 카드 초기값으로 쓰고 있으므로 동작이 바뀌지 않는다.
- 체중 추이 그래프. 통계 화면 단계에서 다룬다.

## 설계

### 1. 설정값 공급 경로

`src/services/useSettings.ts`를 신설한다.

```ts
export function useSettings() {
  const { workoutRepository } = useAppServices()
  return useQuery({
    queryKey: ['user-settings'],
    queryFn: () => workoutRepository.getSettings(),
  })
}
```

기존 네 화면의 `Promise.all`에서 `getSettings()`를 제거하고 이 훅으로 교체한다. 설정 저장 시 `['user-settings']` 하나만 무효화하면 전 화면에 반영된다. TanStack Query가 키 단위로 캐시를 공유하므로 네트워크 요청 수는 늘지 않는다.

**로딩 상태 처리:** 현재는 `getSettings()`가 `Promise.all` 안에 있어 설정 로딩이 화면 pending에 자연히 포함된다. 훅으로 분리하면 두 쿼리가 독립적으로 로딩되므로, 각 화면의 pending 조건을 명시적으로 합친다.

```ts
if (setupQuery.isPending || settingsQuery.isPending) return <RunnerLoading />
```

이 처리를 빠뜨리면 설정이 늦게 도착할 때 `weightUnit`이 `undefined`인 상태로 한 프레임 렌더된다.

에러 조건도 같은 방식으로 합친다.

### 2. 테마 적용 계층

`index.css:79`는 현재 `@media (prefers-color-scheme: dark)` 하나뿐이라 OS 설정만 따른다. 사용자가 명시적으로 라이트/다크를 고를 수 없다. 세 계층으로 확장한다.

```css
:root { /* 라이트 토큰 — 현행 유지 */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* 현행 다크 토큰 */ }
}

:root[data-theme="dark"] { /* 같은 다크 토큰 */ }
```

다크 토큰을 두 블록이 공유하므로 값이 갈라지지 않도록 한 곳에서 정의하고 셀렉터만 나열한다.

적용 규칙:

| 설정값 | `data-theme` | `color-scheme` |
|---|---|---|
| `system` | 속성 제거 | `light dark` |
| `light` | `"light"` | `light` |
| `dark` | `"dark"` | `dark` |

`document.documentElement`에 반영한다.

**초기 렌더 깜빡임:** 테마는 서버에서 받아오므로 첫 페인트는 항상 시스템 기본값이다. 다크를 선택한 사용자에게 흰 화면이 한 번 번쩍인다. 선택한 테마를 `localStorage`(`trainlog:theme:v1`)에 미러링하고 `main.tsx`에서 React 렌더 전에 먼저 적용해 막는다. localStorage는 캐시일 뿐이며 진실은 DB다. 서버 값이 도착하면 그 값으로 덮어쓰고 미러도 갱신한다.

로그인 전 화면(`AuthLoading`, `SignInGate`)에서는 설정을 읽을 수 없으므로 미러 값 또는 시스템 기본을 따른다.

### 3. 설정 화면 (`/settings`)

`App.tsx:270`의 `PlaceholderPage`를 실제 화면으로 교체한다. 새 파일은 `src/features/settings/Settings.tsx`와 `Settings.css`.

| 항목 | 컨트롤 | 저장 메서드 |
|---|---|---|
| 프로필 이름 | 텍스트 입력 | `updateProfile` |
| 테마 | 시스템 / 라이트 / 다크 세그먼트 | `updateSettings` |
| 기본 휴식 시간 | 초 단위 숫자 입력 | `updateSettings` |
| 기본 목표 RIR | 0~5+ 및 "없음" 선택 | `updateSettings` |

**저장 방식은 변경 즉시 반영(자동 저장)이다.** 항목이 네 개뿐이라 저장 버튼은 군더더기다. 저장 실패 시 이전 값으로 롤백하고 해당 항목 옆에 인라인 오류를 표시한다.

프로필 이름은 타이핑 중 매 글자마다 저장하지 않는다. 입력 확정(blur 또는 Enter) 시점에 저장한다. 나머지 세 항목은 선택 즉시 저장한다.

기본 휴식 시간은 0 이상의 정수만 받는다. 빈 값이나 음수는 저장하지 않고 이전 값을 유지한다.

성공 시 `['user-settings']`를, 프로필 변경 시 `['dashboard-overview']`도 함께 무효화한다(대시보드가 `profile.displayName`을 인사말에 쓴다).

### 4. 신체 측정 화면 (`/body`)

신체 측정은 환경설정이 아니라 데이터 기록이므로 설정 화면에 섞지 않고 별도 라우트로 둔다. 새 파일은 `src/features/body/BodyMeasurements.tsx`와 `BodyMeasurements.css`.

구성은 두 가지다.

- **최근 측정 목록** — 날짜 내림차순. `listBodyMeasurements()`는 이미 `measured_on` 내림차순으로 정렬해 반환한다.
- **추가/수정 폼** — 측정일, 체중(kg), 골격근량(kg), 체지방률(%), 메모.

입력 규칙:

- 측정일 외의 값은 모두 선택 사항이다. 체중만 적고 나머지를 비워도 저장된다.
- 수치 값(체중·골격근량·체지방률)이 하나도 없으면 저장하지 않는다. 메모만 있는 기록은 만들지 않는다.
- 같은 날짜에 다시 입력하면 새 행을 만들지 않고 해당 날짜의 기존 행을 수정한다. `saveBodyMeasurement`가 `id`를 받으면 갱신하므로, 목록에서 같은 `measuredOn`을 찾아 그 `id`를 넘긴다.
- 측정일 기본값은 오늘이다.

진입점은 사이드바 내비게이션과 상단 더보기 팝오버(`App.tsx:244`)에 추가한다. 상단 팝오버는 현재 통계·설정 두 항목이며 여기에 신체 기록을 더해 세 항목이 된다.

`navigation` 배열과 `pagePaths`, `getActivePage()`에 `body` 항목을 추가한다.

**내비게이션 배열 주의:** `App.tsx`는 `navigation.slice(0, 5)`로 사이드바를, `navigation.slice(0, 4)`로 하단 탭을 만든다. 배열에 항목을 끼워 넣으면 이 인덱스가 조용히 어긋난다. `slice` 대신 각 위치에 표시할 항목을 명시적으로 지정하는 방식으로 바꾼다.

하단 모바일 탭은 홈·운동 시작·루틴·기록 4개 + 더보기 구조를 유지한다. 현재 하단 더보기 버튼은 `selectPage('stats')`로 통계에 직행하는데(`App.tsx:301`), 도달해야 할 화면이 통계·설정·신체 기록 셋으로 늘었으므로 상단과 같은 팝오버 메뉴를 열도록 바꾼다.

### 5. 로그아웃

설정 화면 하단에 배치한다. `auth.signOut()` 호출 후 `onAuthStateChange`가 `null`을 전달하면 `AppShell`이 `SignInGate`로 자동 전환한다. 별도 리다이렉트 코드는 필요 없다.

두 가지를 함께 처리한다.

- **`queryClient.clear()`** — 하지 않으면 다른 계정으로 로그인했을 때 이전 계정의 캐시 데이터가 잠시 렌더된다.
- **진행 중 운동 초안 제거** — `trainlog:workout-draft:v1`은 localStorage에 있어 로그아웃해도 남는다. 다른 계정으로 로그인하면 이전 사용자의 초안이 복원되고 하단 재개 토스트가 뜬다. 로그아웃 확인 대화상자에서 초안이 있음을 알리고, 진행 시 `clearStoredWorkoutDraft()`로 제거한다.

초안이 없으면 일반 로그아웃 확인만 표시한다.

확인 대화상자는 기존 코드와 같은 `window.confirm`을 쓴다. 자체 다이얼로그 컴포넌트로의 교체는 이후 "운동 중 UX" 단계에서 `App.tsx:153`, `WorkoutRunner.tsx:305`와 함께 일괄 처리한다.

### 6. 테스트

`docs/user-flow-test-plan.md`에 두 시나리오를 추가한다.

**UF-12 설정 변경과 로그아웃**

1. `/settings`로 이동한다.
2. 테마를 다크로 바꾼다.
3. 기본 휴식 시간과 기본 목표 RIR을 바꾼다.
4. 자유 운동을 시작해 새 종목을 추가한다.
5. 설정으로 돌아와 로그아웃한다.

기대 결과:

- 테마 변경이 즉시 적용되고 새로고침 후에도 유지된다.
- 바뀐 기본 휴식 시간과 목표 RIR이 새로 추가한 종목의 세트에 반영된다.
- 로그아웃하면 로그인 화면으로 돌아간다.
- 진행 중 초안이 있으면 로그아웃 확인에 그 사실이 안내되고, 진행 시 초안과 재개 토스트가 사라진다.

**UF-13 신체 측정 기록**

1. `/body`로 이동한다.
2. 체중만 입력해 저장한다.
3. 같은 날짜로 체지방률을 추가 입력해 저장한다.
4. 다른 날짜로 한 건 더 저장한다.

기대 결과:

- 체중만 있는 기록도 저장되고 목록에 나타난다.
- 같은 날짜 재입력은 새 행을 만들지 않고 기존 행을 수정한다.
- 목록은 최근 날짜가 위에 온다.
- 값이 하나도 없으면 저장되지 않는다.

`src/test/app-user-flows.test.tsx`에 대응 케이스를 추가한다. mock adapter가 두 기능을 모두 지원하므로 별도 테스트 스텁은 필요 없다.

## 변경 파일

**신규**

- `src/services/useSettings.ts`
- `src/features/settings/Settings.tsx`, `Settings.css`
- `src/features/body/BodyMeasurements.tsx`, `BodyMeasurements.css`
- `src/lib/theme.ts` — 테마 적용과 localStorage 미러

**수정**

- `src/index.css` — `data-theme` 계층 추가
- `src/main.tsx` — 렌더 전 테마 선적용
- `src/App.tsx` — `/settings`, `/body` 라우트, 내비게이션 항목, `getActivePage()`
- `src/features/dashboard/Dashboard.tsx` — `getSettings()` 제거, `useSettings()` 사용, pending 조건 병합
- `src/features/records/Records.tsx` — 동일
- `src/features/routines/RoutineManager.tsx` — 동일
- `src/features/workout/WorkoutRunner.tsx` — 동일
- `docs/user-flow-test-plan.md` — UF-12, UF-13
- `src/test/app-user-flows.test.tsx` — 대응 케이스
- `README.md`, `AGENTS.md` — 화면 목록과 라우팅 표 갱신

**변경 없음**

- `src/services/contracts.ts`, `src/types/domain.ts` — 필요한 메서드와 타입이 모두 존재한다.
- `src/services/mock/`, `src/services/supabase/` — 구현이 모두 존재한다.
- `supabase/migrations/` — 스키마 변경이 없다.

## 검증

```bash
npm run lint
npx tsc -b
npm test -- --reporter=verbose
npm run build
```

수동 확인:

- 시스템 테마를 라이트/다크로 바꿔 가며 `system` 설정이 따라오는지 확인한다.
- `dark` 설정 상태에서 새로고침해 흰 화면 깜빡임이 없는지 확인한다.
- 데스크톱(1440px), 태블릿(768px), 모바일(390px)에서 두 화면의 입력이 가로 스크롤 없이 조작 가능한지 확인한다.
- 하단 고정 내비게이션이 신체 측정 폼의 마지막 입력과 저장 버튼을 가리지 않는지 확인한다.

## 이후 단계

이 문서는 4단계 계획 중 1단계다.

2. 데이터 레이어 안정화 — `saveSession`의 delete-then-insert를 트랜잭션으로, `listSessions`에 기간·limit 파라미터 추가
3. 통계 화면 — `/stats` 완성. 이 문서의 `useSettings()`를 재사용한다
4. 운동 중 UX — 휴식 타이머 알림, Wake Lock, `window.confirm` 교체, ErrorBoundary
