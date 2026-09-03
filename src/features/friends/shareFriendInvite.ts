import { Clipboard } from '@capacitor/clipboard'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { env } from '../../lib/env'
import type { FriendInvite } from '../../types/domain'

export function getFriendInviteUrl(invite: FriendInvite) {
  const origin = Capacitor.isNativePlatform() ? env.publicAppUrl : window.location.origin
  return `${origin}/friends/invite/${encodeURIComponent(invite.token)}`
}

export async function shareFriendInvite(invite: FriendInvite): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = getFriendInviteUrl(invite)

  if (Capacitor.isNativePlatform()) return shareNativeInvite(url)

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Trainlog 친구 초대', text: 'Trainlog에서 친구가 되어 운동을 함께 기록해요.', url })
      return 'shared'
    } catch (error) {
      if (isShareCancellation(error)) return 'cancelled'
    }
  }

  if (typeof navigator.clipboard?.writeText === 'function') {
    await navigator.clipboard.writeText(url)
    return 'copied'
  }

  throw new Error('clipboard-unavailable')
}

async function shareNativeInvite(url: string): Promise<'shared' | 'copied' | 'cancelled'> {
  try {
    await Share.share({
      title: 'Trainlog 친구 초대',
      text: 'Trainlog에서 친구가 되어 운동을 함께 기록해요.',
      url,
      dialogTitle: '친구 초대 링크 공유',
    })
    return 'shared'
  } catch (error) {
    if (isShareCancellation(error)) return 'cancelled'
    await Clipboard.write({ url, label: 'Trainlog 친구 초대' })
    return 'copied'
  }
}

function isShareCancellation(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (!(error instanceof Error)) return false
  return /cancel(?:led|ed)?/i.test(error.message)
}
