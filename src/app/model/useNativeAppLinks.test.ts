import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const appMock = vi.hoisted(() => {
  let listener: ((event: { url: string }) => void) | undefined
  return {
    get listener() { return listener },
    addListener: vi.fn(async (_event: string, next: (event: { url: string }) => void) => {
      listener = next
      return { remove: vi.fn(async () => undefined) }
    }),
    getLaunchUrl: vi.fn(async () => undefined),
  }
})
vi.mock('@capacitor/app', () => ({ App: appMock }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))

import { getNativeAppPath, useNativeAppLinks } from './useNativeAppLinks'

describe('네이티브 앱 링크', () => {
  const publicAppUrl = 'https://trainlog.example'

  beforeEach(() => vi.clearAllMocks())

  test('운영 웹의 친구 초대 링크를 앱 경로로 변환한다', () => {
    expect(getNativeAppPath('https://trainlog.example/friends/invite/token-1', publicAppUrl))
      .toBe('/friends/invite/token-1')
  })

  test('커스텀 스킴 친구 초대 링크를 앱 경로로 변환한다', () => {
    expect(getNativeAppPath('trainlog://friends/invite/token-1', publicAppUrl))
      .toBe('/friends/invite/token-1')
  })

  test('다른 도메인과 허용하지 않은 내부 경로를 거부한다', () => {
    expect(getNativeAppPath('https://evil.example/friends/invite/token-1', publicAppUrl)).toBeNull()
    expect(getNativeAppPath('https://trainlog.example/settings', publicAppUrl)).toBeNull()
    expect(getNativeAppPath('trainlog://auth/callback?code=secret', publicAppUrl)).toBeNull()
  })

  test('콜백이 바뀌어도 appUrlOpen listener를 재등록하지 않는다', async () => {
    const firstNavigate = vi.fn()
    const secondNavigate = vi.fn()
    const { rerender } = renderHook(
      ({ onNavigate }) => useNativeAppLinks(onNavigate),
      { initialProps: { onNavigate: firstNavigate } },
    )
    await waitFor(() => expect(appMock.addListener).toHaveBeenCalledOnce())

    rerender({ onNavigate: secondNavigate })
    appMock.listener?.({ url: 'trainlog://friends/invite/token-1' })

    expect(appMock.addListener).toHaveBeenCalledOnce()
    expect(firstNavigate).not.toHaveBeenCalled()
    expect(secondNavigate).toHaveBeenCalledWith('/friends/invite/token-1')
  })
})
