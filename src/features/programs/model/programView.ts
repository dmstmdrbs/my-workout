import type { ProgramRunDay } from '../../../types/domain'
import { trainingProgramCatalog, type TrainingProgramDefinition } from '../programTemplate'

export function filterPrograms(query: string, sessionsPerWeek: number | null) {
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR')
  return trainingProgramCatalog.filter((program) => {
    if (sessionsPerWeek !== null && program.sessionsPerWeek !== sessionsPerWeek) return false
    if (!normalizedQuery) return true
    const searchable = [program.name, program.eyebrow, program.focus, ...program.tags].join(' ').toLocaleLowerCase('ko-KR')
    return searchable.includes(normalizedQuery)
  })
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T12:00:00`))
}

export function formatPrescription(set: NonNullable<ReturnType<TrainingProgramDefinition['build']>['days'][number]['routineSnapshot']>['exercises'][number]['sets'][number]) {
  if (set.targetRepsMin === null && set.targetRepsMax === null) return set.notes ?? '시간·거리 기록'
  const reps = set.targetRepsMin === set.targetRepsMax ? `${set.targetRepsMin}회` : `${set.targetRepsMin}-${set.targetRepsMax}회`
  const load = set.targetWeightKg !== null ? `${set.targetWeightKg}kg` : set.targetOneRepMaxPercent != null ? `1RM ${set.targetOneRepMaxPercent}%` : '자율 중량'
  return `${load} · ${reps} · RIR ${set.targetRir ?? '–'}`
}

export function formatDetailedPrescription(set: NonNullable<ProgramRunDay['routineSnapshot']>['exercises'][number]['sets'][number]) {
  if (set.targetRepsMin === null && set.targetRepsMax === null) return set.notes ?? '시간·거리 기록'
  const reps = set.targetRepsMin === set.targetRepsMax ? `${set.targetRepsMin}회` : `${set.targetRepsMin}-${set.targetRepsMax}회`
  const load = set.targetWeightKg !== null
    ? `${set.targetWeightKg}kg${set.targetOneRepMaxPercent != null ? ` · ${set.targetOneRepMaxPercent}%` : ''}`
    : set.targetOneRepMaxPercent != null ? `1RM ${set.targetOneRepMaxPercent}%` : '자율'
  return `${load} · ${reps} · RIR ${set.targetRir ?? '–'}`
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '프로그램을 시작하지 못했어요.'
}

export function isProgramDayCompleted(day: ProgramRunDay) {
  return Boolean(day.completedAt || day.workoutSession)
}
