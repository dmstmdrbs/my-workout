import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

const storeKey = 'trainlog:mock-store:v1'
const workoutDraftKey = 'trainlog:workout-draft:v1'

function renderApp(initialPath = '/workout') {
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

async function openPickerSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '종목 추가' }))
  return within(await screen.findByRole('dialog', { name: '종목 추가' }))
}

describe.sequential('운동 화면: 종목 추가 시트 검색·필터·즉석 생성', () => {
  beforeAll(() => {
    localStorage.clear()
  })

  // Each test below starts its own free workout without ever finishing it,
  // so a leftover in-progress draft from a previous test would otherwise
  // make the next `renderApp()` resume straight into that workout instead
  // of showing the routine picker.
  beforeEach(() => {
    localStorage.removeItem(workoutDraftKey)
  })

  test('이름 검색은 목록을 좁힌다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    const sheet = await openPickerSheet(user)
    // Before typing, every seeded exercise is visible.
    expect(sheet.getByRole('button', { name: '바벨 벤치프레스' })).toBeTruthy()
    expect(sheet.getByRole('button', { name: '레그 프레스' })).toBeTruthy()

    await user.type(sheet.getByRole('searchbox', { name: '운동 이름 검색' }), '벤치')
    expect(sheet.getByRole('button', { name: '바벨 벤치프레스' })).toBeTruthy()
    expect(sheet.queryByRole('button', { name: '레그 프레스' })).toBeNull()
    expect(sheet.queryByRole('button', { name: '와이드 그립 랫 풀다운' })).toBeNull()
  })

  test('부위 필터는 목록을 좁힌다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    const sheet = await openPickerSheet(user)
    await user.click(sheet.getByRole('button', { name: '등' }))

    // 등(back) 종목만 남고, 가슴 종목은 사라진다.
    expect(sheet.getByRole('button', { name: '체스트 서포티드 시티드 로우' })).toBeTruthy()
    expect(sheet.getByRole('button', { name: '와이드 그립 랫 풀다운' })).toBeTruthy()
    expect(sheet.getByRole('button', { name: '원 암 덤벨 로우' })).toBeTruthy()
    expect(sheet.queryByRole('button', { name: '바벨 벤치프레스' })).toBeNull()
    expect(sheet.queryByRole('button', { name: '레그 프레스' })).toBeNull()
  })

  test('장비 필터는 목록을 좁힌다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    const sheet = await openPickerSheet(user)
    await user.selectOptions(sheet.getByRole('combobox', { name: '장비로 필터' }), 'dumbbell')

    expect(sheet.getByRole('button', { name: '원 암 덤벨 로우' })).toBeTruthy()
    expect(sheet.queryByRole('button', { name: '바벨 벤치프레스' })).toBeNull()
    expect(sheet.queryByRole('button', { name: '레그 프레스' })).toBeNull()
    expect(sheet.queryByRole('button', { name: '이지바 컬' })).toBeNull()
  })

  test('여러 종목은 필터를 바꿔도 선택 순서가 유지되고 한 번에 추가된다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    const sheet = await openPickerSheet(user)
    await user.click(sheet.getByRole('button', { name: '바벨 벤치프레스' }))
    expect(sheet.getByRole('button', { name: '바벨 벤치프레스' }).getAttribute('aria-pressed')).toBe('true')

    await user.click(sheet.getByRole('button', { name: '등' }))
    await user.click(sheet.getByRole('button', { name: '와이드 그립 랫 풀다운' }))
    await user.click(sheet.getByRole('button', { name: '전체' }))
    await user.click(sheet.getByRole('button', { name: '레그 프레스' }))

    const selectedOrder = within(sheet.getByRole('list', { name: '선택한 운동 순서' }))
    expect(selectedOrder.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '1바벨 벤치프레스',
      '2와이드 그립 랫 풀다운',
      '3레그 프레스',
    ])

    await user.click(sheet.getByRole('button', { name: '선택한 3개 추가' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '종목 추가' })).toBeNull())
    await waitFor(() => {
      const draft = JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}')
      expect(draft.draft.exercises.map((exercise: { exerciseId: string; exerciseOrder: number }) => [exercise.exerciseId, exercise.exerciseOrder])).toEqual([
        ['barbell-bench-press', 1],
        ['lat-pulldown', 2],
        ['leg-press', 3],
      ])
    })
  })

  test('검색 조건에 맞는 운동이 없으면 새로 만들라는 안내가 보인다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    const sheet = await openPickerSheet(user)
    await user.type(sheet.getByRole('searchbox', { name: '운동 이름 검색' }), '존재하지않는운동이름')
    expect(sheet.getByText('조건에 맞는 운동이 없어요. 새로 만들어 보세요.')).toBeTruthy()
  })

  test('새 운동을 만들면 운동 카탈로그와 진행 중인 운동에 즉시 반영된다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    await openPickerSheet(user)
    await user.click(screen.getByRole('button', { name: '새 운동 만들기' }))
    const createDialog = within(await screen.findByRole('dialog', { name: '새 운동 만들기' }))

    await user.type(createDialog.getByRole('textbox', { name: '새 운동 이름' }), '인클라인 스미스 프레스')
    await user.selectOptions(createDialog.getByRole('combobox', { name: '새 운동 주요 부위' }), 'chest')
    await user.selectOptions(createDialog.getByRole('combobox', { name: '새 운동 장비' }), 'machine')
    await user.click(createDialog.getByRole('button', { name: '만들고 추가' }))

    // Added straight to the in-progress workout without having to find it in
    // the list again.
    await screen.findByRole('heading', { name: '인클라인 스미스 프레스' })
    // Both overlays close once the exercise is created and added.
    expect(screen.queryByRole('dialog')).toBeNull()

    const draft = JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}')
    expect(draft.draft.exercises.some((exercise: { exerciseName: string }) => exercise.exerciseName === '인클라인 스미스 프레스')).toBe(true)

    // The catalog itself (not just the workout draft) now has the exercise.
    const catalog = JSON.parse(localStorage.getItem(storeKey) ?? '{}').exercises as Array<{ name: string; primaryMuscle: string; equipment: string }>
    const savedExercise = catalog.find((exercise) => exercise.name === '인클라인 스미스 프레스')
    expect(savedExercise).toMatchObject({ primaryMuscle: 'chest', equipment: 'machine' })

    // Reopening the picker shows the new exercise too -- the catalog query
    // was actually invalidated, not just mutated behind the scenes.
    const sheet = await openPickerSheet(user)
    expect(sheet.getByRole('button', { name: '인클라인 스미스 프레스' })).toBeTruthy()
  })

  test('맨몸(bodyweight) 종목의 중량 입력란은 추가 중량으로 표시되고 비워 두어도 정상이다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    await openPickerSheet(user)
    await user.click(screen.getByRole('button', { name: '새 운동 만들기' }))
    const createDialog = within(await screen.findByRole('dialog', { name: '새 운동 만들기' }))

    await user.type(createDialog.getByRole('textbox', { name: '새 운동 이름' }), '푸시업')
    await user.selectOptions(createDialog.getByRole('combobox', { name: '새 운동 장비' }), 'bodyweight')
    await user.click(createDialog.getByRole('button', { name: '만들고 추가' }))

    const card = within((await screen.findByRole('heading', { name: '푸시업' })).closest('section')!)
    // The bodyweight label depends on the catalog query (invalidated, not
    // set synchronously) actually including the exercise just created, so
    // assert through `waitFor` rather than a synchronous `getByRole` --
    // otherwise this only proves correct behavior on mock-adapter timing.
    const weightInput = await waitFor(() => card.getByRole('spinbutton', { name: '1세트 추가 중량 (kg)' })) as HTMLInputElement
    // Empty is the normal state for a pure bodyweight set, not missing data --
    // the placeholder communicates that instead of leaving a blank, ambiguous box.
    expect(weightInput.value).toBe('')
    expect(weightInput.placeholder).toBe('맨몸')
  })
})

