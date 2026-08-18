import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import type { WorkoutRepository } from '../services'
import type { MuscleGroup } from '../types/domain'

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

/**
 * Adds one completed session for a single exercise, dated relative to the
 * real clock ("N days ago") rather than a fixed calendar date. The
 * progression card's lookback window is itself computed from `Date.now()`,
 * so anchoring fixtures the same way (like `stats-weekly-flows.test.tsx`
 * does with `weeksBetween`) keeps these tests valid regardless of when they
 * run, instead of rotting once a fixed date falls outside the window.
 */
async function addSessionDaysAgo(
  repo: WorkoutRepository,
  daysAgo: number,
  exercise: { id: string; name: string; primaryMuscle: MuscleGroup },
  sets: Array<{ weightKg: number | null; reps: number | null }>,
) {
  const startedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
  startedAt.setHours(10, 0, 0, 0)
  const completedAt = new Date(startedAt.getTime() + 20 * 60 * 1000)
  await repo.saveSession({
    routineId: null,
    routineName: null,
    status: 'completed',
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    notes: null,
    exercises: [
      {
        id: `progress-test-exercise-${exercise.id}-${daysAgo}`,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        primaryMuscle: exercise.primaryMuscle,
        exerciseOrder: 1,
        notes: null,
        sets: sets.map((set, index) => ({
          id: `progress-test-set-${exercise.id}-${daysAgo}-${index + 1}`,
          setOrder: index + 1,
          setType: 'working' as const,
          weightKg: set.weightKg,
          reps: set.reps,
          targetRir: 2,
          actualRir: 2,
          restSeconds: 90,
          isCompleted: true,
          completedAt: startedAt.toISOString(),
          notes: null,
        })),
      },
    ],
  })
}

async function selectExercise(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: '운동 선택' }))
  await user.click(await screen.findByRole('button', { name }))
}

