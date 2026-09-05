import { beforeEach, describe, expect, it, vi } from 'vitest'

const capacitorMock = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => true) }))
const pushMock = vi.hoisted(() => ({
  checkPermissions: vi.fn(async () => ({ receive: 'prompt' })),
  requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
  unregister: vi.fn(async () => undefined),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: capacitorMock }))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: pushMock }))

import {
  clearRegisteredPushToken,
  readRegisteredPushToken,
  requestFriendActivityNotificationPermission,
  saveRegisteredPushToken,
  unregisterCurrentPushDevice,
} from './friendActivityNotifications'

describe('친구 활동 push 설정', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    capacitorMock.isNativePlatform.mockReturnValue(true)
    pushMock.checkPermissions.mockResolvedValue({ receive: 'prompt' })
    pushMock.requestPermissions.mockResolvedValue({ receive: 'granted' })
  })

  it('사용자가 기능을 켤 때 push 권한을 요청한다', async () => {
    await expect(requestFriendActivityNotificationPermission()).resolves.toBe(true)
    expect(pushMock.requestPermissions).toHaveBeenCalledOnce()
  })

  it('로그아웃과 설정 해제 시 서버와 OS 등록을 함께 정리한다', async () => {
    const socialRepository = { unregisterPushDevice: vi.fn(async () => undefined) }
    saveRegisteredPushToken('test-push-token-value')

    await unregisterCurrentPushDevice(socialRepository)

    expect(socialRepository.unregisterPushDevice).toHaveBeenCalledWith('test-push-token-value')
    expect(pushMock.unregister).toHaveBeenCalledOnce()
    expect(readRegisteredPushToken()).toBeNull()
  })

  it('token 삭제 helper는 기기 미러도 지운다', () => {
    saveRegisteredPushToken('test-push-token-value')
    clearRegisteredPushToken()
    expect(readRegisteredPushToken()).toBeNull()
  })
})
