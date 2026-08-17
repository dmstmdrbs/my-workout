import type { WorkoutSession } from '../../types/domain'

export type WorkoutDraft = Omit<WorkoutSession, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id: string }

export interface StoredWorkoutDraft {
  draft: WorkoutDraft
  activeExerciseId: string | null
  restEndsAt: number | null
}

export const workoutDraftStorageKey = 'trainlog:workout-draft:v1'

export function readStoredWorkoutDraft(): StoredWorkoutDraft | null {
  try {
    const raw = globalThis.localStorage?.getItem(workoutDraftStorageKey)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<StoredWorkoutDraft>
    if (!value.draft || value.draft.status !== 'in_progress' || !Array.isArray(value.draft.exercises) || !isValidStartedAt(value.draft.startedAt)) return null
    return {
      draft: value.draft,
      activeExerciseId: value.activeExerciseId ?? null,
      restEndsAt: typeof value.restEndsAt === 'number' ? value.restEndsAt : null,
    }
  } catch {
    return null
  }
}

export function writeStoredWorkoutDraft(value: StoredWorkoutDraft) {
  try {
    globalThis.localStorage?.setItem(workoutDraftStorageKey, JSON.stringify(value))
  } catch {
    // The current session remains usable if browser storage is unavailable.
  }
}

export function clearStoredWorkoutDraft() {
  try {
    globalThis.localStorage?.removeItem(workoutDraftStorageKey)
  } catch {
    // No-op when browser storage is unavailable.
  }
}

function isValidStartedAt(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}
