import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { notifyRestComplete, requestRestAlerts } from '../lib/restAlerts'

const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
const originalVibrate = Object.getOwnPropertyDescriptor(navigator, 'vibrate')
const originalNotification = Object.getOwnPropertyDescriptor(window, 'Notification')

describe('휴식 완료 알림', () => {
  const showNotification = vi.fn(async (_title: string, _options?: NotificationOptions) => undefined)

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

  test('휴식 완료 알림은 public/ 에 실재하는 아이콘을 가리킨다', async () => {
    // 이 경로는 scripts/build-brand-assets.mjs 가 만드는 파일 이름과 묶여 있다.
    // 자산 이름을 바꾸면 여기도 함께 바꿔야 알림 아이콘이 살아 있다.
    expect(await requestRestAlerts()).toBe(true)
    await notifyRestComplete()

    expect(showNotification.mock.calls[0][1]).toMatchObject({
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    })
  })
})

function restoreProperty(target: object, key: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(target, key, descriptor)
  else Reflect.deleteProperty(target, key)
}
