import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import type { AppServices } from '../services'

let services: AppServices

function renderWorkout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={services}>
        <MemoryRouter initialEntries={['/workout']}>
          <App />
        </MemoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>,
  )
}

describe.sequential('운동 화면: 이전 완료 세션 세트별 비교', () => {
  beforeAll(async () => {
    localStorage.clear()
    services = createLocalStorageServices()
    await services.workoutRepository.saveSession({
      routineId: 'pull-day',
      routineName: '비교 기준 세션',
      status: 'completed',
      startedAt: '2026-08-31T08:00:00.000+09:00',
      completedAt: '2026-08-31T09:00:00.000+09:00',
      notes: null,
      exercises: [{
        id: 'previous-row', exerciseId: 'seated-cable-row', exerciseName: '체스트 서포티드 시티드 로우', primaryMuscle: 'back', exerciseOrder: 1, notes: null,
        sets: [
          { id: 'previous-row-1', setOrder: 1, setType: 'warmup', weightKg: 55, reps: 12, durationSeconds: null, distanceKm: null, targetRir: 3, actualRir: 3, restSeconds: 60, isCompleted: true, completedAt: '2026-08-31T08:10:00.000+09:00', notes: null },
          { id: 'previous-row-2', setOrder: 2, setType: 'topset', weightKg: 70, reps: 8, durationSeconds: null, distanceKm: null, targetRir: 1, actualRir: 1, restSeconds: 120, isCompleted: true, completedAt: '2026-08-31T08:15:00.000+09:00', notes: null },
        ],
      }],
    })
  })

  test('같은 세트 순서의 중량·횟수·유형을 표시하고 없는 대응 세트는 명확히 비운다', async () => {
    const user = userEvent.setup()
    renderWorkout()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByText('Pull Day', { selector: 'strong' }).closest('button')!)
    await user.click(screen.getByRole('button', { name: 'Pull Day 시작' }))

    const heading = await screen.findByRole('heading', { name: '체스트 서포티드 시티드 로우' })
    const card = within(heading.closest('section')!)
    expect(await card.findByText('이전 1세트 · 웜업 · 55kg × 12회')).toBeTruthy()
    expect(card.getByText('이전 2세트 · 탑세트 · 70kg × 8회')).toBeTruthy()
    expect(card.getByText('이전 세션 대응 기록 없음')).toBeTruthy()

    const firstWeight = card.getByRole('spinbutton', { name: '1세트 중량 (kg)' })
    await user.clear(firstWeight)
    await user.type(firstWeight, '99')

    await waitFor(() => {
      expect(card.getByText('이전 1세트 · 웜업 · 55kg × 12회')).toBeTruthy()
      expect(card.getByText('이전 2세트 · 탑세트 · 70kg × 8회')).toBeTruthy()
    })
  })
})
