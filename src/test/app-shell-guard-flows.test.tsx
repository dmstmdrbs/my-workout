import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import { mockSessions } from '../services/mock/seed'
import { writeStoredWorkoutDraft, type StoredWorkoutDraft } from '../entities/workout'

const confirmSpy = vi.spyOn(window, 'confirm')

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

function HistoryControls() {
  const navigate = useNavigate()
  const location = useLocation()
  return <>
    <button type="button" onClick={() => navigate(-1)}>브라우저 뒤로가기</button>
    <output data-testid="current-path">{location.pathname}</output>
  </>
}

function renderAppWithHistory(entries: string[], initialIndex: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={createLocalStorageServices()}>
        <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
          <App />
          <HistoryControls />
        </MemoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>,
  )
}

const draft: StoredWorkoutDraft = {
  draft: {
    id: 'app-shell-active-draft',
    routineId: null,
    routineName: '진행 중 운동',
    status: 'in_progress',
    startedAt: '2026-09-02T09:00:00.000Z',
    completedAt: null,
    pausedSeconds: 0,
    notes: null,
    exercises: [],
  },
  activeExerciseId: null,
  restEndsAt: null,
  pausedAt: null,
}

describe('앱 셸 이탈 보호와 모바일 고정 UI', () => {
  beforeEach(() => {
    localStorage.clear()
    confirmSpy.mockReset().mockReturnValue(true)
  })

  test('저장하지 않은 루틴에서 메뉴 이동을 취소하거나 승인할 수 있다', async () => {
    const user = userEvent.setup()
    renderApp('/routines/pull-day')
    const name = await screen.findByRole('textbox', { name: '루틴 이름' })
    await user.type(name, ' 수정')

    confirmSpy.mockReturnValue(false)
    await user.click(screen.getAllByRole('button', { name: '대시보드' })[0])
    expect(screen.getByRole('heading', { name: '루틴 관리' })).toBeTruthy()

    confirmSpy.mockReturnValue(true)
    await user.click(screen.getAllByRole('button', { name: '대시보드' })[0])
    expect(await screen.findByRole('heading', { name: /좋은 하루예요/ })).toBeTruthy()
    expect(window.confirm).toHaveBeenCalledTimes(2)
  })

  test('종목 관리 이동도 저장하지 않은 루틴 확인을 거친다', async () => {
    const user = userEvent.setup()
    renderApp('/routines/new')
    const name = await screen.findByRole('textbox', { name: '루틴 이름' })
    await user.type(name, ' 수정')
    await user.click(screen.getByRole('button', { name: '종목 추가' }))

    confirmSpy.mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: '종목 관리로 이동' }))
    expect(screen.getByRole('heading', { name: '루틴 관리' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '종목 추가' }))
    confirmSpy.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '종목 관리로 이동' }))
    expect(await screen.findByRole('heading', { name: '종목 관리' })).toBeTruthy()
  })

  test('진행 중 운동에서 종목 관리 이동도 앱 셸 확인을 거친다', async () => {
    const user = userEvent.setup()
    writeStoredWorkoutDraft(draft)
    renderApp('/workout')
    await user.click(await screen.findByRole('button', { name: '종목 추가' }))
    const picker = await screen.findByRole('dialog', { name: '종목 추가' })
    const search = screen.getByRole('searchbox', { name: '운동 이름 검색' })
    await user.type(search, '벤치')
    const bench = screen.getByRole('button', { name: '바벨 벤치프레스' })
    await user.click(bench)

    confirmSpy.mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: '종목 관리로 이동' }))
    expect(screen.queryByRole('heading', { name: '종목 관리' })).toBeNull()
    expect(picker).toBeTruthy()
    expect((search as HTMLInputElement).value).toBe('벤치')
    expect(bench.getAttribute('aria-pressed')).toBe('true')

    await user.click(screen.getByRole('button', { name: '종목 추가' }))
    confirmSpy.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '종목 관리로 이동' }))
    expect(await screen.findByRole('heading', { name: '종목 관리' })).toBeTruthy()
  })

  test('저장하지 않은 루틴에서 브라우저 뒤로가기도 취소하거나 승인할 수 있다', async () => {
    const user = userEvent.setup()
    renderAppWithHistory(['/', '/routines/pull-day'], 1)
    const name = await screen.findByRole('textbox', { name: '루틴 이름' })
    await user.type(name, ' 수정')

    confirmSpy.mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: '브라우저 뒤로가기' }))
    expect(screen.getByTestId('current-path').textContent).toBe('/routines/pull-day')

    confirmSpy.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '브라우저 뒤로가기' }))
    await waitFor(() => expect(screen.getByTestId('current-path').textContent).toBe('/'))
    expect(await screen.findByRole('heading', { name: /좋은 하루예요/ })).toBeTruthy()
  })

  test('진행 중 초안이 있으면 대시보드 토스트만 모바일 재개 CTA로 노출한다', async () => {
    writeStoredWorkoutDraft(draft)
    renderApp('/')

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    expect(await screen.findByRole('button', { name: '진행 중인 운동 이어서 기록하기' })).toBeTruthy()
    expect(document.querySelector('.mobile-start-fab')).toBeNull()
  })

  test('기록 편집 화면에서는 진행 중 운동 토스트를 숨긴다', async () => {
    writeStoredWorkoutDraft(draft)
    renderApp(`/records/${mockSessions[0].id}/edit/`)

    await waitFor(() => expect(screen.getByRole('heading', { name: '기록 수정' })).toBeTruthy())
    expect(document.querySelector('.active-workout-toast')).toBeNull()
  })
})
