import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

function renderApp(initialPath = '/workout') {
  // staleTime matches the production QueryClient (src/main.tsx: 30_000) so
  // this test actually exercises the staleness window the finding
  // describes. A queryClient with staleTime 0 (as most other test files
  // use) would make every query refetch regardless of whether the
  // `['previous-exercise-session']` cache was invalidated, so it could not tell
  // the fix apart from its absence.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
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

describe('운동 화면: 운동 종료 후 지난 기록 캐시 무효화', () => {
  beforeAll(() => {
    localStorage.clear()
  })

  test('운동을 끝내고 30초 staleTime 이내에 같은 종목을 다시 추가하면 방금 세운 기록이 지난 기록으로 보인다', async () => {
    const user = userEvent.setup()
    renderApp('/workout')

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    // barbell-bench-press has seeded history (80kg range), which primes the
    // `['previous-exercise-session', 'barbell-bench-press']` cache with that old
    // value once added below.
    await user.click(screen.getByRole('button', { name: '종목 추가' }))
    await screen.findByRole('dialog', { name: '종목 추가' })
    await user.click(screen.getByRole('button', { name: '바벨 벤치프레스' }))
    await user.click(screen.getByRole('button', { name: '선택한 1개 추가' }))
    await screen.findByRole('heading', { name: '바벨 벤치프레스' })

    // Record a distinctive new value, distinct from the seeded history, and
    // complete the set so the workout has something to save.
    await user.clear(screen.getByRole('spinbutton', { name: '1세트 중량 (kg)' }))
    await user.type(screen.getByRole('spinbutton', { name: '1세트 중량 (kg)' }), '123')
    await user.clear(screen.getByRole('spinbutton', { name: '1세트 횟수' }))
    await user.type(screen.getByRole('spinbutton', { name: '1세트 횟수' }), '4')
    await user.click(screen.getByRole('button', { name: '1세트 완료' }))

    await user.click(screen.getByRole('button', { name: '운동 종료' }))
    await user.click(screen.getByRole('button', { name: '종료하고 저장' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: '바벨 벤치프레스' })).toBeNull())
    await screen.findByRole('heading', { name: '운동을 완료했어요' })
    await user.click(screen.getByRole('button', { name: '홈으로' }))

    // Immediately (well within the 30s staleTime) start a second workout and
    // re-add the same exercise. "운동 시작" renders twice (sidebar nav-link
    // and the mobile FAB); either navigates to the same place.
    await user.click(screen.getAllByRole('button', { name: '운동 시작' })[0])
    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    await user.click(screen.getByRole('button', { name: '종목 추가' }))
    await screen.findByRole('dialog', { name: '종목 추가' })
    await user.click(screen.getByRole('button', { name: '바벨 벤치프레스' }))
    await user.click(screen.getByRole('button', { name: '선택한 1개 추가' }))
    await screen.findByRole('heading', { name: '바벨 벤치프레스' })

    // The workout finished a moment ago must be reflected as "지난 기록"
    // here -- not the pre-workout seeded value that would otherwise still
    // sit in the unexpired 30s cache.
    await waitFor(() => {
      expect(screen.getByText('이전 1세트 · 본세트 · 123kg × 4회')).toBeTruthy()
    })
  })
})
