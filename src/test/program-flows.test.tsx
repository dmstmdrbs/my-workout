import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import App from '../App'
import {
  buildBusyFullBodyProgram,
  buildOfficeUpperFourDayProgram,
  buildPlateauBreakProgram,
  trainingProgramCatalog,
} from '../features/programs/programTemplate'
import { getDateInTimeZone } from '../lib/localDate'
import { AppServicesProvider, createLocalStorageServices } from '../services'

function renderApp(initialPath = '/programs') {
  const services = createLocalStorageServices()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={services}>
        <MemoryRouter initialEntries={[initialPath]}>
          <App />
        </MemoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>,
  )
  return services
}

describe.sequential('UF-25: 고정 7일 프로그램 회차', () => {
  beforeAll(() => {
    localStorage.clear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  test('템플릿은 시작일을 Day 1로 삼고 휴식일을 포함한 56일을 만든다', () => {
    const input = buildPlateauBreakProgram('2026-08-25')
    expect(input.days).toHaveLength(56)
    expect(input.days[0]).toMatchObject({ dayNumber: 1, dayType: 'strength', title: '상체 강도' })
    expect(input.days[2]).toMatchObject({ dayNumber: 3, dayType: 'rest', title: '휴식일' })
    expect(input.days[6]).toMatchObject({ dayNumber: 7, dayType: 'rest', title: '휴식일' })
    expect(trainingProgramCatalog).toHaveLength(4)
    expect(trainingProgramCatalog.every((program) => program.build('2026-08-25').days.length === 56)).toBe(true)
  })

  test('직장인 상체 중심 프로그램은 4주마다 종목을 바꾸고 피로 제거 주차를 적용한다', () => {
    const input = buildOfficeUpperFourDayProgram('2026-08-25')
    expect(input).toMatchObject({
      programKey: 'office-upper-three-lower-cardio-four-day',
      programName: '8주 직장인 상체 3일 + 하체·유산소',
      durationWeeks: 8,
    })
    expect(input.days).toHaveLength(56)
    expect(input.days.slice(0, 7).map((day) => day.title)).toEqual(['상체 A', '상체 B', '휴식일', '하체 + Zone 2', '휴식일', '상체 C', '휴식일'])
    expect(input.days[3].routineSnapshot?.exercises.at(-1)).toMatchObject({ exerciseName: '러닝', notes: expect.stringContaining('경사 트레드밀') })
    expect(input.days[3].routineSnapshot?.exercises.at(-1)?.sets[0]).toMatchObject({ targetRepsMin: null, targetRepsMax: null, notes: 'Zone 2 20-30분' })
    expect(input.days[21].routineSnapshot?.exercises[0].sets).toHaveLength(2)
    expect(input.days[21].routineSnapshot?.exercises[0].sets[0].targetRir).toBe(4)
    expect(input.days[28]).toMatchObject({ title: '상체 A2' })
    expect(input.days[28].routineSnapshot?.exercises[0].exerciseName).toBe('인클라인 덤벨 프레스')
    expect(input.days[52].routineSnapshot?.exercises.at(-1)?.sets[0].notes).toBe('Zone 2 25-35분')
  })

  test('근거 보완 템플릿은 회복 주차와 전신 근육별 최소 볼륨을 실제 처방에 반영한다', () => {
    const plateau = buildPlateauBreakProgram('2026-11-02')
    const weekOneUpper = plateau.days[0].routineSnapshot!
    const weekFourUpper = plateau.days[21].routineSnapshot!
    const weekEightUpper = plateau.days[49].routineSnapshot!
    const totalSets = (snapshot: typeof weekOneUpper) => snapshot.exercises.reduce((sum, item) => sum + item.sets.length, 0)

    expect(totalSets(weekFourUpper)).toBeLessThanOrEqual(Math.ceil(totalSets(weekOneUpper) * 0.67))
    expect(totalSets(weekEightUpper)).toBe(totalSets(weekFourUpper))
    expect(weekFourUpper.exercises.flatMap((item) => item.sets).every((set) => set.targetRir === null || set.targetRir === 4)).toBe(true)

    const busy = buildBusyFullBodyProgram('2026-11-02')
    const firstWeekExercises = busy.days.slice(0, 7).flatMap((day) => day.routineSnapshot?.exercises ?? [])
    const setsFor = (...names: string[]) => firstWeekExercises
      .filter((item) => names.includes(item.exerciseName))
      .reduce((sum, item) => sum + item.sets.length, 0)
    expect(setsFor('바벨 벤치프레스', '플랫 체스트 프레스 머신', '인클라인 덤벨 프레스')).toBe(9)
    expect(setsFor('스쿼트', '레그 프레스', '레그 익스텐션')).toBe(8)
    expect(setsFor('루마니안 데드리프트', '레그 컬')).toBe(7)
    expect(setsFor('스탠딩 카프 레이즈')).toBe(4)

    const office = buildOfficeUpperFourDayProgram('2026-11-02')
    const secondBlockLower = office.days[31].routineSnapshot!
    expect(secondBlockLower.exercises.map((item) => item.exerciseName)).toEqual(expect.arrayContaining(['스쿼트', '루마니안 데드리프트', '레그 컬']))
    expect(secondBlockLower.exercises.find((item) => item.exerciseName === '루마니안 데드리프트')?.sets).toHaveLength(3)
  })

  test('프로그램 카탈로그에서 다른 프로그램의 Day와 종목을 확인할 수 있다', async () => {
    const user = userEvent.setup()
    renderApp()

    const programTabs = await screen.findByRole('tablist', { name: '프로그램 메뉴' })
    expect(within(programTabs).getByRole('tab', { name: /내 프로그램/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('heading', { name: '프로그램을 골라 내 루틴으로' })).toBeNull()
    await user.click(within(programTabs).getByRole('tab', { name: /둘러보기/ }))
    await screen.findByRole('heading', { name: '프로그램을 골라 내 루틴으로' })
    expect(within(programTabs).getByRole('tab', { name: /둘러보기/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('button', { name: /8주 2분할 \+ 러닝 정체기 돌파/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /8주 상체 특화 4일/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /8주 직장인 상체 3일 \+ 하체·유산소/ })).toBeTruthy()
    const search = screen.getByRole('searchbox', { name: '프로그램 검색' })
    await user.type(search, '바쁜 주간')
    await waitFor(() => expect(screen.queryByRole('button', { name: /8주 2분할 \+ 러닝 정체기 돌파/ })).toBeNull())
    expect(screen.getByRole('status').textContent).toBe('1개 찾음')
    await user.click(screen.getByRole('button', { name: /8주 바쁜 주간 전신 3일/ }))

    const detailSheet = await screen.findByRole('dialog', { name: '8주 바쁜 주간 전신 3일' })
    expect(within(detailSheet).getByRole('button', { name: '프로그램 상세 닫기' })).toBeTruthy()
    expect(within(detailSheet).getByText('스쿼트')).toBeTruthy()
    expect(within(detailSheet).getByText('바벨 벤치프레스')).toBeTruthy()
    expect(within(detailSheet).getAllByText('전신 A').length).toBeGreaterThan(0)
    const dayTabs = within(detailSheet).getByRole('tablist', { name: '1주차 Day 선택' })
    const firstWeekDays = within(dayTabs).getAllByRole('tab')
    expect(firstWeekDays).toHaveLength(7)
    expect(firstWeekDays[0].getAttribute('aria-selected')).toBe('true')
    expect(detailSheet.querySelectorAll('.program-template-day')).toHaveLength(1)
    await user.click(firstWeekDays[1])
    expect(firstWeekDays[0].getAttribute('aria-selected')).toBe('false')
    expect(firstWeekDays[1].getAttribute('aria-selected')).toBe('true')
    expect(detailSheet.querySelectorAll('.program-template-day')).toHaveLength(1)
  })

  test('시작, Day 1 기록 저장, 중도 하차와 새 회차 재시작이 기록을 보존한다', async () => {
    const user = userEvent.setup()
    const services = renderApp()
    const today = getDateInTimeZone('Asia/Seoul')

    await user.click(await screen.findByRole('tab', { name: /둘러보기/ }))
    await screen.findByRole('heading', { name: '프로그램을 골라 내 루틴으로' })
    await user.click(screen.getByRole('button', { name: /8주 2분할 \+ 러닝 정체기 돌파/ }))
    const detailSheet = await screen.findByRole('dialog', { name: '8주 2분할 + 러닝 정체기 돌파' })
    const startDate = within(detailSheet).getByLabelText('시작일')
    fireEvent.change(startDate, { target: { value: today } })
    await user.click(within(detailSheet).getByRole('button', { name: '프로그램 시작하기 · 내 루틴에 가져오기' }))

    const maxDialog = await screen.findByRole('dialog', { name: '프로그램 기준 1RM' })
    await user.type(within(maxDialog).getByRole('spinbutton', { name: '바벨 벤치프레스 1RM' }), '115')
    await user.type(within(maxDialog).getByRole('spinbutton', { name: '바벨 오버헤드 프레스 1RM' }), '75')
    await user.type(within(maxDialog).getByRole('spinbutton', { name: '스쿼트 1RM' }), '155')
    await user.type(within(maxDialog).getByRole('spinbutton', { name: '루마니안 데드리프트 1RM' }), '140')
    await user.click(within(maxDialog).getByRole('button', { name: '저장하고 프로그램 시작' }))

    await screen.findByRole('heading', { name: '상체 강도' })
    const activeWorkspace = document.querySelector('.program-active-workspace')
    expect(activeWorkspace?.children).toHaveLength(2)
    expect(activeWorkspace?.firstElementChild?.classList.contains('program-now-grid')).toBe(true)
    expect(activeWorkspace?.lastElementChild?.classList.contains('program-week-section')).toBe(true)
    const personalizedRun = await services.workoutRepository.getActiveProgramRun()
    expect(personalizedRun?.days[0].routineSnapshot?.exercises[0].sets[0].targetWeightKg).toBe(92.5)
    await user.click(screen.getAllByRole('button', { name: '운동 시작' })[0])
    const programRoutine = await screen.findByRole('button', { name: /PROGRAM DAY 1.*상체 강도/ })
    await user.click(programRoutine)
    await screen.findByRole('heading', { name: '상체 강도' })
    const starter = document.querySelector<HTMLElement>('.program-day-starter')
    expect(starter).not.toBeNull()
    await user.click(within(starter!).getByRole('button', { name: '운동 시작' }))

    await screen.findByRole('heading', { name: 'Day 1 · 상체 강도' })
    const benchHeading = screen.getByRole('heading', { name: '바벨 벤치프레스' })
    const benchCard = benchHeading.closest('section')
    expect(benchCard).not.toBeNull()
    await user.click(within(benchCard!).getByRole('button', { name: '1세트 완료' }))
    await user.click(screen.getByRole('button', { name: '운동 종료' }))
    await user.click(within(await screen.findByRole('dialog', { name: '운동을 종료할까요?' })).getByRole('button', { name: '종료하고 저장' }))

    await screen.findByRole('heading', { name: '운동을 완료했어요' })
    await screen.findByRole('heading', { name: 'Day 1 · 상체 강도', level: 2 })
    await user.click(screen.getByRole('button', { name: '전체 기록' }))
    await screen.findByRole('heading', { name: '운동 기록' })

    const firstRun = await services.workoutRepository.getActiveProgramRun()
    expect(firstRun?.days[0].workoutSession).not.toBeNull()
    const savedSessionId = firstRun?.days[0].workoutSession?.id

    await user.click(screen.getAllByRole('button', { name: '프로그램' })[0])
    expect((await screen.findAllByRole('button', { name: '저장한 기록 보기' })).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '다시 운동하기' })).toBeTruthy()
    await screen.findByRole('button', { name: '중도 하차' })
    await user.click(screen.getByRole('button', { name: '중도 하차' }))

    await user.click(await screen.findByRole('tab', { name: /둘러보기/ }))
    await screen.findByRole('heading', { name: '프로그램을 골라 내 루틴으로' })
    await user.click(screen.getByRole('button', { name: /8주 2분할 \+ 러닝 정체기 돌파/ }))
    const restartSheet = await screen.findByRole('dialog', { name: '8주 2분할 + 러닝 정체기 돌파' })
    const restartDate = within(restartSheet).getByLabelText('시작일')
    fireEvent.change(restartDate, { target: { value: today } })
    await user.click(within(restartSheet).getByRole('button', { name: '프로그램 시작하기 · 내 루틴에 가져오기' }))
    await screen.findByRole('heading', { name: '상체 강도' })

    await waitFor(async () => {
      const runs = await services.workoutRepository.listProgramRuns()
      expect(runs).toHaveLength(2)
      const active = runs.find((run) => run.status === 'active')
      const withdrawn = runs.find((run) => run.status === 'withdrawn')
      expect(active?.days[0].dayNumber).toBe(1)
      expect(active?.id).not.toBe(withdrawn?.id)
      expect(withdrawn?.days[0].workoutSession?.id).toBe(savedSessionId)
    })
  })

  test('예정일과 관계없이 Day를 시작하고 휴식일은 즉시 완료한다', async () => {
    const user = userEvent.setup()
    const services = renderApp()

    await screen.findByRole('heading', { name: '상체 강도' })
    const dayList = screen.getByRole('list', { name: '1주차 Day 목록' })
    await user.click(within(dayList).getByText('Day 2').closest('button')!)

    const dayDetail = document.querySelector<HTMLElement>('.program-day-detail')
    expect(dayDetail).not.toBeNull()
    const futureStart = within(dayDetail!).getByRole('button', { name: '운동 시작' })
    expect((futureStart as HTMLButtonElement).disabled).toBe(false)
    await user.click(futureStart)
    await screen.findByRole('heading', { name: '하체 강도' })
    const starter = document.querySelector<HTMLElement>('.program-day-starter')
    expect(starter).not.toBeNull()
    expect((within(starter!).getByRole('button', { name: '운동 시작' }) as HTMLButtonElement).disabled).toBe(false)
    await user.click(screen.getByRole('button', { name: '프로그램으로 돌아가기' }))

    const refreshedDayList = await screen.findByRole('list', { name: '1주차 Day 목록' })
    await user.click(within(refreshedDayList).getByText('Day 3').closest('button')!)
    await user.click(screen.getByRole('button', { name: '휴식 완료' }))

    await waitFor(async () => {
      const activeRun = await services.workoutRepository.getActiveProgramRun()
      expect(activeRun?.days[2].completedAt).not.toBeNull()
    })
    expect(within(within(refreshedDayList).getByText('Day 3').closest('button')!).getByText('완료')).toBeTruthy()
    expect(screen.getByText('1/56일 완료')).toBeTruthy()
    await user.click(within(refreshedDayList).getByText('Day 3').closest('button')!)
    expect((screen.getByRole('button', { name: '휴식 완료됨' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
