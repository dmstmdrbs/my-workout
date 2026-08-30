import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import type { AppServices } from '../services'

const workoutDraftKey = 'trainlog:workout-draft:v1'

/**
 * Wraps the real mock repository but makes `getLastCompletedSetForExercise`
 * reject, so the runner's previous-record lookup genuinely fails at the
 * repository layer (not simulated via component state). Everything else
 * delegates to the real mock so adding an exercise still works normally.
 */
function createServicesWithFailingLookup(): AppServices {
  const base = createLocalStorageServices()
  const workoutRepository = new Proxy(base.workoutRepository, {
    get(target, prop, receiver) {
      if (prop === 'getLastCompletedSetForExercise') return () => Promise.reject(new Error('mock lookup failure'))
      return Reflect.get(target, prop, receiver)
    },
  })
  return { auth: base.auth, workoutRepository, socialRepository: base.socialRepository }
}

function renderAppWithServices(services: AppServices, initialPath = '/workout') {
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

describe.sequential('운동 화면: 지난 기록 조회 실패 내성', () => {
  beforeAll(() => {
    localStorage.clear()
  })

  test('지난 기록 조회가 실패해도 종목은 빈 세트로 추가된다', async () => {
    const user = userEvent.setup()
    renderAppWithServices(createServicesWithFailingLookup())

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    // barbell-bench-press has real seeded history (80kg x 6 in mockSessions),
    // so this only proves resilience if the lookup genuinely runs and fails.
    await user.click(screen.getByRole('button', { name: '종목 추가' }))
    await screen.findByRole('dialog', { name: '종목 추가' })
    await user.click(screen.getByRole('button', { name: '바벨 벤치프레스' }))
    await user.click(screen.getByRole('button', { name: '선택한 1개 추가' }))
    await screen.findByRole('heading', { name: '바벨 벤치프레스' })

    const draft = JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}')
    expect(draft.draft.exercises).toHaveLength(1)
    expect(draft.draft.exercises[0]).toMatchObject({ exerciseId: 'barbell-bench-press' })
    expect(draft.draft.exercises[0].sets[0].weightKg).toBeNull()
    expect(draft.draft.exercises[0].sets[0].reps).toBeNull()

    expect(screen.getByText('기록 없음')).toBeTruthy()
  })
})
