import { LocalNotifications } from '@capacitor/local-notifications'
import { playRestFinishedAlert } from '../../../lib/restAlert'
import type { RestNotificationAdapter } from './restNotificationAdapter'

export const restCompleteNotificationId = 73_001
export const restCompleteNotificationPath = '/workout'

let notificationQueue = Promise.resolve()

export const nativeRestNotificationAdapter: RestNotificationAdapter = {
  async requestPermission() {
    try {
      const current = await LocalNotifications.checkPermissions()
      const permission = current.display === 'prompt' || current.display === 'prompt-with-rationale'
        ? await LocalNotifications.requestPermissions()
        : current
      return permission.display === 'granted'
    } catch {
      return false
    }
  },

  sync(restEndsAt, enabled) {
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
  },

  async notifyTimerFinished(enabled) {
    // 알림 권한을 사용하지 않더라도 앱이 열려 있으면 기존 소리와 진동은 유지한다.
    if (!enabled && document.visibilityState === 'visible') playRestFinishedAlert()
  },
}
