import { describe, expect, test } from 'vitest'
import type { Exercise, WorkoutExercise } from '../../types/domain'
import { applyInitialWorkingWeights, getInitialWorkingWeightItems } from './initialWorkingWeights'

function exercise(id: string, equipment: Exercise['equipment']): Exercise {
  return {
    id, userId: 'user', name: id, primaryMuscle: equipment === 'cardio' ? 'cardio' : 'full_body', secondaryMuscles: [], equipment,
    brand: null, defaultRestSeconds: 90, isArchived: false, createdAt: '', updatedAt: '',
  }
}

function workoutExercise(id: string, weights: Array<number | null>): WorkoutExercise {
  return {
    id: `draft-${id}`, exerciseId: id, exerciseName: id, primaryMuscle: 'full_body', exerciseOrder: 1, notes: null,
    sets: weights.map((weightKg, index) => ({
      id: `${id}-${index}`, setOrder: index + 1, setType: 'working', weightKg, reps: 8, durationSeconds: null, distanceKm: null,
      targetRir: 2, actualRir: null, restSeconds: 90, isCompleted: false, completedAt: null, notes: null,
    })),
  }
}

describe('initial working weights', () => {
  test('중량 종목만 제안하고 맨몸·유산소는 제외한다', () => {
    const exercises = [exercise('barbell', 'barbell'), exercise('body', 'bodyweight'), exercise('run', 'cardio')]
    const items = getInitialWorkingWeightItems([
      workoutExercise('barbell', [80, 70]),
      workoutExercise('body', [null]),
      workoutExercise('run', [null]),
    ], exercises)

    expect(items).toEqual([{ exerciseId: 'draft-barbell', exerciseName: 'barbell', suggestedWeightKg: 80 }])
  })

  test('선택 중량을 적용하면서 세트별 처방 차이를 보존한다', () => {
    const result = applyInitialWorkingWeights([
      workoutExercise('bench', [80, 70, null]),
    ], { 'draft-bench': 85 })

    expect(result[0].sets.map((set) => set.weightKg)).toEqual([85, 75, 85])
  })
})
