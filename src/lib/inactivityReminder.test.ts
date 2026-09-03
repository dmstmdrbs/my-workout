import { beforeEach, describe, expect, it, vi } from 'vitest'

const capacitorMock = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => true) }))
const notificationMock = vi.hoisted(() => ({
  checkPermissions: vi.fn(async () => ({ display: 'granted' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  cancel: vi.fn(async () => undefined),
  schedule: vi.fn(async (_options: { notifications: Array<{ schedule: { at: Date } }> }) => undefined),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: capacitorMock }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: notificationMock }))

import {
  getInactivityReminderAt,
  inactivityReminderNotificationId,
  syncInactivityReminder,
} from './inactivityReminder'

describe('운동 공백 리마인더', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capacitorMock.isNativePlatform.mockReturnValue(true)
    notificationMock.checkPermissions.mockResolvedValue({ display: 'granted' })
  })

  it('마지막 완료 시각에서 설정한 일수 뒤로 예약한다', async () => {
    const anchor = '2026-09-01T12:00:00.000Z'
    const now = new Date('2026-09-02T00:00:00.000Z').getTime()

    await syncInactivityReminder(anchor, { enabled: true, days: 3, anchoredAt: null }, now)

    expect(notificationMock.cancel).toHaveBeenCalledWith({ notifications: [{ id: inactivityReminderNotificationId }] })
    const scheduledAt = notificationMock.schedule.mock.calls[0]?.[0].notifications[0]?.schedule.at
    expect(scheduledAt).toBeInstanceOf(Date)
    if (!scheduledAt) throw new Error('notification was not scheduled')
    expect(scheduledAt.toISOString()).toBe('2026-09-04T12:00:00.000Z')
  })

  it('이미 기준일이 지났으면 다음 오전 9시로 예약한다', () => {
    const now = new Date(2026, 8, 10, 15).getTime()
    const result = getInactivityReminderAt('2026-09-01T00:00:00.000Z', 3, now)
    expect(result.getTime()).toBe(new Date(2026, 8, 11, 9).getTime())
  })

  it('설정을 끄면 기존 예약만 취소한다', async () => {
    await syncInactivityReminder(null, { enabled: false, days: 3, anchoredAt: null })
    expect(notificationMock.cancel).toHaveBeenCalledOnce()
    expect(notificationMock.schedule).not.toHaveBeenCalled()
  })

  it('권한이 없으면 예약하지 않는다', async () => {
    notificationMock.checkPermissions.mockResolvedValueOnce({ display: 'denied' })
    await syncInactivityReminder('2026-09-01T00:00:00.000Z', { enabled: true, days: 3, anchoredAt: null })
    expect(notificationMock.schedule).not.toHaveBeenCalled()
  })
})
