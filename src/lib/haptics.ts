import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

export function signalSetCompleted() {
  if (!Capacitor.isNativePlatform()) return
  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined)
}

export function signalRestFinished() {
  if (Capacitor.isNativePlatform()) {
    void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined)
    return
  }

  if (typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate([180, 90, 180])
  } catch {
    // 사용자 설정이나 브라우저 정책으로 막힐 수 있다.
  }
}
