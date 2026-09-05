import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const restAlertsMock = vi.hoisted(() => ({
  notifyRestComplete: vi.fn(async () => undefined),
  requestRestAlerts: vi.fn(async () => true),
}))
const playRestFinishedAlert = vi.hoisted(() => vi.fn())

vi.mock('../../../lib/restAlerts', () => restAlertsMock)
vi.mock('../../../lib/restAlert', () => ({ playRestFinishedAlert }))

import { webRestNotificationAdapter } from './webRestNotificationAdapter'

const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')

describe('웹 휴식 알림 어댑터', () => {
  beforeEach(() => vi.clearAllMocks())

  afterEach(() => {
    if (originalVisibilityState) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityState)
    } else Reflect.deleteProperty(document, 'visibilityState')
  })

  test('기존 웹 알림 권한 요청을 유지한다', async () => {
    await expect(webRestNotificationAdapter.requestPermission()).resolves.toBe(true)
    expect(restAlertsMock.requestRestAlerts).toHaveBeenCalledOnce()
  })

  test('포그라운드에서는 기존 소리와 진동을 사용한다', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })

    await webRestNotificationAdapter.notifyTimerFinished(false)

    expect(playRestFinishedAlert).toHaveBeenCalledOnce()
    expect(restAlertsMock.notifyRestComplete).not.toHaveBeenCalled()
  })

  test('백그라운드이고 알림이 켜졌으면 기존 웹 Notification을 사용한다', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })

    await webRestNotificationAdapter.notifyTimerFinished(true)

    expect(playRestFinishedAlert).not.toHaveBeenCalled()
    expect(restAlertsMock.notifyRestComplete).toHaveBeenCalledOnce()
  })

  test('웹에서는 OS 예약 작업을 하지 않는다', async () => {
    await expect(webRestNotificationAdapter.sync(Date.now() + 90_000, true)).resolves.toBeUndefined()
  })
})
