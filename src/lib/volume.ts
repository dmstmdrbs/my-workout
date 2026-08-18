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

/**
 * 두 함수 모두 `exercises`만 읽는다. 진행 중인 운동 초안(`WorkoutDraft`)은
 * 아직 id·소유자·타임스탬프가 없어 `WorkoutSession`이 아니지만 세트 구조는
 * 같으므로, 저장 전 기록에도 같은 계산을 쓸 수 있도록 필요한 만큼만 받는다.
 */
type SessionSets = Pick<WorkoutSession, 'exercises'>

/** 세션의 완료 세트만 합산한 총 볼륨(중량 × 반복 수). */
export function getSessionVolume(session: SessionSets): number {
  return session.exercises
    .flatMap((exercise) => exercise.sets)
    .filter((set) => set.isCompleted)
    .reduce((sum, set) => sum + (set.weightKg ?? 0) * (set.reps ?? 0), 0)
}

/** 세션에서 완료로 표시된 세트 개수. */
export function completedSetCount(session: SessionSets): number {
  return session.exercises
    .flatMap((exercise) => exercise.sets)
    .filter((set) => set.isCompleted).length
}
