import type { Rir, Routine } from '../../../types/domain'

export function formatPreviousSessionSummary(session: { sets: readonly unknown[] } | null) {
  return session ? `${session.sets.length}세트 기록` : '완료 기록 없음'
}

export function formatRestTimer(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/** 볼륨은 kg 소수점을 보여줄 만큼 정밀하지 않아 정수로 끊고 천 단위만 구분한다. */
export function formatWorkoutVolume(volume: number) {
  return Math.round(volume).toLocaleString('ko-KR')
}

export function countRoutineSets(routine: Routine) {
  return routine.exercises.reduce((count, exercise) => count + exercise.sets.length, 0)
}

export function formatSuggestionWeight(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function formatProgramDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T12:00:00`))
}

export function formatProgramPickerDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T12:00:00`))
}

export function formatProgramSetTarget(set: { targetWeightKg: number | null; targetRepsMin: number | null; targetRepsMax: number | null; targetRir: Rir; notes?: string | null }) {
  if (set.targetRepsMin === null && set.targetRepsMax === null) return set.notes ?? '시간·거리 기록'
  const weight = set.targetWeightKg === null ? '' : `${set.targetWeightKg}kg · `
  const reps = set.targetRepsMin === set.targetRepsMax ? `${set.targetRepsMin ?? '-'}회` : `${set.targetRepsMin ?? '-'}-${set.targetRepsMax ?? '-'}회`
  return `${weight}${reps} · RIR ${set.targetRir ?? '-'}`
}
