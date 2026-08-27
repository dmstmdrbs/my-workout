import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

const workoutDraftKey = 'trainlog:workout-draft:v1'

function renderWorkout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={createLocalStorageServices()}>
        <MemoryRouter initialEntries={['/workout']}>
          <App />
        </MemoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>,
  )
}

describe.sequential('UF-28: RIR 기반 중량 제안', () => {
  beforeAll(async () => {
    // 목표 RIR 2를 계획했는데 실제 0으로 끝난 세션. 두 칸 모자랐으니
    // 100kg에서 5kg 낮춘 95kg를 제안해야 한다.
    const repo = createLocalStorageServices().workoutRepository
    const startedAt = new Date(Date.now() - 3 * 86_400_000).toISOString()
    await repo.saveSession({
      routineId: null, routineName: null, status: 'completed',
      startedAt, completedAt: startedAt, pausedSeconds: 0, notes: null,
      exercises: [{
        id: 'sug-ex', exerciseId: 'barbell-bench-press', exerciseName: '바벨 벤치프레스',
        primaryMuscle: 'chest', exerciseOrder: 1, notes: null,
        sets: [{
          id: 'sug-set', setOrder: 1, setType: 'working',
          weightKg: 100, reps: 5, durationSeconds: null, distanceKm: null,
          targetRir: 2, actualRir: 0, restSeconds: 120,
          isCompleted: true, completedAt: startedAt, notes: null,
        }],
      }],
    })
  })

  beforeEach(() => {
    localStorage.removeItem(workoutDraftKey)
  })

  test('지난 세트가 계획보다 힘들었으면 낮춘 중량을 제안하고, 누르면 채워진다', async () => {
    const user = userEvent.setup()
    renderWorkout()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await user.click(await screen.findByRole('button', { name: '종목 추가' }))
    const sheet = within(await screen.findByRole('dialog', { name: '종목 추가' }))
    await user.click(sheet.getByRole('button', { name: '바벨 벤치프레스' }))
    await user.click(sheet.getByRole('button', { name: '선택한 1개 추가' }))

    const note = await screen.findByRole('note')
    expect(note.textContent).toContain('계획보다 힘들었어요')
    // 판단 근거를 함께 보여준다 -- 숫자만 던지면 왜 그런지 알 수 없다.
    expect(note.textContent).toContain('목표 RIR 2 → 실제 0')

    const apply = within(note).getByRole('button')
    expect(apply.textContent).toContain('95kg로 낮춰 보세요')

    await user.click(apply)

    // 아직 완료하지 않은 첫 세트의 중량이 제안값으로 바뀐다.
    await waitFor(() => {
      const set = JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}').draft?.exercises?.[0]?.sets?.[0]
      expect(set?.weightKg).toBe(95)
    })
  })
})
