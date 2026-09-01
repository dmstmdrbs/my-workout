import { useContext, useEffect, useRef } from 'react'
import {
  UNSAFE_NavigationContext,
  type Navigator,
} from 'react-router-dom'
import type { GuardedBrowserHistory } from './guardedBrowserHistory'

interface NavigationGuardOptions {
  when: boolean
  onConfirm: () => boolean
}

function isGuardedHistory(
  navigator: Navigator,
): navigator is Navigator & Pick<GuardedBrowserHistory, 'setNavigationGuard'> {
  return 'setNavigationGuard' in navigator
}

/**
 * Registers the app-shell guard at the history boundary. Browser history is
 * handled before HistoryRouter receives a POP; MemoryRouter keeps the small
 * navigator.go fallback used by the flow tests and non-browser consumers.
 */
export function useNavigationGuard({ when, onConfirm }: NavigationGuardOptions) {
  const { navigator } = useContext(UNSAFE_NavigationContext)
  const whenRef = useRef(when)
  const onConfirmRef = useRef(onConfirm)
  whenRef.current = when
  onConfirmRef.current = onConfirm

  useEffect(() => {
    if (isGuardedHistory(navigator)) {
      navigator.setNavigationGuard(
        when ? () => onConfirmRef.current() : null,
      )
      return () => navigator.setNavigationGuard(null)
    }

    const originalGo = navigator.go
    const guardedGo: Navigator['go'] = (delta) => {
      if (delta !== 0 && whenRef.current && !onConfirmRef.current()) return
      originalGo(delta)
    }

    navigator.go = guardedGo
    return () => {
      if (navigator.go === guardedGo) navigator.go = originalGo
    }
  }, [navigator, when])
}
