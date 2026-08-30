const restAlertsKey = 'trainlog:rest-alerts-enabled:v1'

export function readRestAlertsEnabled() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(restAlertsKey) === 'true'
}

export function disableRestAlerts() {
  window.localStorage.removeItem(restAlertsKey)
}

export async function requestRestAlerts() {
  const NotificationApi = (window as unknown as { Notification?: typeof Notification }).Notification
  if (!NotificationApi) {
    if ('vibrate' in navigator) {
      localStorage.setItem(restAlertsKey, 'true')
      return true
    }
    return false
  }

  const permission = NotificationApi.permission === 'default'
    ? await NotificationApi.requestPermission()
    : NotificationApi.permission
  if (permission !== 'granted') return false
  window.localStorage.setItem(restAlertsKey, 'true')
  return true
}

export async function notifyRestComplete() {
  if (!readRestAlertsEnabled()) return
  if ('vibrate' in navigator) navigator.vibrate([120, 60, 120])
  const NotificationApi = (window as unknown as { Notification?: typeof Notification }).Notification
  if (document.visibilityState === 'visible' || !NotificationApi || NotificationApi.permission !== 'granted') return

  const options: NotificationOptions = {
    body: '다음 세트를 시작할 시간이에요.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'trainlog-rest-complete',
    data: { url: '/workout' },
  }
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) await registration.showNotification('휴식 시간이 끝났어요', options)
    else new NotificationApi('휴식 시간이 끝났어요', options)
  } catch {
    // 알림 지원이 불완전한 브라우저에서도 운동 기록은 계속 동작해야 한다.
  }
}
