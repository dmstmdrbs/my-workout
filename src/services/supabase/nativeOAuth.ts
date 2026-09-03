import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import type { SupabaseClient } from '@supabase/supabase-js'

export const nativeAuthRedirectUrl = 'trainlog://auth/callback'

export function usesNativeOAuth() {
  return Capacitor.isNativePlatform()
}

export async function completeNativeOAuth(client: SupabaseClient, callbackUrl: string) {
  const params = getCallbackParams(callbackUrl)
  const error = params.get('error_description') ?? params.get('error')
  if (error) throw new Error(error)

  const code = params.get('code')
  if (code) {
    const { error: exchangeError } = await client.auth.exchangeCodeForSession(code)
    if (exchangeError) throw exchangeError
    return
  }

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) throw new Error('로그인 콜백에 세션 정보가 없어요.')

  const { error: sessionError } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  if (sessionError) throw sessionError
}

export async function openNativeOAuth(client: SupabaseClient, authorizationUrl: string) {
  let callbackStarted = false
  let resolveCallback!: () => void
  let rejectCallback!: (error: unknown) => void
  const callbackResult = new Promise<void>((resolve, reject) => {
    resolveCallback = resolve
    rejectCallback = reject
  })

  const appUrlListener = await App.addListener('appUrlOpen', ({ url }) => {
    if (callbackStarted || !isNativeAuthCallback(url)) return
    callbackStarted = true
    void completeNativeOAuth(client, url)
      .then(resolveCallback)
      .catch(rejectCallback)
      .finally(() => { void Browser.close() })
  })
  let browserFinishedListener: Awaited<ReturnType<typeof Browser.addListener>> | undefined

  try {
    browserFinishedListener = await Browser.addListener('browserFinished', () => {
      if (!callbackStarted) resolveCallback()
    })
    await Browser.open({ url: authorizationUrl })
    await callbackResult
  } finally {
    await Promise.all([appUrlListener.remove(), browserFinishedListener?.remove()])
  }
}

export function isNativeAuthCallback(candidate: string) {
  try {
    const url = new URL(candidate)
    return url.protocol === 'trainlog:' && url.hostname === 'auth' && url.pathname === '/callback'
  } catch {
    return false
  }
}

function getCallbackParams(callbackUrl: string) {
  const url = new URL(callbackUrl)
  const params = new URLSearchParams(url.search)
  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash)
  hashParams.forEach((value, key) => params.set(key, value))
  return params
}
