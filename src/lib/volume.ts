/**
 * Single source of truth for session volume/set-count math.
 *
 * `getSessionVolume` used to be re-derived independently in the records list
 * (detail header, list row and share card) and the dashboard's week summary
 * and recent-session rows -- both copies character-for-character identical.
 * `completedSetCount` was the same story: defined once in records and
 * re-inlined in the dashboard. A third copy would have appeared with the
 * statistics screen. Everything that needs a session's total volume or
 * completed set count should import from here instead of re-deriving it.
 */
import type { WorkoutSession } from '../types/domain'

/** 세션의 완료 세트만 합산한 총 볼륨(중량 × 반복 수). */
export function getSessionVolume(session: WorkoutSession): number {
  return session.exercises
    .flatMap((exercise) => exercise.sets)
    .filter((set) => set.isCompleted)
    .reduce((sum, set) => sum + (set.weightKg ?? 0) * (set.reps ?? 0), 0)
}

/** 세션에서 완료로 표시된 세트 개수. */
export function completedSetCount(session: WorkoutSession): number {
  return session.exercises
    .flatMap((exercise) => exercise.sets)
    .filter((set) => set.isCompleted).length
}
