import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

const storeKey = 'trainlog:mock-store:v1'

function renderApp(initialPath = '/friends') {
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

function readStore() {
  return JSON.parse(localStorage.getItem(storeKey) ?? '{}') as {
    profile?: { displayName?: string }
    socialProfiles?: Array<{ userId: string; displayName: string }>
    friendships?: Array<{ requesterId: string; addresseeId: string; status: string }>
  }
}

describe.sequential('친구 MVP 사용자 흐름', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    deleteNavigatorProperty('share')
    deleteNavigatorProperty('clipboard')
  })

  test('친구 화면에서 친구, 받은 요청, 보낸 요청, 초대 영역을 볼 수 있다', async () => {
    renderApp()

    expect(await screen.findByRole('heading', { name: '친구', level: 1 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /친구 1/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /받은 요청 1/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /보낸 요청 1/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '친구 초대' })).toBeTruthy()
    expect(screen.getByText('김서준')).toBeTruthy()
    expect(screen.getByText('박지우')).toBeTruthy()
    expect(screen.getByText('이도윤')).toBeTruthy()
  })

  test('받은 요청을 수락하면 요청 상대가 친구 목록으로 이동한다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '친구', level: 1 })
    await user.click(screen.getByRole('button', { name: '수락' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: /친구 2/ })).toBeTruthy())
    expect(screen.getByText('박지우')).toBeTruthy()
    expect(readStore().friendships?.some((friendship) => friendship.requesterId === 'local-friend-incoming' && friendship.status === 'accepted')).toBe(true)
  })

  test('활성 초대가 없으면 링크 만들기 후 clipboard fallback을 사용한다', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    defineNavigatorProperty('share', undefined)
    defineNavigatorProperty('clipboard', { writeText })

    renderApp()
    await screen.findByRole('heading', { name: '친구', level: 1 })
    await user.click(screen.getByRole('button', { name: '초대 링크 만들기' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0]?.[0]).toMatch(/\/friends\/invite\//)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(readStore().friendships).toBeTruthy()
  })

  test('초대 상대를 확인한 뒤 친구 요청을 보내면 대기 상태가 된다', async () => {
    const user = userEvent.setup()
    renderApp('/friends/invite/mock-invite-local-owner')

    expect(await screen.findByRole('heading', { name: '친구 초대가 도착했어요' })).toBeTruthy()
    expect(screen.getByText(/최하린님과/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '친구 요청 보내기' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: '친구 요청을 보냈어요' })).toBeTruthy())
    expect(readStore().friendships?.some((friendship) => friendship.requesterId === 'local-user' && friendship.addresseeId === 'local-invite-owner' && friendship.status === 'pending')).toBe(true)
  })

  test('프로필 이름을 저장하면 친구 화면의 내 프로필과 저장소에 반영된다', async () => {
    const user = userEvent.setup()
    renderApp('/profile')

    expect(await screen.findByRole('heading', { name: '프로필', level: 1 })).toBeTruthy()
    const input = screen.getByRole('textbox', { name: '표시 이름' })
    await user.clear(input)
    await user.type(input, '  새 운동러  ')
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }))

    await waitFor(() => expect(readStore().profile?.displayName).toBe('새 운동러'))
    expect(readStore().socialProfiles?.find((profile) => profile.userId === 'local-user')?.displayName).toBe('새 운동러')

    await user.click(screen.getByRole('button', { name: /친구 화면/ }))
    expect(await screen.findByRole('heading', { name: '친구', level: 1 })).toBeTruthy()
    expect(screen.getByRole('button', { name: /내 프로필/ })).toBeTruthy()
  })
})

function defineNavigatorProperty(key: 'share' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, key, { configurable: true, writable: true, value })
}

function deleteNavigatorProperty(key: 'share' | 'clipboard') {
  try { delete (navigator as unknown as Record<string, unknown>)[key] } catch { /* jsdom may expose a non-configurable property */ }
}
