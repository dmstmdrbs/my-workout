import { describe, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { completeNativeOAuth, isNativeAuthCallback } from './nativeOAuth'

describe('네이티브 OAuth 콜백', () => {
  test('implicit flow 토큰으로 세션을 저장한다', async () => {
    const setSession = vi.fn(async () => ({ data: { session: null, user: null }, error: null }))
    const client = { auth: { setSession } } as unknown as SupabaseClient

    await completeNativeOAuth(client, 'trainlog://auth/callback#access_token=access&refresh_token=refresh')

    expect(setSession).toHaveBeenCalledWith({ access_token: 'access', refresh_token: 'refresh' })
  })

  test('PKCE code가 있으면 세션으로 교환한다', async () => {
    const exchangeCodeForSession = vi.fn(async () => ({ data: { session: null, user: null }, error: null }))
    const client = { auth: { exchangeCodeForSession } } as unknown as SupabaseClient

    await completeNativeOAuth(client, 'trainlog://auth/callback?code=auth-code')

    expect(exchangeCodeForSession).toHaveBeenCalledWith('auth-code')
  })

  test('인증 오류를 사용자에게 전파한다', async () => {
    const client = { auth: {} } as unknown as SupabaseClient

    await expect(completeNativeOAuth(
      client,
      'trainlog://auth/callback#error=access_denied&error_description=Google+login+cancelled',
    )).rejects.toThrow('Google login cancelled')
  })

  test('정확한 앱 콜백 주소만 인증 결과로 받는다', () => {
    expect(isNativeAuthCallback('trainlog://auth/callback#access_token=value')).toBe(true)
    expect(isNativeAuthCallback('trainlog://auth/callback.evil#access_token=value')).toBe(false)
    expect(isNativeAuthCallback('https://auth/callback')).toBe(false)
  })
})
