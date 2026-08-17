import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import { mockSessions } from '../services/mock/seed'

const toPngMock = vi.hoisted(() => vi.fn(async (_node: HTMLElement, _options?: Record<string, unknown>) => 'data:image/png;base64,dGVzdA=='))
vi.mock('html-to-image', () => ({ toPng: toPngMock }))

const storeKey = 'trainlog:mock-store:v1'
const workoutDraftKey = 'trainlog:workout-draft:v1'

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

function TestHistoryBack() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>테스트 뒤로가기</button>
}

function renderAppWithHistory(initialPath = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={createLocalStorageServices()}>
        <MemoryRouter initialEntries={[initialPath]}>
          <App />
          <TestHistoryBack />
        </MemoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>,
  )
}

function sideNavButton(name: string) {
  return screen.getAllByRole('button', { name })[0]
}

/**
 * The stacked workout layout renders every exercise's card (and its own
 * "1세트 ..." labelled controls) at once, so plain `screen.getByRole` queries
 * for per-set labels are ambiguous once more than one exercise is on screen.
 * Scope to the specific exercise's card by its heading to disambiguate.
 */
function exerciseCard(exerciseName: string) {
  const heading = screen.getByRole('heading', { name: exerciseName })
  const section = heading.closest('section')
  expect(section).not.toBeNull()
  return within(section!)
}

