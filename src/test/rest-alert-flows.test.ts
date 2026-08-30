import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { notifyRestComplete, requestRestAlerts } from '../lib/restAlerts'

// Vite의 import-analysis 플러그인은 `new URL('...', import.meta.url)` 리터럴
// 패턴을 정적으로 감지해 에셋 경로로 재작성한다. 그 결과 이 테스트 파일에서
// public/ 까지 두 단계 올라가는 상대 경로가 엉뚱한 경로로 바뀐다(직접 확인함:
// jsdom 테스트 환경에서 `/icon-192.png`로 축약됨). import.meta.url을 변수에
// 먼저 담아 두면 그 정적 패턴 매칭을 피해 실제 파일 시스템 경로로 정상 해석된다.
const testFileUrl = import.meta.url

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

    const options = showNotification.mock.calls[0][1]!
    expect(options).toMatchObject({
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    })
    // 문자열만 비교하면 자산을 지워도 초록불이 유지된다. 실제로 public/ 에
    // 파일이 있는지 확인해야 자산 삭제·이름 변경이 이 테스트를 빨갛게 만든다.
    for (const assetPath of [options.icon!, options.badge!]) {
      expect(existsSync(new URL(`../../public${assetPath}`, testFileUrl))).toBe(true)
    }
  })
})

function restoreProperty(target: object, key: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(target, key, descriptor)
  else Reflect.deleteProperty(target, key)
}
