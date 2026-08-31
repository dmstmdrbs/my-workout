import type { Equipment, Exercise, WorkoutExercise } from '../../types/domain'

export interface InitialWorkingWeightItem {
  exerciseId: string
  exerciseName: string
  suggestedWeightKg: number | null
}

/** 맨몸과 유산소는 시작 전에 외부 중량을 정하지 않아도 된다. */
export function requiresInitialWorkingWeight(equipment: Equipment) {
  return equipment !== 'bodyweight' && equipment !== 'cardio'
}

export function getInitialWorkingWeightItems(workoutExercises: WorkoutExercise[], exercises: Exercise[]): InitialWorkingWeightItem[] {
  const equipmentById = new Map(exercises.map((exercise) => [exercise.id, exercise.equipment]))
  return workoutExercises
    .filter((exercise) => requiresInitialWorkingWeight(equipmentById.get(exercise.exerciseId) ?? 'other'))
    .map((exercise) => ({
      exerciseId: exercise.id,
      exerciseName: exercise.exerciseName,
      suggestedWeightKg: [...exercise.sets]
        .sort((left, right) => left.setOrder - right.setOrder)
        .find((set) => set.weightKg !== null)?.weightKg ?? null,
    }))
}

/**
 * 선택한 중량을 종목의 첫 작업 중량으로 삼는다. 기존 처방이 세트마다 다르면
 * 첫 처방과의 차이를 그대로 유지해 웜업/백오프 구조를 납작하게 만들지 않는다.
 * 중량 처방이 비어 있던 세트는 모두 선택한 값으로 시작한다.
 */
export function applyInitialWorkingWeights(
  workoutExercises: WorkoutExercise[],
  selectedWeights: Readonly<Record<string, number>>,
): WorkoutExercise[] {
  return workoutExercises.map((exercise) => {
    const selected = selectedWeights[exercise.id]
    if (selected === undefined) return exercise
    const prescribedBase = [...exercise.sets]
      .sort((left, right) => left.setOrder - right.setOrder)
      .find((set) => set.weightKg !== null)?.weightKg ?? null

    return {
      ...exercise,
      sets: exercise.sets.map((set) => ({
        ...set,
        weightKg: set.weightKg === null || prescribedBase === null
          ? selected
          : Math.max(0, selected + set.weightKg - prescribedBase),
      })),
    }
  })
}
