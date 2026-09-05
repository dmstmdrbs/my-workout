import { describe, expect, it, vi } from 'vitest'
import { subscribeToNativeAppState } from './nativeFocusManager'

describe('subscribeToNativeAppState', () => {
  it('초기 앱 상태와 이후 foreground 전환을 query focus에 반영한다', async () => {
    let notifyState: ((state: { isActive: boolean }) => void) | undefined
    const remove = vi.fn().mockResolvedValue(undefined)
    const app = {
      getState: vi.fn().mockResolvedValue({ isActive: false }),
      addListener: vi.fn().mockImplementation(async (_event, listener) => {
        notifyState = listener
        return { remove }
      }),
    }
    const setFocused = vi.fn()

    const unsubscribe = subscribeToNativeAppState(app, setFocused)

    await vi.waitFor(() => expect(setFocused).toHaveBeenCalledWith(false))
    notifyState?.({ isActive: true })
    expect(setFocused).toHaveBeenLastCalledWith(true)

    unsubscribe()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  })

  it('초기 상태를 읽지 못하면 쿼리를 활성 상태로 유지한다', async () => {
    const app = {
      getState: vi.fn().mockRejectedValue(new Error('plugin unavailable')),
      addListener: vi.fn().mockRejectedValue(new Error('plugin unavailable')),
    }
    const setFocused = vi.fn()

    subscribeToNativeAppState(app, setFocused)

    await vi.waitFor(() => expect(setFocused).toHaveBeenCalledWith(true))
  })

  it('listener 등록 전에 해제해도 늦게 생성된 handle을 정리한다', async () => {
    let resolveHandle: ((handle: { remove(): Promise<void> }) => void) | undefined
    const remove = vi.fn().mockResolvedValue(undefined)
    const app = {
      getState: vi.fn().mockResolvedValue({ isActive: true }),
      addListener: vi.fn().mockImplementation(() => new Promise((resolve) => {
        resolveHandle = resolve
      })),
    }

    const unsubscribe = subscribeToNativeAppState(app, vi.fn())
    unsubscribe()
    resolveHandle?.({ remove })

    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  })
})
