import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type WorkoutDraft } from '../../../entities/workout'
import { invalidateWorkoutSessionQueries, useAppServices } from '../../../services'

interface UseCompleteWorkoutOptions {
  onSuccess: (sessionId: string) => void
}

export function useCompleteWorkout({ onSuccess }: UseCompleteWorkoutOptions) {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (session: WorkoutDraft) => workoutRepository.saveSession({
      ...session,
      exercises: session.exercises.map(({ id, exerciseId, exerciseName, primaryMuscle, exerciseOrder, notes, sets }) => ({
        id,
        exerciseId,
        exerciseName,
        primaryMuscle,
        exerciseOrder,
        notes,
        sets,
      })),
      status: 'completed',
      completedAt: new Date().toISOString(),
    }),
    onSuccess: (saved) => {
      void invalidateWorkoutSessionQueries(queryClient)
      onSuccess(saved.id)
    },
  })
}
