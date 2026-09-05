import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const appMock = vi.hoisted(() => ({
  getLaunchUrl: vi.fn<() => Promise<{ url: string } | undefined>>(async () => undefined),
}))
vi.mock('@capacitor/app', () => ({ App: { ...appMock, addListener: vi.fn() } }))
vi.mock('@capacitor/browser', () => ({ Browser: {} }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => true) } }))

import { completeNativeOAuth, completeNativeOAuthFromLaunchUrl, isNativeAuthCallback } from './nativeOAuth'

describe('네이티브 OAuth 콜백', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('implicit flow 토큰은 PKCE 검증을 우회하므로 거부한다', async () => {
    const setSession = vi.fn()
    const client = { auth: { setSession } } as unknown as SupabaseClient

    await expect(completeNativeOAuth(
      client,
      'trainlog://auth/callback#access_token=access&refresh_token=refresh',
    )).rejects.toThrow('로그인 콜백에 인증 code가 없어요.')

    expect(setSession).not.toHaveBeenCalled()
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

  test('냉간 시작 OAuth 교환이 일시 실패해도 다음 세션 조회에서 재시도한다', async () => {
    appMock.getLaunchUrl.mockResolvedValue({ url: 'trainlog://auth/callback?code=cold-code' })
    const exchangeCodeForSession = vi.fn()
      .mockRejectedValueOnce(new Error('temporary exchange failure'))
      .mockResolvedValueOnce({ data: { session: null, user: null }, error: null })
    const client = { auth: { exchangeCodeForSession } } as unknown as SupabaseClient

    await expect(completeNativeOAuthFromLaunchUrl(client)).rejects.toThrow('temporary exchange failure')
    await completeNativeOAuthFromLaunchUrl(client)

    expect(appMock.getLaunchUrl).toHaveBeenCalledTimes(2)
    expect(exchangeCodeForSession).toHaveBeenCalledWith('cold-code')
  })
})
