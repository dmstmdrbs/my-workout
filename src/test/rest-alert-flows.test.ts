import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { notifyRestComplete, requestRestAlerts } from '../lib/restAlerts'

const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
const originalVibrate = Object.getOwnPropertyDescriptor(navigator, 'vibrate')
const originalNotification = Object.getOwnPropertyDescriptor(window, 'Notification')

describe('휴식 완료 알림', () => {
  const showNotification = vi.fn(async () => undefined)

  beforeEach(() => {
    localStorage.clear()
    showNotification.mockClear()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => ({ showNotification }) } })
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vi.fn(() => true) })
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: class NotificationMock {
        static permission = 'granted'
        static requestPermission = vi.fn(async () => 'granted')
      },
    })
  })

  afterEach(() => {
    restoreProperty(document, 'visibilityState', originalVisibilityState)
    restoreProperty(navigator, 'serviceWorker', originalServiceWorker)
    restoreProperty(navigator, 'vibrate', originalVibrate)
    restoreProperty(window, 'Notification', originalNotification)
  })

  test('알림에 운동 화면 복귀 경로를 담아 서비스 워커로 보낸다', async () => {
    expect(await requestRestAlerts()).toBe(true)
    await notifyRestComplete()

    expect(showNotification).toHaveBeenCalledWith('휴식 시간이 끝났어요', expect.objectContaining({
      tag: 'trainlog-rest-complete',
      data: { url: '/workout' },
    }))
  })
})

function restoreProperty(target: object, key: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(target, key, descriptor)
  else Reflect.deleteProperty(target, key)
}
