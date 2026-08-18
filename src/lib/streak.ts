import { toLocalDateKey } from './week'

/**
 * 연속 기록(streak)을 셀 때 과거로 훑는 한도(일). AGENTS.md 11번 규칙은 세션
 * 목록의 무제한 조회를 금지하는데, "연속 며칠째인가"는 자연스러운 상한이 없는
 * 질문이다 -- 사용자가 오래 꾸준히 하면 할수록 조회 범위가 끝없이 늘어난다.
 * 90일이면 3개월 가까이를 보되, 그 이상 이어진 연속 기록은 정확한 일수 대신
 * "90일 이상"으로 정직하게 표시한다(`isCapped`). 실제로 90일보다 긴 연속
 * 기록을 가진 사용자는 90으로 잘려 보이는 대신 상한에 도달했다는 사실 자체를
 * 보게 된다.
 */
export const STREAK_LOOKBACK_CAP_DAYS = 90

export interface StreakResult {
  /** 캡에 도달하지 않았다면 정확한 연속 일수, 도달했다면 캡까지 확인된 일수. */
  days: number
  /** true면 `days`가 실제 연속 일수의 하한일 뿐 정확한 값이 아니다. */
  isCapped: boolean
}

/**
 * 오늘 아직 운동하지 않았다고 해서 어제까지 이어온 연속 기록이 끊긴 것으로
 * 취급하지 않는다 -- 자정이 지나자마자, 아침을 먹기도 전에 스트릭이 깨졌다고
 * 보여주는 건 나쁜 설계다. 그래서 기준일을 "오늘 운동을 완료했으면 오늘부터,
 * 아니면 어제부터"로 잡는다. 어제도 하지 않았다면(이미 끊긴 상태) 0을 반환한다.
 *
 * `workoutDayKeys`는 `toLocalDateKey`로 만든 로컬 날짜 키 집합이며,
 * `STREAK_LOOKBACK_CAP_DAYS`만큼의 기간만 커버한다고 가정한다. 그 기간을 하루도
 * 빠짐없이 다 채워도 연속 기록이 끊기지 않았다면, 창 밖의 더 오래된 데이터는
 * 조회하지 않았으므로 실제로 얼마나 긴지 알 수 없다 -- 그 경우 `isCapped`를
 * true로 표시한다.
 */
export function computeStreak(workoutDayKeys: Set<string>, today: Date, capDays: number): StreakResult {
  const todayStart = new Date(today)
  todayStart.setHours(0, 0, 0, 0)

  const cursor = new Date(todayStart)
  if (!workoutDayKeys.has(toLocalDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  if (!workoutDayKeys.has(toLocalDateKey(cursor))) {
    return { days: 0, isCapped: false }
  }

  const windowStart = new Date(todayStart)
  windowStart.setDate(windowStart.getDate() - capDays)

  let days = 0
  while (workoutDayKeys.has(toLocalDateKey(cursor))) {
    days += 1
    if (cursor.getTime() <= windowStart.getTime()) {
      // The entire fetched window was consecutive -- there may be more
      // history before it that was never queried, so this is a floor, not
      // an exact count.
      return { days, isCapped: true }
    }
    cursor.setDate(cursor.getDate() - 1)
  }
  return { days, isCapped: false }
}