describe.sequential('운동 화면: 종목 추가 시트 위에 뜨는 새 운동 만들기 다이얼로그', () => {
  beforeAll(() => {
    localStorage.clear()
  })

  // Each test below starts its own free workout without ever finishing it,
  // so a leftover in-progress draft from a previous test would otherwise
  // make the next `renderApp()` resume straight into that workout instead
  // of showing the routine picker.
  beforeEach(() => {
    localStorage.removeItem(workoutDraftKey)
  })

  test('새 운동 만들기를 취소해도 아래 시트는 계속 정상 동작한다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    await openPickerSheet(user)
    await user.click(screen.getByRole('button', { name: '새 운동 만들기' }))
    await screen.findByRole('dialog', { name: '새 운동 만들기' })

    // Both layers are simultaneously present and addressable.
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '새 운동 만들기' })).toBeNull())

    // The sheet underneath is still open and its own controls still work --
    // this is the part a "does the dialog open" test alone would miss.
    const sheet = within(screen.getByRole('dialog', { name: '종목 추가' }))
    await user.type(sheet.getByRole('searchbox', { name: '운동 이름 검색' }), '랫')
    expect(sheet.getByRole('button', { name: '와이드 그립 랫 풀다운' })).toBeTruthy()
    expect(sheet.queryByRole('button', { name: '바벨 벤치프레스' })).toBeNull()

    await user.click(sheet.getByRole('button', { name: '와이드 그립 랫 풀다운' }))
    await user.click(sheet.getByRole('button', { name: '선택한 1개 추가' }))
    // 시트는 종목 이름만 보여주지만(브랜드는 배지로 따로), 기록에 들어갈 때는
    // 브랜드를 합친 이름으로 복사된다.
    await screen.findByRole('heading', { name: '노틸러스 와이드 그립 랫 풀다운' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('Escape는 위에 열린 레이어부터 하나씩 닫는다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    await openPickerSheet(user)
    await user.click(screen.getByRole('button', { name: '새 운동 만들기' }))
    await screen.findByRole('dialog', { name: '새 운동 만들기' })
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(2)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '새 운동 만들기' })).toBeNull())
    expect(screen.getByRole('dialog', { name: '종목 추가' })).toBeTruthy()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe.sequential('운동 화면: 종목 추가 시트는 열려 있는 동안 부모가 다시 렌더링돼도 포커스를 지킨다', () => {
  beforeAll(() => {
    localStorage.clear()
  })

  test('경과 시간을 갱신하는 1초 간격 타이머가 한 번 돌아도 부위 필터의 포커스가 유지된다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    const sheet = await openPickerSheet(user)
    const muscleFilterButton = sheet.getByRole('button', { name: '등' })

    // Move focus off the sheet's own initial-focus target (the search box)
    // onto a control that isn't it. The initial-focus target would trivially
    // "stay" focused even if the mount effect re-ran, since re-running it
    // re-focuses that very same element -- this control is the one that
    // actually exposes the bug.
    act(() => { muscleFilterButton.focus() })
    expect(document.activeElement).toBe(muscleFilterButton)

    // WorkoutRunner runs `setInterval(() => setClock(Date.now()), 1_000)` for
    // as long as a draft exists -- exactly the state the sheet can be open
    // in -- to drive the "운동 시간" display. That is the real trigger this
    // regresses against, so wait for it to actually fire once in real time
    // rather than forcing an arbitrary re-render. (Vitest fake timers were
    // not usable here: this project's `@testing-library/dom` only
    // auto-advances Jest's fake timers, so faking `setInterval` would also
    // stall every `findBy`/`waitFor` call used throughout this file.)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100))
    })

    expect(document.activeElement).toBe(muscleFilterButton)
  })
})
