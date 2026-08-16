import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import { applyTheme, readMirroredTheme, themeStorageKey } from '../lib/theme'

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

// Both tests below sign in through a fresh mock service instance; the mock
// store's `signedIn` flag is a module-level variable that survives across
// tests within this file (see localStorageServices.ts's inMemoryStore), so a
// plain `localStorage.clear()` does not reset it. Signing in before every
// test, the way signout-flows.test.tsx does, keeps the two tests
// order-independent.
describe.sequential('테마·세션 동기화', () => {
  beforeEach(async () => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await createLocalStorageServices().auth.signInWithGoogle()
  })

  test('미러와 다른 DB 테마가 로드 후 화면에 반영된다', async () => {
    // Seed the DB (not the mirror) with 'dark' by driving it through the
    // repository, the way a settings save on another device would. This
    // never touches the localStorage mirror.
    await createLocalStorageServices().workoutRepository.updateSettings({ theme: 'dark' })

    // Simulate main.tsx's pre-render paint on a device/browser that never
    // learned about the DB's 'dark' value (new device, cleared storage,
    // private window): the mirror still says 'system'.
    expect(readMirroredTheme()).toBe('system')
    applyTheme(readMirroredTheme())
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()

    renderApp('/')
    await screen.findByRole('heading', { name: /좋은 하루예요/ })

    // Once settings load, the DB value ('dark') must win and repaint the app.
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))
    await waitFor(() => expect(localStorage.getItem(themeStorageKey)).toBe('dark'))
  })

  test('로그아웃하면 테마 미러가 이전 계정 값을 남기지 않는다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await screen.findByRole('heading', { name: '설정' })
    await user.click(screen.getByRole('radio', { name: '다크' }))
    await waitFor(() => expect(localStorage.getItem(themeStorageKey)).toBe('dark'))

    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    await screen.findByRole('heading', { name: '나의 트레이닝을 이어가세요.' })

    // The next account to sign in on this device must start neutral, not
    // inherit account A's dark theme.
    expect(localStorage.getItem(themeStorageKey)).toBe('system')
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })
})
