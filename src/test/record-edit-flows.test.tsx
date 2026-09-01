import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import type { WorkoutRepository } from '../services'
import type { WorkoutSetRecord } from '../types/domain'

/**
 * UF-26 완료된 운동 기록 편집.
 *
 * mock 어댑터의 모듈 스코프 저장소는 `localStorage.clear()`로 지워지지 않고
 * 파일 단위 격리만 보장된다. 편집은 저장한 데이터를 실제로 바꾸므로 테스트마다
 * **자기 세션을 새로 심어** 앞 테스트의 편집 결과를 읽지 않게 한다.
 */
function renderApp(initialPath: string) {
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

function HistoryBackButton() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>브라우저 뒤로가기</button>
}

function HistoryForwardButton() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(1)}>브라우저 앞으로가기</button>
}

function CurrentPath() {
  const location = useLocation()
  return <output data-testid="current-path">{location.pathname}</output>
}

function renderAppWithHistory(entries: string[], initialIndex: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={createLocalStorageServices()}>
        <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
          <App />
          <HistoryBackButton />
          <HistoryForwardButton />
          <CurrentPath />
        </MemoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>,
  )
}

const exerciseName = '바벨 벤치프레스'

function completedSet(index: number, weightKg: number, reps: number): WorkoutSetRecord {
  return {
    id: `edit-set-${index}`,
    setOrder: index,
    setType: 'working',
    weightKg,
    reps,
    durationSeconds: null,
    distanceKm: null,
    targetRir: 2,
    actualRir: 2,
    restSeconds: 120,
    isCompleted: true,
    completedAt: `2026-08-20T10:${String(10 + index * 4).padStart(2, '0')}:00.000+09:00`,
    notes: null,
  }
}

/** 완료된 세션 하나. 종목은 한 개만 둬서 `1세트 중량 (kg)` 같은 이름이 화면에
 * 하나씩만 있게 한다(SetRow의 이름은 종목이 아니라 세트 번호로 만들어진다). */
async function seedCompletedSession(repo: WorkoutRepository, label: string) {
  const saved = await repo.saveSession({
    routineId: null,
    routineName: label,
    status: 'completed',
    startedAt: '2026-08-20T10:05:00.000+09:00',
    completedAt: '2026-08-20T11:00:00.000+09:00',
    notes: null,
    exercises: [{
      id: `${label}-exercise`,
      exerciseId: 'barbell-bench-press',
      exerciseName,
      primaryMuscle: 'chest',
      exerciseOrder: 1,
      notes: null,
      sets: [completedSet(1, 80, 7), completedSet(2, 80, 7), completedSet(3, 80, 6)],
    }],
  })
  return saved.id
}

function editorSets() {
  return screen.getByRole('region', { name: `${exerciseName} 세트 기록` })
}

