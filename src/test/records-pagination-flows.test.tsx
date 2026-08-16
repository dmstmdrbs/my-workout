import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import { mockSessions } from '../services/mock/seed'
import { recordsPageSize } from '../features/records/Records'

function renderApp(initialPath = '/') {
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

interface MockIntersectionObserverInstance {
  callback: IntersectionObserverCallback
}

function latestObserver() {
  return (globalThis.IntersectionObserver as unknown as { instances: MockIntersectionObserverInstance[] }).instances.at(-1)
}

function triggerIntersection() {
  const observer = latestObserver()
  expect(observer).toBeTruthy()
  observer!.callback([{ isIntersecting: true } as IntersectionObserverEntry], observer as unknown as IntersectionObserver)
}

describe.sequential('기록 화면 무한 스크롤', () => {
  // The mock seed only ships 3 completed sessions -- far fewer than one page.
  // Create just enough extra completed sessions to exceed a single page by 1,
  // deriving the count from the exported page size rather than a hardcoded
  // number, so this test keeps meaning if the page size ever changes.
  const sessionsNeeded = recordsPageSize + 1 - mockSessions.length
  const extraSessionIds: string[] = []

  beforeAll(async () => {
    localStorage.clear()
    const repo = createLocalStorageServices().workoutRepository
    const baseDate = new Date('2026-07-01T09:00:00.000Z')
    for (let index = 0; index < sessionsNeeded; index += 1) {
      const startedAt = new Date(baseDate.getTime() - index * 24 * 60 * 60 * 1000).toISOString()
      const completedAt = new Date(new Date(startedAt).getTime() + 40 * 60 * 1000).toISOString()
      const saved = await repo.saveSession({
        routineId: null,
        routineName: '페이지네이션 테스트',
        status: 'completed',
        startedAt,
        completedAt,
        notes: null,
        exercises: [],
      })
      extraSessionIds.push(saved.id)
    }
  })

  test('처음에는 페이지 크기만큼만 렌더되고, 관찰자 교차 시 다음 페이지가 이어붙으며, 마지막 페이지 이후로는 더 부르지 않는다', async () => {
    renderApp('/records')
    await screen.findByRole('heading', { name: '운동 기록' })

    await waitFor(() => {
      expect(document.querySelectorAll('.record-list-item').length).toBe(recordsPageSize)
    })

    const totalSessions = mockSessions.length + extraSessionIds.length
    expect(totalSessions).toBeGreaterThan(recordsPageSize)

    triggerIntersection()

    await waitFor(() => {
      expect(document.querySelectorAll('.record-list-item').length).toBe(totalSessions)
    })
    await screen.findByText('모든 기록을 불러왔어요.')

    // hasNextPage is now false; intersecting again must not fetch further or
    // change the rendered count.
    const settledCount = document.querySelectorAll('.record-list-item').length
    triggerIntersection()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(document.querySelectorAll('.record-list-item').length).toBe(settledCount)
  })

  test('첫 페이지에 없는 세션 주소로 직접 진입해도 상세가 열린다', async () => {
    const sessionNotOnFirstPage = extraSessionIds.at(-1)
    expect(sessionNotOnFirstPage).toBeTruthy()

    renderApp(`/records/${sessionNotOnFirstPage}`)
    await screen.findByRole('heading', { name: '운동 기록' })

    await waitFor(() => {
      expect(document.querySelector('.record-detail-heading h2')?.textContent).toBe('페이지네이션 테스트')
    })
  })
})
