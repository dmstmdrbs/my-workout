import { beforeEach, describe, expect, it, vi } from 'vitest'

const capacitorMock = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => true) }))
const dialogMock = vi.hoisted(() => ({ confirm: vi.fn(async () => ({ value: true })) }))

vi.mock('@capacitor/core', () => ({ Capacitor: capacitorMock }))
vi.mock('@capacitor/dialog', () => ({ Dialog: dialogMock }))

import { confirmAction } from './dialog'

describe('confirmAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capacitorMock.isNativePlatform.mockReturnValue(true)
  })

  it('네이티브에서는 Capacitor Dialog를 사용한다', async () => {
    await expect(confirmAction({ title: '운동 취소', message: '취소할까요?', okButtonTitle: '운동 취소' })).resolves.toBe(true)
    expect(dialogMock.confirm).toHaveBeenCalledWith({
      title: '운동 취소',
      message: '취소할까요?',
      okButtonTitle: '운동 취소',
      cancelButtonTitle: '취소',
    })
  })

  it('네이티브 Dialog 오류 시 안전하게 거절한다', async () => {
    dialogMock.confirm.mockRejectedValueOnce(new Error('plugin unavailable'))
    await expect(confirmAction({ title: '확인', message: '진행할까요?' })).resolves.toBe(false)
  })

  it('웹에서는 기존 window.confirm을 유지한다', async () => {
    capacitorMock.isNativePlatform.mockReturnValue(false)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await expect(confirmAction({ title: '확인', message: '진행할까요?' })).resolves.toBe(true)
    expect(confirm).toHaveBeenCalledWith('진행할까요?')
  })
})
