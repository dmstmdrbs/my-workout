import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { env } from '../../lib/env'

type NavigateCommand = (path: string) => void

export function useNativeAppLinks(onNavigate: NavigateCommand) {
  const navigateRef = useRef(onNavigate)
  navigateRef.current = onNavigate

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let isActive = true
    let eventUrlBeforeLaunchCheck: string | null = null
    let launchCheckComplete = false
    let removeListener: (() => Promise<void>) | undefined

    const open = (candidate: string) => {
      const path = getNativeAppPath(candidate)
      if (isActive && path) navigateRef.current(path)
    }

    void App.addListener('appUrlOpen', ({ url }) => {
      if (!launchCheckComplete) eventUrlBeforeLaunchCheck = url
      open(url)
    }).then((handle) => {
      if (!isActive) void handle.remove()
      else removeListener = () => handle.remove()
      return App.getLaunchUrl()
    }).then((launch) => {
      if (launch?.url && launch.url !== eventUrlBeforeLaunchCheck) open(launch.url)
    }).catch(() => {
      // 딥링크 초기화 실패가 일반 앱 내비게이션을 막아서는 안 된다.
    }).finally(() => {
      launchCheckComplete = true
    })

    return () => {
      isActive = false
      if (removeListener) void removeListener()
    }
  }, [])
}

export function getNativeAppPath(candidate: string, publicAppUrl = env.publicAppUrl) {
  try {
    const url = new URL(candidate)
    const isCustomInvite = url.protocol === 'trainlog:' && url.hostname === 'friends'
    const isPublicInvite = url.origin === new URL(publicAppUrl).origin
    if (!isCustomInvite && !isPublicInvite) return null

    const path = isCustomInvite ? `/friends${url.pathname}` : url.pathname
    return /^\/friends\/invite\/[^/]+\/?$/.test(path) ? path : null
  } catch {
    return null
  }
}
