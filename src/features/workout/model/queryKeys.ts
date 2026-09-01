export const previousExerciseSessionQueryKey = (exerciseId: string) => ['previous-exercise-session', exerciseId] as const

export const routineLastPerformedQueryKey = ['routine-last-performed'] as const

export const workoutSetupQueryKey = {
  all: ['workout-runner-setup'] as const,
  byProgramDay: (programDayId: string | null) => ['workout-runner-setup', programDayId] as const,
}
