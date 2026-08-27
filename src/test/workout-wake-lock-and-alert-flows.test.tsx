import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

const workoutDraftKey = 'trainlog:workout-draft:v1'

/**
 * jsdom에는 Wake Lock도 Vibration도 없다. 둘 다 스텁으로 심어, 앱이 실제로
 * 호출하는지와 화면이 가려졌다 돌아왔을 때 다시 거는지를 확인한다.
 */
function stubWakeLock() {
  const released: Array<() => void> = []
  const request = vi.fn(async () => {
    const sentinel = {
      released: false,
      release: vi.fn(async () => { sentinel.released = true }),
      addEventListener: () => {},
    }
    released.push(() => { sentinel.released = true })
    return sentinel
  })
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, writable: true, value: { request } })
  return { request, forceRelease: () => released.forEach((fn) => fn()) }
}

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

async function startFreeWorkout(user: ReturnType<typeof userEvent.setup>) {
  renderApp()
  await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
  await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
  await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })
  await user.click(screen.getByRole('button', { name: '종목 추가' }))
  const sheet = within(await screen.findByRole('dialog', { name: '종목 추가' }))
  await user.click(sheet.getByRole('button', { name: '바벨 벤치프레스' }))
  await user.click(sheet.getByRole('button', { name: '선택한 1개 추가' }))
  await screen.findByRole('heading', { name: '바벨 벤치프레스' })
}

describe.sequential('UF-25: 운동 중 화면 켜 두기와 휴식 알림', () => {
  beforeEach(() => {
    localStorage.removeItem(workoutDraftKey)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('운동을 시작하면 화면 잠금을 걸고, 화면이 돌아오면 다시 건다', async () => {
    const wakeLock = stubWakeLock()
    const user = userEvent.setup()
    await startFreeWorkout(user)

    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledWith('screen'))
    const callsAfterStart = wakeLock.request.mock.calls.length

    // 탭이 가려지면 브라우저가 잠금을 강제로 푼다. 돌아왔을 때 다시 걸지
    // 않으면 다른 앱 다녀온 뒤 화면이 도로 꺼진다.
    wakeLock.forceRelease()
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    await waitFor(() => expect(wakeLock.request.mock.calls.length).toBeGreaterThan(callsAfterStart))
  })

  test('휴식이 끝나면 진동으로 알린다', async () => {
    stubWakeLock()
    const vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { configurable: true, writable: true, value: vibrate })

    // 러너의 1초 시계를 앞으로 감아야 하므로, userEvent 대신 fireEvent와
    // fake timers를 쓴다(workout-pause-flows와 같은 이유).
    // shouldAdvanceTime을 켜야 findBy/waitFor가 fake timers 아래에서도 진행한다.
    vi.useFakeTimers({ now: Date.now(), shouldAdvanceTime: true })

    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: '자유 운동으로 시작' }))
    fireEvent.click(await screen.findByRole('button', { name: '종목 추가' }))
    const sheet = within(await screen.findByRole('dialog', { name: '종목 추가' }))
    fireEvent.click(sheet.getByRole('button', { name: '바벨 벤치프레스' }))
    fireEvent.click(sheet.getByRole('button', { name: '선택한 1개 추가' }))

    fireEvent.click(await screen.findByRole('button', { name: '1세트 완료' }))
    expect(vibrate).not.toHaveBeenCalled()

    // 기본 휴식 120초를 넘긴다. 러너의 시계가 한 번 더 돌면 종료를 감지한다.
    await act(async () => { await vi.advanceTimersByTimeAsync(130_000) })

    expect(vibrate).toHaveBeenCalled()
  })
})
