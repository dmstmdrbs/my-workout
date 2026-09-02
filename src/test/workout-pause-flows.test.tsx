import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { readStoredWorkoutDraft, workoutDraftStorageKey } from '../entities/workout'
import { toLocalDateKey } from '../lib/week'
import { AppServicesProvider, createLocalStorageServices } from '../services'

/**
 * 이 파일만 따로 두는 이유는 두 가지다.
 * 1) 러너의 1초 간격 시계는 다른 테스트 파일에서 실시간(real timer)으로
 *    잘 동작하고 있어, 그 파일들에 fake timers를 섞으면 기존 타이밍에
 *    영향을 줄 위험이 있다. 이 파일 안에서만 fake timers를 켠다.
 * 2) mock 어댑터의 모듈 스코프 `inMemoryStore`는 `localStorage.clear()`로
 *    지워지지 않는다(모듈이 다시 로드되기 전까지 메모리에 남는다).
 *    파일 격리는 Vitest가 테스트 파일마다 별도의 모듈 그래프를 쓰는
 *    데서 온다. 그래서 파일 내부에서는 이전 테스트가 만든 시드/세션이
 *    계속 보일 수 있으니, 새 초안을 만들 때 draft 키만 명시적으로
 *    치운다.
 */

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

function elapsedTimeEl() {
  const el = document.querySelector('.workout-elapsed-time')
  if (!el) throw new Error('elapsed time badge not found')
  return el
}

/**
 * fake timers 아래에서는 RTL의 findBy 계열/waitFor가 기대는 실시간 폴링이
 * 그대로 동작하지 않는다. 러너 설정 쿼리(listRoutines/listExercises,
 * 설정)는 실제 지연 없이 microtask로만 풀리므로, 타이머를 조금씩
 * 전진시키며 microtask 큐를 여러 번 비워 확실히 반영시킨다.
 */
async function flushSetupQuery() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
  }
}

describe.sequential('일시정지: 예전 초안과의 하위 호환', () => {
  test('일시정지 필드가 없는 예전 초안도 그대로 복원되고, pausedSeconds/pausedAt은 기본값으로 채워진다', () => {
    const legacyDraft = {
      draft: {
        id: 'legacy-draft',
        routineId: null,
        routineName: '자유 운동',
        status: 'in_progress',
        startedAt: '2026-08-16T09:00:00.000Z',
        completedAt: null,
        notes: null,
        exercises: [],
      },
      activeExerciseId: null,
      restEndsAt: null,
    }
    localStorage.setItem(workoutDraftStorageKey, JSON.stringify(legacyDraft))

    const restored = readStoredWorkoutDraft()

    expect(restored).not.toBeNull()
    // startedAt은 그대로 보존되어야 경과 시간 계산이 어긋나지 않는다.
    expect(restored?.draft.startedAt).toBe('2026-08-16T09:00:00.000Z')
    expect(restored?.draft.routineName).toBe('자유 운동')
    expect(restored?.draft.pausedSeconds).toBe(0)
    expect(restored?.pausedAt).toBeNull()

    localStorage.removeItem(workoutDraftStorageKey)
  })
})

