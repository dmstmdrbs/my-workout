import { describe, expect, test } from 'vitest'
import { suggestNextLoad } from './loadSuggestion'
import type { WorkoutSetRecord } from '../types/domain'

function set(overrides: Partial<WorkoutSetRecord>): WorkoutSetRecord {
  return {
    id: 's1', setOrder: 1, setType: 'working',
    weightKg: 80, reps: 8, durationSeconds: null, distanceKm: null,
    targetRir: 2, actualRir: 2, restSeconds: 120,
    isCompleted: true, completedAt: '2026-08-18T10:00:00.000Z', notes: null,
    ...overrides,
  }
}

describe('suggestNextLoad', () => {
  test('계획보다 힘들었으면 중량을 낮춘다', () => {
    // 목표 RIR 2인데 실제 0 -- 두 칸 모자랐으니 5kg 낮춘다.
    expect(suggestNextLoad(set({ targetRir: 2, actualRir: 0 }))).toMatchObject({
      weightKg: 75, deltaKg: -5, reason: 'harder',
    })
  })

  test('여유가 있었으면 중량을 올린다', () => {
    expect(suggestNextLoad(set({ targetRir: 2, actualRir: 3 }))).toMatchObject({
      weightKg: 82.5, deltaKg: 2.5, reason: 'easier',
    })
  })

  test('계획대로였으면 같은 중량을 유지한다', () => {
    expect(suggestNextLoad(set({ targetRir: 2, actualRir: 2 }))).toMatchObject({
      weightKg: 80, deltaKg: 0, reason: 'onPlan',
    })
  })

  test('차이가 커도 한 번에 두 칸까지만 움직인다', () => {
    // RIR이 5 벌어져도 5kg에서 멈춘다. RIR과 중량의 환산은 사람마다 달라
    // 한 번에 크게 움직이기보다 다음 세션에서 다시 재는 편이 안전하다.
    expect(suggestNextLoad(set({ targetRir: 0, actualRir: 5 }))?.deltaKg).toBe(5)
    expect(suggestNextLoad(set({ targetRir: 5, actualRir: 0 }))?.deltaKg).toBe(-5)
  })

  test('제안할 근거가 없으면 추측하지 않는다', () => {
    expect(suggestNextLoad(null)).toBeNull()
    // 맨몸·유산소처럼 중량이 없는 종목
    expect(suggestNextLoad(set({ weightKg: null }))).toBeNull()
    // 목표나 실제 RIR 중 하나라도 비면 비교할 게 없다
    expect(suggestNextLoad(set({ targetRir: null }))).toBeNull()
    expect(suggestNextLoad(set({ actualRir: null }))).toBeNull()
  })

  test('제안 중량은 0 밑으로 내려가지 않는다', () => {
    expect(suggestNextLoad(set({ weightKg: 2.5, targetRir: 3, actualRir: 0 }))?.weightKg).toBe(0)
  })
})
