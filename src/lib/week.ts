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

/** 주어진 날짜가 속한 달의 1일 00:00(로컬 자정)을 반환한다. */
export function getMonthStart(date: Date): Date {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(1)
  return start
}

/**
 * 주어진 달 시작(1일 00:00)의 다음 달 시작.
 * `listSessions`의 배타적 상한(`startedBefore`)으로 쓴다. `monthStart`의 일자는
 * 항상 1이므로 `setMonth`로 넘어가도 말일 overflow(예: 1월 31일 + 1개월 = 3월
 * 3일) 문제가 생기지 않는다.
 */
export function getMonthEnd(monthStart: Date): Date {
  const end = new Date(monthStart)
  end.setMonth(end.getMonth() + 1)
  return end
}

/**
 * `YYYY-MM-DD` 로컬 날짜 키를 그 날 00:00(로컬 자정)으로 되돌린다.
 * `toLocalDateKey`의 역이다. `new Date('2026-08-26')`는 UTC로 해석돼 한국에서
 * 하루 전 09시가 되므로 쓰지 않는다.
 */
export function fromLocalDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * 주어진 날 시작(00:00)의 다음 날 시작.
 * `listSessions`의 배타적 상한(`startedBefore`)으로 쓴다.
 */
export function getDayEnd(dayStart: Date): Date {
  const end = new Date(dayStart)
  end.setDate(end.getDate() + 1)
  return end
}

/**
 * 로컬 달력 날짜를 `YYYY-MM-DD`로 정규화한다.
 *
 * `toISOString().slice(0, 10)`은 UTC 기준이라, 한국(UTC+9)처럼 UTC보다 앞선
 * 지역에서는 로컬 자정부터 오전 9시 사이의 시각이 하루 전 날짜로 밀린다. 세션을
 * "몇 월 며칠에 했는가"로 묶을 때는(월간 달력, 연속 기록 계산 등) 항상 이
 * 함수를 쓰고, `toISOString`으로 직접 날짜를 잘라내지 않는다.
 */
export function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
