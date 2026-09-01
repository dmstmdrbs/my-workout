import { useCallback, useEffect, useState } from 'react'
import { useAppServices, type AuthSession } from '../../services'

interface AuthState {
  isLoading: boolean
  session: AuthSession | null
  error: string | null
}

const initialAuthState: AuthState = {
  isLoading: true,
  session: null,
  error: null,
}

export function useAuthSession() {
  const { auth } = useAppServices()
  const [state, setState] = useState<AuthState>(initialAuthState)

  useEffect(() => {
    let isMounted = true
    const applySession = (session: AuthSession | null) => {
      if (isMounted) setState({ isLoading: false, session, error: null })
    }
    const unsubscribe = auth.onAuthStateChange(applySession)
    void auth.getSession().then(applySession).catch((error: unknown) => {
      if (!isMounted) return
      setState({
        isLoading: false,
        session: null,
        error: error instanceof Error ? error.message : '로그인 상태를 확인하지 못했어요.',
      })
    })
    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [auth])

  const startGoogleSignIn = useCallback(async () => {
    setState((current) => ({ ...current, error: null }))
    try {
      await auth.signInWithGoogle({ redirectTo: window.location.href })
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Google 로그인을 시작하지 못했어요.',
      }))
    }
  }, [auth])

  return { ...state, startGoogleSignIn }
}
