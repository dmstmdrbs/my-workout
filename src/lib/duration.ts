/**
 * Single source of truth for every workout-duration calculation in the app.
 *
 * Duration used to be re-derived independently in four places (the records
 * list/card, the dashboard's session row and weekly total, the runner
 * header's live clock, and the resume toast). Each copy computed the same
 * thing from the same two fields (`startedAt`/`completedAt`), which meant a
 * future change -- like subtracting paused time -- had four chances to be
 * missed. Everything that needs a duration should import from here instead
 * of re-deriving it.
 */
import type { WorkoutSession } from '../types/domain'

/** 시작 시각부터 지금까지의 경과 초. 일시정지 누적 시간은 제외한다. */
export function getElapsedSeconds(startedAt: string, now = Date.now(), pausedSeconds = 0): number {
  const startedAtMs = Date.parse(startedAt)
  if (!Number.isFinite(startedAtMs)) return 0
  const rawSeconds = Math.floor((now - startedAtMs) / 1_000)
  return Math.max(0, rawSeconds - Math.max(0, pausedSeconds))
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
export function formatElapsedTime(startedAt: string, now = Date.now(), pausedSeconds = 0): string {
  return formatElapsedClock(getElapsedSeconds(startedAt, now, pausedSeconds))
}

/**
 * 현재 진행 중인 일시정지까지 포함한 총 일시정지 초.
 * `pausedAt`이 없으면(일시정지 중이 아니면) 이미 누적된 `pausedSeconds`만
 * 돌려주고, 있으면 그 순간부터 지금까지 흐른 시간을 더한다. 그래서 일시정지
 * 중에는 실제 시간이 얼마나 흘렀든(화면을 보고 있든, 새로고침했든) 경과
 * 시간이 항상 일시정지가 시작된 시점에 멈춘 값으로 계산된다.
 */
export function getEffectivePausedSeconds(pausedSeconds: number, pausedAt: number | null, now: number): number {
  const accumulated = Math.max(0, pausedSeconds)
  if (pausedAt === null) return accumulated
  return accumulated + Math.max(0, Math.floor((now - pausedAt) / 1_000))
}

/** 완료된 세션의 실제 운동 시간(분). 일시정지 누적 시간은 제외한다. */
export function getSessionDurationMinutes(session: Pick<WorkoutSession, 'startedAt' | 'completedAt' | 'pausedSeconds'>): number {
  if (!session.completedAt) return 0
  const startedAtMs = new Date(session.startedAt).getTime()
  const completedAtMs = new Date(session.completedAt).getTime()
  const pausedMs = Math.max(0, session.pausedSeconds ?? 0) * 1_000
  return Math.max(0, Math.round((completedAtMs - startedAtMs - pausedMs) / 60_000))
}
