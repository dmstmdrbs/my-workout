import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import type { AppServices, WorkoutRepository } from '../services'
import { mockSessions } from '../services/mock/seed'
import { recordsPageSize } from '../features/records/Records'

function renderAppWithServices(services: AppServices, initialPath = '/') {
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

function renderApp(initialPath = '/') {
  return renderAppWithServices(createLocalStorageServices(), initialPath)
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

  test('첫 페이지에 있는 세션으로 직접 진입하면 단건 조회 폴백을 부르지 않는다', async () => {
    // session-2026-08-14 is the newest session in the store (the synthetic
    // sessions above are all dated in July or earlier), so it is always on
    // page 1. The fallback single-session query must never fire for it --
    // this can only be shown by observing the repository call, not by
    // asserting on rendered output, since the UI looks identical either way.
    const services = createLocalStorageServices()
    const originalGetSession = services.workoutRepository.getSession.bind(services.workoutRepository)
    const getSessionSpy = vi.fn(originalGetSession)
    services.workoutRepository.getSession = getSessionSpy

    renderAppWithServices(services, '/records/session-2026-08-14')
    await screen.findByRole('heading', { name: '운동 기록' })
    await waitFor(() => {
      expect(document.querySelector('.record-detail-heading .eyebrow')?.textContent).toContain('2026년 8월 14일')
    })

    expect(getSessionSpy).not.toHaveBeenCalled()
  })

  test('단건 조회 폴백이 실패하면 다른 세션을 대신 보여주지 않고 오류를 표시하며, 다시 시도는 그 조회만 다시 부른다', async () => {
    const sessionNotOnFirstPage = extraSessionIds.at(-1)
    expect(sessionNotOnFirstPage).toBeTruthy()

    const services = createLocalStorageServices()
    const getSessionSpy = vi.fn<WorkoutRepository['getSession']>(() => Promise.reject(new Error('network down')))
    services.workoutRepository.getSession = getSessionSpy

    renderAppWithServices(services, `/records/${sessionNotOnFirstPage}`)

    await screen.findByRole('heading', { name: '운동 기록을 불러오지 못했어요.' })
    // Must not silently fall back to rendering some other session's detail.
    expect(screen.queryByRole('heading', { name: '운동 기록' })).toBeNull()
    expect(document.querySelector('.record-detail-heading')).toBeNull()
    expect(getSessionSpy).toHaveBeenCalledTimes(1)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(getSessionSpy).toHaveBeenCalledTimes(2))
  })

  test('다음 페이지 조회가 실패해도 이미 불러온 목록은 그대로 유지되고, 감시 요소 옆에 인라인 오류와 다시 시도가 뜬다', async () => {
    const services = createLocalStorageServices()
    const originalListSessions = services.workoutRepository.listSessions.bind(services.workoutRepository)
    let nextPageCallCount = 0
    const listSessionsSpy = vi.fn<WorkoutRepository['listSessions']>((options) => {
      if (options?.startedBefore) {
        nextPageCallCount += 1
        return Promise.reject(new Error('page 2 network error'))
      }
      return originalListSessions(options)
    })
    services.workoutRepository.listSessions = listSessionsSpy

    renderAppWithServices(services, '/records')
    await screen.findByRole('heading', { name: '운동 기록' })
    await waitFor(() => {
      expect(document.querySelectorAll('.record-list-item').length).toBe(recordsPageSize)
    })

    triggerIntersection()

    await screen.findByText('다음 페이지를 불러오지 못했어요.')
    expect(nextPageCallCount).toBe(1)
    // The already-loaded list, detail panel and share panel must survive --
    // a next-page failure must not be treated like an initial-load failure.
    expect(document.querySelectorAll('.record-list-item').length).toBe(recordsPageSize)
    expect(screen.queryByRole('heading', { name: '운동 기록을 불러오지 못했어요.' })).toBeNull()
    expect(document.querySelector('.record-detail-heading')).not.toBeNull()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy()
  })
})
