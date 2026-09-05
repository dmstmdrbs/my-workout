import { beforeEach, describe, expect, test, vi } from 'vitest'

const capacitorMock = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => false) }))
const shareMock = vi.hoisted(() => ({ share: vi.fn(async () => undefined) }))
const clipboardMock = vi.hoisted(() => ({ write: vi.fn(async () => undefined) }))

vi.mock('@capacitor/core', () => ({ Capacitor: capacitorMock }))
vi.mock('@capacitor/share', () => ({ Share: shareMock }))
vi.mock('@capacitor/clipboard', () => ({ Clipboard: clipboardMock }))
vi.mock('../../lib/env', () => ({ env: { publicAppUrl: 'https://trainlog.example' } }))

import { getFriendInviteUrl, shareFriendInvite } from './shareFriendInvite'

const invite = {
  token: 'invite-token',
  createdAt: '2026-09-03T00:00:00.000Z',
  expiresAt: '2026-10-03T00:00:00.000Z',
}

describe('친구 초대 공유', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capacitorMock.isNativePlatform.mockReturnValue(false)
  })

  test('네이티브에서는 localhost 대신 공개 앱 주소를 공유한다', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(true)

    expect(getFriendInviteUrl(invite)).toBe('https://trainlog.example/friends/invite/invite-token')
    await expect(shareFriendInvite(invite)).resolves.toBe('shared')
    expect(shareMock.share).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://trainlog.example/friends/invite/invite-token',
    }))
  })

  test('네이티브 공유창 실패 시 시스템 클립보드로 복사한다', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(true)
    shareMock.share.mockRejectedValueOnce(new Error('share unavailable'))

    await expect(shareFriendInvite(invite)).resolves.toBe('copied')
    expect(clipboardMock.write).toHaveBeenCalledWith({
      url: 'https://trainlog.example/friends/invite/invite-token',
      label: 'Trainlog 친구 초대',
    })
  })

  test('웹에서는 현재 사이트 주소와 Web Share를 유지한다', async () => {
    const nativeShare = navigator.share
    const webShare = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: webShare })

    try {
      expect(getFriendInviteUrl(invite)).toBe(`${window.location.origin}/friends/invite/invite-token`)
      await expect(shareFriendInvite(invite)).resolves.toBe('shared')
      expect(webShare).toHaveBeenCalledOnce()
      expect(shareMock.share).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(navigator, 'share', { configurable: true, value: nativeShare })
    }
  })
})
