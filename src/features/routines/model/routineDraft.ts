import type { Rir, Routine, RoutineExercise, RoutineSetPrescription, SetType } from '../../../types/domain'

export type RoutineDraft = Omit<Routine, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }

export const rirOptions: Array<{ value: Rir; label: string }> = [
  { value: null, label: '미설정' },
  { value: 0, label: 'RIR 0' },
  { value: 1, label: 'RIR 1' },
  { value: 2, label: 'RIR 2' },
  { value: 3, label: 'RIR 3' },
  { value: 4, label: 'RIR 4' },
  { value: 5, label: 'RIR 5+' },
]

export function toDraft(routine: Routine): RoutineDraft {
  return { id: routine.id, name: routine.name, description: routine.description, color: routine.color, exercises: structuredClone(routine.exercises) }
}

export function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `routine-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function makeSet(setOrder: number, setType: SetType, restSeconds: number | null, reference?: RoutineSetPrescription): RoutineSetPrescription {
  return { id: createId(), setOrder, setType, targetWeightKg: reference?.targetWeightKg ?? null, targetRepsMin: reference?.targetRepsMin ?? null, targetRepsMax: reference?.targetRepsMax ?? null, targetDurationSeconds: reference?.targetDurationSeconds ?? null, targetDistanceKm: reference?.targetDistanceKm ?? null, targetRir: reference?.targetRir ?? null, restSeconds }
}

export function normalizeExerciseOrder(exercises: RoutineExercise[]) {
  return exercises.map((exercise, index) => ({ ...exercise, exerciseOrder: index + 1 }))
}

export function normalizeSetOrder(sets: RoutineSetPrescription[]) {
  return sets.map((set, index) => ({ ...set, setOrder: index + 1 }))
}

export function countSets(exercises: RoutineExercise[]) {
  return exercises.reduce((total, exercise) => total + exercise.sets.length, 0)
}

export function blankToNull(value: string | null) {
  return value?.trim() || null
}

export function draftFingerprint(draft: RoutineDraft) {
  return JSON.stringify({
    id: draft.id ?? null,
    name: draft.name,
    description: draft.description,
    color: draft.color,
    exercises: [...draft.exercises].sort((a, b) => a.exerciseOrder - b.exerciseOrder).map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
      exerciseOrder: exercise.exerciseOrder,
      notes: exercise.notes,
      sets: [...exercise.sets].sort((a, b) => a.setOrder - b.setOrder).map((set) => ({
        id: set.id,
        setOrder: set.setOrder,
        setType: set.setType,
        targetWeightKg: set.targetWeightKg,
        targetRepsMin: set.targetRepsMin,
        targetRepsMax: set.targetRepsMax,
        targetDurationSeconds: set.targetDurationSeconds,
        targetDistanceKm: set.targetDistanceKm,
        targetRir: set.targetRir,
        restSeconds: set.restSeconds,
      })),
    })),
  })
}

export function rirValue(rir: Rir) {
  return rir === null ? '' : String(rir)
}

export function parseRir(value: string): Rir {
  if (value === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

export function toNullableNumber(value: string) {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/** 분 입력을 초로. 기록 쪽과 같은 규칙이다. */
export function minutesToSeconds(value: string) {
  const parsed = toNullableInteger(value)
  return parsed === null ? null : parsed * 60
}

export function toNullableInteger(value: string) {
  const parsed = toNullableNumber(value)
  return parsed === null ? null : Math.floor(parsed)
}
