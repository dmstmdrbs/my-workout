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

export function getElapsedSeconds(startedAt: string, now = Date.now()) {
  const startedAtMs = Date.parse(startedAt)
  return Number.isFinite(startedAtMs) ? Math.max(0, Math.floor((now - startedAtMs) / 1_000)) : 0
}

export function formatElapsedTime(startedAt: string, now = Date.now()) {
  const totalSeconds = getElapsedSeconds(startedAt, now)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function isValidStartedAt(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}
