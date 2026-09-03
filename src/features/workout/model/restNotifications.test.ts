import { beforeEach, describe, expect, test, vi } from 'vitest'

const capacitorMock = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
}))
const nativeAdapterMock = vi.hoisted(() => ({
  requestPermission: vi.fn(async () => true),
  sync: vi.fn(async () => undefined),
  notifyTimerFinished: vi.fn(async () => undefined),
}))
const webAdapterMock = vi.hoisted(() => ({
  requestPermission: vi.fn(async () => true),
  sync: vi.fn(async () => undefined),
  notifyTimerFinished: vi.fn(async () => undefined),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: capacitorMock }))
vi.mock('./nativeRestNotificationAdapter', () => ({
  nativeRestNotificationAdapter: nativeAdapterMock,
}))
vi.mock('./webRestNotificationAdapter', () => ({
  webRestNotificationAdapter: webAdapterMock,
}))

import {
  getRestNotificationAdapter,
  notifyRestTimerFinished,
  requestRestNotificationPermission,
  syncRestNotification,
} from './restNotifications'

describe('휴식 알림 플랫폼 경계', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capacitorMock.isNativePlatform.mockReturnValue(true)
  })

  test('네이티브 앱에서는 Capacitor 어댑터에 위임한다', async () => {
    const restEndsAt = Date.now() + 90_000

    expect(getRestNotificationAdapter()).toBe(nativeAdapterMock)
    await requestRestNotificationPermission()
    await syncRestNotification(restEndsAt, true)
    await notifyRestTimerFinished(true)

    expect(nativeAdapterMock.requestPermission).toHaveBeenCalledOnce()
    expect(nativeAdapterMock.sync).toHaveBeenCalledWith(restEndsAt, true)
    expect(nativeAdapterMock.notifyTimerFinished).toHaveBeenCalledWith(true)
    expect(webAdapterMock.sync).not.toHaveBeenCalled()
  })

  test('브라우저에서는 기존 웹 어댑터에 위임한다', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(false)
    const restEndsAt = Date.now() + 90_000

    expect(getRestNotificationAdapter()).toBe(webAdapterMock)
    await requestRestNotificationPermission()
    await syncRestNotification(restEndsAt, true)
    await notifyRestTimerFinished(true)

    expect(webAdapterMock.requestPermission).toHaveBeenCalledOnce()
    expect(webAdapterMock.sync).toHaveBeenCalledWith(restEndsAt, true)
    expect(webAdapterMock.notifyTimerFinished).toHaveBeenCalledWith(true)
    expect(nativeAdapterMock.sync).not.toHaveBeenCalled()
  })
})
