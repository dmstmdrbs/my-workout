import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

const storeKey = 'trainlog:mock-store:v1'

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

describe.sequential('UF-12: 로그아웃', () => {
  beforeAll(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  // Both tests below end by signing out, and the mock store's `signedIn` flag
  // is a module-level variable that survives across tests within this file
  // (see file header comment) — a plain `beforeEach` localStorage.clear()
  // does not reset it. Whichever test runs second would otherwise start
  // stranded on the sign-in screen. Signing back in here, before every test,
  // makes the two tests order-independent.
  beforeEach(async () => {
    await createLocalStorageServices().auth.signInWithGoogle()
  })

  test('로그아웃하면 로그인 화면으로 돌아간다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await screen.findByRole('heading', { name: '설정' })
    await user.click(screen.getByRole('button', { name: '로그아웃' }))

    await screen.findByRole('heading', { name: '나의 트레이닝을 이어가세요.' })
    expect(JSON.parse(localStorage.getItem(storeKey) ?? '{}').signedIn).toBe(false)
  })

  test('진행 중 초안이 있으면 안내하고 초안을 제거한다', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(screen.getAllByRole('button', { name: '운동 시작' })[0])
    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    await user.click(screen.getByRole('button', { name: '종목 추가' }))
    await screen.findByRole('dialog', { name: '종목 추가' })
    await user.click(screen.getByRole('button', { name: '바벨 벤치프레스' }))
    await user.click(screen.getByRole('button', { name: '선택한 1개 추가' }))
    await waitFor(() => expect(localStorage.getItem('trainlog:workout-draft:v1')).not.toBeNull())

    await user.click(screen.getAllByRole('button', { name: '설정' })[0])
    await screen.findByRole('heading', { name: '설정' })
    await user.click(screen.getByRole('button', { name: '로그아웃' }))

    await screen.findByRole('heading', { name: '나의 트레이닝을 이어가세요.' })
    expect(localStorage.getItem('trainlog:workout-draft:v1')).toBeNull()
    expect(vi.mocked(window.confirm).mock.calls.at(-1)?.[0]).toContain('진행 중인 운동')
  })
})