describe.sequential('통계: 종목별 중량 추이', () => {
  let repo: WorkoutRepository
  let bodyweightExerciseName: string

  beforeAll(async () => {
    localStorage.clear()
    repo = createLocalStorageServices().workoutRepository

    // Two sessions -> a real trend. The 10-days-ago session has a *heavier*
    // low-rep set (100x5) alongside a lighter higher-rep set (90x8), so this
    // also verifies "heaviest set per session" picks by weight, not volume.
    await addSessionDaysAgo(repo, 10, { id: 'leg-press', name: '레그 프레스', primaryMuscle: 'quadriceps' }, [
      { weightKg: 100, reps: 5 },
      { weightKg: 90, reps: 8 },
    ])
    await addSessionDaysAgo(repo, 3, { id: 'leg-press', name: '레그 프레스', primaryMuscle: 'quadriceps' }, [
      { weightKg: 125, reps: 6 },
    ])

    // Exactly one session -> the "single data point" case.
    await addSessionDaysAgo(repo, 5, { id: 'machine-shoulder-press', name: '머신 숄더 프레스', primaryMuscle: 'shoulders' }, [
      { weightKg: 60, reps: 8 },
    ])

    // '원 암 덤벨 로우' intentionally gets no session at all -> the "zero
    // data points in the period" case.

    // The heaviest set (100kg x 3) and the best-e1RM set (90kg x 10) are
    // deliberately different sets, so the estimate must be the best across
    // the session -- not the heaviest set's own e1RM. 100x3 alone estimates
    // ~105.9kg; 90x10 estimates ~120kg, which is higher and must win even
    // though 최고 중량 itself (the heaviest-set weight/reps pair) still
    // reports 100kg x 3회.
    await addSessionDaysAgo(repo, 4, { id: 'dumbbell-curl', name: '이지바 컬', primaryMuscle: 'biceps' }, [
      { weightKg: 100, reps: 3 },
      { weightKg: 90, reps: 10 },
    ])

    // A freshly created bodyweight exercise: two sessions, reps only.
    const bodyweightExercise = await repo.saveExercise({
      name: '맨몸 스쿼트',
      primaryMuscle: 'quadriceps',
      secondaryMuscles: [],
      equipment: 'bodyweight',
      defaultRestSeconds: 60,
      isArchived: false,
    })
    bodyweightExerciseName = bodyweightExercise.name
    await addSessionDaysAgo(repo, 8, { id: bodyweightExercise.id, name: bodyweightExercise.name, primaryMuscle: 'quadriceps' }, [
      { weightKg: null, reps: 20 },
      { weightKg: null, reps: 15 },
    ])
    await addSessionDaysAgo(repo, 2, { id: bodyweightExercise.id, name: bodyweightExercise.name, primaryMuscle: 'quadriceps' }, [
      { weightKg: null, reps: 28 },
    ])
  })

  test('운동을 선택하면 세션별 최고 중량과 예상 1RM 추이를 보여준다', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })

    await selectExercise(user, '레그 프레스')

    await waitFor(() => {
      expect(screen.getByRole('group', { name: '레그 프레스 최고 중량 추이' })).toBeTruthy()
    })

    // 10 days ago: the heaviest completed set is 100kg x 5 (not the
    // higher-volume 90kg x 8), with Brzycki e1RM 112.5kg.
    expect(screen.getByRole('img', { name: /최고 중량 100kg × 5회 · 예상 1RM 112\.5kg/ })).toBeTruthy()
    // 3 days ago: 125kg x 6 -> Brzycki e1RM 145.2kg, matching the reference figure.
    expect(screen.getByRole('img', { name: /최고 중량 125kg × 6회 · 예상 1RM 145\.2kg/ })).toBeTruthy()
  })

  test('주 이동을 해도 선택한 종목과 추이가 그대로 유지된다', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })

    await selectExercise(user, '레그 프레스')
    await waitFor(() => {
      expect(screen.getByRole('group', { name: '레그 프레스 최고 중량 추이' })).toBeTruthy()
    })

    // The progress card's own period is independent of the week being
    // viewed, but the weekly section's query key includes the selected
    // week, so paging it must not reset (unmount) the exercise picked here.
    const rangeBeforeNav = document.querySelector('.stats-week-range')?.textContent
    await user.click(screen.getByRole('button', { name: '이전 주' }))
    await waitFor(() => {
      expect(document.querySelector('.stats-week-range')?.textContent).not.toBe(rangeBeforeNav)
    })

    expect(screen.getByRole('button', { name: '레그 프레스' })).toBeTruthy()
    expect(screen.getByRole('group', { name: '레그 프레스 최고 중량 추이' })).toBeTruthy()
    expect(screen.getByRole('img', { name: /최고 중량 125kg × 6회 · 예상 1RM 145\.2kg/ })).toBeTruthy()
  })

  test('기록이 한 건뿐인 종목은 추이 차트 대신 단일 기록 요약을 보여준다', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })

    await selectExercise(user, '머신 숄더 프레스')

    await waitFor(() => {
      expect(screen.getByText('비교할 이전 기록이 없어 추이를 표시할 수 없어요.')).toBeTruthy()
    })
    expect(document.querySelector('.progress-chart')).toBeNull()
    expect(screen.getByText(/60kg × 8회/)).toBeTruthy()
  })

  test('예상 1RM은 가장 무거운 세트가 아니라, 세션의 완료 세트 중 e1RM이 가장 높은 세트를 기준으로 한다', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })

    await selectExercise(user, '이지바 컬')

    await waitFor(() => {
      expect(screen.getByText('비교할 이전 기록이 없어 추이를 표시할 수 없어요.')).toBeTruthy()
    })
    // 최고 중량은 여전히 그대로 가장 무거운 세트(100kg × 3회) 기준이다.
    expect(screen.getByText(/100kg × 3회/)).toBeTruthy()
    // 하지만 예상 1RM은 그 무거운 세트만의 추정치(105.9kg)가 아니라, 같은
    // 세션의 90kg × 10회가 내는 더 높은 추정치(120kg)를 보여줘야 한다.
    expect(screen.getByText(/예상 1RM 120kg/)).toBeTruthy()
    expect(screen.queryByText(/105\.9kg/)).toBeNull()
  })

  test('기간 내 완료한 세트가 없는 종목은 빈 상태를 보여준다', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })

    await selectExercise(user, '원 암 덤벨 로우')

    await waitFor(() => {
      expect(screen.getByText(/완료한 원 암 덤벨 로우 세트가 없어요\./)).toBeTruthy()
    })
    expect(document.querySelector('.progress-chart')).toBeNull()
    expect(document.querySelector('.progress-single')).toBeNull()
  })

  test('체중 운동은 중량과 예상 1RM 대신 세션별 최고 반복 수로 추이를 보여준다', async () => {
    const user = userEvent.setup()
    renderApp('/stats')
    await screen.findByRole('heading', { name: '주간 통계' })

    await selectExercise(user, bodyweightExerciseName)

    await waitFor(() => {
      expect(screen.getByRole('group', { name: `${bodyweightExerciseName} 최고 반복 수 추이` })).toBeTruthy()
    })
    expect(screen.getByText(/체중 운동은 기록된 중량이 없어/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /최고 반복 20회/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /최고 반복 28회/ })).toBeTruthy()
    // A bodyweight exercise has no logged weight, so no e1RM should render anywhere in the card.
    expect(document.querySelector('.progress-card')?.textContent).not.toMatch(/1RM/)
  })
})
