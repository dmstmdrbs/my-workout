import { describe, expect, it, vi } from 'vitest'
import { subscribeToNativeKeyboard } from './useNativeKeyboardState'

describe('subscribeToNativeKeyboard', () => {
  it('표시·숨김 이벤트를 상태로 전달하고 listener를 정리한다', async () => {
    const listeners = new Map<string, () => void>()
    const removeShow = vi.fn(async () => undefined)
    const removeHide = vi.fn(async () => undefined)
    const keyboard = {
      addListener: vi.fn(async (eventName: 'keyboardWillShow' | 'keyboardWillHide', listener: () => void) => {
        listeners.set(eventName, listener)
        return { remove: eventName === 'keyboardWillShow' ? removeShow : removeHide }
      }),
    }
    const setOpen = vi.fn()

    const unsubscribe = subscribeToNativeKeyboard(keyboard, setOpen)
    await vi.waitFor(() => expect(keyboard.addListener).toHaveBeenCalledTimes(2))
    listeners.get('keyboardWillShow')?.()
    listeners.get('keyboardWillHide')?.()

    expect(setOpen.mock.calls).toEqual([[true], [false]])
    unsubscribe()
    expect(removeShow).toHaveBeenCalledOnce()
    expect(removeHide).toHaveBeenCalledOnce()
  })
})
