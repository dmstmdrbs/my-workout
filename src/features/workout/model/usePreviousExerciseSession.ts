import { useQuery } from '@tanstack/react-query'
import { useAppServices } from '../../../services'
import { previousExerciseSessionQueryKey } from './queryKeys'

export function usePreviousExerciseSession(exerciseId: string) {
  const { workoutRepository } = useAppServices()

  return useQuery({
    queryKey: previousExerciseSessionQueryKey(exerciseId),
    queryFn: () => workoutRepository.getPreviousCompletedSessionForExercise(exerciseId),
  })
}
