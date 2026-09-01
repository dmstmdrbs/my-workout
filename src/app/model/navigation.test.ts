import { describe, expect, it } from 'vitest'
import {
  buildRecordPath,
  buildRecordsPath,
  buildRoutinePath,
  buildWorkoutPath,
  buildWorkoutCompletePath,
  getActivePage,
  pagePaths,
} from './navigation'

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

  it('builds dynamic paths at one navigation boundary', () => {
    expect(buildWorkoutPath('day/1')).toBe('/workout?programDay=day%2F1')
    expect(buildWorkoutCompletePath('session/1')).toBe('/workout/complete/session%2F1')
    expect(buildRecordPath('session/1')).toBe('/records/session%2F1')
    expect(buildRecordPath('session/1', 'edit')).toBe('/records/session%2F1/edit')
    expect(buildRecordsPath('2026-09-01')).toBe('/records?d=2026-09-01')
    expect(buildRoutinePath('routine/1')).toBe('/routines/routine%2F1')
    expect(buildRoutinePath('new')).toBe('/routines/new')
  })
})
