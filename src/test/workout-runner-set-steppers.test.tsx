import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
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
  beforeEach(() => {
    localStorage.clear()
  })

  test('이전 완료 세션은 종목 요약에만 표시하고 중량 입력 아래에는 반복하지 않는다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await user.click(screen.getByRole('button', { name: '종목 추가' }))
    await screen.findByRole('dialog', { name: '종목 추가' })
    await user.click(screen.getByRole('button', { name: '바벨 벤치프레스' }))
    await user.click(screen.getByRole('button', { name: '선택한 1개 추가' }))

    const card = within((await screen.findByRole('heading', { name: '바벨 벤치프레스' })).closest('section')!)
    expect(card.getByText('이전 완료 세션')).toBeTruthy()
    expect(card.queryByText(/이전 1세트/)).toBeNull()
    expect(card.getByText('1', { selector: '.set-number-marker' })).toBeTruthy()
    expect(card.getByText('1세트 본세트', { selector: '.set-number-a11y' })).toBeTruthy()
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
    await user.click(screen.getByRole('button', { name: '선택한 1개 추가' }))
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

    expect(screen.getByRole('combobox', { name: '1세트 실제 RIR 선택' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '휴식 시간 10초 늘리기' }))
    const restTimer = within(screen.getByRole('article', { name: '휴식 타이머' }))
    expect(restTimer.getByText('00:10')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '휴식 시간 10초 줄이기' }))
    expect(restTimer.getByText('00:00')).toBeTruthy()
  })
})
