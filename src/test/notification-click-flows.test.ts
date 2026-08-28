import { beforeEach, describe, expect, test, vi } from 'vitest'
// 서비스 워커 스크립트는 앱 번들이 아니라 `public/`에서 그대로 서빙되고
// `vite.config.ts`의 `workbox.importScripts`로 주입된다. 앱이 import하지 않으니
// 원문을 문자열로 읽어 가짜 `self` 위에서 실행해 동작을 확인한다.
import swSource from '../../public/notification-click.js?raw'

interface FakeClient {
  url: string
  focus: ReturnType<typeof vi.fn>
  navigate?: ReturnType<typeof vi.fn>
}

function makeClient(url: string, canNavigate = true): FakeClient {
  const client: FakeClient = { url, focus: vi.fn(async () => client) }
  if (canNavigate) client.navigate = vi.fn(async () => client)
  return client
}

/**
 * `notification-click.js`를 실행해 `notificationclick` 핸들러를 붙이고, 알림을
 * 눌렀을 때 무슨 일이 일어나는지 관찰한다.
 */
async function clickNotification({ clients, notificationUrl = '/workout', openWindow }: {
  clients: FakeClient[]
  notificationUrl?: string
  openWindow?: ReturnType<typeof vi.fn>
}) {
  const listeners: Record<string, (event: unknown) => void> = {}
  const close = vi.fn()
  const openWindowMock = openWindow ?? vi.fn(async () => makeClient('https://app.test/'))

  const self = {
    location: { origin: 'https://app.test' },
    addEventListener: (type: string, listener: (event: unknown) => void) => { listeners[type] = listener },
    clients: {
      matchAll: vi.fn(async () => clients),
      openWindow: openWindowMock,
    },
  }

  new Function('self', swSource)(self)
  expect(typeof listeners.notificationclick).toBe('function')

  const pending: Promise<unknown>[] = []
  listeners.notificationclick({
    notification: { close, data: { url: notificationUrl } },
    waitUntil: (promise: Promise<unknown>) => { pending.push(promise) },
  })
  await Promise.all(pending)

  return { close, openWindow: openWindowMock }
}

describe('휴식 완료 알림 클릭', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('이미 그 화면에 있으면 포커스만 하고 이동하지 않는다', async () => {
    const client = makeClient('https://app.test/workout')
    await clickNotification({ clients: [client] })

    expect(client.focus).toHaveBeenCalled()
    // 같은 URL로 navigate()하면 전체 리로드가 걸려 기록 중이던 화면이 새로 뜬다.
    expect(client.navigate).not.toHaveBeenCalled()
  })

  test('쿼리스트링만 다른 같은 화면도 이동하지 않는다', async () => {
    const client = makeClient('https://app.test/workout?programDay=abc')
    await clickNotification({ clients: [client] })

    expect(client.focus).toHaveBeenCalled()
    expect(client.navigate).not.toHaveBeenCalled()
  })

  test('다른 화면에 있으면 그 창을 운동 화면으로 이동시킨다', async () => {
    const client = makeClient('https://app.test/records')
    await clickNotification({ clients: [client] })

    expect(client.focus).toHaveBeenCalled()
    expect(client.navigate).toHaveBeenCalledWith('https://app.test/workout')
  })

  test('열린 창이 없으면 새 창을 연다', async () => {
    const openWindow = vi.fn(async () => makeClient('https://app.test/workout'))
    await clickNotification({ clients: [], openWindow })

    expect(openWindow).toHaveBeenCalledWith('https://app.test/workout')
  })

  test('알림은 어느 경로로든 닫힌다', async () => {
    const { close } = await clickNotification({ clients: [makeClient('https://app.test/workout')] })
    expect(close).toHaveBeenCalled()
  })
})
