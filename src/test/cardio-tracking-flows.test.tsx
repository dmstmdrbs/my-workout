import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import { getSessionVolume } from '../lib/volume'
import type { AppServices } from '../services'

const workoutDraftKey = 'trainlog:workout-draft:v1'

function renderApp(services: AppServices, initialPath = '/workout') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={services}>
        <MemoryRouter initialEntries={[initialPath]}>
          <App />
        </MemoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>,
  )
}

describe.sequential('UF-24: 유산소 종목의 시간·거리 기록', () => {
  beforeAll(async () => {
    // 시드에는 유산소 종목이 없다. 장비가 'cardio'인 종목 하나를 만들어 둔다.
    await createLocalStorageServices().workoutRepository.saveExercise({
      name: '트레드밀',
      primaryMuscle: 'cardio',
      secondaryMuscles: [],
      equipment: 'cardio',
      brand: null,
      defaultRestSeconds: 0,
      isArchived: false,
    })
  })

  beforeEach(() => {
    localStorage.removeItem(workoutDraftKey)
  })

  async function startFreeWorkoutWithTreadmill(user: ReturnType<typeof userEvent.setup>) {
    renderApp(createLocalStorageServices())
    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })
    await user.click(screen.getByRole('button', { name: '종목 추가' }))
    const sheet = within(await screen.findByRole('dialog', { name: '종목 추가' }))
    await user.click(sheet.getByRole('button', { name: '트레드밀' }))
    await screen.findByRole('heading', { name: '트레드밀' })
  }

  test('유산소 종목은 중량·횟수 대신 시간과 거리를 받는다', async () => {
    const user = userEvent.setup()
    await startFreeWorkoutWithTreadmill(user)

    // 중량·횟수 칸은 아예 없다.
    expect(screen.queryByRole('spinbutton', { name: '1세트 중량 (kg)' })).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: '1세트 횟수' })).toBeNull()

    const minutes = screen.getByRole('spinbutton', { name: '1세트 시간 (분)' })
    const distance = screen.getByRole('spinbutton', { name: '1세트 거리 (km)' })
    await user.clear(minutes)
    await user.type(minutes, '30')
    await user.clear(distance)
    await user.type(distance, '5.2')

    // 분 입력은 초로 저장한다.
    await waitFor(() => {
      const set = JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}').draft?.exercises?.[0]?.sets?.[0]
      expect(set).toMatchObject({ durationSeconds: 1800, distanceKm: 5.2, weightKg: null, reps: null })
    })
  })

  test('스테퍼는 시간을 1분, 거리를 0.1km씩 움직인다', async () => {
    const user = userEvent.setup()
    await startFreeWorkoutWithTreadmill(user)

    await user.click(screen.getByRole('button', { name: '1세트 시간 1분 증가' }))
    await user.click(screen.getByRole('button', { name: '1세트 거리 0.1km 증가' }))
    await user.click(screen.getByRole('button', { name: '1세트 거리 0.1km 증가' }))

    await waitFor(() => {
      const set = JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}').draft?.exercises?.[0]?.sets?.[0]
      // 0.1 + 0.1이 0.30000000000000004로 새지 않아야 한다.
      expect(set).toMatchObject({ durationSeconds: 60, distanceKm: 0.2 })
    })
  })

  test('유산소 세트는 볼륨 합산에 들어가지 않는다', () => {
    const cardioSet = {
      id: 'c1', setOrder: 1, setType: 'working' as const,
      weightKg: null, reps: null, durationSeconds: 1800, distanceKm: 5.2,
      targetRir: null, actualRir: null, restSeconds: 0, isCompleted: true,
      completedAt: '2026-08-18T10:00:00.000Z', notes: null,
    }
    const liftSet = { ...cardioSet, id: 'l1', weightKg: 60, reps: 10, durationSeconds: null, distanceKm: null }

    // 시간·거리는 kg에 더할 수 있는 값이 아니라 합계에서 빠진다.
    expect(getSessionVolume({ exercises: [{ sets: [cardioSet, liftSet] }] as never })).toBe(600)
  })
})
