import { useState } from 'react'
import type { SocialProfile } from '../../types/domain'
import { getProfileInitials } from './friendProfileHelpers'

export function FriendAvatar({ profile, size = 'medium' }: { profile: Pick<SocialProfile, 'displayName' | 'avatarUrl'>; size?: 'small' | 'medium' | 'large' }) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(profile.avatarUrl) && !imageFailed

  return (
    <span className={`friend-avatar friend-avatar-${size}`} aria-hidden="true">
      {showImage ? (
        <img src={profile.avatarUrl ?? undefined} alt="" onError={() => setImageFailed(true)} />
      ) : (
        getProfileInitials(profile.displayName)
      )}
    </span>
  )
}
