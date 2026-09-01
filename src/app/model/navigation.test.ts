import { describe, expect, it } from 'vitest'
import { getActivePage, pagePaths } from './navigation'

describe('app navigation model', () => {
  it('maps every known root path to its navigation page', () => {
    for (const [page, path] of Object.entries(pagePaths)) {
      expect(getActivePage(path)).toBe(page)
    }
  })

  it('keeps detail routes active without claiming unknown routes', () => {
    expect(getActivePage('/records/session-1/edit')).toBe('records')
    expect(getActivePage('/records-archive')).toBeNull()
    expect(getActivePage('/unknown')).toBeNull()
  })
})
