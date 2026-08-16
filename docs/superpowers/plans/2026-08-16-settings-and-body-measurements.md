# 설정 화면과 신체 측정 기록 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/settings`와 `/body` 화면을 완성하고 로그아웃을 붙이며, 설정값 공급 경로를 단일 쿼리 키로 통일한다.

**Architecture:** `useSettings()` 훅이 `['user-settings']` 키 하나로 설정을 공급하고, 기존 네 화면은 각자의 `getSettings()` 호출을 이 훅으로 교체한다. 테마는 `data-theme` 속성 계층과 localStorage 미러로 적용한다. 신체 측정은 설정과 성격이 달라 `/body` 별도 라우트로 분리한다.

**Tech Stack:** React 19, TypeScript, TanStack Query 5, React Router 7, Vitest + Testing Library, Supabase(변경 없음)

**Spec:** `docs/superpowers/specs/2026-08-16-settings-and-body-measurements-design.md`

## Global Constraints

- UI는 `useAppServices()`를 통해서만 서비스에 접근한다. 컴포넌트에서 Supabase 클라이언트를 직접 호출하지 않는다.
- `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`가 없을 때 mock adapter로 동작해야 한다. 데모·테스트 흐름을 깨지 않는다.
- 목표 RIR(`targetRir`)과 실제 RIR(`actualRir`)은 독립 값이다.
- 무게 단위는 kg 고정이다. `UserSettings.weightUnit`은 읽어서 라벨로만 쓰고 설정 UI에 노출하지 않는다.
- 스키마 변경 없음. `supabase/migrations/`에 새 파일을 만들지 않는다.
- 모든 사용자 노출 문구는 한국어다. 기존 화면의 존댓말 어조를 따른다.
- 새 화면은 URL을 가지며 브라우저 뒤로가기와 직접 주소 진입을 지원한다.
- 정상 종료 전 검증: `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`.

## 파일 구조

**신규**

| 파일 | 책임 |
|---|---|
| `src/services/useSettings.ts` | `['user-settings']` 단일 쿼리로 설정 공급 |
| `src/lib/theme.ts` | 테마 → DOM 속성 반영, localStorage 미러 |
| `src/features/settings/Settings.tsx` | 설정 화면 |
| `src/features/settings/Settings.css` | 설정 화면 스타일 |
| `src/features/body/BodyMeasurements.tsx` | 신체 측정 목록·입력 |
| `src/features/body/BodyMeasurements.css` | 신체 측정 스타일 |
| `src/test/settings-flows.test.tsx` | UF-12, UF-13 (로그아웃 격리 목적으로 별도 파일) |

**수정**

| 파일 | 변경 |
|---|---|
| `src/services/index.ts` | `useSettings` 재export |
| `src/index.css` | `data-theme` 계층 추가 |
| `src/main.tsx` | 렌더 전 테마 선적용 |
| `src/App.tsx` | 라우트 2개, 내비게이션 구조, 더보기 팝오버 공용화 |
| `src/features/dashboard/Dashboard.tsx` | `getSettings()` → `useSettings()` |
| `src/features/records/Records.tsx` | 동일 |
| `src/features/routines/RoutineManager.tsx` | 동일 |
| `src/features/workout/WorkoutRunner.tsx` | 동일 |
| `docs/user-flow-test-plan.md` | UF-12, UF-13 |
| `README.md`, `AGENTS.md` | 화면 목록·라우팅 표 |

## 테스트 환경 주의사항 (전 태스크 공통)

`src/services/mock/localStorageServices.ts:25`의 `inMemoryStore`는 **모듈 레벨 변수**다. `createLocalStorageServices()`를 다시 호출해도 같은 스토어를 공유한다.

기존 `src/test/app-user-flows.test.tsx`는 `describe.sequential`로 상태를 이어가며 돌아간다. 이 파일 안에서 로그아웃을 실행하면 `signedIn=false`가 남아 **이후 모든 테스트가 로그인 화면에서 멈춘다.**

따라서 UF-12/UF-13은 **새 파일 `src/test/settings-flows.test.tsx`** 에 작성한다. Vitest는 파일마다 모듈 그래프를 새로 만들고 `vitest.config.ts`의 `sequence: { concurrent: false }`가 파일 순차 실행을 보장하므로 격리된다.

---

### Task 1: `useSettings()` 훅 도입과 호출부 정리

설정 공급 경로를 단일화한다. 화면 동작은 바뀌지 않으므로 **기존 테스트 전체가 회귀 안전망**이다.

**Files:**
- Create: `src/services/useSettings.ts`
- Modify: `src/services/index.ts`
- Modify: `src/features/dashboard/Dashboard.tsx:39-58`
- Modify: `src/features/records/Records.tsx:30-49`
- Modify: `src/features/routines/RoutineManager.tsx:44-51`
- Modify: `src/features/workout/WorkoutRunner.tsx:67-85`
- Test: `src/test/app-user-flows.test.tsx` (기존, 수정 없음)

**Interfaces:**
- Produces: `useSettings(): UseQueryResult<UserSettings, Error>` — 이후 모든 태스크가 이 훅으로 설정을 읽는다. 쿼리 키는 `['user-settings']`.

- [ ] **Step 1: 기존 테스트가 통과하는지 먼저 확인 (기준선 확보)**

Run: `npm test`
Expected: PASS. 이 결과가 리팩터 전 기준선이다. 여기서 실패가 있으면 리팩터를 시작하지 말고 보고한다.

- [ ] **Step 2: `useSettings` 훅 작성**

Create `src/services/useSettings.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { useAppServices } from './useAppServices'

/**
 * Settings feed every screen (weight-unit labels, default rest, default RIR).
 * A single query key keeps them in sync: saving settings invalidates one key
 * instead of every screen's composite key.
 */
export const userSettingsQueryKey = ['user-settings'] as const

export function useSettings() {
  const { workoutRepository } = useAppServices()
  return useQuery({
    queryKey: userSettingsQueryKey,
    queryFn: () => workoutRepository.getSettings(),
  })
}
```

- [ ] **Step 3: `services/index.ts`에 재export 추가**

`src/services/index.ts`에 한 줄 추가:

```ts
export { useSettings, userSettingsQueryKey } from './useSettings'
```

- [ ] **Step 4: Dashboard 교체**

`src/features/dashboard/Dashboard.tsx`에서 `DashboardData`의 `weightUnit` 필드를 제거하고, 쿼리에서 `getSettings()`를 뺀다.

