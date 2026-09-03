import { beforeEach, describe, expect, test, vi } from 'vitest'

const capacitorMock = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => true) }))
const preferencesMock = vi.hoisted(() => ({
  get: vi.fn(async () => ({ value: null as string | null })),
  set: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: capacitorMock }))
vi.mock('@capacitor/preferences', () => ({ Preferences: preferencesMock }))

import {
  flushPersistentStorageWrites,
  hydratePersistentStorage,
  readPersistentValue,
  removePersistentValue,
  writePersistentValue,
} from './persistentStorage'

describe('플랫폼 영속 저장소', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    capacitorMock.isNativePlatform.mockReturnValue(true)
    preferencesMock.get.mockResolvedValue({ value: null })
  })

  test('네이티브 Preferences 값을 동기 localStorage 미러로 복원한다', async () => {
    preferencesMock.get.mockResolvedValueOnce({ value: '{"draft":true}' })

    await hydratePersistentStorage(['draft'])

    expect(readPersistentValue('draft')).toBe('{"draft":true}')
  })

  test('업그레이드 직후에는 기존 localStorage 값을 Preferences로 이관한다', async () => {
    localStorage.setItem('draft', 'legacy')

    await hydratePersistentStorage(['draft'])

    expect(preferencesMock.set).toHaveBeenCalledWith({ key: 'draft', value: 'legacy' })
  })

  test('네이티브 쓰기와 삭제는 동기 미러와 Preferences에 함께 반영한다', async () => {
    writePersistentValue('draft', 'next')
    expect(localStorage.getItem('draft')).toBe('next')
    await flushPersistentStorageWrites()
    expect(preferencesMock.set).toHaveBeenCalledWith({ key: 'draft', value: 'next' })

    removePersistentValue('draft')
    expect(localStorage.getItem('draft')).toBeNull()
    await flushPersistentStorageWrites()
    expect(preferencesMock.remove).toHaveBeenCalledWith({ key: 'draft' })
  })

  test('웹에서는 localStorage만 사용한다', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(false)

    writePersistentValue('draft', 'web')
    await hydratePersistentStorage(['draft'])
    await flushPersistentStorageWrites()

    expect(localStorage.getItem('draft')).toBe('web')
    expect(preferencesMock.get).not.toHaveBeenCalled()
    expect(preferencesMock.set).not.toHaveBeenCalled()
  })
})
