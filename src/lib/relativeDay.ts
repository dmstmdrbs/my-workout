/**
 * 달력상 며칠 차이인지. 두 시각을 각자 자정으로 내린 뒤 빼므로, 23시간짜리
 * 날(서머타임 시작)이나 25시간짜리 날이 섞여도 결과가 밀리지 않는다. 밀리초
 * 차이를 그냥 86400000으로 나누면 그런 날에 하루가 어긋난다.
 */
export function calendarDaysBetween(from: Date, to: Date): number {
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((toMidnight.getTime() - fromMidnight.getTime()) / 86_400_000)
}

/** 상대 표기가 감을 주지 못하는 시점. 이 이상은 날짜를 그대로 보여준다. */
const ABSOLUTE_THRESHOLD_DAYS = 30

/**
 * "오늘" / "어제" / "N일 전" / 절대 날짜. 30일이 넘어가면 "37일 전"보다
 * 날짜 자체가 읽기 쉬워 절대 표기로 넘어간다. 미래 시각(기기 시계 차이 등)은
 * "오늘"로 처리한다 -- "-1일 전" 같은 표기를 내놓지 않기 위함이다.
 */
export function formatRelativeDay(isoDateTime: string, now: Date): string {
  const date = new Date(isoDateTime)
  if (Number.isNaN(date.getTime())) return ''

  const days = calendarDaysBetween(date, now)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  if (days <= ABSOLUTE_THRESHOLD_DAYS) return `${days}일 전`
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
