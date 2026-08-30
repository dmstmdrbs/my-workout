import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

const storeKey = 'trainlog:mock-store:v1'
const workoutDraftKey = 'trainlog:workout-draft:v1'

function renderApp(initialPath = '/exercises') {
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

function readExercises(): Array<{ id: string; userId: string | null; name: string; brand: string | null; isArchived: boolean }> {
  return JSON.parse(localStorage.getItem(storeKey) ?? '{}').exercises ?? []
}

describe.sequential('UF-23: 종목 관리와 브랜드', () => {
  beforeEach(() => {
    localStorage.removeItem(workoutDraftKey)
  })

  test('브랜드가 있는 종목은 목록에서 배지로 구분된다', async () => {
    renderApp()

    // 제목은 조회와 무관하게 바로 뜨므로 목록 항목이 나타날 때까지 기다린다.
    const latPulldown = (await screen.findByText('와이드 그립 랫 풀다운')).closest('button')!
    const card = latPulldown.closest('section')!
    // 시드의 랫 풀다운은 노틸러스, 바벨 벤치프레스는 브랜드가 없다.
    expect(latPulldown.textContent).toContain('노틸러스')

    const bench = within(card).getByText('바벨 벤치프레스').closest('button')!
    expect(bench.textContent).not.toContain('노틸러스')
  })

  test('브랜드 필터는 그 브랜드의 종목만 남긴다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByText('와이드 그립 랫 풀다운')
    await user.selectOptions(screen.getByRole('combobox', { name: '브랜드로 필터' }), 'nautilus')

    expect(screen.getByText('와이드 그립 랫 풀다운')).toBeTruthy()
    expect(screen.queryByText('바벨 벤치프레스')).toBeNull()

    // "브랜드 없음"은 반대쪽만 남긴다.
    await user.selectOptions(screen.getByRole('combobox', { name: '브랜드로 필터' }), 'none')
    expect(screen.getByText('바벨 벤치프레스')).toBeTruthy()
    expect(screen.queryByText('와이드 그립 랫 풀다운')).toBeNull()
  })

  test('종목을 수정하면 저장되고, 보관하면 목록에서 보관함으로 옮겨간다', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: '레그 프레스 수정' }))

    const dialog = within(await screen.findByRole('dialog', { name: '종목 수정' }))
    await user.selectOptions(dialog.getByRole('combobox', { name: '종목 브랜드' }), 'hammer_strength')
    await user.click(dialog.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(readExercises().find((item) => item.id === 'leg-press')).toMatchObject({
        userId: 'local-user',
        brand: 'hammer_strength',
      })
    })

    await user.click(screen.getByRole('button', { name: '레그 프레스 보관' }))
    await waitFor(() => expect(readExercises().find((item) => item.id === 'leg-press')?.isArchived).toBe(true))
    await waitFor(() => expect(screen.queryByText('레그 프레스')).toBeNull())

    await user.click(screen.getByRole('button', { name: /보관함 보기/ }))
    expect(await screen.findByText('레그 프레스')).toBeTruthy()
  })

  test('보관한 종목은 운동 화면의 종목 추가 시트에 나오지 않는다', async () => {
    const user = userEvent.setup()
    renderApp('/workout')

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })
    await user.click(screen.getByRole('button', { name: '종목 추가' }))

    const sheet = within(await screen.findByRole('dialog', { name: '종목 추가' }))
    // 앞 테스트에서 보관한 종목이다. mock 저장소는 파일 안에서 이어진다.
    expect(sheet.queryByRole('button', { name: '레그 프레스' })).toBeNull()
    expect(sheet.getByRole('button', { name: '바벨 벤치프레스' })).toBeTruthy()
  })
})
