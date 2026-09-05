import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.hoisted(() => {
  const listeners = new Map<string, (value: never) => void>()
  return {
    listeners,
    addListener: vi.fn(async (event: string, listener: (value: never) => void) => {
      listeners.set(event, listener)
      return { remove: vi.fn(async () => undefined) }
    }),
    checkPermissions: vi.fn(async () => ({ receive: 'granted' })),
    createChannel: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
  }
})
const unregisterCurrentPushDevice = vi.hoisted(() => vi.fn(async () => undefined))
const registerPushDevice = vi.hoisted(() => vi.fn(async () => undefined))
const socialRepository = vi.hoisted(() => ({ registerPushDevice }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: pushMock }))
vi.mock('../../services', () => ({
  useAppServices: () => ({ socialRepository }),
}))
vi.mock('../../lib/friendActivityNotifications', () => ({
  readRegisteredPushToken: () => 'registered-token',
  saveRegisteredPushToken: vi.fn(),
  unregisterCurrentPushDevice,
  useFriendActivityNotificationsEnabled: () => true,
}))

import { getPushNotificationPath, useNativePushNotifications } from './useNativePushNotifications'

describe('친구 활동 push 이동', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pushMock.listeners.clear()
  })

  it('서버가 보낸 친구 목록 경로만 허용한다', () => {
    expect(getPushNotificationPath({ path: '/friends' })).toBe('/friends')
    expect(getPushNotificationPath({ path: '/settings' })).toBeNull()
    expect(getPushNotificationPath({ path: 'https://example.com' })).toBeNull()
  })

  it('인증 부트스트랩 중에는 기존 push token을 해제하지 않는다', async () => {
    renderHook(() => useNativePushNotifications({
      authenticated: false,
      authResolved: false,
      onNavigate: vi.fn(),
    }))

    await Promise.resolve()

    expect(unregisterCurrentPushDevice).not.toHaveBeenCalled()
    expect(pushMock.addListener).not.toHaveBeenCalled()
  })

  it('내비게이션 콜백이 바뀌어도 listener와 push 등록을 다시 설정하지 않는다', async () => {
    const firstNavigate = vi.fn()
    const secondNavigate = vi.fn()
    const { rerender } = renderHook(
      ({ onNavigate }) => useNativePushNotifications({ authenticated: true, authResolved: true, onNavigate }),
      { initialProps: { onNavigate: firstNavigate } },
    )
    await waitFor(() => expect(pushMock.register).toHaveBeenCalledOnce())

    rerender({ onNavigate: secondNavigate })
    pushMock.listeners.get('pushNotificationActionPerformed')?.({
      notification: { data: { path: '/friends' } },
    } as never)

    expect(pushMock.addListener).toHaveBeenCalledTimes(2)
    expect(pushMock.register).toHaveBeenCalledOnce()
    expect(firstNavigate).not.toHaveBeenCalled()
    expect(secondNavigate).toHaveBeenCalledWith('/friends')
  })
})
