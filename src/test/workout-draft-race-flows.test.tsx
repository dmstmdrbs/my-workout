import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

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

describe.sequential('운동 초안 동시성', () => {
  afterEach(() => {
    localStorage.removeItem(workoutDraftKey)
  })

  test('선택 화면을 연 사이 다른 탭에서 만들어진 초안을 시작 시 복원한다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })

    const externalDraft = {
      draft: {
        id: 'tab-b-draft',
        routineId: null,
        routineName: '탭 B에서 만든 운동',
        status: 'in_progress',
        startedAt: '2026-08-30T09:00:00.000Z',
        completedAt: null,
        pausedSeconds: 12,
        notes: '외부 탭 초안',
        exercises: [],
      },
      activeExerciseId: 'tab-b-exercise',
      restEndsAt: Date.now() + 60_000,
      pausedAt: Date.now() - 5_000,
    }
    localStorage.setItem(workoutDraftKey, JSON.stringify(externalDraft))

    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))

    expect(await screen.findByRole('heading', { name: '탭 B에서 만든 운동' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}')).toMatchObject(externalDraft)
  })
})
