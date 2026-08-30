// Vercel Web Analytics records the raw URL of every page view. This app puts
// two kinds of value in the URL that must not end up in that dashboard:
//
//   1. `/friends/invite/<token>` — a live credential. Anyone holding it can
//      send a friend request for 30 days.
//   2. Row ids (`/records/<uuid>`, `?programDay=<uuid>`) — not secret, but one
//      distinct URL per row makes the page-view report useless.
//
// Both are normalised before the event leaves the browser.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Masked by position rather than by shape, so changing the token format later
// cannot silently start leaking it.
const SECRET_PARENT_PATH = 'friends/invite'

export function normalizeAnalyticsPath(pathname: string): string {
  const segments = pathname.split('/')

  return segments
    .map((segment, index) => {
      if (segment === '') return segment
      const parent = segments.slice(0, index).filter(Boolean).join('/')
      if (parent === SECRET_PARENT_PATH) return '[token]'
      return UUID_PATTERN.test(segment) ? '[id]' : segment
    })
    .join('/')
}

/**
 * Returns the URL to report, or `null` to drop the event.
 *
 * Anything unparseable is dropped rather than forwarded: a malformed URL is
 * worth less than the risk of passing an unmasked token through.
 */
export function normalizeAnalyticsUrl(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  url.pathname = normalizeAnalyticsPath(url.pathname)

  // Keys stay so the report still shows which parameters are in use; values go
  // because `?programDay=` carries an id and `?d=` a specific training date.
  for (const key of [...url.searchParams.keys()]) {
    url.searchParams.set(key, '[value]')
  }

  url.hash = ''
  return url.toString()
}
