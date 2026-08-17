/**
 * Single source of truth for the app's Monday-start week boundaries.
 *
 * The dashboard derived "days since Monday" as `(getDay() + 6) % 7` in two
 * separate places -- once to find this week's start for its `listSessions`
 * range, and again to bucket each session into a weekday column. The
 * statistics screen needs the same formula plus the ability to step to
 * arbitrary weeks, so it's consolidated here rather than re-derived a third
 * (and fourth) time.
 */

/** 로컬 기준 월요일=0 ~ 일요일=6 요일 인덱스. */
export function getMondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

/** 주어진 날짜가 속한 주의 월요일 00:00(로컬 자정)을 반환한다. */
export function getWeekStart(date: Date): Date {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - getMondayIndex(start))
  return start
}

/**
 * 주어진 주 시작(월요일 00:00)의 다음 주 시작.
 * `listSessions`의 배타적 상한(`startedBefore`)으로 쓴다.
 */
export function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 7)
  return end
}
