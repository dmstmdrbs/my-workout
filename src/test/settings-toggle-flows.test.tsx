import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

const storeKey = 'trainlog:mock-store:v1'
const workoutDraftKey = 'trainlog:workout-draft:v1'

function renderApp(initialPath: string) {
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

function readSettings() {
  return JSON.parse(localStorage.getItem(storeKey) ?? '{}').settings ?? {}
}

describe.sequential('UF-26: 실제 RIR 입력 끄기', () => {
  beforeEach(() => {
    localStorage.removeItem(workoutDraftKey)
  })

  test('설정 토글이 저장되고, 끄면 운동 화면에서 실제 RIR을 묻지 않는다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    const toggle = await screen.findByRole('switch', { name: '실제 RIR 입력' })
    expect((toggle as HTMLInputElement).checked).toBe(true)
    await user.click(toggle)
    await waitFor(() => expect(readSettings().rirInputEnabled).toBe(false))

    // 같은 설정으로 운동 화면을 열면 실제 RIR 선택지가 사라진다.
    renderApp('/workout')
    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await user.click(await screen.findByRole('button', { name: '종목 추가' }))
    const sheet = within(await screen.findByRole('dialog', { name: '종목 추가' }))
    await user.click(sheet.getByRole('button', { name: '바벨 벤치프레스' }))
    await screen.findByRole('heading', { name: '바벨 벤치프레스' })

    expect(screen.queryByRole('group', { name: '1세트 실제 RIR' })).toBeNull()
    // 목표 RIR은 그대로 보여준다 -- 끈 것은 입력이지 처방이 아니다.
    expect(screen.getByRole('button', { name: '1세트 완료' })).toBeTruthy()
  })

  test('화면 켜 두기 토글도 저장된다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    const toggle = await screen.findByRole('switch', { name: '운동 중 화면 켜 두기' })
    const before = (toggle as HTMLInputElement).checked
    await user.click(toggle)
    await waitFor(() => expect(readSettings().keepScreenAwake).toBe(!before))
  })
})
