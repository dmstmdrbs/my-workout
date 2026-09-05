import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

interface KeyboardListenerHandle {
  remove(): Promise<void>
}

export interface NativeKeyboardAdapter {
  addListener(eventName: 'keyboardWillShow', listener: () => void): Promise<KeyboardListenerHandle>
  addListener(eventName: 'keyboardWillHide', listener: () => void): Promise<KeyboardListenerHandle>
}

export function subscribeToNativeKeyboard(
  keyboard: NativeKeyboardAdapter,
  setOpen: (open: boolean) => void,
) {
  let disposed = false
  const handles: KeyboardListenerHandle[] = []

  const register = async (handlePromise: Promise<KeyboardListenerHandle>) => {
    try {
      const handle = await handlePromise
      if (disposed) await handle.remove().catch(() => undefined)
      else handles.push(handle)
    } catch {
      // 키보드 이벤트를 읽지 못해도 native resize 설정은 계속 동작한다.
    }
  }

  void register(keyboard.addListener('keyboardWillShow', () => {
    if (!disposed) setOpen(true)
  }))
  void register(keyboard.addListener('keyboardWillHide', () => {
    if (!disposed) setOpen(false)
  }))

  return () => {
    disposed = true
    handles.forEach((handle) => { void handle.remove().catch(() => undefined) })
  }
}

export function useNativeKeyboardState() {
  const [isOpen, setOpen] = useState(false)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    return subscribeToNativeKeyboard(Keyboard, setOpen)
  }, [])

  return isOpen
}
