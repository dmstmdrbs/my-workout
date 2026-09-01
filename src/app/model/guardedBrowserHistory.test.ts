import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGuardedBrowserHistory } from './guardedBrowserHistory'

async function waitFor(condition: () => void) {
  await vi.waitFor(condition, { timeout: 500, interval: 5 })
}

describe('createGuardedBrowserHistory', () => {
  beforeEach(() => {
    window.history.replaceState({ idx: 0 }, '', '/guarded-start')
  })

  afterEach(() => {
    window.history.replaceState({ idx: 0 }, '', '/')
  })

  it('does not publish a cancelled native POP to the router listener', async () => {
    const history = createGuardedBrowserHistory()
    const updates: string[] = []
    const unlisten = history.listen(({ location }) => updates.push(location.pathname))
    history.push('/guarded-workout')
    const confirm = vi.fn(() => false)
    history.setNavigationGuard(confirm)

    window.history.back()
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
    await waitFor(() => expect(window.history.state?.idx).toBe(1))

    expect(confirm).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/guarded-workout')
    expect(updates).toEqual(['/guarded-workout'])
    unlisten()
  })

  it('publishes exactly one confirmed native POP after rollback', async () => {
    const history = createGuardedBrowserHistory()
    const updates: string[] = []
    const unlisten = history.listen(({ location }) => updates.push(location.pathname))
    history.push('/guarded-workout-confirm')
    const confirm = vi.fn(() => true)
    history.setNavigationGuard(confirm)

    window.history.back()
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
    await waitFor(() => expect(window.history.state?.idx).toBe(0))

    expect(confirm).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/guarded-start')
    expect(updates).toEqual(['/guarded-workout-confirm', '/guarded-start'])
    unlisten()
  })

  it('does not publish a cancelled native Forward to the router listener', async () => {
    const history = createGuardedBrowserHistory()
    const updates: string[] = []
    const unlisten = history.listen(({ location }) => updates.push(location.pathname))
    history.push('/guarded-forward-cancel')
    window.history.back()
    await waitFor(() => expect(window.history.state?.idx).toBe(0))
    updates.length = 0

    const confirm = vi.fn(() => false)
    history.setNavigationGuard(confirm)
    window.history.forward()
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
    await waitFor(() => expect(window.history.state?.idx).toBe(0))

    expect(window.location.pathname).toBe('/guarded-start')
    expect(updates).toEqual([])
    unlisten()
  })

  it('publishes exactly one confirmed native Forward after rollback', async () => {
    const history = createGuardedBrowserHistory()
    const updates: string[] = []
    const unlisten = history.listen(({ location }) => updates.push(location.pathname))
    history.push('/guarded-forward-confirm')
    window.history.back()
    await waitFor(() => expect(window.history.state?.idx).toBe(0))
    updates.length = 0

    const confirm = vi.fn(() => true)
    history.setNavigationGuard(confirm)
    window.history.forward()
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
    await waitFor(() => expect(window.history.state?.idx).toBe(1))

    expect(window.location.pathname).toBe('/guarded-forward-confirm')
    expect(updates).toEqual(['/guarded-forward-confirm'])
    unlisten()
  })
})
