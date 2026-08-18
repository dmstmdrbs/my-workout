import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import type { WorkoutRepository } from '../services'
import { mockSessions } from '../services/mock/seed'
import { getWeekStart } from '../lib/week'

function renderApp(initialPath = '/stats') {
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

/** Volume computed the same way `getSessionVolume` does, but derived directly
 * from the seed's own fields rather than a hand-copied number, so a change to
 * the seed data can't silently desync the assertion from what's summed. */
function expectedVolumeOf(sessions: typeof mockSessions) {
  return sessions.reduce((sum, session) =>
    sum + session.exercises
      .flatMap((exercise) => exercise.sets)
      .filter((set) => set.isCompleted)
      .reduce((setSum, set) => setSum + (set.weightKg ?? 0) * (set.reps ?? 0), 0), 0)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(Math.round(value))
}

/**
 * The seed sessions carry fixed dates (2026-08-11/12/14) while the screen's
 * "this week" is computed from the real clock, so the number of weeks
 * between "now" and the seed week drifts as the clock advances. Rather than
 * hardcoding a week count, walk there by comparing Monday-start weeks.
 */
function weeksBetween(a: Date, b: Date) {
  return Math.round((getWeekStart(a).getTime() - getWeekStart(b).getTime()) / (7 * 24 * 60 * 60 * 1000))
}

async function clickWeeksBack(user: ReturnType<typeof userEvent.setup>, count: number) {
  const prevButton = screen.getByRole('button', { name: '이전 주' })
  for (let i = 0; i < count; i += 1) {
    await user.click(prevButton)
  }
}

/** Adds a single, cleanly predictable session dated inside the given week (a
 * Monday-start Date from `getWeekStart`), so a test can control exactly one
 * week's volume without depending on the fixed seed sessions. */
async function addSessionInWeek(repo: WorkoutRepository, weekStart: Date, weightKg: number, reps: number) {
  const startedAt = new Date(weekStart)
  startedAt.setDate(startedAt.getDate() + 2)
  startedAt.setHours(10, 0, 0, 0)
  const completedAt = new Date(startedAt.getTime() + 30 * 60 * 1000)
  await repo.saveSession({
    routineId: null,
    routineName: '통계 테스트',
    status: 'completed',
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    notes: null,
    exercises: [
      {
        id: 'stats-test-exercise',
        exerciseId: 'barbell-bench-press',
        exerciseName: '바벨 벤치프레스',
        primaryMuscle: 'chest',
        exerciseOrder: 1,
        notes: null,
        sets: [
          {
            id: 'stats-test-set-1',
            setOrder: 1,
            setType: 'working',
            weightKg,
            reps,
            durationSeconds: null,
            distanceKm: null,
            targetRir: 2,
            actualRir: 2,
            restSeconds: 120,
            isCompleted: true,
            completedAt: startedAt.toISOString(),
            notes: null,
          },
        ],
      },
    ],
  })
}

describe.sequential('통계: 주간 볼륨과 부위별 분포', () => {
  beforeAll(() => {
    localStorage.clear()
  })

  test('선택한 주의 총 볼륨이 시드 데이터와 일치한다', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })

    const seedWeekStart = getWeekStart(new Date(mockSessions[0].startedAt))
    await clickWeeksBack(user, weeksBetween(new Date(), seedWeekStart))

    const expectedVolume = expectedVolumeOf(mockSessions)
    await waitFor(() => {
      const volumeValue = document.querySelector('.volume-card .stats-volume-value strong')
      expect(volumeValue?.textContent).toBe(formatNumber(expectedVolume))
    })
  })

  test('완료한 운동이 없는 주는 0과 잘못된 계산 대신 빈 상태를 보여준다', async () => {
    renderApp('/stats')
    // The real-clock "this week" holds none of the fixed 2026-08 seed
    // sessions, so it's empty by construction -- no navigation needed.
    await screen.findByText('이 주에는 완료한 운동이 없어요.')
    expect(document.querySelector('.stats-grid')).toBeNull()
    expect(document.querySelector('.stats-volume-value')).toBeNull()
  })

  test('지난주 기록이 없으면 비교 문구가 대신 안내한다', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })

    const seedWeekStart = getWeekStart(new Date(mockSessions[0].startedAt))
    await clickWeeksBack(user, weeksBetween(new Date(), seedWeekStart))

    // The week before the seed week has no sessions at all, so previous-week
    // volume is 0 -- the comparison must read as "no data", not Infinity/NaN.
    await waitFor(() => {
      const comparison = document.querySelector('.stats-comparison')
      expect(comparison?.textContent).toContain('지난주 기록이 없어')
      expect(comparison?.textContent).not.toMatch(/Infinity|NaN/)
    })
  })

  test('지난주 볼륨이 있으면 증감률을 정확히 계산한다', async () => {
    const seedWeekStart = getWeekStart(new Date(mockSessions[0].startedAt))
    const previousWeekStart = new Date(seedWeekStart)
    previousWeekStart.setDate(previousWeekStart.getDate() - 7)

    const repo = createLocalStorageServices().workoutRepository
    await addSessionInWeek(repo, previousWeekStart, 50, 10)

    const user = userEvent.setup()
    renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })
    await clickWeeksBack(user, weeksBetween(new Date(), seedWeekStart))

    const previousVolume = 50 * 10
    const currentVolume = expectedVolumeOf(mockSessions)
    const expectedPercent = Math.round(((currentVolume - previousVolume) / previousVolume) * 100)

    await waitFor(() => {
      const comparison = document.querySelector('.stats-comparison')
      expect(comparison?.textContent).toContain(`${expectedPercent}%`)
      expect(comparison?.textContent).toContain('증가')
    })
  })

  test('주 이동은 표시되는 범위와 내용을 바꾼다', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })

    const initialRange = document.querySelector('.stats-week-range')?.textContent
    expect(initialRange).toContain('이번 주')
    await screen.findByText('이 주에는 완료한 운동이 없어요.')

    await user.click(screen.getByRole('button', { name: '이전 주' }))

    await waitFor(() => {
      expect(document.querySelector('.stats-week-range')?.textContent).not.toBe(initialRange)
    })
    const oneWeekBackRange = document.querySelector('.stats-week-range')?.textContent
    expect(oneWeekBackRange).not.toContain('이번 주')

    await user.click(screen.getByRole('button', { name: '다음 주' }))
    await waitFor(() => {
      expect(document.querySelector('.stats-week-range')?.textContent).toBe(initialRange)
    })
    await screen.findByText('이 주에는 완료한 운동이 없어요.')
  })

  test('부위별 분포는 볼륨이 큰 순서로 그룹화된다', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })

    const seedWeekStart = getWeekStart(new Date(mockSessions[0].startedAt))
    await clickWeeksBack(user, weeksBetween(new Date(), seedWeekStart))

    await waitFor(() => {
      expect(document.querySelectorAll('.muscle-row').length).toBeGreaterThan(0)
    })

    const rows = Array.from(document.querySelectorAll('.muscle-row'))
    const labels = rows.map((row) => row.querySelector('.muscle-row-label')?.textContent)
    const volumes = rows.map((row) => Number(row.querySelector('.muscle-row-value')?.textContent?.replace(/,/g, '')))

    // 시드 데이터의 등(back) 운동 볼륨이 가슴(chest)보다 크므로 등이 먼저 와야 한다.
    expect(labels).toEqual(['등', '가슴'])
    expect(volumes[0]).toBeGreaterThan(volumes[1])
    expect([...volumes]).toEqual([...volumes].sort((a, b) => b - a))
  })

  test('요일별 볼륨 막대는 스크린리더에도 요일별 값이 노출된다', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })

    const seedWeekStart = getWeekStart(new Date(mockSessions[0].startedAt))
    await clickWeeksBack(user, weeksBetween(new Date(), seedWeekStart))

    await waitFor(() => {
      expect(document.querySelector('.stats-weekday-chart')).not.toBeNull()
    })

    // A bare `<div>`/`<span>` maps to ARIA role `generic`, and the spec
    // prohibits name-from-author on `generic` -- an `aria-label` there is
    // dropped from the accessibility tree entirely, not merely terse. Role
    // queries (unlike `getByLabelText`, which matches the raw attribute)
    // only succeed once the element actually carries a name-accepting role,
    // so this distinguishes "exposed to assistive tech" from "attribute is
    // merely present in the DOM".
    expect(screen.getByRole('group', { name: '요일별 볼륨' })).toBeTruthy()
    // Tuesday (화) in the seed week has a known non-zero volume from
    // session-2026-08-11's completed sets.
    expect(screen.getByRole('img', { name: /^화요일 [0-9,]+ kg$/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /^일요일 0 kg$/ })).toBeTruthy()
  })

  test('이번 주보다 미래로는 이동할 수 없다', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })

    const rangeBefore = document.querySelector('.stats-week-range')?.textContent
    const nextButton = screen.getByRole('button', { name: '다음 주' }) as HTMLButtonElement
    expect(nextButton.disabled).toBe(true)

    await user.click(nextButton)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(document.querySelector('.stats-week-range')?.textContent).toBe(rangeBefore)
  })
})
