import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

function renderRoutines() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={createLocalStorageServices()}>
        <MemoryRouter initialEntries={['/routines/new']}>
          <App />
        </MemoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>,
  )
}

describe.sequential('UF-22: 루틴 편집에서 종목 추가', () => {
  beforeAll(() => {
    localStorage.clear()
  })

  test('시트에서 검색해 고른 종목이 루틴에 추가된다', async () => {
    const user = userEvent.setup()
    renderRoutines()

    await user.click(await screen.findByRole('button', { name: '종목 추가' }))
    const sheet = within(await screen.findByRole('dialog', { name: '종목 추가' }))

    await user.type(sheet.getByRole('searchbox', { name: '운동 이름 검색' }), '벤치')
    expect(sheet.queryByRole('button', { name: '레그 프레스' })).toBeNull()
    await user.click(sheet.getByRole('button', { name: '바벨 벤치프레스' }))

    // 시트가 닫히고 종목이 세트 표와 함께 들어온다.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '종목 추가' })).toBeNull())
    expect(screen.getByRole('spinbutton', { name: '1세트 목표 중량' })).toBeTruthy()
    expect(screen.getByText('1개 종목 · 1세트')).toBeTruthy()
  })

  test('시트 위에서 새 종목을 만들면 곧바로 루틴에 들어간다', async () => {
    const user = userEvent.setup()
    renderRoutines()

    await user.click(await screen.findByRole('button', { name: '종목 추가' }))
    // 시트 위에 만들기 대화상자가 겹쳐 뜬다 -- 중첩 레이어가 성립해야 한다.
    await user.click(screen.getByRole('button', { name: '새 운동 만들기' }))
    const dialog = within(await screen.findByRole('dialog', { name: '새 운동 만들기' }))
    expect(screen.getByRole('dialog', { name: '종목 추가' })).toBeTruthy()

    await user.type(dialog.getByRole('textbox', { name: '새 운동 이름' }), '케이블 크런치')
    await user.click(dialog.getByRole('button', { name: '만들고 추가' }))

    // 두 레이어가 모두 닫히고, 만든 종목이 루틴에 들어와 있다.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '새 운동 만들기' })).toBeNull())
    expect(screen.queryByRole('dialog', { name: '종목 추가' })).toBeNull()
    expect(await screen.findByText('케이블 크런치')).toBeTruthy()
  })
})
