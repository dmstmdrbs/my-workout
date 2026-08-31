import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import App from '../App'
import { workoutDraftStorageKey } from '../features/workout/activeWorkoutDraft'
import { AppServicesProvider, createLocalStorageServices, type AppServices } from '../services'

function renderWorkout(services: AppServices = createLocalStorageServices()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={services}>
        <MemoryRouter initialEntries={['/workout']}><App /></MemoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>,
  )
}

describe.sequential('UF-30: 운동 시작 전 초기 작업 중량', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.removeItem(workoutDraftStorageKey)
  })

  test('루틴의 제안 중량을 확인·수정한 뒤 모든 세트 입력값에 반영한다', async () => {
    const user = userEvent.setup()
    renderWorkout()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByText('Pull Day', { selector: 'strong' }).closest('button')!)
    await user.click(screen.getByRole('button', { name: 'Pull Day 시작' }))
    await screen.findByRole('heading', { name: '초기 작업 중량 확인' })

    const rowInput = screen.getByRole('spinbutton', { name: '체스트 서포티드 시티드 로우 초기 작업 중량' }) as HTMLInputElement
    expect(rowInput.value).toBe('60')
    await user.clear(rowInput)
    await user.type(rowInput, '65')
    await user.click(screen.getByRole('button', { name: '이 중량으로 시작' }))

    const rowCard = (await screen.findByRole('heading', { name: '체스트 서포티드 시티드 로우' })).closest('section')!
    expect((within(rowCard).getByRole('spinbutton', { name: '1세트 중량 (kg)' }) as HTMLInputElement).value).toBe('65')
    expect((within(rowCard).getByRole('spinbutton', { name: '2세트 중량 (kg)' }) as HTMLInputElement).value).toBe('65')
    expect((within(rowCard).getByRole('spinbutton', { name: '3세트 중량 (kg)' }) as HTMLInputElement).value).toBe('65')
  })

  test('맨몸 종목만 있는 루틴은 초기 중량 입력 없이 바로 시작한다', async () => {
    const user = userEvent.setup()
    const services = createLocalStorageServices()
    const bodyweight = await services.workoutRepository.saveExercise({
      name: '테스트 푸시업', primaryMuscle: 'chest', secondaryMuscles: ['triceps'], equipment: 'bodyweight', brand: null,
      defaultRestSeconds: 60, isArchived: false,
    })
    await services.workoutRepository.saveRoutine({
      name: '맨몸 루틴', description: null, color: null,
      exercises: [{
        id: 'body-routine-exercise', exerciseId: bodyweight.id, exerciseName: bodyweight.name, exerciseOrder: 1, notes: null,
        sets: [{ id: 'body-set', setOrder: 1, setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetDurationSeconds: null, targetDistanceKm: null, targetRir: 2, restSeconds: 60 }],
      }],
    })
    renderWorkout(services)

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByText('맨몸 루틴', { selector: 'strong' }).closest('button')!)
    await user.click(screen.getByRole('button', { name: '맨몸 루틴 시작' }))

    await screen.findByRole('heading', { name: '맨몸 루틴' })
    expect(screen.queryByRole('heading', { name: '초기 작업 중량 확인' })).toBeNull()
  })
})
