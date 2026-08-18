import { describe, expect, test } from 'vitest'
import { estimateOneRepMax, REP_CEILING } from './oneRepMax'

describe('estimateOneRepMax', () => {
  test('125kg x 6회는 Brzycki 공식으로 145.2kg이 나온다 (Epley였다면 150kg)', () => {
    expect(estimateOneRepMax(125, 6)).toBe(145.2)
  })

  test('1회는 그 중량 그대로를 추정치로 돌려준다', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100)
  })

  test(`반복 수가 ${REP_CEILING}회를 넘으면 추정치 대신 null을 돌려준다`, () => {
    expect(estimateOneRepMax(40, REP_CEILING + 1)).toBeNull()
  })

  test(`반복 수가 ${REP_CEILING}회이면 여전히 값을 돌려준다(경계값 포함)`, () => {
    expect(estimateOneRepMax(40, REP_CEILING)).not.toBeNull()
  })

  test('공식이 무너지는 37회 부근에서도 null을 돌려준다 (분모가 0에 가까워지거나 음수가 됨)', () => {
    expect(estimateOneRepMax(40, 37)).toBeNull()
    expect(estimateOneRepMax(40, 50)).toBeNull()
  })

  test('중량이나 반복 수가 0 이하/유효하지 않으면 null을 돌려준다', () => {
    expect(estimateOneRepMax(0, 5)).toBeNull()
    expect(estimateOneRepMax(-10, 5)).toBeNull()
    expect(estimateOneRepMax(50, 0)).toBeNull()
    expect(estimateOneRepMax(50, -3)).toBeNull()
    expect(estimateOneRepMax(Number.NaN, 5)).toBeNull()
  })
})