```tsx
interface DashboardData {
  profile: { displayName: string; avatarUrl: string | null }
  routines: Routine[]
  sessions: WorkoutSession[]
}

export function Dashboard({ onStartWorkout, onViewRecords, onSelectSession, onManageRoutines, onSelectRoutine }: DashboardProps) {
  const { workoutRepository } = useAppServices()
  const settingsQuery = useSettings()
  const dashboardQuery = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: async (): Promise<DashboardData> => {
      const [profile, routines, sessions] = await Promise.all([
        workoutRepository.getProfile(),
        workoutRepository.listRoutines(),
        workoutRepository.listSessions({ status: 'completed' }),
      ])
      return { profile, routines, sessions }
    },
  })

  if (dashboardQuery.isPending || settingsQuery.isPending) return <DashboardLoading />
  if (dashboardQuery.isError || !dashboardQuery.data || settingsQuery.isError || !settingsQuery.data) {
    return <DashboardError onRetry={() => { void dashboardQuery.refetch(); void settingsQuery.refetch() }} />
  }

  const { profile, routines, sessions } = dashboardQuery.data
  return <DashboardContent profile={profile} routines={routines} sessions={sessions} weightUnit={settingsQuery.data.weightUnit} onStartWorkout={onStartWorkout} onViewRecords={onViewRecords} onSelectSession={onSelectSession} onManageRoutines={onManageRoutines} onSelectRoutine={onSelectRoutine} />
}
```

`DashboardContent`의 props 타입은 `DashboardData & DashboardProps`에서 `DashboardData & DashboardProps & { weightUnit: string }`으로 바꾼다.

import에 `useSettings`를 추가한다: `import { useAppServices, useSettings } from '../../services'`

- [ ] **Step 5: Records 교체**

`src/features/records/Records.tsx`에서 `RecordsData`를 `{ sessions: WorkoutSession[] }`로 줄이고 동일하게 교체한다. `weightUnit`과 `shareRirByDefault`는 `settingsQuery.data`에서 읽는다.

`Records.tsx:47-49`의 effect는 설정 쿼리를 보도록 바꾼다:

```tsx
useEffect(() => {
  if (settingsQuery.data) setIncludeRir(settingsQuery.data.shareRirByDefault)
}, [settingsQuery.data])
```

본문에서 `recordsQuery.data.weightUnit`을 쓰던 5곳(`:161`, `:172`, `:189`, `:205`)은 `settingsQuery.data.weightUnit`으로 바꾼다. 렌더 시점에 `settingsQuery.data`가 존재함을 보장하도록 pending/error 가드를 `recordsQuery`와 합친다.

- [ ] **Step 6: RoutineManager 교체**

`src/features/routines/RoutineManager.tsx:44-51`에서 `defaultRestSeconds`를 쿼리 결과가 아니라 `settingsQuery.data.defaultRestSeconds`에서 읽도록 바꾼다. `:136`의 구조 분해와 `:182`, `:211-214`의 props 전달 경로를 그에 맞춘다.

- [ ] **Step 7: WorkoutRunner 교체**

`src/features/workout/WorkoutRunner.tsx:67-85`의 `WorkoutSetupData`에서 `weightUnit`, `defaultRestSeconds`, `defaultRir`를 제거하고 `settingsQuery.data`에서 읽는다.

```tsx
const settingsQuery = useSettings()
const setupQuery = useQuery({
  queryKey: ['workout-runner-setup'],
  queryFn: async (): Promise<WorkoutSetupData> => {
    const [routines, exercises, previousSessions] = await Promise.all([
      workoutRepository.listRoutines(),
      workoutRepository.listExercises(),
      workoutRepository.listSessions({ status: 'completed' }),
    ])
    return { routines, exercises, previousSessions }
  },
})
```

`:125-128`의 가드와 구조 분해를 아래로 바꾼다:

```tsx
if (setupQuery.isPending || settingsQuery.isPending) return <RunnerLoading />
if (setupQuery.isError || !setupQuery.data || settingsQuery.isError || !settingsQuery.data) {
  return <RunnerError onRetry={() => { void setupQuery.refetch(); void settingsQuery.refetch() }} onCancel={onCancel} />
}

const { routines, exercises, previousSessions } = setupQuery.data
const { weightUnit, defaultRestSeconds, defaultRir } = settingsQuery.data
```

**주의:** 이 컴포넌트는 훅 호출 뒤 조기 반환이 있다. `useSettings()`는 반드시 기존 `useQuery` 옆, 모든 조기 반환보다 위에서 호출한다.

- [ ] **Step 8: 회귀 테스트 실행**

Run: `npm test`
Expected: PASS. Step 1과 같은 결과여야 한다. 실패하면 해당 화면의 pending/error 가드 병합을 다시 본다.

- [ ] **Step 9: 타입·린트 확인**

Run: `npm run lint && npx tsc -b`
Expected: 오류 없음

- [ ] **Step 10: 커밋**

```bash
git add src/services/useSettings.ts src/services/index.ts src/features
git commit -m "refactor: 설정 조회를 단일 쿼리 키로 통일

네 화면이 각자 getSettings()를 호출해 설정 저장 시 화면마다 값이
어긋날 수 있었다. useSettings() 훅으로 ['user-settings'] 키를 공유해
무효화 한 번으로 전 화면에 반영되게 한다."
```

---

### Task 2: 테마 적용 계층

설정 화면보다 먼저 만든다. 화면 없이 단위 테스트로 검증 가능하고, Task 3이 이 함수를 호출한다.

**Files:**
- Create: `src/lib/theme.ts`
- Create: `src/lib/theme.test.ts`
- Modify: `src/index.css:79-98`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `Theme` 타입 (`src/types/domain.ts:9`, `'system' | 'light' | 'dark'`)
- Produces:
  - `applyTheme(theme: Theme): void` — DOM 반영 + localStorage 미러 기록
  - `readMirroredTheme(): Theme` — 미러 값 읽기, 없거나 손상 시 `'system'`
  - `themeStorageKey: 'trainlog:theme:v1'`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `src/lib/theme.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'vitest'
import { applyTheme, readMirroredTheme, themeStorageKey } from './theme'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
  })

  test('system 테마는 data-theme 속성을 제거하고 두 스킴을 모두 허용한다', () => {
    applyTheme('dark')
    applyTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light dark')
  })

  test('dark 테마는 data-theme과 color-scheme을 설정한다', () => {
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  test('light 테마는 OS가 다크여도 라이트를 강제한다', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  test('적용한 테마를 localStorage에 미러링한다', () => {
    applyTheme('dark')
    expect(localStorage.getItem(themeStorageKey)).toBe('dark')
    expect(readMirroredTheme()).toBe('dark')
  })

  test('미러 값이 없으면 system을 반환한다', () => {
    expect(readMirroredTheme()).toBe('system')
  })

  test('미러 값이 손상되면 system으로 되돌린다', () => {
    localStorage.setItem(themeStorageKey, 'chartreuse')
    expect(readMirroredTheme()).toBe('system')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/theme.test.ts`
Expected: FAIL — `Failed to resolve import "./theme"`

- [ ] **Step 3: 구현 작성**

Create `src/lib/theme.ts`:

