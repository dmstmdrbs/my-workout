import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { WorkoutDraft } from '../../../entities/workout'
import { useAppServices } from '../../../services'
import { routineLastPerformedQueryKey, workoutSetupQueryKey } from './queryKeys'

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
      void queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['completed-workout-records'] })
      void queryClient.invalidateQueries({ queryKey: workoutSetupQueryKey.all })
      void queryClient.invalidateQueries({ queryKey: ['program-runs'] })
      void queryClient.invalidateQueries({ queryKey: ['active-program-run'] })
      void queryClient.invalidateQueries({ queryKey: routineLastPerformedQueryKey })
      // Prefix match covers every exercise id, including caches populated before
      // this workout finished and still inside their staleTime.
      void queryClient.invalidateQueries({ queryKey: ['previous-exercise-session'] })
      onSuccess(saved.id)
    },
  })
}
