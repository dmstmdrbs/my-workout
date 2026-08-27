import { getSessionDurationMinutes } from '../../lib/duration'
import type { WorkoutSession, WorkoutSetRecord } from '../../types/domain'

export const shareCardExportWidth = 540
export const maxShareCardPixels = 32_000_000

export function formatWorkoutSet(set: WorkoutSetRecord, weightUnit: string) {
  if (set.durationSeconds !== null || set.distanceKm !== null) {
    const parts = []
    if (set.durationSeconds !== null) parts.push(`${Math.round(set.durationSeconds / 60)}분`)
    if (set.distanceKm !== null) parts.push(`${set.distanceKm}km`)
    return parts.join(' · ')
  }
  return `${formatWeight(set.weightKg)} ${weightUnit} × ${set.reps ?? '–'}`
}

export function formatWorkoutRir(rir: number) { return rir >= 5 ? '5+' : String(rir) }
export function formatWorkoutNumber(value: number) { return new Intl.NumberFormat('ko-KR').format(Math.round(value)) }
export function formatWorkoutDuration(session: WorkoutSession) { if (!session.completedAt) return '기록 중'; const minutes = getSessionDurationMinutes(session); return minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ''}` }
export function workoutShareFileName(session: WorkoutSession) { const date = new Date(session.startedAt); const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; return `trainlog-${localDate}.png` }
export function formatWeight(weight: number | null) { return weight === null ? '–' : Number.isInteger(weight) ? String(weight) : weight.toFixed(1) }