```ts
import type { Theme } from '../types/domain'

/**
 * Theme lives in the database, but that value arrives after the first paint.
 * Mirroring it here lets the app paint the chosen theme immediately; the
 * database stays the source of truth and overwrites this on load.
 */
export const themeStorageKey = 'trainlog:theme:v1'

const themes: Theme[] = ['system', 'light', 'dark']

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && themes.includes(value as Theme)
}

export function readMirroredTheme(): Theme {
  try {
    const stored = globalThis.localStorage?.getItem(themeStorageKey)
    return isTheme(stored) ? stored : 'system'
  } catch {
    // localStorage can be disabled; the system default stays usable.
    return 'system'
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
    root.style.colorScheme = 'light dark'
  } else {
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = theme
  }
  try {
    globalThis.localStorage?.setItem(themeStorageKey, theme)
  } catch {
    // A missing mirror only costs a first-paint flash.
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/theme.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: CSS 계층 확장**

`src/index.css:79-98`의 `@media (prefers-color-scheme: dark)` 블록을 아래로 교체한다. 다크 토큰이 두 셀렉터에서 갈라지지 않도록 값 목록은 한 번만 쓰고 셀렉터를 나열한다.

```css
/* Dark tokens apply when the OS asks for dark and the user has not forced
   light, or when the user explicitly picked dark. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #171717;
    --surface: #202020;
    --surface-subtle: #292929;
    --surface-emphasis: #303030;
    --text: #fafafa;
    --text-muted: #a1a1aa;
    --border: #343434;
    --accent: #60a5fa;
    --accent-subtle: #172554;
    --success: #34d399;
    --success-subtle: #143c32;
    --danger: #f87171;
    --danger-subtle: #482021;
    --accent-border: #25446e;
    --shadow-card: 0 1px 2px rgb(0 0 0 / 0.18);
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #171717;
  --surface: #202020;
  --surface-subtle: #292929;
  --surface-emphasis: #303030;
  --text: #fafafa;
  --text-muted: #a1a1aa;
  --border: #343434;
  --accent: #60a5fa;
  --accent-subtle: #172554;
  --success: #34d399;
  --success-subtle: #143c32;
  --danger: #f87171;
  --danger-subtle: #482021;
  --accent-border: #25446e;
  --shadow-card: 0 1px 2px rgb(0 0 0 / 0.18);
}
```

또한 `:root`(`index.css:5-6`)의 `color`와 `background` 하드코딩 값은 토큰을 쓰도록 바꾼다. 그대로 두면 다크에서 본문 글자색이 라이트로 남는다.

```css
:root {
  color-scheme: light;
  /* ...font 설정 유지... */
  color: var(--text);
  background: var(--bg);
  /* ...토큰 정의 유지... */
}
```

- [ ] **Step 6: 첫 페인트 선적용**

`src/main.tsx`에서 `createRoot` 호출 전에 미러 값을 적용한다. import 추가와 한 줄이면 된다.

```tsx
import { applyTheme, readMirroredTheme } from './lib/theme'

// Paint the user's theme before React renders; the database value replaces
// this once settings load.
applyTheme(readMirroredTheme())

createRoot(document.getElementById('root')!).render(
  // ...현행 유지...
)
```

- [ ] **Step 7: 전체 테스트와 빌드 확인**

Run: `npm test && npm run lint && npx tsc -b && npm run build`
Expected: 전부 통과

- [ ] **Step 8: 커밋**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts src/index.css src/main.tsx
git commit -m "feat: 테마 선택을 위한 data-theme 계층 추가

기존에는 prefers-color-scheme만 있어 OS 설정만 따를 수 있었다.
data-theme 속성 계층을 두어 사용자가 라이트/다크를 명시적으로 고를 수
있게 하고, 선택값을 localStorage에 미러링해 첫 페인트 깜빡임을 막는다."
```

---

### Task 3: 설정 화면

`/settings`의 placeholder를 실제 화면으로 교체한다. 로그아웃은 Task 4에서 붙인다.

**Files:**
- Create: `src/features/settings/Settings.tsx`
- Create: `src/features/settings/Settings.css`
- Modify: `src/App.tsx:270`
- Test: `src/test/settings-flows.test.tsx`

**Interfaces:**
- Consumes: `useSettings()`, `userSettingsQueryKey` (Task 1), `applyTheme()` (Task 2)
- Produces: `<Settings />` — props 없음. `App.tsx`의 `/settings` 라우트에서 렌더한다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `src/test/settings-flows.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

const storeKey = 'trainlog:mock-store:v1'

function renderApp(initialPath = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={createLocalStorageServices()}>
        <MemoryRouter initialEntries={[initialPath]}>
          <App />
        </MemoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>,
  )
}

function readSettings() {
  return JSON.parse(localStorage.getItem(storeKey) ?? '{}').settings
}

describe.sequential('UF-12: 설정 변경', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  test('테마를 다크로 바꾸면 즉시 적용되고 저장된다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await screen.findByRole('heading', { name: '설정' })
    await user.click(screen.getByRole('radio', { name: '다크' }))

    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))
    await waitFor(() => expect(readSettings().theme).toBe('dark'))
  })

  test('기본 휴식 시간과 기본 목표 RIR 변경이 저장된다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await screen.findByRole('heading', { name: '설정' })
    const restInput = screen.getByRole('spinbutton', { name: '기본 휴식 시간 (초)' })
    await user.clear(restInput)
    await user.type(restInput, '75')
    await user.tab()

    await waitFor(() => expect(readSettings().defaultRestSeconds).toBe(75))

    await user.selectOptions(screen.getByRole('combobox', { name: '기본 목표 RIR' }), '3')
    await waitFor(() => expect(readSettings().defaultRir).toBe(3))
  })

  test('바뀐 기본값이 새 자유 운동 종목에 반영된다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await screen.findByRole('heading', { name: '설정' })
    const restInput = screen.getByRole('spinbutton', { name: '기본 휴식 시간 (초)' })
    await user.clear(restInput)
    await user.type(restInput, '75')
    await user.tab()
    await waitFor(() => expect(readSettings().defaultRestSeconds).toBe(75))

    await user.selectOptions(screen.getByRole('combobox', { name: '기본 목표 RIR' }), '4')
    await waitFor(() => expect(readSettings().defaultRir).toBe(4))

    await user.click(screen.getAllByRole('button', { name: '운동 시작' })[0])
    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    await user.selectOptions(screen.getByRole('combobox', { name: '운동 종목 추가' }), 'barbell-bench-press')
    await user.click(screen.getByRole('button', { name: '추가' }))
    await screen.findByRole('heading', { name: '바벨 벤치프레스' })

    const draft = JSON.parse(localStorage.getItem('trainlog:workout-draft:v1') ?? '{}')
    expect(draft.draft.exercises[0].sets[0].targetRir).toBe(4)
  })

  test('프로필 이름 변경이 대시보드 인사말에 반영된다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await screen.findByRole('heading', { name: '설정' })
    const nameInput = screen.getByRole('textbox', { name: '표시 이름' })
    await user.clear(nameInput)
    await user.type(nameInput, '테스트유저')
    await user.tab()

    await waitFor(() => {
      const profile = JSON.parse(localStorage.getItem(storeKey) ?? '{}').profile
      expect(profile.displayName).toBe('테스트유저')
    })

    await user.click(screen.getAllByRole('button', { name: '대시보드' })[0])
    await screen.findByRole('heading', { name: /좋은 하루예요, 테스트유저/ })
  })

  test('휴식 시간에 음수나 빈 값을 넣으면 저장하지 않는다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await screen.findByRole('heading', { name: '설정' })
    const before = readSettings().defaultRestSeconds
    const restInput = screen.getByRole('spinbutton', { name: '기본 휴식 시간 (초)' })
    await user.clear(restInput)
    await user.tab()

    expect(readSettings().defaultRestSeconds).toBe(before)
  })
})
```

