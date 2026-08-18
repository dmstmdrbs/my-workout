import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import { workoutDraftStorageKey } from '../features/workout/activeWorkoutDraft'

/**
 * 시드 세션은 2026-08-14 / 08-12 / 08-11로 고정돼 있다. "마지막 수행" 문구는
 * 오늘이 언제인지에 따라 달라지므로 시스템 시각을 고정해야 값이 안정된다.
 */
const TODAY = new Date(2026, 7, 18, 12, 0)

function renderWorkoutScreen() {
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

describe.sequential('UF-21: 루틴 선택 화면', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(TODAY)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    // 진행 중 초안이 남아 있으면 선택 화면 대신 러너가 뜬다.
    localStorage.removeItem(workoutDraftStorageKey)
  })

  test('루틴 카드가 종목 미리보기와 마지막 수행일을 보여준다', async () => {
    renderWorkoutScreen()

    const pullDay = (await screen.findByText('Pull Day')).closest('button')!
    // 세 종목까지만 미리 보여준다. Pull Day는 정확히 셋이라 "외 N개"가 붙지 않는다.
    expect(pullDay.textContent).toContain('체스트 서포티드 시티드 로우 · 와이드 그립 랫 풀다운 · 이지바 컬')
    expect(pullDay.textContent).not.toContain('외 ')
    // Pull Day 세션은 08-14와 08-11 둘인데, 최신인 08-14 기준이어야 한다.
    expect(pullDay.textContent).toContain('마지막 수행 4일 전')

    const pushDay = (await screen.findByText('Push Day')).closest('button')!
    expect(pushDay.textContent).toContain('마지막 수행 6일 전')
  })

  test('한 번도 수행하지 않은 루틴에는 마지막 수행을 표시하지 않는다', async () => {
    const services = createLocalStorageServices()
    await services.workoutRepository.saveRoutine({
      name: '아직 안 한 루틴',
      description: null,
      color: null,
      exercises: [],
    })

    renderWorkoutScreen()

    const fresh = (await screen.findByText('아직 안 한 루틴')).closest('button')!
    expect(fresh.textContent).not.toContain('마지막 수행')
  })
})
