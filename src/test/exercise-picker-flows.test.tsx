import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
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
    await user.selectOptions(sheet.getByRole('combobox', { name: '부위로 필터' }), 'back')

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
    const weightInput = card.getByRole('spinbutton', { name: '1세트 추가 중량 (kg)' }) as HTMLInputElement
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
    expect(screen.getAllByRole('dialog')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '새 운동 만들기' })).toBeNull())

    // The sheet underneath is still open and its own controls still work --
    // this is the part a "does the dialog open" test alone would miss.
    const sheet = within(screen.getByRole('dialog', { name: '종목 추가' }))
    await user.type(sheet.getByRole('searchbox', { name: '운동 이름 검색' }), '랫')
    expect(sheet.getByRole('button', { name: '와이드 그립 랫 풀다운' })).toBeTruthy()
    expect(sheet.queryByRole('button', { name: '바벨 벤치프레스' })).toBeNull()

    await user.click(sheet.getByRole('button', { name: '와이드 그립 랫 풀다운' }))
    await screen.findByRole('heading', { name: '와이드 그립 랫 풀다운' })
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
    expect(screen.getAllByRole('dialog')).toHaveLength(2)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '새 운동 만들기' })).toBeNull())
    expect(screen.getByRole('dialog', { name: '종목 추가' })).toBeTruthy()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
