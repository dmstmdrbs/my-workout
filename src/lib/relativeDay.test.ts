import { describe, expect, test } from 'vitest'
import { calendarDaysBetween, formatRelativeDay } from './relativeDay'

describe('calendarDaysBetween', () => {
  test('시각이 아니라 달력 날짜로 센다', () => {
    // 23시간 차이지만 날짜는 하루 넘어간다.
    expect(calendarDaysBetween(new Date(2025, 0, 1, 23, 30), new Date(2025, 0, 2, 22, 30))).toBe(1)
    // 반대로 25시간 차이라도 이틀은 아니다.
    expect(calendarDaysBetween(new Date(2025, 0, 1, 1, 0), new Date(2025, 0, 2, 2, 0))).toBe(1)
  })

  test('같은 날이면 0이다', () => {
    expect(calendarDaysBetween(new Date(2025, 0, 1, 0, 5), new Date(2025, 0, 1, 23, 55))).toBe(0)
  })
})

describe('formatRelativeDay', () => {
  const now = new Date(2025, 5, 15, 12, 0)

  test('오늘·어제·N일 전을 구분한다', () => {
    expect(formatRelativeDay(new Date(2025, 5, 15, 7, 0).toISOString(), now)).toBe('오늘')
    expect(formatRelativeDay(new Date(2025, 5, 14, 22, 0).toISOString(), now)).toBe('어제')
    expect(formatRelativeDay(new Date(2025, 5, 10, 9, 0).toISOString(), now)).toBe('5일 전')
  })

  test('30일을 넘으면 절대 날짜로 바꾼다', () => {
    expect(formatRelativeDay(new Date(2025, 4, 16, 9, 0).toISOString(), now)).toBe('30일 전')
    expect(formatRelativeDay(new Date(2025, 4, 15, 9, 0).toISOString(), now)).toBe('2025-05-15')
  })

  test('미래 시각은 오늘로 처리한다', () => {
    expect(formatRelativeDay(new Date(2025, 5, 16, 9, 0).toISOString(), now)).toBe('오늘')
  })

  test('해석할 수 없는 값은 빈 문자열이다', () => {
    expect(formatRelativeDay('언제인지 모름', now)).toBe('')
  })
})
