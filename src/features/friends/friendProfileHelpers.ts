export function getProfileInitials(displayName: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}
