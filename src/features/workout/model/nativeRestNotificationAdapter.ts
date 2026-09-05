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
            // 앱이 열려 있을 때는 JS timer가 소리·햅틱을 담당한다.
            // OS 표시는 백그라운드에서만 사용해 중복 신호를 피한다.
            foreground: false,
            autoCancel: true,
            isExactNotification: true,
            extra: { path: restCompleteNotificationPath },
          }],
        })
      })

    return notificationQueue
  },

  async notifyTimerFinished(_enabled) {
    // OS 예약 취소와 timer callback의 경쟁에 의존하지 않고,
    // 앱이 열려 있을 때는 항상 앱이 완료 신호를 보장한다.
    if (document.visibilityState === 'visible') playRestFinishedAlert()
  },
}
