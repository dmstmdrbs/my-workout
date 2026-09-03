import { describe, expect, test } from 'vitest'
import { getNotificationPath } from './useNativeNotificationNavigation'

describe('네이티브 알림 이동', () => {
  test('휴식 알림은 운동 화면으로 이동한다', () => {
    expect(getNotificationPath({ notification: { extra: { path: '/workout' } } })).toBe('/workout')
  })

  test('운동 공백 리마인더는 홈으로 이동한다', () => {
    expect(getNotificationPath({ notification: { extra: { path: '/' } } })).toBe('/')
  })

  test('허용하지 않은 경로는 무시한다', () => {
    expect(getNotificationPath({ notification: { extra: { path: 'https://example.com' } } })).toBeNull()
  })
})
