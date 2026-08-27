import type { Exercise, ExerciseOneRepMax, StartProgramRunInput } from '../../types/domain'

export interface ProgramOneRepMaxRequirement {
  exercise: Exercise
  exerciseName: string
}

export function getProgramOneRepMaxRequirements(input: StartProgramRunInput, exercises: Exercise[]): ProgramOneRepMaxRequirement[] {
  const requiredNames = new Set<string>()
  for (const day of input.days) {
    for (const exercise of day.routineSnapshot?.exercises ?? []) {
      if (exercise.sets.some((set) => set.targetOneRepMaxPercent != null)) {
        requiredNames.add(exercise.oneRepMaxExerciseName ?? exercise.exerciseName)
      }
    }
  }
  return [...requiredNames].flatMap((exerciseName) => {
    const exercise = exercises.find((item) => item.name === exerciseName)
    return exercise ? [{ exercise, exerciseName }] : []
  })
}

export function personalizeProgramRun(input: StartProgramRunInput, exercises: Exercise[], maxes: ExerciseOneRepMax[]): StartProgramRunInput {
  const exerciseByName = new Map(exercises.map((exercise) => [exercise.name, exercise]))
  const maxByExerciseId = new Map(maxes.map((max) => [max.exerciseId, max.oneRepMaxKg]))

  return {
    ...input,
    days: input.days.map((day) => ({
      ...day,
      routineSnapshot: day.routineSnapshot ? {
        ...day.routineSnapshot,
        exercises: day.routineSnapshot.exercises.map((prescription) => {
          const baseName = prescription.oneRepMaxExerciseName ?? prescription.exerciseName
          const exercise = exerciseByName.get(baseName)
          const oneRepMaxKg = exercise ? maxByExerciseId.get(exercise.id) : undefined
          return {
            ...prescription,
            sets: prescription.sets.map((set) => ({
              ...set,
              targetWeightKg: set.targetOneRepMaxPercent == null || oneRepMaxKg == null
                ? set.targetWeightKg
                : roundToPlate(oneRepMaxKg * set.targetOneRepMaxPercent / 100),
            })),
          }
        }),
      } : null,
    })),
  }
}

export function missingProgramOneRepMaxes(requirements: ProgramOneRepMaxRequirement[], maxes: ExerciseOneRepMax[]) {
  const configuredIds = new Set(maxes.map((max) => max.exerciseId))
  return requirements.filter(({ exercise }) => !configuredIds.has(exercise.id))
}

export function roundToPlate(value: number) { return Math.round(value / 2.5) * 2.5 }