describe.sequential('일시정지: 러너 화면 동작', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('일시정지 중에는 경과 시간이 멈추고, 재개하면 멈춘 지점부터 이어지며, 화면을 벗어났다 돌아와도 그 지점이 유지된다', async () => {
    localStorage.removeItem(workoutDraftStorageKey)

    // 러너의 1초 간격 시계가 처음부터 fake timer 위에서 만들어지도록,
    // 렌더링 전에 fake timers를 켠다. 나중에 켜면 이미 실행 중인 실제
    // interval은 그대로 실시간으로 남아 있어 시간 조작이 먹히지 않는다.
    vi.useFakeTimers({ now: Date.now() })

    let app = renderApp('/workout')
    await flushSetupQuery()
    expect(screen.getByRole('heading', { name: '오늘 어떤 운동을 할까요?' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    expect(screen.getByRole('heading', { name: '자유 운동' })).toBeTruthy()

    act(() => { vi.advanceTimersByTime(5_000) })
    expect(elapsedTimeEl().textContent).toContain('00:05')
    expect(elapsedTimeEl().classList.contains('is-paused')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '운동 일시정지' }))
    expect(elapsedTimeEl().classList.contains('is-paused')).toBe(true)
    expect(screen.getByText('일시정지')).toBeTruthy()

    // 65초를 흘려보내도(전화, 기구 대기 등) 일시정지 중에는 경과 시간이
    // 그대로여야 한다.
    act(() => { vi.advanceTimersByTime(65_000) })
    expect(elapsedTimeEl().textContent).toContain('00:05')

    fireEvent.click(screen.getByRole('button', { name: '운동 재개' }))
    expect(elapsedTimeEl().classList.contains('is-paused')).toBe(false)

    // 재개 후에는 멈췄던 00:05에서 이어져야 한다. 65초의 공백을 흡수해
    // 01:10으로 건너뛰면 안 된다.
    act(() => { vi.advanceTimersByTime(5_000) })
    expect(elapsedTimeEl().textContent).toContain('00:10')

    // 다시 일시정지한 뒤 화면을 벗어났다가(새로고침 시뮬레이션) 돌아와도
    // 경과 시간이 일시정지 시작 시점에 멈춰 있어야 한다 -- 새로고침으로
    // 실제 시간이 얼마나 흘렀든 관계없이.
    fireEvent.click(screen.getByRole('button', { name: '운동 일시정지' }))
    const frozenAtSecondPause = elapsedTimeEl().textContent

    app.unmount()
    act(() => { vi.advanceTimersByTime(120_000) })

    app = renderApp('/workout')
    await flushSetupQuery()
    expect(screen.getByRole('heading', { name: '자유 운동' })).toBeTruthy()

    expect(elapsedTimeEl().classList.contains('is-paused')).toBe(true)
    expect(elapsedTimeEl().textContent).toBe(frozenAtSecondPause)

    app.unmount()
    localStorage.removeItem(workoutDraftStorageKey)
  })

  test('일시정지한 채로 운동을 종료해도 그 시점까지의 일시정지 시간이 저장된다', async () => {
    localStorage.removeItem(workoutDraftStorageKey)
    vi.useFakeTimers({ now: Date.now() })

    const app = renderApp('/workout')
    await flushSetupQuery()
    expect(screen.getByRole('heading', { name: '오늘 어떤 운동을 할까요?' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    expect(screen.getByRole('heading', { name: '자유 운동' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '종목 추가' }))
    expect(screen.getByRole('dialog', { name: '종목 추가' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '바벨 벤치프레스' }))
    fireEvent.click(screen.getByRole('button', { name: '선택한 1개 추가' }))
    await flushSetupQuery()
    expect(screen.getByRole('heading', { name: '바벨 벤치프레스' })).toBeTruthy()

    // 완료 세트가 0개면 종료가 저장 없이 초안만 지우므로, 저장 경로를
    // 실제로 거치도록 한 세트를 완료해 둔다.
    fireEvent.click(screen.getByRole('button', { name: '1세트 완료' }))

    fireEvent.click(screen.getByRole('button', { name: '운동 일시정지' }))
    // 재개 없이 90초를 흘려보낸 뒤 곧바로 종료한다 -- "일시정지한 채 재개
    // 없이 종료"가 spec이 명시한 시나리오다.
    act(() => { vi.advanceTimersByTime(90_000) })

    fireEvent.click(screen.getByRole('button', { name: '운동 종료' }))
    fireEvent.click(screen.getByRole('button', { name: '종료하고 저장' }))
    await flushSetupQuery()

    const store = JSON.parse(localStorage.getItem('trainlog:mock-store:v1') ?? '{}') as { sessions?: Array<{ pausedSeconds: number; status: string }> }
    const saved = store.sessions?.at(-1)
    expect(saved).toBeTruthy()
    expect(saved?.status).toBe('completed')
    // fake timers 위에서 결정론적으로 정확히 90초여야 한다.
    expect(saved?.pausedSeconds).toBe(90)

    app.unmount()
    localStorage.removeItem(workoutDraftStorageKey)
  })
})

describe.sequential('일시정지: 저장·표시', () => {
  test('종료 시 누적된 일시정지 시간이 세션에 저장되고, 기록 화면의 소요 시간 표시가 그만큼 줄어든다', async () => {
    localStorage.removeItem(workoutDraftStorageKey)
    const repo = createLocalStorageServices().workoutRepository

    // 100분짜리 운동 중 10분(600초)을 일시정지했다고 가정한다.
    const startedAt = '2026-08-09T09:00:00.000Z'
    const completedAt = '2026-08-09T10:40:00.000Z'
    const saved = await repo.saveSession({
      routineId: null,
      routineName: '일시정지 소요시간 테스트',
      status: 'completed',
      startedAt,
      completedAt,
      pausedSeconds: 600,
      notes: null,
      exercises: [],
    })

    expect(saved.pausedSeconds).toBe(600)

    // 기록 탭은 이제 하루씩 보여준다. 기본값(가장 최근 운동일)이 아니라 이
    // 세션이 있는 날을 명시해 연다.
    const app = renderApp(`/records?d=${toLocalDateKey(new Date(startedAt))}`)
    await screen.findByRole('heading', { name: '운동 기록' })

    const rowLabel = await screen.findByText('일시정지 소요시간 테스트')
    const row = rowLabel.closest('button')
    expect(row).not.toBeNull()
    // 100분 - 10분 = 90분 = 1시간 30분. 일시정지 시간을 빼지 않으면
    // 1시간 40분으로 보였을 것이다.
    expect(row!.textContent).toContain('1시간 30분')
    expect(row!.textContent).not.toContain('1시간 40분')

    app.unmount()
  })
})
