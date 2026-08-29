import type { FriendInvite } from '../../types/domain'

export function getFriendInviteUrl(invite: FriendInvite) {
  return `${window.location.origin}/friends/invite/${encodeURIComponent(invite.token)}`
}

/** Returns true when the native share sheet was opened and false for clipboard fallback. */
export async function shareFriendInvite(invite: FriendInvite): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = getFriendInviteUrl(invite)
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Trainlog 친구 초대', text: 'Trainlog에서 친구가 되어 운동을 함께 기록해요.', url })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }

  if (typeof navigator.clipboard?.writeText === 'function') {
    await navigator.clipboard.writeText(url)
    return 'copied'
  }

  throw new Error('clipboard-unavailable')
}

