import { useState } from 'react'
import { getProfileInitials } from '../model/profileInitials'
import './ProfileAvatar.css'

interface ProfileAvatarProps {
  displayName: string
  avatarUrl: string | null
  size?: 'small' | 'medium' | 'large'
}

export function ProfileAvatar({ displayName, avatarUrl, size = 'medium' }: ProfileAvatarProps) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null)
  const showImage = Boolean(avatarUrl) && avatarUrl !== failedAvatarUrl

  const handleImageError = () => {
    if (!avatarUrl) return
    setFailedAvatarUrl(avatarUrl)
  }

  return (
    <span className={`friend-avatar friend-avatar-${size}`} aria-hidden="true">
      {showImage ? (
        <img key={avatarUrl} src={avatarUrl ?? undefined} alt="" onError={handleImageError} />
      ) : (
        getProfileInitials(displayName)
      )}
    </span>
  )
}
