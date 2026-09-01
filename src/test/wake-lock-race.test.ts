import { afterEach, describe, expect, test, vi } from 'vitest'
import { requestScreenWakeLock } from '../lib/wakeLock'

describe('화면 잠금 비동기 수명주기', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock')
  })

  test('요청이 끝나기 전에 해제되어도 늦게 도착한 sentinel을 즉시 해제한다', async () => {
    let resolveRequest: ((value: { released: boolean; release: () => Promise<void>; addEventListener: () => void }) => void) | undefined
    const request = vi.fn(() => new Promise<{ released: boolean; release: () => Promise<void>; addEventListener: () => void }>((resolve) => {
      resolveRequest = resolve
    }))
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })

    const cleanup = requestScreenWakeLock()
    cleanup()

    const release = vi.fn(async () => undefined)
    resolveRequest?.({ released: false, release, addEventListener: () => undefined })
    await Promise.resolve()
    await Promise.resolve()

    expect(release).toHaveBeenCalledOnce()
  })
})
