import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import type { SupabaseClient } from '@supabase/supabase-js'

export const nativeAuthRedirectUrl = 'trainlog://auth/callback'

let launchOAuthCompletion: Promise<void> | null = null
let launchOAuthChecked = false

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

  // Custom schemes can be opened by another app. Only a PKCE authorization
  // code, verified against the locally stored code verifier, may create a session.
  throw new Error('로그인 콜백에 인증 code가 없어요.')
}

/**
 * OAuth 도중 OS가 앱을 종료했다면 appUrlOpen listener가 없다.
 * 인증 snapshot을 읽기 전 launch URL을 한 번 소비해 냉간 시작도 완료한다.
 */
export function completeNativeOAuthFromLaunchUrl(client: SupabaseClient) {
  if (!usesNativeOAuth()) return Promise.resolve()
  if (launchOAuthChecked) return Promise.resolve()
  launchOAuthCompletion ??= App.getLaunchUrl()
    .then(async (launch) => {
      if (launch?.url && isNativeAuthCallback(launch.url)) {
        await completeNativeOAuth(client, launch.url)
      }
      launchOAuthChecked = true
    })
    .finally(() => {
      launchOAuthCompletion = null
    })
  return launchOAuthCompletion
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
