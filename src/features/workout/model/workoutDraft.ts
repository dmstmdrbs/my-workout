import { snapshotExerciseName } from '../exerciseLabels'
import type { Equipment, Exercise, ProgramRunDay, Rir, Routine, WorkoutExercise, WorkoutSetRecord } from '../../../types/domain'
import type { ExerciseTrackingType, WorkoutDraft, WorkoutDraftExercise } from '../activeWorkoutDraft'

export function createRoutineWorkoutDraft(routine: Routine, exercises: Exercise[]): WorkoutDraft {
  const startedAt = new Date().toISOString()
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  return {
    id: createWorkoutId(), routineId: routine.id, routineName: routine.name, status: 'in_progress', startedAt, completedAt: null, pausedSeconds: 0, notes: null,
    exercises: [...routine.exercises].sort((a, b) => a.exerciseOrder - b.exerciseOrder).map((routineExercise): WorkoutDraftExercise => ({
      id: createWorkoutId(), exerciseId: routineExercise.exerciseId, exerciseName: routineExercise.exerciseName,
      primaryMuscle: exerciseById.get(routineExercise.exerciseId)?.primaryMuscle ?? 'full_body', exerciseOrder: routineExercise.exerciseOrder, notes: routineExercise.notes,
      trackingType: exerciseById.get(routineExercise.exerciseId)?.equipment === 'cardio' ? 'cardio' : 'strength',
      sets: [...routineExercise.sets].sort((a, b) => a.setOrder - b.setOrder).map((prescription): WorkoutSetRecord => ({
        id: createWorkoutId(), setOrder: prescription.setOrder, setType: prescription.setType, weightKg: prescription.targetWeightKg,
        reps: prescription.targetRepsMax ?? prescription.targetRepsMin,
        durationSeconds: prescription.targetDurationSeconds, distanceKm: prescription.targetDistanceKm,
        targetRir: prescription.targetRir, actualRir: null,
        restSeconds: prescription.restSeconds, isCompleted: false, completedAt: null, notes: null,
      })),
    })),
  }
}

export function createProgramWorkoutDraft(day: ProgramRunDay, exercises: Exercise[]): WorkoutDraft {
  const exerciseByName = new Map(exercises.map((exercise) => [exercise.name, exercise]))
  const startedAt = new Date().toISOString()

  if (day.dayType === 'cardio' && day.cardioTarget) {
    const target = day.cardioTarget
    const exercise = exerciseByName.get(target.exerciseName)
    if (!exercise) throw new Error(`${target.exerciseName} 종목을 찾지 못했어요.`)
    return {
      id: createWorkoutId(), routineId: null, routineName: `Day ${day.dayNumber} · ${day.title}`, programRunDayId: day.id,
      status: 'in_progress', startedAt, completedAt: null, pausedSeconds: 0, notes: day.instructions,
      exercises: [{
        id: createWorkoutId(), exerciseId: exercise.id, exerciseName: exercise.name, primaryMuscle: exercise.primaryMuscle, exerciseOrder: 1,
        trackingType: 'cardio',
        notes: target.rpeMin === null ? day.instructions : `목표 RPE ${target.rpeMin}-${target.rpeMax ?? target.rpeMin}`,
        sets: [{
          id: createWorkoutId(), setOrder: 1, setType: 'working', weightKg: null, reps: null,
          durationSeconds: target.durationMinutes === null ? null : target.durationMinutes * 60,
          distanceKm: target.distanceKm, targetRir: null, actualRir: null, restSeconds: null,
          isCompleted: false, completedAt: null, notes: null,
        }],
      }],
    }
  }

  if (!day.routineSnapshot) throw new Error('이 Day에는 운동 처방이 없어요.')
  return {
    id: createWorkoutId(), routineId: null, routineName: `Day ${day.dayNumber} · ${day.title}`, programRunDayId: day.id,
    status: 'in_progress', startedAt, completedAt: null, pausedSeconds: 0, notes: day.instructions,
    exercises: day.routineSnapshot.exercises.map((prescription): WorkoutDraftExercise => {
      const exercise = exerciseByName.get(prescription.exerciseName)
      if (!exercise) throw new Error(`${prescription.exerciseName} 종목을 찾지 못했어요.`)
      return {
        id: createWorkoutId(), exerciseId: exercise.id, exerciseName: exercise.name, primaryMuscle: exercise.primaryMuscle,
        exerciseOrder: prescription.exerciseOrder, notes: prescription.notes,
        trackingType: exercise.equipment === 'cardio' ? 'cardio' : 'strength',
        sets: prescription.sets.map((set): WorkoutSetRecord => ({
          id: createWorkoutId(), setOrder: set.setOrder, setType: set.setType, weightKg: set.targetWeightKg,
          reps: set.targetRepsMax ?? set.targetRepsMin,
          durationSeconds: set.targetDurationSeconds ?? null,
          distanceKm: set.targetDistanceKm ?? null,
          targetRir: set.targetRir, actualRir: null, restSeconds: set.restSeconds,
          isCompleted: false, completedAt: null, notes: set.notes,
        })),
      }
    }),
  }
}

