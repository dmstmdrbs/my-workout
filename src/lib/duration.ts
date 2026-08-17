/**
 * Single source of truth for every workout-duration calculation in the app.
 *
 * Duration used to be re-derived independently in four places (the records
 * list/card, the dashboard's session row and weekly total, the runner
 * header's live clock, and the resume toast). Each copy computed the same
 * thing from the same two fields (`startedAt`/`completedAt`), which meant a
 * future change had four chances to be missed. Everything that needs a
 * duration should import from here instead of re-deriving it.
 */
import type { WorkoutSession } from '../types/domain'

/** 시작 시각부터 지금까지의 경과 초. */
export function getElapsedSeconds(startedAt: string, now = Date.now()): number {
  const startedAtMs = Date.parse(startedAt)
  return Number.isFinite(startedAtMs) ? Math.max(0, Math.floor((now - startedAtMs) / 1_000)) : 0
}

/** 초를 `mm:ss` 또는 `hh:mm:ss` 시계 표기로 바꾼다. */
export function formatElapsedClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** 러너 헤더/재개 토스트가 쓰는 실시간 경과 시계 표기. */
export function formatElapsedTime(startedAt: string, now = Date.now()): string {
  return formatElapsedClock(getElapsedSeconds(startedAt, now))
}

/** 완료된 세션의 실제 운동 시간(분). */
export function getSessionDurationMinutes(session: Pick<WorkoutSession, 'startedAt' | 'completedAt'>): number {
  if (!session.completedAt) return 0
  const startedAtMs = new Date(session.startedAt).getTime()
  const completedAtMs = new Date(session.completedAt).getTime()
  return Math.max(0, Math.round((completedAtMs - startedAtMs) / 60_000))
}
