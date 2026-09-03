import { beforeEach, describe, expect, test, vi } from 'vitest'

const capacitorMock = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
}))

const localNotificationsMock = vi.hoisted(() => ({
  cancel: vi.fn(async () => undefined),
  checkPermissions: vi.fn(async () => ({ display: 'granted' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  schedule: vi.fn(async () => ({ notifications: [{ id: 73_001 }] })),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: capacitorMock }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: localNotificationsMock }))

import {
  requestNativeRestNotificationPermission,
  restCompleteNotificationId,
  syncNativeRestNotification,
} from './restNotifications'

describe('네이티브 휴식 알림', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capacitorMock.isNativePlatform.mockReturnValue(true)
    localNotificationsMock.checkPermissions.mockResolvedValue({ display: 'granted' })
  })

  test('이전 예약을 취소한 뒤 종료 시각을 OS에 예약한다', async () => {
    const restEndsAt = Date.now() + 90_000

    await syncNativeRestNotification(restEndsAt, true)

    expect(localNotificationsMock.cancel).toHaveBeenCalledWith({
      notifications: [{ id: restCompleteNotificationId }],
    })
    expect(localNotificationsMock.schedule).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({
        id: restCompleteNotificationId,
        schedule: expect.objectContaining({ at: new Date(restEndsAt), allowWhileIdle: true }),
        isExactNotification: true,
        extra: { path: '/workout' },
      })],
    })
  })

  test('알림을 끄면 예약만 취소한다', async () => {
    await syncNativeRestNotification(Date.now() + 90_000, false)

    expect(localNotificationsMock.cancel).toHaveBeenCalledTimes(1)
    expect(localNotificationsMock.schedule).not.toHaveBeenCalled()
  })

  test('권한이 아직 결정되지 않았으면 요청한다', async () => {
    localNotificationsMock.checkPermissions.mockResolvedValue({ display: 'prompt' })

    await expect(requestNativeRestNotificationPermission()).resolves.toBe(true)
    expect(localNotificationsMock.requestPermissions).toHaveBeenCalledTimes(1)
  })

  test('웹에서는 네이티브 플러그인을 호출하지 않는다', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(false)

    await syncNativeRestNotification(Date.now() + 90_000, true)

    expect(localNotificationsMock.cancel).not.toHaveBeenCalled()
    expect(localNotificationsMock.schedule).not.toHaveBeenCalled()
  })
})