**주의:** `barbell-bench-press`의 `defaultRestSeconds`가 0이 아니면 세트의 `restSeconds`는 종목 값을 우선 쓴다(`WorkoutRunner.tsx:543`의 `exercise.defaultRestSeconds || defaultRestSeconds`). 그래서 위 테스트는 휴식 시간이 아니라 `targetRir`로 설정 반영을 검증한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/test/settings-flows.test.tsx`
Expected: FAIL — `Unable to find role="heading" with name "설정"` (현재는 placeholder가 "이 화면을 준비하고 있어요."를 렌더한다)

- [ ] **Step 3: 설정 화면 구현**

Create `src/features/settings/Settings.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Moon, Palette, Sun, Timer, User2, MonitorSmartphone } from 'lucide-react'
import { useAppServices, useSettings, userSettingsQueryKey } from '../../services'
import { applyTheme } from '../../lib/theme'
import type { Theme, UserSettings } from '../../types/domain'
import './Settings.css'

const themeChoices: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'system', label: '시스템', icon: MonitorSmartphone },
  { value: 'light', label: '라이트', icon: Sun },
  { value: 'dark', label: '다크', icon: Moon },
]

const rirChoices = [
  { value: '', label: '없음' },
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5+' },
]

export function Settings() {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const settingsQuery = useSettings()
  const [error, setError] = useState<string | null>(null)

  const settingsMutation = useMutation({
    mutationFn: (changes: Partial<Omit<UserSettings, 'userId' | 'updatedAt'>>) =>
      workoutRepository.updateSettings(changes),
    onMutate: () => setError(null),
    onSuccess: (saved) => {
      applyTheme(saved.theme)
      void queryClient.invalidateQueries({ queryKey: userSettingsQueryKey })
    },
    onError: () => setError('설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'),
  })

  if (settingsQuery.isPending) return <SettingsLoading />
  if (settingsQuery.isError || !settingsQuery.data) return <SettingsError onRetry={() => void settingsQuery.refetch()} />

  const settings = settingsQuery.data

  return (
    <main className="settings-page" aria-labelledby="settings-title">
      <section className="settings-heading">
        <p className="eyebrow">PREFERENCES</p>
        <h1 id="settings-title">설정</h1>
        <p>표시 방식과 운동 기본값을 정합니다. 변경하면 바로 저장됩니다.</p>
      </section>

      {error && <p className="settings-error" role="alert">{error}</p>}

      <ProfileSection onError={setError} />

      <section className="settings-card" aria-labelledby="settings-theme-title">
        <div className="settings-card-heading">
          <span className="settings-icon"><Palette size={18} aria-hidden="true" /></span>
          <div><h2 id="settings-theme-title">테마</h2><p>시스템을 고르면 기기 설정을 따릅니다.</p></div>
        </div>
        <div className="theme-choice-row" role="radiogroup" aria-label="테마">
          {themeChoices.map((choice) => {
            const Icon = choice.icon
            return (
              <button
                type="button"
                role="radio"
                key={choice.value}
                aria-checked={settings.theme === choice.value}
                className={settings.theme === choice.value ? 'is-selected' : ''}
                onClick={() => settingsMutation.mutate({ theme: choice.value })}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{choice.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="settings-card" aria-labelledby="settings-workout-title">
        <div className="settings-card-heading">
          <span className="settings-icon"><Timer size={18} aria-hidden="true" /></span>
          <div><h2 id="settings-workout-title">운동 기본값</h2><p>새 종목을 추가할 때 쓰이는 초기값입니다.</p></div>
        </div>

        <RestSecondsField
          value={settings.defaultRestSeconds}
          onCommit={(seconds) => settingsMutation.mutate({ defaultRestSeconds: seconds })}
        />

        <label className="settings-field">
          <span>기본 목표 RIR</span>
          <select
            aria-label="기본 목표 RIR"
            value={settings.defaultRir === null ? '' : String(settings.defaultRir)}
            onChange={(event) => settingsMutation.mutate({ defaultRir: event.target.value === '' ? null : Number(event.target.value) })}
          >
            {rirChoices.map((choice) => <option key={choice.label} value={choice.value}>{choice.label}</option>)}
          </select>
        </label>
      </section>
    </main>
  )
}

/**
 * Rest seconds commit on blur rather than per keystroke: typing "75" would
 * otherwise save "7" first and briefly show a nonsense default.
 */
function RestSecondsField({ value, onCommit }: { value: number; onCommit: (seconds: number) => void }) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => { setDraft(String(value)) }, [value])

  const commit = () => {
    const parsed = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      setDraft(String(value))
      return
    }
    const seconds = Math.floor(parsed)
    if (seconds !== value) onCommit(seconds)
  }

  return (
    <label className="settings-field">
      <span>기본 휴식 시간 (초)</span>
      <input
        aria-label="기본 휴식 시간 (초)"
        type="number"
        inputMode="numeric"
        min="0"
        step="5"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
    </label>
  )
}

function ProfileSection({ onError }: { onError: (message: string | null) => void }) {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => workoutRepository.getProfile(),
  })
  const [draft, setDraft] = useState('')

  useEffect(() => { if (profileQuery.data) setDraft(profileQuery.data.displayName) }, [profileQuery.data])

  const profileMutation = useMutation({
    mutationFn: (displayName: string) =>
      workoutRepository.updateProfile({ displayName, avatarUrl: profileQuery.data?.avatarUrl ?? null }),
    onMutate: () => onError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
    },
    onError: () => onError('이름을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'),
  })

  const commit = () => {
    const name = draft.trim()
    if (!name || name === profileQuery.data?.displayName) {
      setDraft(profileQuery.data?.displayName ?? '')
      return
    }
    profileMutation.mutate(name)
  }

  return (
    <section className="settings-card" aria-labelledby="settings-profile-title">
      <div className="settings-card-heading">
        <span className="settings-icon"><User2 size={18} aria-hidden="true" /></span>
        <div><h2 id="settings-profile-title">프로필</h2><p>대시보드 인사말에 쓰이는 이름입니다.</p></div>
      </div>
      <label className="settings-field">
        <span>표시 이름</span>
        <input
          aria-label="표시 이름"
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
        />
      </label>
    </section>
  )
}

function SettingsLoading() {
  return <main className="settings-page" aria-label="설정을 불러오는 중">
    <div className="skeleton-card" /><div className="skeleton-card" /><div className="skeleton-card" />
  </main>
}

function SettingsError({ onRetry }: { onRetry: () => void }) {
  return <main className="settings-page settings-message">
    <h1>설정을 불러오지 못했어요.</h1>
    <p>잠시 후 다시 시도해 주세요.</p>
    <button className="primary-button" type="button" onClick={onRetry}>다시 시도</button>
  </main>
}
```

`useQuery` import를 상단에 추가한다: `import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'`

