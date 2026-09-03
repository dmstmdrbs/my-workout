import { describe, expect, test } from 'vitest'
import { getNativeAppPath } from './useNativeAppLinks'

describe('네이티브 앱 링크', () => {
  const publicAppUrl = 'https://trainlog.example'

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
})
