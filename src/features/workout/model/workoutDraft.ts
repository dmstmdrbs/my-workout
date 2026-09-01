import { snapshotExerciseName } from '../exerciseLabels'
import type { Exercise, ProgramRunDay, Rir, Routine, WorkoutExercise, WorkoutSetRecord } from '../../../types/domain'
import type { WorkoutDraft } from '../activeWorkoutDraft'

export function createRoutineWorkoutDraft(routine: Routine, exercises: Exercise[]): WorkoutDraft {
  const startedAt = new Date().toISOString()
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  return {
    id: createWorkoutId(), routineId: routine.id, routineName: routine.name, status: 'in_progress', startedAt, completedAt: null, pausedSeconds: 0, notes: null,
    exercises: [...routine.exercises].sort((a, b) => a.exerciseOrder - b.exerciseOrder).map((routineExercise): WorkoutExercise => ({
      id: createWorkoutId(), exerciseId: routineExercise.exerciseId, exerciseName: routineExercise.exerciseName,
      primaryMuscle: exerciseById.get(routineExercise.exerciseId)?.primaryMuscle ?? 'full_body', exerciseOrder: routineExercise.exerciseOrder, notes: routineExercise.notes,
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
    exercises: day.routineSnapshot.exercises.map((prescription): WorkoutExercise => {
      const exercise = exerciseByName.get(prescription.exerciseName)
      if (!exercise) throw new Error(`${prescription.exerciseName} 종목을 찾지 못했어요.`)
      return {
        id: createWorkoutId(), exerciseId: exercise.id, exerciseName: exercise.name, primaryMuscle: exercise.primaryMuscle,
        exerciseOrder: prescription.exerciseOrder, notes: prescription.notes,
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

export function createFreeWorkoutExercise({ exercise, exerciseOrder, previousSet, defaultRestSeconds, defaultRir }: { exercise: Exercise; exerciseOrder: number; previousSet: WorkoutSetRecord | null; defaultRestSeconds: number; defaultRir: Rir }): WorkoutExercise {
  return {
    id: createWorkoutId(), exerciseId: exercise.id, exerciseName: snapshotExerciseName(exercise), primaryMuscle: exercise.primaryMuscle, exerciseOrder, notes: null,
    sets: [{
      id: createWorkoutId(), setOrder: 1, setType: 'working', weightKg: previousSet?.weightKg ?? null, reps: previousSet?.reps ?? null, durationSeconds: null, distanceKm: null,
      targetRir: defaultRir, actualRir: null, restSeconds: exercise.defaultRestSeconds || defaultRestSeconds, isCompleted: false, completedAt: null, notes: null,
    }],
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
