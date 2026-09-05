import { beforeEach, describe, expect, it, vi } from 'vitest'

const capacitorMock = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => true) }))
const hapticsMock = vi.hoisted(() => ({
  impact: vi.fn(async () => undefined),
  notification: vi.fn(async () => undefined),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: capacitorMock }))
vi.mock('@capacitor/haptics', () => ({
  Haptics: hapticsMock,
  ImpactStyle: { Light: 'LIGHT' },
  NotificationType: { Success: 'SUCCESS' },
}))

import { signalRestFinished, signalSetCompleted } from './haptics'

describe('native haptics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capacitorMock.isNativePlatform.mockReturnValue(true)
  })

  it('세트 완료에는 가벼운 impact를 사용한다', () => {
    signalSetCompleted()
    expect(hapticsMock.impact).toHaveBeenCalledWith({ style: 'LIGHT' })
  })

  it('휴식 종료에는 success notification haptic을 사용한다', () => {
    signalRestFinished()
    expect(hapticsMock.notification).toHaveBeenCalledWith({ type: 'SUCCESS' })
  })

  it('웹에서는 기존 Vibration API를 유지한다', () => {
    capacitorMock.isNativePlatform.mockReturnValue(false)
    const vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })

    signalRestFinished()

    expect(vibrate).toHaveBeenCalledWith([180, 90, 180])
    expect(hapticsMock.notification).not.toHaveBeenCalled()
  })
})
