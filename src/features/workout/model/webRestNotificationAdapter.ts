import { playRestFinishedAlert } from '../../../lib/restAlert'
import { notifyRestComplete, requestRestAlerts } from '../../../lib/restAlerts'
import type { RestNotificationAdapter } from './restNotificationAdapter'

export const webRestNotificationAdapter: RestNotificationAdapter = {
  requestPermission: requestRestAlerts,

  async sync() {
    // 웹에는 특정 시각의 로컬 알림을 운영체제에 예약하는 표준 API가 없다.
  },

  async notifyTimerFinished(enabled) {
    if (document.visibilityState === 'visible') {
      playRestFinishedAlert()
      return
    }
    if (enabled) await notifyRestComplete()
  },
}
