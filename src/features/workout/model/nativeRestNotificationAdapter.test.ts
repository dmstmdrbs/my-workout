import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const localNotificationsMock = vi.hoisted(() => ({
  cancel: vi.fn(async () => undefined),
  checkPermissions: vi.fn(async () => ({ display: 'granted' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  schedule: vi.fn(async () => ({ notifications: [{ id: 73_001 }] })),
}))
const playRestFinishedAlert = vi.hoisted(() => vi.fn())

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: localNotificationsMock }))
vi.mock('../../../lib/restAlert', () => ({ playRestFinishedAlert }))

import {
  nativeRestNotificationAdapter,
  restCompleteNotificationId,
} from './nativeRestNotificationAdapter'

const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')

describe('네이티브 휴식 알림 어댑터', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localNotificationsMock.checkPermissions.mockResolvedValue({ display: 'granted' })
  })

  afterEach(() => {
    if (originalVisibilityState) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityState)
    } else Reflect.deleteProperty(document, 'visibilityState')
  })

  test('이전 예약을 취소한 뒤 종료 시각을 OS에 예약한다', async () => {
    const restEndsAt = Date.now() + 90_000

    await nativeRestNotificationAdapter.sync(restEndsAt, true)

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
    await nativeRestNotificationAdapter.sync(Date.now() + 90_000, false)

    expect(localNotificationsMock.cancel).toHaveBeenCalledTimes(1)
    expect(localNotificationsMock.schedule).not.toHaveBeenCalled()
  })

  test('권한이 아직 결정되지 않았으면 요청한다', async () => {
    localNotificationsMock.checkPermissions.mockResolvedValue({ display: 'prompt' })

    await expect(nativeRestNotificationAdapter.requestPermission()).resolves.toBe(true)
    expect(localNotificationsMock.requestPermissions).toHaveBeenCalledTimes(1)
  })

  test('플러그인 권한 확인 실패는 알림 비활성으로 처리한다', async () => {
    localNotificationsMock.checkPermissions.mockRejectedValueOnce(new Error('plugin unavailable'))

    await expect(nativeRestNotificationAdapter.requestPermission()).resolves.toBe(false)
  })

  test('실패한 예약 뒤의 취소 요청도 계속 처리한다', async () => {
    localNotificationsMock.schedule.mockRejectedValueOnce(new Error('schedule failed'))

    await expect(nativeRestNotificationAdapter.sync(Date.now() + 90_000, true)).rejects.toThrow('schedule failed')
    await expect(nativeRestNotificationAdapter.sync(null, false)).resolves.toBeUndefined()

    expect(localNotificationsMock.cancel).toHaveBeenCalledTimes(2)
  })

  test('OS 알림이 꺼진 포그라운드에서는 앱 자체 알림을 유지한다', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })

    await nativeRestNotificationAdapter.notifyTimerFinished(false)

    expect(playRestFinishedAlert).toHaveBeenCalledOnce()
  })

  test('OS 알림이 켜졌으면 포그라운드 앱 알림을 중복 재생하지 않는다', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })

    await nativeRestNotificationAdapter.notifyTimerFinished(true)

    expect(playRestFinishedAlert).not.toHaveBeenCalled()
  })
})