export function createFreeWorkoutDraft(): WorkoutDraft {
  return {
    id: createWorkoutId(), routineId: null, routineName: null, status: 'in_progress', startedAt: new Date().toISOString(), completedAt: null, pausedSeconds: 0, notes: null, exercises: [],
  }
}

export function createFreeWorkoutExercise({ exercise, exerciseOrder, previousSet, defaultRestSeconds, defaultRir }: { exercise: Exercise; exerciseOrder: number; previousSet: WorkoutSetRecord | null; defaultRestSeconds: number; defaultRir: Rir }): WorkoutDraftExercise {
  return {
    id: createWorkoutId(), exerciseId: exercise.id, exerciseName: snapshotExerciseName(exercise), primaryMuscle: exercise.primaryMuscle, exerciseOrder, notes: null,
    trackingType: exercise.equipment === 'cardio' ? 'cardio' : 'strength',
    sets: [{
      id: createWorkoutId(), setOrder: 1, setType: 'working', weightKg: previousSet?.weightKg ?? null, reps: previousSet?.reps ?? null, durationSeconds: null, distanceKm: null,
      targetRir: exercise.equipment === 'cardio' ? null : defaultRir, actualRir: null, restSeconds: exercise.defaultRestSeconds || defaultRestSeconds, isCompleted: false, completedAt: null, notes: null,
    }],
  }
}

export function isExerciseTrackingTypeChange(current: Equipment | ExerciseTrackingType, replacement: Equipment) {
  return (current === 'cardio') !== (replacement === 'cardio')
}

export function resolveWorkoutExerciseTrackingType(current: WorkoutDraftExercise, catalogEquipment?: Equipment): ExerciseTrackingType {
  return current.trackingType ?? (catalogEquipment === 'cardio' ? 'cardio' : 'strength')
}

export function replaceWorkoutExercise(
  current: WorkoutDraftExercise,
  replacement: Exercise,
  { resetSets, defaultRestSeconds, defaultRir }: { resetSets: boolean; defaultRestSeconds: number; defaultRir: Rir },
): WorkoutDraftExercise {
  if (!resetSets) {
    return {
      ...current,
      exerciseId: replacement.id,
      exerciseName: snapshotExerciseName(replacement),
      primaryMuscle: replacement.primaryMuscle,
      trackingType: replacement.equipment === 'cardio' ? 'cardio' : 'strength',
    }
  }

  const initialized = createFreeWorkoutExercise({
    exercise: replacement,
    exerciseOrder: current.exerciseOrder,
    previousSet: null,
    defaultRestSeconds,
    defaultRir,
  })
  return {
    ...initialized,
    id: current.id,
  }
}

export function sortWorkoutExercises(exercises: WorkoutExercise[]) {
  return [...exercises].sort((left, right) => left.exerciseOrder - right.exerciseOrder)
}

export function normalizeWorkoutExerciseOrder(exercises: WorkoutExercise[]) {
  return exercises.map((exercise, index) => ({ ...exercise, exerciseOrder: index + 1 }))
}

export function findMostRecentlyCompletedSet(draft: WorkoutDraft | null): WorkoutSetRecord | null {
  if (!draft) return null
  let latest: WorkoutSetRecord | null = null
  for (const exercise of draft.exercises) {
    for (const set of exercise.sets) {
      if (!set.isCompleted || !set.completedAt) continue
      if (!latest || !latest.completedAt || set.completedAt > latest.completedAt) latest = set
    }
  }
  return latest
}

export function getMissingProgramExercises(day: ProgramRunDay, exercises: Exercise[]) {
  const available = new Set(exercises.map((exercise) => exercise.name))
  const names = day.dayType === 'cardio' && day.cardioTarget
    ? [day.cardioTarget.exerciseName]
    : day.routineSnapshot?.exercises.map((exercise) => exercise.exerciseName) ?? []
  return names.filter((name) => !available.has(name))
}

export function countWorkoutSets(session: WorkoutDraft) {
  return session.exercises.reduce((count, exercise) => count + exercise.sets.length, 0)
}

export function createWorkoutId() {
  return globalThis.crypto?.randomUUID?.() ?? `workout-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
