import {
  UNSAFE_createBrowserHistory,
} from 'react-router-dom'
export type NavigationGuard = (() => boolean) | null

type BrowserHistory = ReturnType<typeof UNSAFE_createBrowserHistory>
type HistoryListener = Parameters<BrowserHistory['listen']>[0]

export type GuardedBrowserHistory = BrowserHistory & {
  setNavigationGuard: (guard: NavigationGuard) => void
}

function readHistoryIndex(): number | null {
  const index = window.history.state?.idx
  return typeof index === 'number' && Number.isInteger(index) ? index : null
}

/**
 * Creates the browser history consumed by the app shell.
 *
 * React Router's public declarative router API does not expose a POP blocker.
 * The history implementation is therefore the only boundary that can reject
 * a native POP before the router receives its target location. This relies on
 * React Router's `unstable_HistoryRouter` and `UNSAFE_createBrowserHistory`;
 * keep this adapter small so a future supported blocker API can replace it.
 */
export function createGuardedBrowserHistory(): GuardedBrowserHistory {
  // v5Compat is required because HistoryRouter expects PUSH/REPLACE updates
  // from its history listener as BrowserRouter provides them.
  const history = UNSAFE_createBrowserHistory({ v5Compat: true })
  let navigationGuard: NavigationGuard = null
  let stableIndex = readHistoryIndex()
  let allowNextPop = false
  let pendingPop:
    | { currentIndex: number; targetIndex: number; phase: 'rollback' | 'allow' }
    | null = null

  return {
    get action() {
      return history.action
    },
    get location() {
      return history.location
    },
    createHref: history.createHref,
    createURL: history.createURL,
    encodeLocation: history.encodeLocation,
    push: history.push,
    replace: history.replace,
    go(delta) {
      if (delta === 0 || !navigationGuard) {
        history.go(delta)
        return
      }

      if (!navigationGuard()) return
      allowNextPop = true
      history.go(delta)
    },
    listen(listener) {
      return history.listen((update: Parameters<HistoryListener>[0]) => {
        const nextIndex = readHistoryIndex()

        if (update.action !== 'POP') {
          if (nextIndex !== null) stableIndex = nextIndex
          listener(update)
          return
        }

        if (allowNextPop) {
          allowNextPop = false
          if (nextIndex !== null) stableIndex = nextIndex
          listener(update)
          return
        }

        const pending = pendingPop
        if (pending?.phase === 'rollback') {
          if (nextIndex !== pending.currentIndex) return
          pendingPop = null
          if (!navigationGuard || navigationGuard()) {
            pendingPop = { ...pending, phase: 'allow' }
            history.go(pending.targetIndex - pending.currentIndex)
          } else {
            stableIndex = pending.currentIndex
          }
          return
        }

        if (pending?.phase === 'allow') {
          if (nextIndex !== pending.targetIndex) return
          pendingPop = null
          stableIndex = pending.targetIndex
          listener(update)
          return
        }

        if (
          !navigationGuard ||
          stableIndex === null ||
          nextIndex === null ||
          stableIndex === nextIndex
        ) {
          if (nextIndex !== null) stableIndex = nextIndex
          listener(update)
          return
        }

        pendingPop = {
          currentIndex: stableIndex,
          targetIndex: nextIndex,
          phase: 'rollback',
        }
        history.go(stableIndex - nextIndex)
      })
    },
    setNavigationGuard(guard) {
      navigationGuard = guard
      if (!guard) {
        allowNextPop = false
        pendingPop = null
      }
    },
  }
}
