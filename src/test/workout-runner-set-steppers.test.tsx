import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

const workoutDraftKey = 'trainlog:workout-draft:v1'

function renderApp(initialPath = '/workout') {
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

function readFirstSet() {
  return JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}').draft.exercises[0].sets[0]
}

describe.sequential('운동 화면: 세트 중량/횟수 증감 버튼', () => {
  beforeAll(() => {
    localStorage.clear()
  })

  test('중량과 횟수는 각각 2.5kg, 1회 단위로 증감하고 0 아래로 내려가지 않는다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    // leg-press (레그 프레스) has no seeded completion history, so it is added
    // with a genuinely empty (null) weight and reps -- the case that matters
    // for the "increment from empty" rule below.
    await user.click(screen.getByRole('button', { name: '종목 추가' }))
    await screen.findByRole('dialog', { name: '종목 추가' })
    await user.click(screen.getByRole('button', { name: '레그 프레스' }))
    const card = within((await screen.findByRole('heading', { name: '레그 프레스' })).closest('section')!)

    const weightInput = card.getByRole('spinbutton', { name: '1세트 중량 (kg)' }) as HTMLInputElement
    const repsInput = card.getByRole('spinbutton', { name: '1세트 횟수' }) as HTMLInputElement
    expect(weightInput.value).toBe('')
    expect(repsInput.value).toBe('')

    // A null value incremented once lands on exactly one step (treated as an
    // empty 0 baseline), rather than staying empty or producing NaN.
    await user.click(card.getByRole('button', { name: '1세트 중량 2.5kg 증가' }))
    await waitFor(() => expect(readFirstSet().weightKg).toBe(2.5))
    expect(weightInput.value).toBe('2.5')

    await user.click(card.getByRole('button', { name: '1세트 중량 2.5kg 증가' }))
    await waitFor(() => expect(readFirstSet().weightKg).toBe(5))

    await user.click(card.getByRole('button', { name: '1세트 중량 2.5kg 감소' }))
    await waitFor(() => expect(readFirstSet().weightKg).toBe(2.5))
    await user.click(card.getByRole('button', { name: '1세트 중량 2.5kg 감소' }))
    await waitFor(() => expect(readFirstSet().weightKg).toBe(0))
    // Floor is 0: decrementing further must not go negative.
    await user.click(card.getByRole('button', { name: '1세트 중량 2.5kg 감소' }))
    await waitFor(() => expect(readFirstSet().weightKg).toBe(0))

    await user.click(card.getByRole('button', { name: '1세트 횟수 1 증가' }))
    await waitFor(() => expect(readFirstSet().reps).toBe(1))
    await user.click(card.getByRole('button', { name: '1세트 횟수 1 증가' }))
    await waitFor(() => expect(readFirstSet().reps).toBe(2))
    await user.click(card.getByRole('button', { name: '1세트 횟수 1 감소' }))
    await user.click(card.getByRole('button', { name: '1세트 횟수 1 감소' }))
    await waitFor(() => expect(readFirstSet().reps).toBe(0))
    // Floor is 0 for reps too.
    await user.click(card.getByRole('button', { name: '1세트 횟수 1 감소' }))
    await waitFor(() => expect(readFirstSet().reps).toBe(0))
  })
})
