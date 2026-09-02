import { useState, type Dispatch, type SetStateAction } from 'react'
import type { WorkoutDraft } from '../../../entities/workout'
import type { Exercise, Rir } from '../../../types/domain'
import { isExerciseTrackingTypeChange, replaceWorkoutExercise, resolveWorkoutExerciseTrackingType } from './workoutDraft'

export interface PendingExerciseReplacement {
  workoutExerciseId: string
  replacement: Exercise
}

interface UseExerciseReplacementOptions {
  draft: WorkoutDraft | null
  setDraft: Dispatch<SetStateAction<WorkoutDraft | null>>
  exercises: Exercise[]
  defaultRestSeconds: number
  defaultRir: Rir
}

export function useExerciseReplacement({ draft, setDraft, exercises, defaultRestSeconds, defaultRir }: UseExerciseReplacementOptions) {
  const [locallyCreatedExercises, setLocallyCreatedExercises] = useState<Exercise[]>([])
  const [pendingReplacement, setPendingReplacement] = useState<PendingExerciseReplacement | null>(null)
  const exerciseCatalog = [
    ...exercises,
    ...locallyCreatedExercises.filter((created) => !exercises.some((exercise) => exercise.id === created.id)),
  ]

  const applyReplacement = (workoutExerciseId: string, replacement: Exercise, resetSets: boolean) => {
    setDraft((current) => current ? {
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id === workoutExerciseId
        ? replaceWorkoutExercise(exercise, replacement, { resetSets, defaultRestSeconds, defaultRir })
        : exercise),
    } : current)
  }

  const requestReplacement = (workoutExerciseId: string, replacement: Exercise) => {
    const current = draft?.exercises.find((exercise) => exercise.id === workoutExerciseId)
    if (!current || current.exerciseId === replacement.id) return

    const catalogEquipment = exerciseCatalog.find((exercise) => exercise.id === current.exerciseId)?.equipment
    const currentTrackingType = resolveWorkoutExerciseTrackingType(current, catalogEquipment)
    if (isExerciseTrackingTypeChange(currentTrackingType, replacement.equipment)) {
      setPendingReplacement({ workoutExerciseId, replacement })
      return
    }
    applyReplacement(workoutExerciseId, replacement, false)
  }

  const confirmReplacement = () => {
    if (!pendingReplacement) return
    applyReplacement(pendingReplacement.workoutExerciseId, pendingReplacement.replacement, true)
    setPendingReplacement(null)
  }

  const registerCreatedExercise = (exercise: Exercise) => {
    setLocallyCreatedExercises((current) => [...current.filter((item) => item.id !== exercise.id), exercise])
  }

  return {
    exerciseCatalog,
    pendingReplacement,
    requestReplacement,
    confirmReplacement,
    cancelReplacement: () => setPendingReplacement(null),
    registerCreatedExercise,
  }
}
