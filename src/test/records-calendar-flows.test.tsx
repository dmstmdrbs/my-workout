import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import App from '../App'
import { STREAK_LOOKBACK_CAP_DAYS } from '../lib/streak'
import { getMonthStart } from '../lib/week'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import type { WorkoutRepository } from '../services'
import { mockSessions } from '../services/mock/seed'

// `tsconfig.app.json` deliberately scopes `types` to `["vite/client"]` only
// (this is a browser app, not a Node one), so `process` isn't ambient here.
// This file is the one place that needs it, to force a stable local timezone
// for Date-based fixtures -- a minimal local declaration instead of widening
// the project-wide type roster.
declare const process: { env: Record<string, string | undefined> }

// Forced so every date computation in this file (seed dates, "today"-relative
// streak fixtures, and the local-day-grouping check) runs against a known,
// stable local timezone instead of whatever the CI runner happens to default
// to. Without this, the local-day-grouping test in particular would be
// meaningless -- it exists specifically to prove the calendar groups sessions
// by *this* timezone's calendar day, not UTC's.
const originalTZ = process.env.TZ

function renderApp(initialPath = '/records') {
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

/**
 * The seed sessions carry fixed dates (2026-08-11/12/14) while the calendar's
 * "current month" is computed from the real clock, so the number of months
 * between "now" and the seed month drifts as the clock advances. Rather than
 * hardcoding a month count, walk there by comparing calendar months --
 * `src/test/stats-weekly-flows.test.tsx`'s `weeksBetween` solves the same
 * problem for weeks.
 */
function monthsBetween(a: Date, b: Date) {
  return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth())
}

async function clickMonthsBack(user: ReturnType<typeof userEvent.setup>, count: number) {
  if (count <= 0) return
  const prevButton = screen.getByRole('button', { name: '이전 달' })
  for (let i = 0; i < count; i += 1) {
    await user.click(prevButton)
  }
}

/** Minimal completed session for calendar/streak fixtures -- no exercises are
 * needed since these tests only look at which days are marked, not at set
 * detail (mirrors the minimal fixture in `records-pagination-flows.test.tsx`). */
async function addCompletedSession(repo: WorkoutRepository, startedAtIso: string, label: string) {
  await repo.saveSession({
    routineId: null,
    routineName: `달력 테스트 ${label}`,
    status: 'completed',
    startedAt: startedAtIso,
    completedAt: startedAtIso,
    notes: null,
    exercises: [],
  })
}

/** A session dated exactly `daysAgo` local days before the real "today", at a
 * fixed local hour safely away from any midnight boundary -- used for the
 * streak fixtures, which are anchored to the real clock rather than the fixed
 * seed dates. */
function isoDaysAgo(daysAgo: number): string {
  const date = new Date()
  date.setHours(9, 0, 0, 0)
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}

function streakValueText() {
  return document.querySelectorAll('.calendar-stat strong')[0]?.textContent
}

function monthCountText() {
  return document.querySelectorAll('.calendar-stat strong')[1]?.textContent
}

