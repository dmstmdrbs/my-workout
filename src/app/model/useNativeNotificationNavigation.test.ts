import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const localNotificationMock = vi.hoisted(() => {
  let listener: ((action: never) => void) | undefined
  const remove = vi.fn(async () => undefined)
  return {
    get listener() { return listener },
    remove,
    addListener: vi.fn(async (_event: string, next: (action: never) => void) => {
      listener = next
      return { remove }
    }),
  }
})
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: localNotificationMock }))

import { getNotificationPath, useNativeNotificationNavigation } from './useNativeNotificationNavigation'

describe('네이티브 알림 이동', () => {
  beforeEach(() => vi.clearAllMocks())

  test('휴식 알림은 운동 화면으로 이동한다', () => {
    expect(getNotificationPath({ notification: { extra: { path: '/workout' } } })).toBe('/workout')
  })

  test('운동 공백 리마인더는 홈으로 이동한다', () => {
    expect(getNotificationPath({ notification: { extra: { path: '/' } } })).toBe('/')
  })

  test('허용하지 않은 경로는 무시한다', () => {
    expect(getNotificationPath({ notification: { extra: { path: 'https://example.com' } } })).toBeNull()
  })

  test('콜백 변경은 listener를 재등록하지 않고 최신 내비게이션을 사용한다', async () => {
    const firstNavigate = vi.fn()
    const secondNavigate = vi.fn()
    const { rerender } = renderHook(
      ({ onNavigate }) => useNativeNotificationNavigation(onNavigate),
      { initialProps: { onNavigate: firstNavigate } },
    )
    await waitFor(() => expect(localNotificationMock.addListener).toHaveBeenCalledOnce())

    rerender({ onNavigate: secondNavigate })
    localNotificationMock.listener?.({ notification: { extra: { path: '/workout' } } } as never)

    expect(localNotificationMock.addListener).toHaveBeenCalledOnce()
    expect(firstNavigate).not.toHaveBeenCalled()
    expect(secondNavigate).toHaveBeenCalledWith('/workout')
  })

  test('언마운트 후 도착한 느린 event는 무시한다', async () => {
    const onNavigate = vi.fn()
    const { unmount } = renderHook(() => useNativeNotificationNavigation(onNavigate))
    await waitFor(() => expect(localNotificationMock.addListener).toHaveBeenCalledOnce())

    unmount()
    localNotificationMock.listener?.({ notification: { extra: { path: '/workout' } } } as never)

    expect(onNavigate).not.toHaveBeenCalled()
  })
})
