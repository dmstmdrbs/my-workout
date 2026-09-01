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

export function buildWorkoutPath(programDayId?: string | null) {
  return programDayId
    ? `${pagePaths.workout}?programDay=${encodeURIComponent(programDayId)}`
    : pagePaths.workout
}

export function buildWorkoutCompletePath(sessionId: string) {
  return `${pagePaths.workout}/complete/${encodeURIComponent(sessionId)}`
}

export function buildRecordPath(sessionId: string, mode: 'detail' | 'edit' = 'detail') {
  return mode === 'edit'
    ? `${pagePaths.records}/${encodeURIComponent(sessionId)}/edit`
    : `${pagePaths.records}/${encodeURIComponent(sessionId)}`
}

export function buildRecordsPath(dateKey?: string | null) {
  return dateKey ? `${pagePaths.records}?d=${encodeURIComponent(dateKey)}` : pagePaths.records
}

export function buildRoutinePath(routineId?: string | null) {
  return routineId === 'new'
    ? `${pagePaths.routines}/new`
    : routineId
      ? `${pagePaths.routines}/${encodeURIComponent(routineId)}`
      : pagePaths.routines
}

function matchesSegment(prefix: string) {
  return (pathname: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)
}
