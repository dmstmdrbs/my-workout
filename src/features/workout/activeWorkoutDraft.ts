import type { WorkoutSession } from '../../types/domain'

// `editedAt`은 초안에 없다. 진행 중인 운동은 "완료된 기록을 고친 것"이 될 수
// 없고, 그 값은 저장소만 정한다.
export type WorkoutDraft = Omit<WorkoutSession, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'editedAt'> & { id: string }

export interface StoredWorkoutDraft {
  draft: WorkoutDraft
  activeExerciseId: string | null
  restEndsAt: number | null
  /**
   * 현재 일시정지가 시작된 시각(epoch ms). 일시정지 중일 때만 의미가 있으므로
   * 세션이 아니라(`draft.pausedSeconds`) 이 초안 메타데이터에 둔다.
   * 재개하면 이 값과 지금 사이의 시간을 `draft.pausedSeconds`에 더하고
   * null로 되돌린다.
   */
  pausedAt: number | null
}

export const workoutDraftStorageKey = 'trainlog:workout-draft:v1'

type DraftListener = () => void

let snapshotRaw: string | null | undefined
let snapshot: StoredWorkoutDraft | null = null
let hasSnapshot = false
const listeners = new Set<DraftListener>()

function getStorageRaw() {
  try {
    return globalThis.localStorage?.getItem(workoutDraftStorageKey) ?? null
  } catch {
    return null
  }
}

function refreshSnapshot() {
  const raw = getStorageRaw()
  if (hasSnapshot && raw === snapshotRaw) return false
  snapshotRaw = raw
  snapshot = readStoredWorkoutDraft()
  hasSnapshot = true
  return true
}

function notifySnapshot() {
  if (!refreshSnapshot()) return
  listeners.forEach((listener) => listener())
}

function handleStorage(event: StorageEvent) {
  if (event.key === workoutDraftStorageKey) notifySnapshot()
}

export function subscribeStoredWorkoutDraft(listener: DraftListener) {
  listeners.add(listener)
  if (listeners.size === 1) window.addEventListener('storage', handleStorage)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', handleStorage)
  }
}

export function getStoredWorkoutDraftSnapshot() {
  refreshSnapshot()
  return snapshot
}

export function readStoredWorkoutDraft(): StoredWorkoutDraft | null {
  try {
    const raw = globalThis.localStorage?.getItem(workoutDraftStorageKey)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<StoredWorkoutDraft>
    if (!value.draft || value.draft.status !== 'in_progress' || !Array.isArray(value.draft.exercises) || !isValidStartedAt(value.draft.startedAt)) return null
    // A draft written before pause support existed has neither field. Default
    // them exactly as restEndsAt/activeExerciseId already are below, so an
    // in-progress workout saved by older code still restores cleanly.
    // Integer-only: a non-integer here (e.g. from a corrupted/tampered draft)
    // would reach save_workout_session's `::integer` cast on finish and abort
    // the entire save -- the exact failure mode this feature exists to avoid.
    const pausedSeconds = typeof value.draft.pausedSeconds === 'number' && Number.isInteger(value.draft.pausedSeconds) && value.draft.pausedSeconds >= 0 ? value.draft.pausedSeconds : 0
    return {
      draft: { ...value.draft, pausedSeconds },
      activeExerciseId: value.activeExerciseId ?? null,
      restEndsAt: typeof value.restEndsAt === 'number' ? value.restEndsAt : null,
      pausedAt: typeof value.pausedAt === 'number' ? value.pausedAt : null,
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
  notifySnapshot()
}

export function clearStoredWorkoutDraft() {
  try {
    globalThis.localStorage?.removeItem(workoutDraftStorageKey)
  } catch {
    // No-op when browser storage is unavailable.
  }
  notifySnapshot()
}

function isValidStartedAt(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}
