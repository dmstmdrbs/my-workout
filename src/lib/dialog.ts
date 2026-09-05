import { Capacitor } from '@capacitor/core'
import { Dialog } from '@capacitor/dialog'

export interface ConfirmActionOptions {
  title: string
  message: string
  okButtonTitle?: string
  cancelButtonTitle?: string
}

export async function confirmAction({
  title,
  message,
  okButtonTitle = '확인',
  cancelButtonTitle = '취소',
}: ConfirmActionOptions) {
  if (!Capacitor.isNativePlatform()) return window.confirm(message)

  try {
    const result = await Dialog.confirm({ title, message, okButtonTitle, cancelButtonTitle })
    return result.value
  } catch {
    // 대화상자를 표시하지 못한 경우 파괴적 동작을 진행하지 않는다.
    return false
  }
}
