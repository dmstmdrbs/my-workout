import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import type { WorkoutDraft } from '../features/workout/activeWorkoutDraft'

const workoutDraftKey = 'trainlog:workout-draft:v1'

function renderApp() {
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

function exerciseCard(name: string) {
  return within(screen.getByRole('heading', { name }).closest('section')!)
}

function readDraft(): WorkoutDraft {
  return JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}').draft
}

async function startFreeWorkoutWithBench(user: ReturnType<typeof userEvent.setup>) {
  renderApp()
  await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
  await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
  await user.click(screen.getByRole('button', { name: '종목 추가' }))
  const picker = within(await screen.findByRole('dialog', { name: '종목 추가' }))
  await user.click(picker.getByRole('button', { name: '바벨 벤치프레스' }))
  await user.click(picker.getByRole('button', { name: '선택한 1개 추가' }))
  await screen.findByRole('heading', { name: '바벨 벤치프레스' })
}

describe.sequential('운동 화면: 진행 중 종목 교체', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('경과 시간과 일시정지를 한쪽 제어 그룹에 함께 둔다', async () => {
    const user = userEvent.setup()
    await startFreeWorkoutWithBench(user)

    const runtimeControls = within(screen.getByRole('group', { name: '타이머 제어' }))
    expect(runtimeControls.getByLabelText(/^운동 시간/)).toBeTruthy()
    expect(runtimeControls.getByRole('button', { name: '운동 일시정지' })).toBeTruthy()
  })

  test('같은 기록 타입으로 교체하면 입력값과 완료 상태를 그대로 유지한다', async () => {
    const user = userEvent.setup()
    await startFreeWorkoutWithBench(user)
    const bench = exerciseCard('바벨 벤치프레스')
    const weight = bench.getByRole('spinbutton', { name: '1세트 중량 (kg)' })
    const reps = bench.getByRole('spinbutton', { name: '1세트 횟수' })
    await user.clear(weight)
    await user.type(weight, '87.5')
    await user.clear(reps)
    await user.type(reps, '9')
    await user.selectOptions(bench.getByRole('combobox', { name: '1세트 실제 RIR 선택' }), '1')
    await user.click(bench.getByRole('button', { name: '1세트 완료' }))
    await waitFor(() => expect(readDraft().exercises[0].sets[0].isCompleted).toBe(true))
    const before = readDraft().exercises[0]

    await user.click(bench.getByRole('button', { name: '종목 교체' }))
    const picker = within(await screen.findByRole('dialog', { name: '종목 교체' }))
    await user.click(picker.getByRole('button', { name: '플랫 체스트 프레스 머신' }))

    const replaced = exerciseCard('플랫 체스트 프레스 머신')
    expect((replaced.getByRole('spinbutton', { name: '1세트 중량 (kg)' }) as HTMLInputElement).value).toBe('87.5')
    expect((replaced.getByRole('spinbutton', { name: '1세트 횟수' }) as HTMLInputElement).value).toBe('9')
    expect((replaced.getByRole('combobox', { name: '1세트 실제 RIR 선택' }) as HTMLSelectElement).value).toBe('1')
    expect(replaced.getByRole('button', { name: '1세트 완료 취소' })).toBeTruthy()
    await waitFor(() => expect(readDraft().exercises[0].exerciseId).toBe('flat-chest-press-machine'))
    const after = readDraft().exercises[0]
    expect(after.id).toBe(before.id)
    expect(after.sets[0].id).toBe(before.sets[0].id)
    expect(after.sets[0]).toMatchObject({ weightKg: 87.5, reps: 9, actualRir: 1, isCompleted: true })
  })

  test('근력 종목을 유산소로 바꿀 때 확인 전에는 유지하고 승인 후 빈 세트로 초기화한다', async () => {
    const user = userEvent.setup()
    await startFreeWorkoutWithBench(user)
    const bench = exerciseCard('바벨 벤치프레스')
    await user.click(bench.getByRole('button', { name: '1세트 완료' }))

    await user.click(bench.getByRole('button', { name: '종목 교체' }))
    await user.click(within(await screen.findByRole('dialog', { name: '종목 교체' })).getByRole('button', { name: '러닝' }))
    const warning = within(await screen.findByRole('dialog', { name: '입력 형식이 달라요' }))
    expect(screen.getByRole('heading', { name: '바벨 벤치프레스' })).toBeTruthy()
    expect(warning.getByText(/기존 세트의 입력값과 완료 상태가 모두 초기화/)).toBeTruthy()
    await user.click(warning.getByRole('button', { name: '취소' }))
    expect(exerciseCard('바벨 벤치프레스').getByRole('button', { name: '1세트 완료 취소' })).toBeTruthy()

    await user.click(exerciseCard('바벨 벤치프레스').getByRole('button', { name: '종목 교체' }))
    await user.click(within(await screen.findByRole('dialog', { name: '종목 교체' })).getByRole('button', { name: '러닝' }))
    await user.click(within(await screen.findByRole('dialog', { name: '입력 형식이 달라요' })).getByRole('button', { name: '초기화하고 교체' }))

    const running = exerciseCard('러닝')
    expect((running.getByRole('spinbutton', { name: '1세트 시간 (분)' }) as HTMLInputElement).value).toBe('')
    expect((running.getByRole('spinbutton', { name: '1세트 거리 (km)' }) as HTMLInputElement).value).toBe('')
    expect(running.getByRole('button', { name: '1세트 완료' })).toBeTruthy()
    await waitFor(() => expect(readDraft().exercises[0].exerciseId).toBe('running'))
    expect(readDraft().exercises[0].sets).toHaveLength(1)
    expect(readDraft().exercises[0].sets[0]).toMatchObject({
      weightKg: null,
      reps: null,
      durationSeconds: null,
      distanceKm: null,
      actualRir: null,
      isCompleted: false,
    })
  })
})
