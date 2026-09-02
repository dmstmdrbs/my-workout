import { exerciseCatalogQueryKey } from '../../../entities/exercise'

export const previousExerciseSessionQueryKey = (exerciseId: string) => ['previous-exercise-session', exerciseId] as const

export const routineLastPerformedQueryKey = ['routine-last-performed'] as const

export const workoutSetupQueryKey = {
  all: [...exerciseCatalogQueryKey, 'workout-setup'] as const,
  byProgramDay: (programDayId: string | null) => [...exerciseCatalogQueryKey, 'workout-setup', programDayId] as const,
}
