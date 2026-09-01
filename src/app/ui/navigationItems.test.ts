import { describe, expect, it } from 'vitest'
import { formatRequestCount } from './navigationItems'

describe('navigation UI labels', () => {
  it('caps large friend request counts', () => {
    expect(formatRequestCount(8)).toBe('8')
    expect(formatRequestCount(100)).toBe('99+')
  })
})
