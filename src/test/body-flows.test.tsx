import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import type { AppServices } from '../services'

const storeKey = 'trainlog:mock-store:v1'

/**
 * Wraps the real mock repository but makes `listBodyMeasurements` fail, so
 * the measurements list query settles into an error state. Everything else
 * (auth, saving, etc.) delegates to the real mock so the rest of the screen
 * behaves normally.
 */
function createServicesWithFailingList(): AppServices {
  const base = createLocalStorageServices()
  const workoutRepository = new Proxy(base.workoutRepository, {
    get(target, prop, receiver) {
      if (prop === 'listBodyMeasurements') return () => Promise.reject(new Error('mock list failure'))
      return Reflect.get(target, prop, receiver)
    },
  })
  return { auth: base.auth, workoutRepository }
}

function renderAppWithServices(services: AppServices, initialPath = '/body') {
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

describe.sequential('UF-13: 신체 측정 기록', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  function readMeasurements() {
    return JSON.parse(localStorage.getItem(storeKey) ?? '{}').measurements ?? []
  }

  test('체중만 입력해도 저장되고 목록에 나타난다', async () => {
    const user = userEvent.setup()
    renderApp('/body')

    await screen.findByRole('heading', { name: '신체 기록' })
    const before = readMeasurements().length
    await user.clear(screen.getByRole('spinbutton', { name: '체중 (kg)' }))
    await user.type(screen.getByRole('spinbutton', { name: '체중 (kg)' }), '72.4')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(readMeasurements()).toHaveLength(before + 1))
    const created = readMeasurements().find((item: { weightKg: number }) => item.weightKg === 72.4)
    expect(created).toMatchObject({ weightKg: 72.4, bodyFatPercentage: null })
    expect(await screen.findByText(/72\.4/)).toBeTruthy()
  })

  test('같은 날짜 재입력은 새 행을 만들지 않고 기존 행을 수정한다', async () => {
    const user = userEvent.setup()
    renderApp('/body')

    await screen.findByRole('heading', { name: '신체 기록' })
    const before = readMeasurements().length
    await user.type(screen.getByRole('spinbutton', { name: '체중 (kg)' }), '72.4')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(readMeasurements()).toHaveLength(before + 1))

    await user.type(screen.getByRole('spinbutton', { name: '체지방률 (%)' }), '14.2')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const today = new Date().toISOString().slice(0, 10)
      const record = readMeasurements().find((item: { measuredOn: string }) => item.measuredOn === today)
      expect(record?.bodyFatPercentage).toBe(14.2)
    })
    expect(readMeasurements()).toHaveLength(before + 1)
  })

  test('수치를 하나도 입력하지 않으면 저장하지 않는다', async () => {
    const user = userEvent.setup()
    renderApp('/body')

    await screen.findByRole('heading', { name: '신체 기록' })
    const before = readMeasurements().length
    await user.type(screen.getByRole('textbox', { name: '메모' }), '메모만 있음')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect((await screen.findByRole('alert')).textContent).toContain('하나는 입력해 주세요')
    expect(readMeasurements()).toHaveLength(before)
  })

  test('저장 후 입력 폼이 초기화된다', async () => {
    const user = userEvent.setup()
    renderApp('/body')

    await screen.findByRole('heading', { name: '신체 기록' })
    const before = readMeasurements().length
    const weightInput = screen.getByRole('spinbutton', { name: '체중 (kg)' }) as HTMLInputElement
    const notesInput = screen.getByRole('textbox', { name: '메모' }) as HTMLInputElement
    await user.type(weightInput, '65.5')
    await user.type(notesInput, '아침 공복')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(readMeasurements()).toHaveLength(before + 1))

    // A changed-date-only re-save must not silently copy the previous
    // entry's numbers onto another day, so the form must go back to empty.
    await waitFor(() => expect(weightInput.value).toBe(''))
    expect(notesInput.value).toBe('')
  })

  test('기존 기록을 불러오지 못한 동안에는 저장할 수 없다', async () => {
    const user = userEvent.setup()
    renderAppWithServices(createServicesWithFailingList())

    await screen.findByRole('heading', { name: '신체 기록' })
    await screen.findByText('기록을 불러오지 못했어요.')

    const before = readMeasurements().length
    await user.clear(screen.getByRole('spinbutton', { name: '체중 (kg)' }))
    await user.type(screen.getByRole('spinbutton', { name: '체중 (kg)' }), '80')

    const saveButton = screen.getByRole('button', { name: '저장' }) as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)

    await user.click(saveButton)
    // Disabled buttons don't dispatch click, so this is a no-op either way;
    // the assertion that matters is that nothing was written to the store.
    expect(readMeasurements()).toHaveLength(before)
  })

  test('더보기 메뉴에서 신체 기록으로 이동한다', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(screen.getByRole('button', { name: '더보기 메뉴' }))
    await user.click(within(screen.getByRole('menu', { name: '더보기' })).getByRole('menuitem', { name: '신체 기록' }))

    await screen.findByRole('heading', { name: '신체 기록' })
  })
})
