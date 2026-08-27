import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

const workoutDraftKey = 'trainlog:workout-draft:v1'

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

describe.sequential('UF-27: 루틴의 유산소 처방과 통계', () => {
  beforeAll(async () => {
    const repo = createLocalStorageServices().workoutRepository
    const treadmill = await repo.saveExercise({
      name: '트레드밀', primaryMuscle: 'cardio', secondaryMuscles: [],
      equipment: 'cardio', brand: null, defaultRestSeconds: 0, isArchived: false,
    })

    // 통계용: 서로 다른 날짜의 유산소 세션 둘.
    for (const [daysAgo, seconds, km] of [[6, 1800, 5.2], [2, 2400, 7.1]] as const) {
      const startedAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString()
      await repo.saveSession({
        routineId: null, routineName: null, status: 'completed',
        startedAt, completedAt: startedAt, pausedSeconds: 0, notes: null,
        exercises: [{
          id: `cardio-${daysAgo}`, exerciseId: treadmill.id, exerciseName: '트레드밀',
          primaryMuscle: 'cardio', exerciseOrder: 1, notes: null,
          sets: [{
            id: `cardio-set-${daysAgo}`, setOrder: 1, setType: 'working',
            weightKg: null, reps: null, durationSeconds: seconds, distanceKm: km,
            targetRir: null, actualRir: null, restSeconds: 0,
            isCompleted: true, completedAt: startedAt, notes: null,
          }],
        }],
      })
    }
  })

  beforeEach(() => {
    localStorage.removeItem(workoutDraftKey)
  })

  test('루틴 편집에서 유산소 종목은 시간·거리를 처방한다', async () => {
    const user = userEvent.setup()
    renderApp('/routines/new')

    await user.click(await screen.findByRole('button', { name: '종목 추가' }))
    const sheet = within(await screen.findByRole('dialog', { name: '종목 추가' }))
    await user.click(sheet.getByRole('button', { name: '트레드밀' }))
    await user.click(sheet.getByRole('button', { name: '선택한 1개 추가' }))

    // 중량·반복 수 처방 칸은 나오지 않는다.
    await waitFor(() => expect(screen.queryByRole('spinbutton', { name: '1세트 목표 중량' })).toBeNull())
    expect(screen.queryByRole('spinbutton', { name: '1세트 최소 반복 수' })).toBeNull()

    const minutes = screen.getByRole('spinbutton', { name: '1세트 목표 시간(분)' })
    await user.type(minutes, '30')
    await user.type(screen.getByRole('spinbutton', { name: '1세트 목표 거리(km)' }), '5')

    // 새 루틴은 "새 루틴"이라는 기본 이름을 갖고 있어 지우고 적는다.
    await user.clear(screen.getByRole('textbox', { name: '루틴 이름' }))
    await user.type(screen.getByRole('textbox', { name: '루틴 이름' }), '유산소 데이')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const routines = JSON.parse(localStorage.getItem('trainlog:mock-store:v1') ?? '{}').routines ?? []
      const saved = routines.find((routine: { name: string }) => routine.name === '유산소 데이')
      // 분 입력이 초로 저장된다.
      expect(saved?.exercises[0]?.sets[0]).toMatchObject({ targetDurationSeconds: 1800, targetDistanceKm: 5 })
    })
  })

  test('통계는 유산소 종목을 운동 시간 추이로 보여준다', async () => {
    const user = userEvent.setup()
    renderApp('/stats')

    await screen.findByRole('heading', { name: '주간 통계' })
    await user.click(screen.getByRole('button', { name: /운동 선택/ }))
    const sheet = within(await screen.findByRole('dialog', { name: '종목 추가' }))
    await user.click(sheet.getByRole('button', { name: '트레드밀' }))

    const chart = await screen.findByRole('group', { name: '트레드밀 운동 시간 추이' })
    const labels = within(chart).getAllByRole('img').map((bar) => bar.getAttribute('aria-label'))

    expect(labels).toHaveLength(2)
    expect(labels[0]).toContain('30분 · 5.2km')
    expect(labels[1]).toContain('40분 · 7.1km')
  })
})
