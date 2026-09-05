import { describe, expect, it, vi } from 'vitest'
import { requestNativeScreenWakeLock } from './wakeLock'

describe('native screen wake lock', () => {
  it('운동 종료 시 네이티브 화면 잠금을 해제한다', async () => {
    const keepAwake = {
      keepAwake: vi.fn(async () => undefined),
      allowSleep: vi.fn(async () => undefined),
    }

    const cleanup = requestNativeScreenWakeLock(keepAwake)
    await vi.waitFor(() => expect(keepAwake.keepAwake).toHaveBeenCalledOnce())
    cleanup()

    expect(keepAwake.allowSleep).toHaveBeenCalledOnce()
  })

  it('keepAwake 응답 전에 종료되어도 늦게 획득한 잠금을 해제한다', async () => {
    let resolveAcquire: (() => void) | undefined
    const keepAwake = {
      keepAwake: vi.fn(() => new Promise<void>((resolve) => { resolveAcquire = resolve })),
      allowSleep: vi.fn(async () => undefined),
    }

    const cleanup = requestNativeScreenWakeLock(keepAwake)
    cleanup()
    resolveAcquire?.()

    await vi.waitFor(() => expect(keepAwake.allowSleep).toHaveBeenCalledOnce())
  })
})
