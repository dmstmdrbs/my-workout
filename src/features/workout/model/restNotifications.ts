import { Capacitor } from '@capacitor/core'
import { nativeRestNotificationAdapter } from './nativeRestNotificationAdapter'
import type { RestNotificationAdapter } from './restNotificationAdapter'
import { webRestNotificationAdapter } from './webRestNotificationAdapter'

export function getRestNotificationAdapter(): RestNotificationAdapter {
  return Capacitor.isNativePlatform()
    ? nativeRestNotificationAdapter
    : webRestNotificationAdapter
}

export function requestRestNotificationPermission() {
  return getRestNotificationAdapter().requestPermission()
}

/**
 * 네이티브는 동일한 ID의 OS 예약을 교체하고, 웹은 예약 API가 없어 no-op이다.
 */
export function syncRestNotification(restEndsAt: number | null, enabled: boolean) {
  return getRestNotificationAdapter().sync(restEndsAt, enabled)
}

export function notifyRestTimerFinished(enabled: boolean) {
  return getRestNotificationAdapter().notifyTimerFinished(enabled)
}
