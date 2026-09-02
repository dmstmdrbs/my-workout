import { useState } from 'react'
import { getProfileInitials } from '../model/profileInitials'
import './ProfileAvatar.css'

interface ProfileAvatarProps {
  displayName: string
  avatarUrl: string | null
  size?: 'small' | 'medium' | 'large'
}

export function ProfileAvatar({ displayName, avatarUrl, size = 'medium' }: ProfileAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(avatarUrl) && !imageFailed

  return (
    <span className={`friend-avatar friend-avatar-${size}`} aria-hidden="true">
      {showImage ? (
        <img src={avatarUrl ?? undefined} alt="" onError={() => setImageFailed(true)} />
      ) : (
        getProfileInitials(displayName)
      )}
    </span>
  )
}
