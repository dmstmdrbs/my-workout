export type PageId =
  | 'dashboard'
  | 'programs'
  | 'workout'
  | 'routines'
  | 'records'
  | 'stats'
  | 'body'
  | 'exercises'
  | 'friends'
  | 'profile'
  | 'settings'

interface RouteDefinition {
  path: string
  matches: (pathname: string) => boolean
}

const routeDefinitions: Record<PageId, RouteDefinition> = {
  dashboard: { path: '/', matches: (pathname) => pathname === '/' },
  programs: { path: '/programs', matches: matchesSegment('/programs') },
  workout: { path: '/workout', matches: matchesSegment('/workout') },
  routines: { path: '/routines', matches: matchesSegment('/routines') },
  records: { path: '/records', matches: matchesSegment('/records') },
  friends: { path: '/friends', matches: matchesSegment('/friends') },
  stats: { path: '/stats', matches: matchesSegment('/stats') },
  body: { path: '/body', matches: matchesSegment('/body') },
  exercises: { path: '/exercises', matches: matchesSegment('/exercises') },
  profile: { path: '/profile', matches: matchesSegment('/profile') },
  settings: { path: '/settings', matches: matchesSegment('/settings') },
}

export const pagePaths = Object.fromEntries(
  Object.entries(routeDefinitions).map(([id, route]) => [id, route.path]),
) as Record<PageId, string>

export function getActivePage(pathname: string): PageId | null {
  for (const [id, route] of Object.entries(routeDefinitions) as Array<[PageId, RouteDefinition]>) {
    if (route.matches(pathname)) return id
  }
  return null
}

function matchesSegment(prefix: string) {
  return (pathname: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)
}
