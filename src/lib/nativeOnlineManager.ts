import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { onlineManager } from '@tanstack/react-query'

interface NetworkStatus {
  connected: boolean
}

interface NetworkListenerHandle {
  remove(): Promise<void>
}

export interface NativeNetworkAdapter {
  getStatus(): Promise<NetworkStatus>
  addListener(
    eventName: 'networkStatusChange',
    listener: (status: NetworkStatus) => void,
  ): Promise<NetworkListenerHandle>
}

export function subscribeToNativeNetwork(
  network: NativeNetworkAdapter,
  setOnline: (online: boolean) => void,
) {
  let isDisposed = false
  let listenerHandle: NetworkListenerHandle | undefined
  const applyStatus = ({ connected }: NetworkStatus) => {
    if (!isDisposed) setOnline(connected)
  }

  void network.getStatus()
    .then(applyStatus)
    // A missing native plugin must not leave every server query paused forever.
    .catch(() => { if (!isDisposed) setOnline(true) })

  void network.addListener('networkStatusChange', applyStatus)
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

export function configureNativeOnlineManager() {
  if (!Capacitor.isNativePlatform()) return
  onlineManager.setEventListener((setOnline) => subscribeToNativeNetwork(Network, setOnline))
}
