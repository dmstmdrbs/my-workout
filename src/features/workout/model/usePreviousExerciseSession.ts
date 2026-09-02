import { useQuery } from '@tanstack/react-query'
import { previousExerciseSessionQueryKey, useAppServices } from '../../../services'

export function usePreviousExerciseSession(exerciseId: string) {
  const { workoutRepository } = useAppServices()

  return useQuery({
    queryKey: previousExerciseSessionQueryKey(exerciseId),
    queryFn: () => workoutRepository.getPreviousCompletedSessionForExercise(exerciseId),
  })
}
