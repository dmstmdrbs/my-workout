import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppServices } from '../../../services'
import type { Exercise } from '../../../types/domain'
import { exerciseCatalogQueryKey } from './queryKeys'

export type CreateExerciseInput = Omit<Exercise, 'id' | 'userId' | 'createdAt' | 'updatedAt'>

export function useCreateExercise({ onCreated }: { onCreated: (exercise: Exercise) => void }) {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: CreateExerciseInput) => workoutRepository.saveExercise(input),
    onSuccess: (exercise) => {
      void queryClient.invalidateQueries({ queryKey: exerciseCatalogQueryKey })
      onCreated(exercise)
    },
  })

  return {
    create: mutation.mutate,
    reset: mutation.reset,
    isPending: mutation.isPending,
    isError: mutation.isError,
  }
}
