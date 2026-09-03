import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

export const restCompleteNotificationId = 73_001
export const restCompleteNotificationPath = '/workout'

let notificationQueue = Promise.resolve()

export function usesNativeRestNotifications() {
  return Capacitor.isNativePlatform()
}

export async function requestNativeRestNotificationPermission() {
  if (!usesNativeRestNotifications()) return false

  try {
    const current = await LocalNotifications.checkPermissions()
    const permission = current.display === 'prompt' || current.display === 'prompt-with-rationale'
      ? await LocalNotifications.requestPermissions()
      : current
    return permission.display === 'granted'
  } catch {
    return false
  }
}

/**
 * 휴식 종료 알림은 React 타이머가 아니라 운영체제에 예약한다. 동일한 ID를
 * 사용해 시간 조정, 중단, 다음 세트 시작이 항상 이전 예약을 대체하게 한다.
 */
export function syncNativeRestNotification(restEndsAt: number | null, enabled: boolean) {
  if (!usesNativeRestNotifications()) return Promise.resolve()

  notificationQueue = notificationQueue
    .catch(() => undefined)
    .then(async () => {
      await LocalNotifications.cancel({ notifications: [{ id: restCompleteNotificationId }] })
      if (!enabled || restEndsAt === null || restEndsAt <= Date.now()) return

      await LocalNotifications.schedule({
        notifications: [{
          id: restCompleteNotificationId,
          title: '휴식 시간이 끝났어요',
          body: '다음 세트를 시작할 시간이에요.',
          schedule: {
            at: new Date(restEndsAt),
            allowWhileIdle: true,
          },
          sound: 'default',
          foreground: true,
          autoCancel: true,
          isExactNotification: true,
          extra: { path: restCompleteNotificationPath },
        }],
      })
    })

  return notificationQueue
}
