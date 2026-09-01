import { describe, expect, test } from 'vitest'
import { setTypeMarker } from './setInput'

describe('세트 타입 마커', () => {
  test('본세트는 순번을 유지하고 나머지 타입은 한 글자 마커로 줄인다', () => {
    expect(setTypeMarker('working', 3)).toBe('3')
    expect(setTypeMarker('warmup', 1)).toBe('W')
    expect(setTypeMarker('topset', 2)).toBe('T')
    expect(setTypeMarker('backoff', 4)).toBe('B')
    expect(setTypeMarker('dropset', 5)).toBe('D')
  })
})