describe.sequential('기록 화면: 월간 달력', () => {
  beforeAll(() => {
    process.env.TZ = 'Asia/Seoul'
    localStorage.clear()
  })

  afterAll(() => {
    process.env.TZ = originalTZ
  })

  test('월 그리드는 완료한 세션이 있는 날짜만 정확히 표시한다', async () => {
    const user = userEvent.setup()
    renderApp('/records')
    await screen.findByRole('heading', { name: '운동 기록' })

    const seedMonthStart = getMonthStart(new Date(mockSessions[0].startedAt))
    await clickMonthsBack(user, monthsBetween(new Date(), seedMonthStart))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /2026년 8월 14일 .+ 운동 \d+회 완료/ })).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: /2026년 8월 12일 .+ 운동 \d+회 완료/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /2026년 8월 11일 .+ 운동 \d+회 완료/ })).toBeTruthy()

    // Exactly those three days -- everything else in August 2026 is unmarked.
    expect(document.querySelectorAll('.calendar-day.has-workout').length).toBe(3)
    expect(screen.getByRole('button', { name: /2026년 8월 1일 .+ 운동 기록 없음/ })).toBeTruthy()
  })

  test('월 이동은 표시되는 달을 바꾸고, 이번 달보다 미래로는 이동할 수 없다', async () => {
    const user = userEvent.setup()
    renderApp('/records')
    await screen.findByRole('heading', { name: '운동 기록' })

    const nextButton = screen.getByRole('button', { name: '다음 달' }) as HTMLButtonElement
    expect(nextButton.disabled).toBe(true)

    const initialLabel = document.querySelector('.calendar-month-label')?.textContent
    expect(initialLabel).toContain('이번 달')

    await user.click(screen.getByRole('button', { name: '이전 달' }))
    await waitFor(() => {
      expect(document.querySelector('.calendar-month-label')?.textContent).not.toBe(initialLabel)
    })
    expect(document.querySelector('.calendar-month-label')?.textContent).not.toContain('이번 달')

    await user.click(screen.getByRole('button', { name: '다음 달' }))
    await waitFor(() => {
      expect(document.querySelector('.calendar-month-label')?.textContent).toBe(initialLabel)
    })
    expect((screen.getByRole('button', { name: '다음 달' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('완료한 운동이 없는 달은 오류 대신 빈 상태를 보여준다', async () => {
    const user = userEvent.setup()
    renderApp('/records')
    await screen.findByRole('heading', { name: '운동 기록' })

    // July 2026 -- one month before the seed month -- is never seeded by any
    // test in this suite, so it is guaranteed empty regardless of when the
    // suite runs relative to the fixed seed dates.
    const seedMonthStart = getMonthStart(new Date(mockSessions[0].startedAt))
    const neverSeededMonthStart = new Date(seedMonthStart)
    neverSeededMonthStart.setMonth(neverSeededMonthStart.getMonth() - 1)
    await clickMonthsBack(user, monthsBetween(new Date(), neverSeededMonthStart))

    await screen.findByText('이 달에는 완료한 운동이 없어요.')
    expect(document.querySelectorAll('.calendar-day.has-workout').length).toBe(0)
  })

  test('마킹된 날짜를 선택하면 그 날의 기록이 아래 목록에 열린다', async () => {
    const user = userEvent.setup()
    renderApp('/records')
    await screen.findByRole('heading', { name: '운동 기록' })

    const seedMonthStart = getMonthStart(new Date(mockSessions[0].startedAt))
    await clickMonthsBack(user, monthsBetween(new Date(), seedMonthStart))

    await user.click(await screen.findByRole('button', { name: /2026년 8월 11일 .+ 운동 \d+회 완료/ }))

    const panel = await screen.findByRole('region', { name: '선택한 날의 운동' })
    await waitFor(() => {
      expect(within(panel).getByRole('heading').textContent).toContain('2026년 8월 11일')
    })
    expect(within(panel).getByText('Pull Day')).toBeTruthy()
  })

  test('늦은 저녁과 자정 직후에 기록한 세션도 각자의 로컬 날짜에 정확히 표시된다', async () => {
    const repo = createLocalStorageServices().workoutRepository
    // Keep these fixtures away from the today-relative streak tests below.
    // 00:30 KST on the 6th converts to 15:30 UTC on the *5th*, which catches
    // accidental UTC grouping without becoming part of a current streak.
    await addCompletedSession(repo, '2026-08-05T23:30:00.000+09:00', 'late-evening')
    await addCompletedSession(repo, '2026-08-06T00:30:00.000+09:00', 'just-after-midnight')

    const user = userEvent.setup()
    renderApp('/records')
    await screen.findByRole('heading', { name: '운동 기록' })

    const seedMonthStart = getMonthStart(new Date(mockSessions[0].startedAt))
    await clickMonthsBack(user, monthsBetween(new Date(), seedMonthStart))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /2026년 8월 5일 .+ 운동 \d+회 완료/ })).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: /2026년 8월 6일 .+ 운동 \d+회 완료/ })).toBeTruthy()
  })

  test('오늘 아직 운동을 완료하지 않아도 어제까지 이어온 연속 기록은 끊기지 않는다', async () => {
    const repo = createLocalStorageServices().workoutRepository
    await addCompletedSession(repo, isoDaysAgo(1), 'streak-yesterday')
    await addCompletedSession(repo, isoDaysAgo(2), 'streak-day-before')

    renderApp('/records')
    await screen.findByRole('heading', { name: '운동 기록' })

    await waitFor(() => expect(streakValueText()).toBe('2일'))
    expect(document.querySelector('.calendar-stat-caption')?.textContent).toBe('오늘 운동을 완료하면 계속 이어져요.')
  })

  test('오늘 운동을 완료하면 그만큼 연속 기록이 늘어난다', async () => {
    const repo = createLocalStorageServices().workoutRepository
    await addCompletedSession(repo, isoDaysAgo(0), 'streak-today')

    renderApp('/records')
    await screen.findByRole('heading', { name: '운동 기록' })

    await waitFor(() => expect(streakValueText()).toBe('3일'))
    expect(document.querySelector('.calendar-stat-caption')).toBeNull()
  })

  test(`연속 기록이 상한(${STREAK_LOOKBACK_CAP_DAYS}일)에 닿으면 실제 일수 대신 "${STREAK_LOOKBACK_CAP_DAYS}일 이상"으로 정직하게 표시한다`, async () => {
    const repo = createLocalStorageServices().workoutRepository
    // Days 0-2 are already filled in by the previous two tests (today,
    // yesterday, the day before); fill the rest of the lookback window so the
    // streak runs uninterrupted all the way to the cap.
    for (let daysAgo = 3; daysAgo <= STREAK_LOOKBACK_CAP_DAYS; daysAgo += 1) {
      await addCompletedSession(repo, isoDaysAgo(daysAgo), `streak-cap-${daysAgo}`)
    }

    renderApp('/records')
    await screen.findByRole('heading', { name: '운동 기록' })

    await waitFor(() => expect(streakValueText()).toBe(`${STREAK_LOOKBACK_CAP_DAYS}일 이상`))
    expect(document.querySelector('.calendar-stat-caption')?.textContent)
      .toBe(`${STREAK_LOOKBACK_CAP_DAYS}일이 넘는 연속 기록은 정확한 일수 대신 이렇게 표시해요.`)
  })

  test('이 달 운동일 수치는 실제 달력 일수와 마킹된 날짜 수를 그대로 반영한다', async () => {
    renderApp('/records')
    await screen.findByRole('heading', { name: '운동 기록' })

    await waitFor(() => expect(monthCountText()).not.toBe('–'))
    const markedThisMonth = document.querySelectorAll('.calendar-day.has-workout').length
    const now = new Date()
    const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    expect(monthCountText()).toBe(`${markedThisMonth} / ${daysInThisMonth}일`)
  })
})
