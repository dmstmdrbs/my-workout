import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import {
  PushNotifications,
  type ActionPerformed,
  type Token,
} from '@capacitor/push-notifications'
import type { PluginListenerHandle } from '@capacitor/core'
import { useAppServices } from '../../services'
import {
  readRegisteredPushToken,
  saveRegisteredPushToken,
  unregisterCurrentPushDevice,
  useFriendActivityNotificationsEnabled,
} from '../../lib/friendActivityNotifications'

type NavigateCommand = (path: string) => void

interface NativePushNotificationOptions {
  authenticated: boolean
  authResolved: boolean
  onNavigate: NavigateCommand
}

export function useNativePushNotifications({
  authenticated,
  authResolved,
  onNavigate,
}: NativePushNotificationOptions) {
  const { socialRepository } = useAppServices()
  const enabled = useFriendActivityNotificationsEnabled()
  const navigateRef = useRef(onNavigate)
  navigateRef.current = onNavigate

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !authResolved) return
    let disposed = false
    const handles: PluginListenerHandle[] = []

    const retain = async (handlePromise: Promise<PluginListenerHandle>) => {
      try {
        const handle = await handlePromise
        if (disposed) await handle.remove().catch(() => undefined)
        else handles.push(handle)
      } catch {
        // listener 등록 실패는 다음 앱 시작 때 다시 시도한다.
      }
    }

    const setup = async () => {
      if (!authenticated || !enabled) {
        if (readRegisteredPushToken()) {
          await unregisterCurrentPushDevice(authenticated ? socialRepository : undefined)
        }
        return
      }

      await retain(PushNotifications.addListener('registration', (token: Token) => {
        if (disposed || !token.value) return
        saveRegisteredPushToken(token.value)
        const platform = Capacitor.getPlatform()
        if (platform !== 'ios' && platform !== 'android') return
        void socialRepository.registerPushDevice({ token: token.value, platform }).catch(() => undefined)
      }))
      await retain(PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
        const path = getPushNotificationPath(action.notification.data)
        if (!disposed && path) navigateRef.current(path)
      }))

      try {
        const permission = await PushNotifications.checkPermissions()
        if (permission.receive !== 'granted' || disposed) return
        if (Capacitor.getPlatform() === 'android') {
          await PushNotifications.createChannel({
            id: 'friend-activity',
            name: '친구 운동 소식',
            description: '친구가 운동을 시작했을 때 알려줍니다.',
            importance: 4,
            visibility: 1,
          })
        }
        await PushNotifications.register()
      } catch {
        // Firebase/APNs 설정이 아직 없거나 등록이 실패하면 다음 시작 때 재시도한다.
      }
    }

    void setup()
    return () => {
      disposed = true
      handles.forEach((handle) => { void handle.remove().catch(() => undefined) })
    }
  }, [authResolved, authenticated, enabled, socialRepository])
}

export function getPushNotificationPath(data: unknown) {
  if (!data || typeof data !== 'object') return null
  const path = (data as { path?: unknown }).path
  return path === '/friends' ? path : null
}