describe.sequential('Trainlog 핵심 사용자 플로우', () => {
  beforeAll(() => {
    localStorage.clear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  test('UF-02~05: 루틴 운동을 기록하고 목표/실제 RIR을 분리해 저장한다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(sideNavButton('운동 시작'))
    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })

    const pullDayCard = screen.getByText('Pull Day', { selector: 'strong' }).closest('button')
    expect(pullDayCard).not.toBeNull()
    await user.click(pullDayCard!)
    await user.click(screen.getByRole('button', { name: 'Pull Day 시작' }))

    await screen.findByRole('heading', { name: 'Pull Day' })
    // Pull Day has three exercises, all visible at once in the stacked
    // layout; scope to the first (체스트 서포티드 시티드 로우 = exercises[0]).
    const firstExercise = exerciseCard('체스트 서포티드 시티드 로우')
    const weightInput = firstExercise.getByRole('spinbutton', { name: '1세트 중량 (kg)' })
    const repsInput = firstExercise.getByRole('spinbutton', { name: '1세트 횟수' })
    await user.clear(weightInput)
    await user.type(weightInput, '62.5')
    await user.clear(repsInput)
    await user.type(repsInput, '9')

    const actualRirGroup = firstExercise.getByRole('group', { name: '1세트 실제 RIR' })
    expect(within(actualRirGroup).getByRole('button', { name: '–' }).className).toContain('is-selected')
    await user.click(within(actualRirGroup).getByRole('button', { name: '5+' }))
    expect(within(actualRirGroup).getByRole('button', { name: '5+' }).className).toContain('is-selected')

    const storedDraft = JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}')
    expect(storedDraft.draft.exercises[0].sets[0]).toMatchObject({
      weightKg: 62.5,
      reps: 9,
      targetRir: 2,
      actualRir: 5,
    })

    await user.click(firstExercise.getByRole('button', { name: '1세트 완료' }))
    expect(firstExercise.getByRole('button', { name: '1세트 완료 취소' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '운동 종료' }))

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    expect(localStorage.getItem(workoutDraftKey)).toBeNull()

    const store = JSON.parse(localStorage.getItem(storeKey) ?? '{}')
    const completedPullDay = store.sessions.findLast((session: { routineName: string; exercises: Array<{ sets: Array<{ weightKg: number }> }> }) =>
      session.routineName === 'Pull Day' && session.exercises[0].sets[0].weightKg === 62.5,
    )
    expect(completedPullDay.status).toBe('completed')
    expect(completedPullDay.exercises[0].sets[0]).toMatchObject({ targetRir: 2, actualRir: 5, isCompleted: true })

    await user.click(sideNavButton('기록'))
    await screen.findByRole('heading', { name: '운동 기록' })
    expect(screen.getAllByText(/실제 RIR 5\+/).length).toBeGreaterThan(0)
  })

  test('UF-01: 대시보드의 전체 보기·관리·목록 행이 해당 상세 화면을 연다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(screen.getByRole('button', { name: '전체 보기' }))
    await screen.findByRole('heading', { name: '운동 기록' })

    await user.click(sideNavButton('대시보드'))
    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(screen.getByRole('button', { name: '관리' }))
    await screen.findByRole('heading', { name: '루틴 관리' })

    await user.click(sideNavButton('대시보드'))
    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    const sessionRows = Array.from(document.querySelectorAll<HTMLButtonElement>('.session-row'))
    expect(sessionRows.length).toBeGreaterThan(1)
    const recentSession = sessionRows.at(-1)!
    expect(recentSession.tagName).toBe('BUTTON')
    // Derive the expectation from the row itself (routine name + month/day) rather than a
    // hardcoded date, so an ordering bug that opens the wrong session is actually caught.
    const recentSessionRoutine = recentSession.querySelector('strong')?.textContent
    const recentSessionDate = recentSession.textContent?.match(/\d+월\s*\d+일/)?.[0]
    expect(recentSessionRoutine).toBeTruthy()
    expect(recentSessionDate).toBeTruthy()
    await user.click(recentSession)
    await screen.findByRole('heading', { name: '운동 기록' })
    const openedHeading = document.querySelector('.record-detail-heading')
    expect(openedHeading?.querySelector('h2')?.textContent).toBe(recentSessionRoutine)
    expect(openedHeading?.querySelector('.eyebrow')?.textContent).toContain(recentSessionDate)

    await user.click(sideNavButton('대시보드'))
    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    const routineRow = Array.from(document.querySelectorAll<HTMLButtonElement>('.routine-row')).at(-1)!
    const routineName = routineRow.querySelector('strong')?.textContent
    expect(routineRow.tagName).toBe('BUTTON')
    await user.click(routineRow)
    await screen.findByRole('heading', { name: '루틴 관리' })
    expect((screen.getByRole('textbox', { name: '루틴 이름' }) as HTMLInputElement).value).toBe(routineName)

    await user.click(sideNavButton('대시보드'))
    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(screen.getByRole('button', { name: '더보기 메뉴' }))
    const moreMenu = screen.getByRole('menu', { name: '더보기' })
    await user.click(within(moreMenu).getByRole('menuitem', { name: '통계' }))
    await screen.findByRole('heading', { name: '주간 통계' })
    expect(document.querySelector('.stats-heading .eyebrow')?.textContent).toBe('STATISTICS')
  })

  test('UF-01: 직접 주소 진입·알 수 없는 주소 정리·히스토리 뒤로가기가 동작한다', async () => {
    const user = userEvent.setup()

    const directRecord = renderApp('/records/session-2026-08-14')
    await screen.findByRole('heading', { name: '운동 기록' })
    expect(document.querySelector('.record-detail-heading .eyebrow')?.textContent).toContain('2026년 8월 14일')
    directRecord.unmount()

    const directRoutine = renderApp('/routines/pull-day')
    await screen.findByRole('heading', { name: '루틴 관리' })
    expect((screen.getByRole('textbox', { name: '루틴 이름' }) as HTMLInputElement).value).toBe('Pull Day')
    directRoutine.unmount()

    // A deleted/mistyped routine id must show not-found, not silently fall
    // back to editing a different routine (Pull Day) under the wrong URL.
    const missingRoutine = renderApp('/routines/not-a-real-routine')
    await screen.findByRole('heading', { name: '루틴을 찾을 수 없어요.' })
    expect(screen.queryByRole('textbox', { name: '루틴 이름' })).toBeNull()
    missingRoutine.unmount()

    // /stats is the real page that shares the value ('stats') the unknown-path
    // fallback used to default to -- confirm the fix didn't collaterally break
    // the genuine case: direct entry to /stats still marks 통계 active in both
    // the sidebar and the bottom nav's 더보기 toggle.
    const directStats = renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })
    expect(sideNavButton('통계').classList.contains('is-active')).toBe(true)
    expect(document.querySelector('.bottom-nav button[aria-haspopup="menu"]')?.classList.contains('is-active')).toBe(true)
    directStats.unmount()

    // An unknown path must render a real not-found screen at the URL the
    // user typed, not silently redirect to the dashboard -- and it must not
    // leave any nav tab (sidebar, bottom nav, 더보기 toggle) marked active,
    // visually or via aria-current, since the app isn't actually on any of
    // those pages.
    const unknownRoute = renderApp('/not-a-real-page')
    await screen.findByRole('heading', { name: '이 페이지를 찾을 수 없어요.' })
    expect(screen.queryByRole('heading', { name: /좋은 하루예요/ })).toBeNull()
    expect(document.querySelector('.placeholder-page code')?.textContent).toBe('/not-a-real-page')
    const unknownRouteNavButtons = document.querySelectorAll('.side-nav-links button, .side-nav-footer button, .bottom-nav > button')
    expect(unknownRouteNavButtons.length).toBeGreaterThan(0)
    unknownRouteNavButtons.forEach((button) => {
      expect(button.classList.contains('is-active')).toBe(false)
      expect(button.hasAttribute('aria-current')).toBe(false)
    })
    unknownRoute.unmount()

    renderAppWithHistory()
    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(screen.getByRole('button', { name: '전체 보기' }))
    await screen.findByRole('heading', { name: '운동 기록' })
    await user.click(screen.getByRole('button', { name: '테스트 뒤로가기' }))
    await screen.findByRole('heading', { name: /좋은 하루예요/ })
  })

  test('UF-07: 저장하지 않은 루틴 편집은 이탈 확인으로 보호한다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(sideNavButton('루틴'))
    await screen.findByRole('heading', { name: '루틴 관리' })

    const nameInput = await screen.findByRole('textbox', { name: '루틴 이름' })
    const originalName = (nameInput as HTMLInputElement).value
    await user.clear(nameInput)
    await user.type(nameInput, '저장 전 변경 루틴')

    const otherRoutineName = originalName === 'Pull Day' ? 'Push Day' : 'Pull Day'
    const otherRoutineButton = screen.getByText(otherRoutineName, { selector: 'strong' }).closest('button')
    expect(otherRoutineButton).not.toBeNull()
    await user.click(otherRoutineButton!)

    const dialog = await screen.findByRole('dialog', { name: '저장하지 않은 변경사항이 있어요.' })
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    expect((screen.getByRole('textbox', { name: '루틴 이름' }) as HTMLInputElement).value).toBe('저장 전 변경 루틴')

    await user.click(otherRoutineButton!)
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '저장하지 않고 나가기' }))
    await waitFor(() => expect((screen.getByRole('textbox', { name: '루틴 이름' }) as HTMLInputElement).value).toBe(otherRoutineName))
  })

  test('UF-06: 새 루틴의 세트 처방과 목표 RIR을 저장하고 운동 시작에서 다시 조회한다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(sideNavButton('루틴'))
    await screen.findByRole('heading', { name: '루틴 관리' })
    await user.click(document.querySelector('.routine-new-button') as HTMLButtonElement)

    const nameInput = screen.getByRole('textbox', { name: '루틴 이름' })
    await user.clear(nameInput)
    await user.type(nameInput, 'E2E 루틴')
    await user.selectOptions(screen.getByLabelText('운동 추가'), 'barbell-bench-press')
    await user.click(screen.getByRole('button', { name: '추가' }))

    const weightInput = screen.getByRole('spinbutton', { name: '1세트 목표 중량' })
    await user.clear(weightInput)
    await user.type(weightInput, '77.5')
    await user.selectOptions(screen.getByRole('combobox', { name: '1세트 목표 RIR' }), '3')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await screen.findByText('루틴을 저장했어요.')
    const store = JSON.parse(localStorage.getItem(storeKey) ?? '{}')
    const savedRoutine = store.routines.find((routine: { name: string }) => routine.name === 'E2E 루틴')
    expect(savedRoutine.exercises[0].sets[0]).toMatchObject({ targetWeightKg: 77.5, targetRir: 3 })

    await user.click(sideNavButton('운동 시작'))
    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    expect(screen.getByText('E2E 루틴', { selector: 'strong' })).toBeTruthy()
  })

  test('UF-08: 기록 RIR 토글과 고정 폭 PNG 저장이 동작한다', async () => {
    const user = userEvent.setup()
    let downloadedFile = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureDownload(this: HTMLAnchorElement) {
      downloadedFile = this.download
    })
    renderApp()

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(sideNavButton('기록'))
    await screen.findByRole('heading', { name: '운동 기록' })

    const toggle = screen.getByRole('checkbox', { name: '실제 RIR 표시' })
    expect((toggle as HTMLInputElement).checked).toBe(true)
    await user.click(toggle)
    expect((toggle as HTMLInputElement).checked).toBe(false)
    expect(document.querySelector('.share-panel .share-card-summary')?.className).toContain('without-rir')

    await user.click(screen.getByRole('button', { name: 'PNG 저장' }))
    await screen.findByText('PNG 이미지를 저장했어요.')
    expect(toPngMock).toHaveBeenCalled()
    expect(toPngMock.mock.calls.at(-1)?.[1]).toMatchObject({ width: 720, skipAutoScale: true })
    expect(downloadedFile).toMatch(/^trainlog-\d{4}-\d{2}-\d{2}\.png$/)
  })

  test('UF-04: 진행 중 운동 초안은 화면 재진입 후 복원되고 명시적 취소 시 삭제된다', async () => {
    const user = userEvent.setup()
    const firstRender = renderApp()

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(sideNavButton('운동 시작'))
    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByText('Push Day', { selector: 'strong' }).closest('button')!)
    await user.click(screen.getByRole('button', { name: 'Push Day 시작' }))
    await screen.findByRole('heading', { name: 'Push Day' })

    // Push Day has two exercises; scope to the first (바벨 벤치프레스 = exercises[0]).
    const firstWeight = exerciseCard('바벨 벤치프레스').getByRole('spinbutton', { name: '1세트 중량 (kg)' })
    await user.clear(firstWeight)
    await user.type(firstWeight, '91')
    await waitFor(() => expect(JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}').draft.exercises[0].sets[0].weightKg).toBe(91))
    const originalStartedAt = JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}').draft.startedAt
    expect(screen.getByLabelText(/운동 시간/)).toBeTruthy()

    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await user.click(sideNavButton('기록'))
    expect(screen.getByRole('heading', { name: 'Push Day' })).toBeTruthy()

    vi.mocked(window.confirm).mockReturnValueOnce(true)
    await user.click(sideNavButton('기록'))
    await screen.findByRole('heading', { name: '운동 기록' })
    const resumeToast = screen.getByRole('button', { name: '진행 중인 운동 이어서 기록하기' })
    expect(resumeToast.textContent).toContain('Push Day 진행 중')
    await user.click(resumeToast)
    await screen.findByRole('heading', { name: 'Push Day' })
    expect((exerciseCard('바벨 벤치프레스').getByRole('spinbutton', { name: '1세트 중량 (kg)' }) as HTMLInputElement).value).toBe('91')
    expect(JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}').draft.startedAt).toBe(originalStartedAt)

    firstRender.unmount()
    renderApp()
    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(sideNavButton('운동 시작'))
    await screen.findByRole('heading', { name: 'Push Day' })
    expect((exerciseCard('바벨 벤치프레스').getByRole('spinbutton', { name: '1세트 중량 (kg)' }) as HTMLInputElement).value).toBe('91')

    await user.click(screen.getByRole('button', { name: '나가기' }))
    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    expect(localStorage.getItem(workoutDraftKey)).toBeNull()
  })

  test('UF-09: 빈 자유 운동은 기록 없이 종료하고, 종목 순서 변경·삭제 후 완료 기록만 저장한다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    await user.click(sideNavButton('운동 시작'))
    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '자유 운동' })
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    const sessionCountBeforeEmptyFinish = (JSON.parse(localStorage.getItem(storeKey) ?? '{}').sessions ?? []).length
    await user.click(screen.getByRole('button', { name: '운동 종료' }))
    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    expect(localStorage.getItem(workoutDraftKey)).toBeNull()
    expect(JSON.parse(localStorage.getItem(storeKey) ?? '{}').sessions ?? []).toHaveLength(sessionCountBeforeEmptyFinish)

    await user.click(sideNavButton('운동 시작'))
    await screen.findByRole('heading', { name: '오늘 어떤 운동을 할까요?' })
    await user.click(screen.getByRole('button', { name: '자유 운동으로 시작' }))
    await screen.findByRole('heading', { name: '첫 운동을 추가해 주세요.' })

    await user.click(screen.getByRole('button', { name: '종목 추가' }))
    await screen.findByRole('dialog', { name: '종목 추가' })
    await user.click(screen.getByRole('button', { name: '바벨 벤치프레스' }))
    await screen.findByRole('heading', { name: '바벨 벤치프레스' })

    await user.click(screen.getByRole('button', { name: '종목 추가' }))
    await screen.findByRole('dialog', { name: '종목 추가' })
    await user.click(screen.getByRole('button', { name: '와이드 그립 랫 풀다운' }))
    await user.click(screen.getByRole('button', { name: '순서 변경' }))
    await screen.findByRole('dialog', { name: '운동 순서 변경' })
    await user.click(screen.getByRole('button', { name: '바벨 벤치프레스 아래로' }))
    await user.click(screen.getByRole('button', { name: '완료' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}').draft.exercises.map((exercise: { exerciseId: string; exerciseOrder: number }) => [exercise.exerciseId, exercise.exerciseOrder])).toEqual([
      ['lat-pulldown', 1],
      ['barbell-bench-press', 2],
    ]))

    // Both exercises are already visible in the stacked layout -- no need to
    // navigate into one first. Scope the delete to 바벨 벤치프레스's own card,
    // since both cards render an identically-labelled "종목 삭제" button.
    await user.click(exerciseCard('바벨 벤치프레스').getByRole('button', { name: '종목 삭제' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: '바벨 벤치프레스' })).toBeNull())
    expect(screen.getByRole('heading', { name: '와이드 그립 랫 풀다운' })).toBeTruthy()

    const savedDraft = JSON.parse(localStorage.getItem(workoutDraftKey) ?? '{}')
    expect(savedDraft.draft).toMatchObject({ routineId: null, routineName: null })
    expect(savedDraft.draft.exercises[0].sets[0].targetRir).toBe(2)
    expect(savedDraft.draft.exercises).toHaveLength(1)
    expect(savedDraft.draft.exercises[0]).toMatchObject({ exerciseId: 'lat-pulldown', exerciseOrder: 1 })

    const expectedPreviousLatPulldownSet = findLastCompletedSet('lat-pulldown')
    expect(expectedPreviousLatPulldownSet).not.toBeNull()
    expect(savedDraft.draft.exercises[0].sets[0].weightKg).toBe(expectedPreviousLatPulldownSet!.weightKg)
    expect(savedDraft.draft.exercises[0].sets[0].reps).toBe(expectedPreviousLatPulldownSet!.reps)

    await user.click(screen.getByRole('button', { name: '1세트 완료' }))
    await user.click(screen.getByRole('button', { name: '운동 종료' }))
    await screen.findByRole('heading', { name: /좋은 하루예요/ })

    const store = JSON.parse(localStorage.getItem(storeKey) ?? '{}')
    const savedSession = store.sessions.findLast((session: { routineId: string | null; exercises: Array<{ exerciseName: string }> }) => session.routineId === null && session.exercises[0]?.exerciseName === '와이드 그립 랫 풀다운')
    expect(savedSession).toMatchObject({ routineId: null, routineName: null, status: 'completed' })

    await user.click(sideNavButton('기록'))
    await screen.findByRole('heading', { name: '운동 기록' })
    expect(screen.getAllByText('자유 운동').length).toBeGreaterThan(0)
  })

  test('하단 내비게이션의 더보기 버튼으로 팝오버를 열고 닫을 수 있다', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: /좋은 하루예요/ })
    // The bottom-nav button (accessible name "더보기") is a distinct element
    // from the top-bar button (accessible name "더보기 메뉴"); the popover it
    // opens is anchored in the top bar, outside this button's own DOM subtree.
    const bottomMoreButton = screen.getByRole('button', { name: '더보기' })

    await user.click(bottomMoreButton)
    await screen.findByRole('menu', { name: '더보기' })

    // Pressing the same button again must close the menu it opened, not
    // leave it stuck open (pointerdown-closes-then-click-reopens regression).
    await user.click(bottomMoreButton)
    await waitFor(() => expect(screen.queryByRole('menu', { name: '더보기' })).toBeNull())
  })
})
