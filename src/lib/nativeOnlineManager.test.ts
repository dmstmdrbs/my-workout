import { describe, expect, it, vi } from 'vitest'
import { subscribeToNativeNetwork } from './nativeOnlineManager'

describe('subscribeToNativeNetwork', () => {
  it('uses the native status instead of navigator.onLine and follows later changes', async () => {
    let notifyStatus: ((status: { connected: boolean }) => void) | undefined
    const remove = vi.fn().mockResolvedValue(undefined)
    const network = {
      getStatus: vi.fn().mockResolvedValue({ connected: true }),
      addListener: vi.fn().mockImplementation(async (_event, listener) => {
        notifyStatus = listener
        return { remove }
      }),
    }
    const setOnline = vi.fn()

    const unsubscribe = subscribeToNativeNetwork(network, setOnline)

    await vi.waitFor(() => expect(setOnline).toHaveBeenCalledWith(true))
    notifyStatus?.({ connected: false })
    expect(setOnline).toHaveBeenLastCalledWith(false)

    unsubscribe()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  })

  it('fails open when the native status cannot be read', async () => {
    const network = {
      getStatus: vi.fn().mockRejectedValue(new Error('plugin unavailable')),
      addListener: vi.fn().mockRejectedValue(new Error('plugin unavailable')),
    }
    const setOnline = vi.fn()

    subscribeToNativeNetwork(network, setOnline)

    await vi.waitFor(() => expect(setOnline).toHaveBeenCalledWith(true))
  })
})
