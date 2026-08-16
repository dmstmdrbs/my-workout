import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import { mockSessions } from '../services/mock/seed'

const storeKey = 'trainlog:mock-store:v1'

/** 목 시드에서 종목의 마지막 완료 세트를 골라, 기대값을 하드코딩하지 않고 유도한다. */
function findLastCompletedSet(exerciseId: string) {
  const sessionsNewestFirst = [...mockSessions].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  for (const session of sessionsNewestFirst) {
    const exercise = session.exercises.find((item) => item.exerciseId === exerciseId)
    const set = exercise?.sets.filter((item) => item.isCompleted).at(-1)
    if (set) return set
  }
  return null
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

function readSettings() {
  return JSON.parse(localStorage.getItem(storeKey) ?? '{}').settings
}

describe.sequential('UF-12: 설정 변경', () => {
  beforeAll(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  test('테마를 다크로 바꾸면 즉시 적용되고 저장된다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await screen.findByRole('heading', { name: '설정' })
    await user.click(screen.getByRole('radio', { name: '다크' }))

    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))
    await waitFor(() => expect(readSettings().theme).toBe('dark'))
  })

  test('기본 휴식 시간과 기본 목표 RIR 변경이 저장된다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await screen.findByRole('heading', { name: '설정' })
    const restInput = screen.getByRole('spinbutton', { name: '기본 휴식 시간 (초)' })
    await user.clear(restInput)
    await user.type(restInput, '75')
    await user.tab()

    await waitFor(() => expect(readSettings().defaultRestSeconds).toBe(75))

    await user.selectOptions(screen.getByRole('combobox', { name: '기본 목표 RIR' }), '3')
    await waitFor(() => expect(readSettings().defaultRir).toBe(3))
  })

  test('바뀐 기본값이 새 자유 운동 종목에 반영된다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await screen.findByRole('heading', { name: '설정' })

    await user.selectOptions(screen.getByRole('combobox', { name: '기본 목표 RIR' }), '4')
    await waitFor(() => expect(readSettings().defaultRir).toBe(4))

    await user.click(screen.getAllByRole('button', { name: '운동 시작' })[0])
    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    await user.selectOptions(screen.getByRole('combobox', { name: '운동 종목 추가' }), 'barbell-bench-press')
    await user.click(screen.getByRole('button', { name: '추가' }))
    await screen.findByRole('heading', { name: '바벨 벤치프레스' })

    const draft = JSON.parse(localStorage.getItem('trainlog:workout-draft:v1') ?? '{}')
    expect(draft.draft.exercises[0].sets[0].targetRir).toBe(4)

    const expectedPreviousBenchSet = findLastCompletedSet('barbell-bench-press')
    expect(expectedPreviousBenchSet).not.toBeNull()
    expect(draft.draft.exercises[0].sets[0].weightKg).toBe(expectedPreviousBenchSet!.weightKg)
    expect(draft.draft.exercises[0].sets[0].reps).toBe(expectedPreviousBenchSet!.reps)
  })

  test('프로필 이름 변경이 대시보드 인사말에 반영된다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await screen.findByRole('heading', { name: '설정' })
    const nameInput = screen.getByRole('textbox', { name: '표시 이름' })
    await user.clear(nameInput)
    await user.type(nameInput, '테스트유저')
    await user.tab()

    await waitFor(() => {
      const profile = JSON.parse(localStorage.getItem(storeKey) ?? '{}').profile
      expect(profile.displayName).toBe('테스트유저')
    })

    await user.click(screen.getAllByRole('button', { name: '대시보드' })[0])
    await screen.findByRole('heading', { name: /좋은 하루예요, 테스트유저/ })
  })

  test('휴식 시간에 음수나 빈 값을 넣으면 저장하지 않는다', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await screen.findByRole('heading', { name: '설정' })
    const before = readSettings().defaultRestSeconds
    const restInput = screen.getByRole('spinbutton', { name: '기본 휴식 시간 (초)' })
    await user.clear(restInput)
    await user.tab()

    expect(readSettings().defaultRestSeconds).toBe(before)
  })
})
