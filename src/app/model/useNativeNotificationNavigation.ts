import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

type NavigateCommand = (path: string) => void

export function useNativeNotificationNavigation(onNavigate: NavigateCommand) {
  const navigateRef = useRef(onNavigate)
  navigateRef.current = onNavigate

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let isActive = true
    let removeListener: (() => Promise<void>) | undefined

    void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const path = getNotificationPath(action)
      if (isActive && path) navigateRef.current(path)
    }).then((handle) => {
      if (!isActive) void handle.remove()
      else removeListener = () => handle.remove()
    }).catch(() => {
      // 알림 플러그인 초기화 실패가 앱 라우팅 전체를 막아서는 안 된다.
    })

    return () => {
      isActive = false
      if (removeListener) void removeListener()
    }
  }, [])
}

export function getNotificationPath(action: { notification: { extra?: { path?: unknown } } }) {
  const path = action.notification.extra?.path
  return path === '/workout' || path === '/' ? path : null
}