- [ ] **Step 4: 스타일 작성**

Create `src/features/settings/Settings.css`. `Dashboard.css`의 `.dashboard-card` 패턴을 따른다.

```css
.settings-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 26px clamp(16px, 4vw, 38px) 108px;
  max-width: 760px;
}

.settings-heading h1 { font-size: clamp(24px, 3.4vw, 31px); }
.settings-heading p { color: var(--text-muted); margin-top: 6px; }

.settings-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-card-heading { display: flex; gap: 12px; align-items: flex-start; }
.settings-card-heading h2 { font-size: 16px; }
.settings-card-heading p { color: var(--text-muted); font-size: 13px; margin-top: 3px; }

.settings-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
  color: var(--text-muted);
}

.settings-field { display: flex; flex-direction: column; gap: 7px; }
.settings-field > span { font-size: 13px; color: var(--text-muted); }

.settings-field input,
.settings-field select {
  min-height: 44px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface-subtle);
  color: var(--text);
}

.theme-choice-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }

.theme-choice-row button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-height: 68px;
  justify-content: center;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface-subtle);
  color: var(--text-muted);
  font-size: 13px;
}

.theme-choice-row button.is-selected {
  border-color: var(--accent-border);
  background: var(--accent-subtle);
  color: var(--accent);
}

.settings-error {
  border-radius: var(--radius-md);
  border: 1px solid var(--danger);
  background: var(--danger-subtle);
  color: var(--danger);
  padding: 11px 14px;
  font-size: 14px;
}

.settings-message { align-items: flex-start; gap: 12px; }

@media (max-width: 640px) {
  .settings-page { padding-bottom: 132px; }
}
```

- [ ] **Step 5: 라우트 연결**

`src/App.tsx`에서 `/settings` 라우트를 교체한다.

```tsx
import { Settings } from './features/settings/Settings'
```

```tsx
<Route path="/settings" element={<Settings />} />
```

`PlaceholderPage`는 `/stats`가 아직 쓰므로 남긴다. 다만 `page` prop 타입을 `'stats'`로 좁힌다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run src/test/settings-flows.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 7: 전체 검증**

Run: `npm test && npm run lint && npx tsc -b && npm run build`
Expected: 전부 통과. 기존 `app-user-flows.test.tsx`도 그대로 통과해야 한다.

- [ ] **Step 8: 커밋**

```bash
git add src/features/settings src/App.tsx src/test/settings-flows.test.tsx
git commit -m "feat: 설정 화면 추가

테마·기본 휴식 시간·기본 목표 RIR·표시 이름을 화면에서 바꿀 수 있게
한다. 항목이 적어 저장 버튼 없이 변경 즉시 저장하고, 텍스트·숫자
입력은 확정 시점에 저장한다."
```

---

### Task 4: 로그아웃

**Files:**
- Modify: `src/features/settings/Settings.tsx`
- Test: `src/test/settings-flows.test.tsx`

**Interfaces:**
- Consumes: `useAppServices().auth.signOut()`, `clearStoredWorkoutDraft()` (`src/features/workout/activeWorkoutDraft.ts`), `readStoredWorkoutDraft()`
- Produces: 없음 (화면 내부 동작)

- [ ] **Step 1: 실패하는 테스트 추가**

`src/test/settings-flows.test.tsx` 끝에 describe 블록을 추가한다.

```tsx
describe.sequential('UF-12: 로그아웃', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  test('로그아웃하면 로그인 화면으로 돌아간다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await screen.findByRole('heading', { name: '설정' })
    await user.click(screen.getByRole('button', { name: '로그아웃' }))

    await screen.findByRole('heading', { name: '나의 트레이닝을 이어가세요.' })
    expect(JSON.parse(localStorage.getItem(storeKey) ?? '{}').signedIn).toBe(false)
  })

  test('진행 중 초안이 있으면 안내하고 초안을 제거한다', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(screen.getAllByRole('button', { name: '운동 시작' })[0])
    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    await user.selectOptions(screen.getByRole('combobox', { name: '운동 종목 추가' }), 'barbell-bench-press')
    await user.click(screen.getByRole('button', { name: '추가' }))
    await waitFor(() => expect(localStorage.getItem('trainlog:workout-draft:v1')).not.toBeNull())

    await user.click(screen.getAllByRole('button', { name: '설정' })[0])
    await screen.findByRole('heading', { name: '설정' })
    await user.click(screen.getByRole('button', { name: '로그아웃' }))

    await screen.findByRole('heading', { name: '나의 트레이닝을 이어가세요.' })
    expect(localStorage.getItem('trainlog:workout-draft:v1')).toBeNull()
    expect(vi.mocked(window.confirm).mock.calls.at(-1)?.[0]).toContain('진행 중인 운동')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/test/settings-flows.test.tsx`
Expected: FAIL — `Unable to find role="button" with name "로그아웃"`

- [ ] **Step 3: 로그아웃 구현**

`src/features/settings/Settings.tsx`에 섹션을 추가한다. import를 보강한다.

```tsx
import { LogOut } from 'lucide-react'
import { clearStoredWorkoutDraft, readStoredWorkoutDraft } from '../workout/activeWorkoutDraft'
```

`Settings` 컴포넌트의 `</main>` 직전에 렌더한다:

```tsx
<SignOutSection />
```

컴포넌트를 추가한다:

```tsx
/**
 * The workout draft lives in localStorage, so it survives sign-out. Leaving it
 * behind would surface one account's in-progress workout to the next person who
 * signs in on this device.
 */
function SignOutSection() {
  const { auth } = useAppServices()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const signOut = async () => {
    const draft = readStoredWorkoutDraft()
    const message = draft
      ? '로그아웃할까요? 진행 중인 운동 초안이 이 기기에서 삭제됩니다.'
      : '로그아웃할까요?'
    if (!window.confirm(message)) return

    try {
      await auth.signOut()
      clearStoredWorkoutDraft()
      queryClient.clear()
    } catch {
      setError('로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.')
    }
  }

  return (
    <section className="settings-card settings-danger" aria-labelledby="settings-account-title">
      <div className="settings-card-heading">
        <span className="settings-icon"><LogOut size={18} aria-hidden="true" /></span>
        <div><h2 id="settings-account-title">계정</h2><p>이 기기에서 로그아웃합니다. 기록은 계정에 그대로 남습니다.</p></div>
      </div>
      {error && <p className="settings-error" role="alert">{error}</p>}
      <button className="secondary-button settings-signout-button" type="button" onClick={() => void signOut()}>
        <LogOut size={16} aria-hidden="true" /> 로그아웃
      </button>
    </section>
  )
}
```

**순서 주의:** `queryClient.clear()`는 `auth.signOut()` 뒤에 호출한다. 먼저 비우면 `AppShell`이 아직 로그인 상태인 채로 빈 캐시를 다시 채워 불필요한 요청이 나간다.

- [ ] **Step 4: 스타일 추가**

`src/features/settings/Settings.css` 끝에 추가한다.

