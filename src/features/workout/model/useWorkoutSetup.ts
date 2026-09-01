import { useQuery } from '@tanstack/react-query'
import { useAppServices } from '../../../services'
import type { Exercise, ProgramRun, ProgramRunDay, Routine } from '../../../types/domain'
import { workoutSetupQueryKey } from './queryKeys'

export interface WorkoutSetupData {
  routines: Routine[]
  exercises: Exercise[]
  programDay: ProgramRunDay | null
  activeProgramRun: ProgramRun | null
}

export function useWorkoutSetup(initialProgramRunDayId: string | null) {
  const { workoutRepository } = useAppServices()

  return useQuery({
    queryKey: workoutSetupQueryKey.byProgramDay(initialProgramRunDayId),
    queryFn: async (): Promise<WorkoutSetupData> => {
      const [routines, exercises, programDay, activeProgramRun] = await Promise.all([
        workoutRepository.listRoutines(),
        workoutRepository.listExercises(),
        initialProgramRunDayId ? workoutRepository.getProgramRunDay(initialProgramRunDayId) : Promise.resolve(null),
        workoutRepository.getActiveProgramRun(),
      ])
      return { routines, exercises, programDay, activeProgramRun }
    },
  })
}
