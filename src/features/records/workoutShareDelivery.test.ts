import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkoutSession } from '../../types/domain'

const capacitorMock = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => true) }))
const filesystemMock = vi.hoisted(() => ({
  writeFile: vi.fn(async () => ({ uri: 'file:///cache/share/card.png' })),
  deleteFile: vi.fn(async () => undefined),
}))
const shareMock = vi.hoisted(() => ({
  canShare: vi.fn(async () => ({ value: true })),
  share: vi.fn(async () => ({})),
}))
const imageMock = vi.hoisted(() => ({
  downloadWorkoutCard: vi.fn(),
  workoutCardFile: vi.fn(async () => new File(['png'], 'card.png', { type: 'image/png' })),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: capacitorMock }))
vi.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Filesystem: filesystemMock }))
vi.mock('@capacitor/share', () => ({ Share: shareMock }))
vi.mock('./workoutShareImage', () => imageMock)

import { saveWorkoutCard, shareWorkoutCard } from './workoutShareDelivery'

const session = {
  id: 'session-1',
  routineName: '상체 운동',
  startedAt: '2026-09-03T08:00:00.000Z',
} as WorkoutSession

describe('workoutShareDelivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capacitorMock.isNativePlatform.mockReturnValue(true)
    shareMock.canShare.mockResolvedValue({ value: true })
    shareMock.share.mockResolvedValue({})
  })

  it('네이티브에서는 PNG를 cache 파일로 만든 뒤 공유하고 정리한다', async () => {
    const result = await shareWorkoutCard('data:image/png;base64,cG5n', session)

    expect(result).toBe('shared')
    expect(filesystemMock.writeFile).toHaveBeenCalledWith(expect.objectContaining({
      data: 'cG5n',
      directory: 'CACHE',
      recursive: true,
    }))
    expect(shareMock.share).toHaveBeenCalledWith(expect.objectContaining({
      files: ['file:///cache/share/card.png'],
      dialogTitle: '운동 기록 공유',
    }))
    expect(filesystemMock.deleteFile).toHaveBeenCalledWith(expect.objectContaining({ directory: 'CACHE' }))
  })

  it('네이티브 저장도 OS 공유 시트를 열어 사용자가 위치를 선택하게 한다', async () => {
    await saveWorkoutCard('data:image/png;base64,cG5n', session)

    expect(shareMock.share).toHaveBeenCalledWith(expect.objectContaining({ dialogTitle: 'PNG 이미지 저장' }))
  })

  it('네이티브 공유 취소는 오류가 아닌 canceled 결과로 반환한다', async () => {
    shareMock.share.mockRejectedValueOnce(new Error('User cancelled'))

    await expect(shareWorkoutCard('data:image/png;base64,cG5n', session)).resolves.toBe('canceled')
    expect(filesystemMock.deleteFile).toHaveBeenCalledOnce()
  })

  it('웹에서는 지원 시 File Web Share를 사용한다', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(false)
    const nativeShare = navigator.share
    const nativeCanShare = navigator.canShare
    Object.assign(navigator, {
      share: vi.fn(async () => undefined),
      canShare: vi.fn(() => true),
    })

    await expect(shareWorkoutCard('data:image/png;base64,cG5n', session)).resolves.toBe('shared')
    expect(navigator.share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.any(File)] }))
    expect(filesystemMock.writeFile).not.toHaveBeenCalled()

    Object.assign(navigator, { share: nativeShare, canShare: nativeCanShare })
  })

  it('웹 공유창 오류 시 기존 PNG 다운로드로 되돌아간다', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(false)
    const nativeShare = navigator.share
    const nativeCanShare = navigator.canShare
    Object.assign(navigator, {
      share: vi.fn(async () => { throw new Error('share failed') }),
      canShare: vi.fn(() => true),
    })

    await expect(shareWorkoutCard('data:image/png;base64,cG5n', session)).resolves.toBe('downloaded')
    expect(imageMock.downloadWorkoutCard).toHaveBeenCalledWith('data:image/png;base64,cG5n', session)

    Object.assign(navigator, { share: nativeShare, canShare: nativeCanShare })
  })
})
