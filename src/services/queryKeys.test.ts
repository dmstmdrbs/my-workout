import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  dashboardOverviewQueryKey,
  exerciseProgressQueryKey,
  invalidateProgramRunQueries,
  invalidateWorkoutSessionQueries,
  previousExerciseSessionQueryKey,
  programRunsQueryKey,
  recordsCalendarQueryKey,
  recordsQueryKey,
  routineLastPerformedQueryKey,
  routineManagerQueryKey,
  weeklyStatsQueryKey,
  workoutRecordQueryKey,
  workoutSetupQueryKey,
} from './queryKeys'

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
}

function expectInvalidated(queryClient: QueryClient, queryKey: readonly unknown[]) {
  expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true)
}

describe('workout query invalidation contract', () => {
  it('invalidates every session consumer, including parameterized keys', async () => {
    const queryClient = createQueryClient()
    const consumedKeys = [
      workoutRecordQueryKey.byId('session-1'),
      recordsQueryKey.latestSession,
      recordsQueryKey.day('2026-09-02'),
      recordsCalendarQueryKey.month('2026-09-01T00:00:00.000Z'),
      recordsCalendarQueryKey.streak('2026-08-03T00:00:00.000Z'),
      dashboardOverviewQueryKey,
      weeklyStatsQueryKey('2026-09-01T00:00:00.000Z'),
      exerciseProgressQueryKey('exercise-1', '2026-03-06'),
      previousExerciseSessionQueryKey('exercise-1'),
      routineLastPerformedQueryKey,
      programRunsQueryKey,
      routineManagerQueryKey,
      workoutSetupQueryKey.byProgramDay('program-day-1'),
    ] as const
    const unrelatedKeys = [
      ['active-program-run'],
      ['completed-workout-records'],
      ['last-completed-set'],
      ['unrelated-query'],
    ] as const

    for (const queryKey of [...consumedKeys, ...unrelatedKeys]) queryClient.setQueryData(queryKey, { cached: true })

    await invalidateWorkoutSessionQueries(queryClient)

    for (const queryKey of consumedKeys) expectInvalidated(queryClient, queryKey)
    for (const queryKey of unrelatedKeys) expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(false)
  })

  it('invalidates program consumers without reviving the legacy active key', async () => {
    const queryClient = createQueryClient()
    const consumedKeys = [
      programRunsQueryKey,
      dashboardOverviewQueryKey,
      routineManagerQueryKey,
      workoutSetupQueryKey.byProgramDay(null),
    ] as const
    const unrelatedKeys = [
      ['active-program-run'],
      recordsQueryKey.latestSession,
    ] as const

    for (const queryKey of [...consumedKeys, ...unrelatedKeys]) queryClient.setQueryData(queryKey, { cached: true })

    await invalidateProgramRunQueries(queryClient)

    for (const queryKey of consumedKeys) expectInvalidated(queryClient, queryKey)
    for (const queryKey of unrelatedKeys) expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(false)
  })
})