describe.sequential('UF-26: 완료된 운동 기록 편집', () => {
  beforeAll(() => {
    localStorage.clear()
  })

  test('상세 화면에서 편집으로 들어가 세트 값을 고치고 세트를 더하면 기록에 반영된다', async () => {
    const user = userEvent.setup()
    const repo = createLocalStorageServices().workoutRepository
    const sessionId = await seedCompletedSession(repo, '편집 대상 A')

    renderApp(`/records/${sessionId}`)
    await screen.findByRole('heading', { name: '편집 대상 A', level: 1 })
    expect(screen.queryByText('수정됨')).toBeNull()

    await user.click(screen.getByRole('button', { name: '수정' }))
    await screen.findByRole('heading', { name: '기록 수정' })

    const firstWeight = within(editorSets()).getByLabelText('1세트 중량 (kg)')
    await user.clear(firstWeight)
    await user.type(firstWeight, '85')

    await user.click(screen.getByRole('button', { name: `${exerciseName} 세트 추가` }))
    const fourthWeight = within(editorSets()).getByLabelText('4세트 중량 (kg)')
    await user.clear(fourthWeight)
    await user.type(fourthWeight, '75')
    const fourthReps = within(editorSets()).getByLabelText('4세트 횟수')
    await user.clear(fourthReps)
    await user.type(fourthReps, '5')

    await user.click(screen.getByRole('button', { name: '저장하기' }))

    await screen.findByRole('heading', { name: '편집 대상 A', level: 1 })
    await waitFor(() => {
      expect(screen.getByText('85 kg × 7')).toBeTruthy()
    })
    expect(screen.getByText('75 kg × 5')).toBeTruthy()
    // 고친 흔적이 남는다. mock 어댑터가 Supabase의 save_workout_session과 같은
    // 규칙("이미 completed였던 세션의 재저장")으로 editedAt을 찍는다.
    expect(screen.getByText('수정됨')).toBeTruthy()
  })

  test('세트를 지우면 번호가 다시 매겨지고, 종목의 마지막 세트는 지울 수 없다', async () => {
    const user = userEvent.setup()
    const repo = createLocalStorageServices().workoutRepository
    const sessionId = await seedCompletedSession(repo, '편집 대상 B')

    renderApp(`/records/${sessionId}/edit`)
    await screen.findByRole('heading', { name: '기록 수정' })

    await user.click(within(editorSets()).getByRole('button', { name: '2세트 삭제' }))
    // 3세트(80 × 6)가 2세트로 내려온다. 번호를 다시 매기지 않으면 저장 payload에
    // 1, 3만 남아 화면과 DB의 세트 번호가 어긋난다.
    expect(within(editorSets()).queryByLabelText('3세트 중량 (kg)')).toBeNull()
    expect((within(editorSets()).getByLabelText('2세트 횟수') as HTMLInputElement).value).toBe('6')

    await user.click(within(editorSets()).getByRole('button', { name: '2세트 삭제' }))
    expect((within(editorSets()).getByRole('button', { name: '1세트 삭제' }) as HTMLButtonElement).disabled).toBe(true)

    await user.click(screen.getByRole('button', { name: '저장하기' }))

    await screen.findByRole('heading', { name: '편집 대상 B', level: 1 })
    await waitFor(() => {
      expect(screen.getByText(/완료 1세트/)).toBeTruthy()
    })
    expect(screen.getByText('80 kg × 7')).toBeTruthy()
    expect(screen.queryByText('80 kg × 6')).toBeNull()
  })

  test('고친 상태로 취소하면 확인을 받고, 버리기를 고르면 값이 그대로 남는다', async () => {
    const user = userEvent.setup()
    const repo = createLocalStorageServices().workoutRepository
    const sessionId = await seedCompletedSession(repo, '편집 대상 C')

    renderApp(`/records/${sessionId}/edit`)
    await screen.findByRole('heading', { name: '기록 수정' })

    const firstWeight = within(editorSets()).getByLabelText('1세트 중량 (kg)')
    await user.clear(firstWeight)
    await user.type(firstWeight, '100')

    await user.click(screen.getByRole('button', { name: '취소' }))
    await screen.findByRole('heading', { name: '고친 내용을 버릴까요?' })

    await user.click(screen.getByRole('button', { name: '계속 편집' }))
    expect(screen.getByRole('heading', { name: '기록 수정' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '취소' }))
    await screen.findByRole('heading', { name: '고친 내용을 버릴까요?' })
    await user.click(screen.getByRole('button', { name: '버리기' }))

    await screen.findByRole('heading', { name: '편집 대상 C', level: 1 })
    // 심어 둔 세트는 80×7, 80×7, 80×6이다. 고치기 전 그대로 남아 있어야 한다.
    expect(screen.getAllByText('80 kg × 7')).toHaveLength(2)
    expect(screen.getByText('80 kg × 6')).toBeTruthy()
    expect(screen.queryByText('100 kg × 7')).toBeNull()
    expect(screen.queryByText('수정됨')).toBeNull()
  })

  test('고치지 않고 취소하면 확인 없이 바로 상세로 돌아간다', async () => {
    const user = userEvent.setup()
    const repo = createLocalStorageServices().workoutRepository
    const sessionId = await seedCompletedSession(repo, '편집 대상 D')

    renderApp(`/records/${sessionId}/edit`)
    await screen.findByRole('heading', { name: '기록 수정' })

    await user.click(screen.getByRole('button', { name: '취소' }))
    await screen.findByRole('heading', { name: '편집 대상 D', level: 1 })
    expect(screen.queryByRole('heading', { name: '고친 내용을 버릴까요?' })).toBeNull()
  })

  test('기록 수정 중 브라우저 뒤로가기를 취소하면 편집 화면과 URL을 유지한다', async () => {
    const user = userEvent.setup()
    const repo = createLocalStorageServices().workoutRepository
    const sessionId = await seedCompletedSession(repo, '편집 대상 POP 취소')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderAppWithHistory(['/records', `/records/${sessionId}`, `/records/${sessionId}/edit`], 2)
    await screen.findByRole('heading', { name: '기록 수정' })
    const firstWeight = within(editorSets()).getByLabelText('1세트 중량 (kg)')
    await user.clear(firstWeight)
    await user.type(firstWeight, '100')

    await user.click(screen.getByRole('button', { name: '브라우저 뒤로가기' }))
    expect(screen.getByRole('heading', { name: '기록 수정' })).toBeTruthy()
    expect(screen.getByTestId('current-path').textContent).toBe(`/records/${sessionId}/edit`)
    expect(confirm.mock.calls).toHaveLength(1)
    confirm.mockRestore()
  })

  test('기록 수정 중 브라우저 뒤로가기를 확인하면 이전 화면으로 이동한다', async () => {
    const user = userEvent.setup()
    const repo = createLocalStorageServices().workoutRepository
    const sessionId = await seedCompletedSession(repo, '편집 대상 POP 확인')
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderAppWithHistory(['/records', `/records/${sessionId}`, `/records/${sessionId}/edit`], 2)
    await screen.findByRole('heading', { name: '기록 수정' })
    const firstWeight = within(editorSets()).getByLabelText('1세트 중량 (kg)')
    await user.clear(firstWeight)
    await user.type(firstWeight, '100')

    await user.click(screen.getByRole('button', { name: '브라우저 뒤로가기' }))
    await screen.findByRole('heading', { name: '편집 대상 POP 확인', level: 1 })
    expect(screen.queryByRole('heading', { name: '기록 수정' })).toBeNull()
    vi.restoreAllMocks()
  })

  test('기록 수정 중 브라우저 앞으로가기를 취소하면 편집 화면을 유지한다', async () => {
    const user = userEvent.setup()
    const repo = createLocalStorageServices().workoutRepository
    const sessionId = await seedCompletedSession(repo, '편집 대상 POP 앞으로')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderAppWithHistory(['/records', `/records/${sessionId}/edit`, `/records/${sessionId}`], 1)
    await screen.findByRole('heading', { name: '기록 수정' })
    const firstWeight = within(editorSets()).getByLabelText('1세트 중량 (kg)')
    await user.clear(firstWeight)
    await user.type(firstWeight, '100')

    await user.click(screen.getByRole('button', { name: '브라우저 앞으로가기' }))
    expect(screen.getByRole('heading', { name: '기록 수정' })).toBeTruthy()
    expect(screen.getByTestId('current-path').textContent).toBe(`/records/${sessionId}/edit`)
    expect(confirm.mock.calls).toHaveLength(1)
    confirm.mockRestore()
  })
})
