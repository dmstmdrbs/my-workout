import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { focusManager } from '@tanstack/react-query'

interface AppState {
  isActive: boolean
}

interface AppStateListenerHandle {
  remove(): Promise<void>
}

export interface NativeAppStateAdapter {
  getState(): Promise<AppState>
  addListener(
    eventName: 'appStateChange',
    listener: (state: AppState) => void,
  ): Promise<AppStateListenerHandle>
}

export function subscribeToNativeAppState(
  app: NativeAppStateAdapter,
  setFocused: (focused: boolean) => void,
) {
  let isDisposed = false
  let listenerHandle: AppStateListenerHandle | undefined
  const applyState = ({ isActive }: AppState) => {
    if (!isDisposed) setFocused(isActive)
  }

  void app.getState()
    .then(applyState)
    // 플러그인을 읽지 못해도 앱을 비활성 상태로 고정하지 않는다.
    .catch(() => { if (!isDisposed) setFocused(true) })

  void app.addListener('appStateChange', applyState)
    .then((handle) => {
      if (isDisposed) {
        void handle.remove().catch(() => undefined)
        return
      }
      listenerHandle = handle
    })
    .catch(() => undefined)

  return () => {
    isDisposed = true
    if (listenerHandle) void listenerHandle.remove().catch(() => undefined)
  }
}

export function configureNativeFocusManager() {
  if (!Capacitor.isNativePlatform()) return
  focusManager.setEventListener((setFocused) => subscribeToNativeAppState(App, setFocused))
}