```css
.settings-danger { border-color: color-mix(in srgb, var(--danger) 32%, var(--border)); }

.settings-signout-button {
  align-self: flex-start;
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 42%, transparent);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/test/settings-flows.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 6: 전체 검증**

Run: `npm test && npm run lint && npx tsc -b`
Expected: 전부 통과. 특히 `app-user-flows.test.tsx`가 로그아웃 영향을 받지 않았는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add src/features/settings src/test/settings-flows.test.tsx
git commit -m "feat: 로그아웃 추가

signOut()이 구현돼 있었으나 호출하는 화면이 없어 계정을 바꿀 수 없었다.
설정 화면에 로그아웃을 두고, 캐시를 비우고 기기에 남은 운동 초안도 함께
제거해 다음 사용자에게 남지 않게 한다."
```

---

### Task 5: 신체 측정 화면과 내비게이션 정리

**Files:**
- Create: `src/features/body/BodyMeasurements.tsx`
- Create: `src/features/body/BodyMeasurements.css`
- Modify: `src/App.tsx:25-41, 188, 244-248, 284-306, 361-368`
- Test: `src/test/settings-flows.test.tsx`

**Interfaces:**
- Consumes: `workoutRepository.listBodyMeasurements()`, `workoutRepository.saveBodyMeasurement()`
- Produces: `<BodyMeasurements />` — props 없음. `/body` 라우트에서 렌더한다.

- [ ] **Step 1: 실패하는 테스트 추가**

`src/test/settings-flows.test.tsx` 끝에 추가한다.

```tsx
describe.sequential('UF-13: 신체 측정 기록', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  function readMeasurements() {
    return JSON.parse(localStorage.getItem(storeKey) ?? '{}').measurements ?? []
  }

  test('체중만 입력해도 저장되고 목록에 나타난다', async () => {
    const user = userEvent.setup()
    renderApp('/body')

    await screen.findByRole('heading', { name: '신체 기록' })
    await user.clear(screen.getByRole('spinbutton', { name: '체중 (kg)' }))
    await user.type(screen.getByRole('spinbutton', { name: '체중 (kg)' }), '72.4')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(readMeasurements()).toHaveLength(1))
    expect(readMeasurements()[0]).toMatchObject({ weightKg: 72.4, bodyFatPercentage: null })
    expect(await screen.findByText(/72\.4/)).toBeTruthy()
  })

  test('같은 날짜 재입력은 새 행을 만들지 않고 기존 행을 수정한다', async () => {
    const user = userEvent.setup()
    renderApp('/body')

    await screen.findByRole('heading', { name: '신체 기록' })
    await user.type(screen.getByRole('spinbutton', { name: '체중 (kg)' }), '72.4')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(readMeasurements()).toHaveLength(1))

    await user.type(screen.getByRole('spinbutton', { name: '체지방률 (%)' }), '14.2')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(readMeasurements()[0].bodyFatPercentage).toBe(14.2))
    expect(readMeasurements()).toHaveLength(1)
  })

  test('수치를 하나도 입력하지 않으면 저장하지 않는다', async () => {
    const user = userEvent.setup()
    renderApp('/body')

    await screen.findByRole('heading', { name: '신체 기록' })
    await user.type(screen.getByRole('textbox', { name: '메모' }), '메모만 있음')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect((await screen.findByRole('alert')).textContent).toContain('하나는 입력해 주세요')
    expect(readMeasurements()).toHaveLength(0)
  })

  test('더보기 메뉴에서 신체 기록으로 이동한다', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(screen.getByRole('button', { name: '더보기 메뉴' }))
    await user.click(within(screen.getByRole('menu', { name: '더보기' })).getByRole('menuitem', { name: '신체 기록' }))

    await screen.findByRole('heading', { name: '신체 기록' })
  })
})
```

import에 `within`을 추가한다: `import { render, screen, waitFor, within } from '@testing-library/react'`

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/test/settings-flows.test.tsx`
Expected: FAIL — `/body`가 `Navigate to="/"`에 걸려 대시보드가 렌더된다

- [ ] **Step 3: 신체 측정 화면 구현**

Create `src/features/body/BodyMeasurements.tsx`:

```tsx
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Scale } from 'lucide-react'
import { useAppServices } from '../../services'
import type { BodyMeasurement } from '../../types/domain'
import './BodyMeasurements.css'

const bodyMeasurementsQueryKey = ['body-measurements'] as const

interface MeasurementForm {
  measuredOn: string
  weightKg: string
  skeletalMuscleMassKg: string
  bodyFatPercentage: string
  notes: string
}

function todayIsoDate() {
  const now = new Date()
  const offsetMinutes = now.getTimezoneOffset()
  return new Date(now.getTime() - offsetMinutes * 60_000).toISOString().slice(0, 10)
}

function emptyForm(): MeasurementForm {
  return { measuredOn: todayIsoDate(), weightKg: '', skeletalMuscleMassKg: '', bodyFatPercentage: '', notes: '' }
}

function toNullableNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function BodyMeasurements() {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<MeasurementForm>(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const measurementsQuery = useQuery({
    queryKey: bodyMeasurementsQueryKey,
    queryFn: () => workoutRepository.listBodyMeasurements(),
  })

  const saveMutation = useMutation({
    mutationFn: (input: Omit<BodyMeasurement, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }) =>
      workoutRepository.saveBodyMeasurement(input),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: bodyMeasurementsQueryKey })
    },
    onError: () => setError('측정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'),
  })

  const submit = () => {
    const weightKg = toNullableNumber(form.weightKg)
    const skeletalMuscleMassKg = toNullableNumber(form.skeletalMuscleMassKg)
    const bodyFatPercentage = toNullableNumber(form.bodyFatPercentage)

    if (weightKg === null && skeletalMuscleMassKg === null && bodyFatPercentage === null) {
      setError('체중·골격근량·체지방률 중 하나는 입력해 주세요.')
      return
    }

    // Same-day entries update the existing row instead of stacking duplicates.
    const existing = measurementsQuery.data?.find((item) => item.measuredOn === form.measuredOn)
    const notes = form.notes.trim()

    saveMutation.mutate({
      ...(existing ? { id: existing.id } : {}),
      measuredOn: form.measuredOn,
      weightKg: weightKg ?? existing?.weightKg ?? null,
      skeletalMuscleMassKg: skeletalMuscleMassKg ?? existing?.skeletalMuscleMassKg ?? null,
      bodyFatPercentage: bodyFatPercentage ?? existing?.bodyFatPercentage ?? null,
      notes: notes || existing?.notes || null,
    })
  }

  const measurements = measurementsQuery.data ?? []

  return (
    <main className="body-page" aria-labelledby="body-title">
      <section className="body-heading">
        <p className="eyebrow">BODY LOG</p>
        <h1 id="body-title">신체 기록</h1>
        <p>체중과 체성분을 기록해 두면 훈련 변화와 함께 볼 수 있어요.</p>
      </section>

      {error && <p className="body-error" role="alert">{error}</p>}

      <section className="body-card" aria-labelledby="body-form-title">
        <h2 id="body-form-title">측정 추가</h2>
        <div className="body-form-grid">
          <label className="body-field">
            <span>측정일</span>
            <input aria-label="측정일" type="date" value={form.measuredOn} onChange={(event) => setForm((current) => ({ ...current, measuredOn: event.target.value }))} />
          </label>
          <label className="body-field">
            <span>체중 (kg)</span>
            <input aria-label="체중 (kg)" type="number" inputMode="decimal" min="0" step="0.1" value={form.weightKg} onChange={(event) => setForm((current) => ({ ...current, weightKg: event.target.value }))} />
          </label>
          <label className="body-field">
            <span>골격근량 (kg)</span>
            <input aria-label="골격근량 (kg)" type="number" inputMode="decimal" min="0" step="0.1" value={form.skeletalMuscleMassKg} onChange={(event) => setForm((current) => ({ ...current, skeletalMuscleMassKg: event.target.value }))} />
          </label>
          <label className="body-field">
            <span>체지방률 (%)</span>
            <input aria-label="체지방률 (%)" type="number" inputMode="decimal" min="0" step="0.1" value={form.bodyFatPercentage} onChange={(event) => setForm((current) => ({ ...current, bodyFatPercentage: event.target.value }))} />
          </label>
          <label className="body-field body-field-wide">
            <span>메모</span>
            <input aria-label="메모" type="text" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          </label>
        </div>
        <button className="primary-button body-save-button" type="button" onClick={submit} disabled={saveMutation.isPending}>
          <Plus size={17} aria-hidden="true" /> {saveMutation.isPending ? '저장 중…' : '저장'}
        </button>
      </section>

      <section className="body-card" aria-labelledby="body-list-title">
        <h2 id="body-list-title">최근 기록</h2>
        {measurementsQuery.isPending && <p className="body-empty">불러오는 중…</p>}
        {measurementsQuery.isError && (
          <div className="body-empty">
            <p>기록을 불러오지 못했어요.</p>
            <button className="secondary-button" type="button" onClick={() => void measurementsQuery.refetch()}>
              <RefreshCw size={15} aria-hidden="true" /> 다시 시도
            </button>
          </div>
        )}
        {!measurementsQuery.isPending && !measurementsQuery.isError && measurements.length === 0 && (
          <div className="body-empty"><Scale size={18} aria-hidden="true" /><p>아직 기록이 없어요. 첫 측정을 남겨 보세요.</p></div>
        )}
        {measurements.length > 0 && (
          <ul className="measurement-list">
            {measurements.map((measurement) => (
              <li key={measurement.id}>
                <strong>{measurement.measuredOn}</strong>
                <span>
                  {measurement.weightKg !== null && `${measurement.weightKg} kg`}
                  {measurement.skeletalMuscleMassKg !== null && ` · 골격근 ${measurement.skeletalMuscleMassKg} kg`}
                  {measurement.bodyFatPercentage !== null && ` · 체지방 ${measurement.bodyFatPercentage}%`}
                </span>
                {measurement.notes && <small>{measurement.notes}</small>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Step 4: 스타일 작성**

Create `src/features/body/BodyMeasurements.css`:

```css
.body-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 26px clamp(16px, 4vw, 38px) 108px;
  max-width: 820px;
}

.body-heading h1 { font-size: clamp(24px, 3.4vw, 31px); }
.body-heading p { color: var(--text-muted); margin-top: 6px; }

.body-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.body-card h2 { font-size: 16px; }

.body-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.body-field { display: flex; flex-direction: column; gap: 7px; }
.body-field > span { font-size: 13px; color: var(--text-muted); }
.body-field-wide { grid-column: 1 / -1; }

.body-field input {
  min-height: 44px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface-subtle);
  color: var(--text);
}

.body-save-button { align-self: flex-start; }

.measurement-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }

.measurement-list li {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 13px 15px;
  border-radius: var(--radius-md);
  background: var(--surface-subtle);
}

.measurement-list span { color: var(--text-muted); font-size: 14px; }
.measurement-list small { color: var(--text-muted); font-size: 12px; }

.body-empty { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; color: var(--text-muted); }

.body-error {
  border-radius: var(--radius-md);
  border: 1px solid var(--danger);
  background: var(--danger-subtle);
  color: var(--danger);
  padding: 11px 14px;
  font-size: 14px;
}

@media (max-width: 640px) {
  .body-page { padding-bottom: 132px; }
}
```

- [ ] **Step 5: 내비게이션 구조 정리**

`src/App.tsx`를 수정한다. `slice` 인덱스가 조용히 어긋나지 않도록 위치별 목록을 명시한다.

`PageId`와 `navigation`, `pagePaths`에 `body`를 추가한다:

```tsx
type PageId = 'dashboard' | 'workout' | 'routines' | 'records' | 'stats' | 'body' | 'settings'

const navigation: Array<{ id: PageId; label: string; icon: typeof Home }> = [
  { id: 'dashboard', label: '대시보드', icon: Home },
  { id: 'workout', label: '운동 시작', icon: Dumbbell },
  { id: 'routines', label: '루틴', icon: Layers3 },
  { id: 'records', label: '기록', icon: CalendarDays },
  { id: 'stats', label: '통계', icon: BarChart3 },
  { id: 'body', label: '신체 기록', icon: Scale },
  { id: 'settings', label: '설정', icon: Settings2 },
]

const pagePaths: Record<PageId, string> = {
  dashboard: '/',
  workout: '/workout',
  routines: '/routines',
  records: '/records',
  stats: '/stats',
  body: '/body',
  settings: '/settings',
}

// Explicit placement: slicing the navigation array silently reshuffles menus
// whenever an entry is inserted.
const sideNavPages: PageId[] = ['dashboard', 'workout', 'routines', 'records', 'stats', 'body']
const bottomNavPages: PageId[] = ['dashboard', 'workout', 'routines', 'records']
const moreMenuPages: PageId[] = ['stats', 'body', 'settings']

function navItem(id: PageId) {
  const item = navigation.find((entry) => entry.id === id)
  if (!item) throw new Error(`Unknown navigation page: ${id}`)
  return item
}
```

`Scale`을 lucide import에 추가한다.

사이드바(`:188`)를 `sideNavPages.map((id) => { const item = navItem(id); ... })`로 바꾼다.

하단 탭(`:284`)을 `bottomNavPages.map(...)`으로 바꾸고, 더보기 버튼(`:299-306`)이 통계로 직행하는 대신 팝오버를 열게 한다. 상단과 같은 메뉴를 쓰도록 `isMoreMenuOpen` 상태를 공유한다.

```tsx
<button
  className={moreMenuPages.includes(activePage) ? 'is-active' : ''}
  onClick={() => setIsMoreMenuOpen((isOpen) => !isOpen)}
  type="button"
  aria-haspopup="menu"
  aria-expanded={isMoreMenuOpen}
>
  <MoreHorizontal size={21} aria-hidden="true" />
  <span>더보기</span>
</button>
```

상단 팝오버(`:244-248`)를 `moreMenuPages`로 렌더한다:

```tsx
{isMoreMenuOpen && (
  <div className="top-bar-popover" role="menu" aria-label="더보기" onKeyDown={moveMoreMenuFocus}>
    {moreMenuPages.map((id) => {
      const item = navItem(id)
      const Icon = item.icon
      return (
        <button type="button" role="menuitem" key={id} onClick={() => selectPage(id)}>
          <Icon size={17} aria-hidden="true" /> {item.label}
        </button>
      )
    })}
  </div>
)}
```

`getActivePage()`(`:361-368`)에 `/body` 분기를 추가한다:

```tsx
if (pathname.startsWith('/body')) return 'body'
```

라우트를 추가한다:

```tsx
<Route path="/body" element={<BodyMeasurements />} />
```

import: `import { BodyMeasurements } from './features/body/BodyMeasurements'`

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run src/test/settings-flows.test.tsx`
Expected: PASS (11 tests)

- [ ] **Step 7: 기존 테스트 회귀 확인**

Run: `npm test`
Expected: PASS. `app-user-flows.test.tsx:148-152`가 더보기 메뉴에서 '통계'를 고르는데, 메뉴 항목이 셋으로 늘어도 이름으로 찾으므로 통과해야 한다. 실패하면 팝오버 렌더 구조를 확인한다.

- [ ] **Step 8: 전체 검증**

Run: `npm run lint && npx tsc -b && npm run build`
Expected: 오류 없음

- [ ] **Step 9: 커밋**

```bash
git add src/features/body src/App.tsx src/test/settings-flows.test.tsx
git commit -m "feat: 신체 측정 기록 화면 추가

BodyMeasurement 모델과 저장소 메서드가 있었으나 화면이 없었다.
/body 라우트에 목록과 입력 폼을 두고, 같은 날짜 재입력은 기존 행을
수정한다. 내비게이션은 slice 인덱스 대신 위치별 목록을 명시해
항목 추가 시 메뉴가 어긋나지 않게 한다."
```

---

### Task 6: 문서 갱신

**Files:**
- Modify: `docs/user-flow-test-plan.md`
- Modify: `README.md`
- Modify: `AGENTS.md:70-76`

- [ ] **Step 1: 테스트 계획에 UF-12, UF-13 추가**

`docs/user-flow-test-plan.md` 끝에 아래를 그대로 덧붙인다. 기존 UF-01~UF-11과 같은 형식이다.

```markdown
### UF-12 설정 변경과 로그아웃

1. `/settings`로 이동한다.
2. 테마를 다크로 바꾼다.
3. 기본 휴식 시간과 기본 목표 RIR을 바꾼다.
4. 자유 운동을 시작해 새 종목을 추가한다.
5. 설정으로 돌아와 로그아웃한다.

기대 결과:

- 테마 변경이 즉시 적용되고 새로고침 후에도 유지된다.
- 바뀐 기본 목표 RIR이 새로 추가한 종목의 세트에 반영된다.
- 기본 휴식 시간은 종목 자체의 기본 휴식 시간이 없을 때 적용된다.
- 표시 이름을 바꾸면 대시보드 인사말에 반영된다.
- 휴식 시간에 빈 값이나 음수를 넣으면 저장하지 않고 이전 값을 유지한다.
- 로그아웃하면 로그인 화면으로 돌아간다.
- 진행 중 초안이 있으면 로그아웃 확인에 그 사실이 안내되고, 진행 시 초안과 재개 토스트가 사라진다.

### UF-13 신체 측정 기록

1. `/body`로 이동한다.
2. 체중만 입력해 저장한다.
3. 같은 날짜로 체지방률을 추가 입력해 저장한다.
4. 다른 날짜로 한 건 더 저장한다.
5. 메모만 입력하고 저장을 시도한다.

기대 결과:

- 체중만 있는 기록도 저장되고 목록에 나타난다.
- 같은 날짜 재입력은 새 행을 만들지 않고 기존 행을 수정한다.
- 목록은 최근 날짜가 위에 온다.
- 수치를 하나도 입력하지 않으면 저장되지 않고 안내가 표시된다.
- 상단 더보기 메뉴에서 신체 기록으로 이동할 수 있다.
```

- [ ] **Step 2: README 기능 목록 갱신**

`README.md`의 "주요 기능"에 두 줄을 추가한다.

```markdown
- 테마·기본 휴식 시간·기본 목표 RIR·표시 이름 설정과 로그아웃
- 체중·골격근량·체지방률 신체 측정 기록
```

- [ ] **Step 3: AGENTS.md 라우팅 표 갱신**

`AGENTS.md:70-76`의 URL 목록을 고친다.

```markdown
- `/` 대시보드
- `/workout` 운동 시작/진행/재개
- `/routines`, `/routines/new`, `/routines/:routineId` 루틴
- `/records`, `/records/:sessionId` 기록/공유
- `/settings` 설정
- `/body` 신체 측정 기록
- `/stats` 준비 중 화면
```

같은 파일의 저장소 구조(`:38-54`)에 새 디렉터리를 추가한다.

```text
    settings/                     설정·로그아웃
    body/                         신체 측정 기록
  services/
    useSettings.ts                설정 단일 쿼리 훅
  lib/theme.ts                    테마 적용과 localStorage 미러
```

또한 "아키텍처 규칙"에 한 항목을 추가한다.

```markdown
8. 설정은 `useSettings()`로만 읽습니다. 화면별 쿼리에서 `getSettings()`를 직접 호출하지 않습니다. 설정 저장 후에는 `['user-settings']`를 무효화합니다.
```

- [ ] **Step 4: 최종 전체 검증**

Run: `npm run lint && npx tsc -b && npm test -- --reporter=verbose && npm run build`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add docs/user-flow-test-plan.md README.md AGENTS.md
git commit -m "docs: 설정·신체 기록 화면 문서 갱신"
```

---

## 완료 기준

- `/settings`에서 테마·기본 휴식 시간·기본 목표 RIR·표시 이름을 바꾸면 즉시 저장되고 전 화면에 반영된다.
- 다크 테마 선택 후 새로고침해도 흰 화면 깜빡임이 없다.
- 로그아웃하면 로그인 화면으로 돌아가고, 캐시와 운동 초안이 남지 않는다.
- `/body`에서 측정을 기록하고 같은 날짜 재입력이 기존 행을 수정한다.
- `getSettings()`를 직접 호출하는 화면이 없다.
- `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`가 모두 통과한다.

## 수동 확인

자동 테스트로 덮이지 않는 항목이다. Task 6 이후 개발 서버에서 확인한다.

- OS 테마를 라이트/다크로 바꿔 가며 `system` 설정이 따라오는지 확인한다. jsdom의 `matchMedia`는 항상 `matches: false`라 테스트가 이 경로를 검증하지 못한다.
- `dark` 설정에서 새로고침해 첫 페인트 깜빡임이 없는지 확인한다.
- 1440px / 768px / 390px에서 두 화면의 입력이 가로 스크롤 없이 조작 가능한지 확인한다.
- 하단 고정 내비게이션이 신체 측정 폼의 저장 버튼을 가리지 않는지 확인한다.
- 하단 "더보기" 탭이 팝오버를 열고, 항목 선택 후 팝오버가 닫히는지 확인한다.
