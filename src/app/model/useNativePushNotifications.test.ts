import { describe, expect, it } from 'vitest'
import { getPushNotificationPath } from './useNativePushNotifications'

describe('친구 활동 push 이동', () => {
  it('서버가 보낸 친구 목록 경로만 허용한다', () => {
    expect(getPushNotificationPath({ path: '/friends' })).toBe('/friends')
    expect(getPushNotificationPath({ path: '/settings' })).toBeNull()
    expect(getPushNotificationPath({ path: 'https://example.com' })).toBeNull()
  })
})
