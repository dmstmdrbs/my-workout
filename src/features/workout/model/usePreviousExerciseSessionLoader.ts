import { useQueryClient } from '@tanstack/react-query'
import { previousExerciseSessionQueryKey, useAppServices, type PreviousExerciseSession } from '../../../services'
import type { Exercise } from '../../../types/domain'

export function usePreviousExerciseSessionLoader() {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()

  return async (exercises: Exercise[]): Promise<(PreviousExerciseSession | null)[]> => Promise.all(exercises.map(async (exercise) => {
    try {
      return await queryClient.fetchQuery({
        queryKey: previousExerciseSessionQueryKey(exercise.id),
        queryFn: () => workoutRepository.getPreviousCompletedSessionForExercise(exercise.id),
      })
    } catch {
      // 한 종목의 지난 기록 조회가 실패해도 나머지 선택 종목은 모두 추가한다.
      return null
    }
  }))
}
