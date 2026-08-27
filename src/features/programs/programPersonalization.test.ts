import { describe, expect, test } from 'vitest'
import { mockExercises } from '../../services/mock/seed'
import type { ExerciseOneRepMax } from '../../types/domain'
import { buildPlateauBreakProgram } from './programTemplate'
import { getProgramOneRepMaxRequirements, missingProgramOneRepMaxes, personalizeProgramRun, roundToPlate } from './programPersonalization'

describe('프로그램 1RM 개인화', () => {
  test('필요한 기준 종목을 중복 없이 찾고 누락 값을 구분한다', () => {
    const input = buildPlateauBreakProgram('2026-08-25')
    const requirements = getProgramOneRepMaxRequirements(input, mockExercises)
    expect(requirements.map((item) => item.exercise.name)).toEqual([
      '바벨 벤치프레스',
      '바벨 오버헤드 프레스',
      '스쿼트',
      '루마니안 데드리프트',
    ])
    expect(missingProgramOneRepMaxes(requirements, [max('barbell-bench-press', 115)])).toHaveLength(3)
  })

  test('퍼센트 처방을 2.5kg 단위로 계산하고 회차 스냅샷에 고정한다', () => {
    const input = buildPlateauBreakProgram('2026-08-25')
    const personalized = personalizeProgramRun(input, mockExercises, [
      max('barbell-bench-press', 115),
      max('barbell-overhead-press', 75),
      max('back-squat', 155),
      max('romanian-deadlift', 140),
    ])

    const upper = personalized.days[0].routineSnapshot!
    expect(upper.exercises[0].sets.map((set) => set.targetWeightKg)).toEqual([92.5, 82.5, 82.5])
    expect(upper.exercises[1].sets[0].targetWeightKg).toBeNull()
    const lowerVolume = personalized.days[4].routineSnapshot!
    expect(lowerVolume.exercises[0].exerciseName).toBe('일시정지 스쿼트')
    expect(lowerVolume.exercises[0].sets[0].targetWeightKg).toBe(100)
    expect(roundToPlate(92)).toBe(92.5)
  })
})

function max(exerciseId: string, oneRepMaxKg: number): ExerciseOneRepMax {
  return { userId: 'user-1', exerciseId, oneRepMaxKg, updatedAt: '2026-08-24T00:00:00.000Z' }
}
