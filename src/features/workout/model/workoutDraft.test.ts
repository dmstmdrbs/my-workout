import { describe, expect, it } from 'vitest'
import type { Exercise, ProgramRunDay, Routine, WorkoutExercise, WorkoutSetRecord } from '../../../types/domain'
import type { WorkoutDraft } from '../../../entities/workout'
import {
  countWorkoutSets,
  createFreeWorkoutExercise,
  createFreeWorkoutDraft,
  createProgramWorkoutDraft,
  createRoutineWorkoutDraft,
  findMostRecentlyCompletedSet,
  getMissingProgramExercises,
  isExerciseTrackingTypeChange,
  normalizeWorkoutExerciseOrder,
  replaceWorkoutExercise,
  resolveWorkoutExerciseTrackingType,
  sortWorkoutExercises,
} from './workoutDraft'

describe('workout draft model', () => {
  it('sorts exercises without mutating the draft order', () => {
    const exercises = [createExercise('second', 2), createExercise('first', 1)]

    const sorted = sortWorkoutExercises(exercises)

    expect(sorted.map((exercise) => exercise.id)).toEqual(['first', 'second'])
    expect(exercises.map((exercise) => exercise.id)).toEqual(['second', 'first'])
  })

  it('normalizes exercise order into a new collection', () => {
    const exercises = [createExercise('first', 4), createExercise('second', 9)]

    const normalized = normalizeWorkoutExerciseOrder(exercises)

    expect(normalized.map((exercise) => exercise.exerciseOrder)).toEqual([1, 2])
    expect(exercises.map((exercise) => exercise.exerciseOrder)).toEqual([4, 9])
  })

  it('finds the latest completed set across every exercise', () => {
    const older = createSet('older', '2026-08-31T10:00:00.000Z')
    const latest = createSet('latest', '2026-08-31T11:00:00.000Z')
    const incomplete = createSet('incomplete', null)
    const draft = createDraft([
      { ...createExercise('first', 1), sets: [older, incomplete] },
      { ...createExercise('second', 2), sets: [latest] },
    ])

    expect(findMostRecentlyCompletedSet(draft)).toBe(latest)
  })

  it('creates a routine draft with ordered exercises, sets and target values', () => {
    const routine = createRoutine('routine', [createRoutineExercise('press', '프레스', 2, 2), createRoutineExercise('squat', '스쿼트', 1, 1)])

    const draft = createRoutineWorkoutDraft(routine, [createExerciseDefinition('press', '프레스'), createExerciseDefinition('squat', '스쿼트')])

    expect(draft.exercises.map((exercise) => exercise.exerciseName)).toEqual(['스쿼트', '프레스'])
    expect(draft.exercises[0].sets[0]).toMatchObject({ weightKg: 40, reps: 10, targetRir: 2, restSeconds: 90, isCompleted: false })
    expect(countWorkoutSets(draft)).toBe(2)
  })

  it('creates a free draft and applies default RIR/rest while keeping previous values', () => {
    expect(createFreeWorkoutDraft().exercises).toEqual([])

    const exercise = createExerciseDefinition('press', '프레스', 0)
    const previousSet = { ...createSet('previous', null), weightKg: 55, reps: 7 }
    const workoutExercise = createFreeWorkoutExercise({ exercise, exerciseOrder: 1, previousSet, defaultRestSeconds: 120, defaultRir: 3 })

    expect(workoutExercise.sets[0]).toMatchObject({ weightKg: 55, reps: 7, targetRir: 3, restSeconds: 120 })
  })

  it('creates strength and cardio program drafts with expected set count and fields', () => {
    const strengthDay = createProgramDay({
      dayType: 'strength',
      routineSnapshot: { description: null, exercises: [{ exerciseName: '프레스', exerciseOrder: 1, notes: null, sets: [createPrescription(1), createPrescription(2)] }] },
    })
    const strengthDraft = createProgramWorkoutDraft(strengthDay, [createExerciseDefinition('press', '프레스')])
    expect(strengthDraft.programRunDayId).toBe(strengthDay.id)
    expect(strengthDraft.exercises[0].sets).toHaveLength(2)

    const cardioDay = createProgramDay({ dayType: 'cardio', routineSnapshot: null, cardioTarget: { exerciseName: '러닝', distanceKm: 5, durationMinutes: 30, rpeMin: 6, rpeMax: 7 } })
    const cardioDraft = createProgramWorkoutDraft(cardioDay, [createExerciseDefinition('running', '러닝', 0, 'cardio')])
    expect(cardioDraft.exercises[0].sets[0]).toMatchObject({ durationSeconds: 1_800, distanceKm: 5, weightKg: null, reps: null })
    expect(countWorkoutSets(cardioDraft)).toBe(1)
  })

  it('replaces only the exercise identity when both exercises use the same tracking fields', () => {
    const completedSet = {
      ...createSet('completed', '2026-08-31T10:00:00.000Z'),
      weightKg: 82.5,
      reps: 6,
      actualRir: 1,
    }
    const pendingSet = { ...createSet('pending', null), setOrder: 2, weightKg: 77.5, reps: 8, targetRir: 2 }
    const current = { ...createExercise('bench', 2), notes: '3초 네거티브', sets: [completedSet, pendingSet] }
    const replacement = createExerciseDefinition('chest-press', '체스트 프레스', 75, 'machine')

    const result = replaceWorkoutExercise(current, replacement, {
      resetSets: false,
      defaultRestSeconds: 120,
      defaultRir: 2,
    })

    expect(result).toMatchObject({
      id: current.id,
      exerciseId: 'chest-press',
      exerciseName: '체스트 프레스',
      primaryMuscle: replacement.primaryMuscle,
      exerciseOrder: 2,
      notes: '3초 네거티브',
    })
    expect(result.sets).toBe(current.sets)
    expect(result.sets[0]).toBe(completedSet)
  })

  it('resets every set value when the replacement changes between strength and cardio', () => {
    const current = {
      ...createExercise('bench', 3),
      sets: [{
        ...createSet('completed', '2026-08-31T10:00:00.000Z'),
        weightKg: 90,
        reps: 5,
        targetRir: 2,
        actualRir: 1,
      }],
    }
    const running = createExerciseDefinition('running', '러닝', 0, 'cardio')

    const result = replaceWorkoutExercise(current, running, {
      resetSets: true,
      defaultRestSeconds: 120,
      defaultRir: 2,
    })

    expect(result).toMatchObject({ id: current.id, exerciseId: 'running', exerciseName: '러닝', exerciseOrder: 3 })
    expect(result).toMatchObject({ trackingType: 'cardio', notes: null })
    expect(result.sets).toHaveLength(1)
    expect(result.sets[0]).toMatchObject({
      setOrder: 1,
      setType: 'working',
      weightKg: null,
      reps: null,
      durationSeconds: null,
      distanceKm: null,
      targetRir: null,
      actualRir: null,
      isCompleted: false,
      completedAt: null,
    })
    expect(result.sets[0].id).not.toBe(current.sets[0].id)
  })

  it('requires reset confirmation only when cardio tracking changes', () => {
    expect(isExerciseTrackingTypeChange('barbell', 'machine')).toBe(false)
    expect(isExerciseTrackingTypeChange('bodyweight', 'cable')).toBe(false)
    expect(isExerciseTrackingTypeChange('barbell', 'cardio')).toBe(true)
    expect(isExerciseTrackingTypeChange('cardio', 'dumbbell')).toBe(true)
    expect(isExerciseTrackingTypeChange('cardio', 'cardio')).toBe(false)
  })

  it('keeps the draft tracking snapshot when the current exercise is no longer in the catalog', () => {
    expect(resolveWorkoutExerciseTrackingType({ ...createExercise('running', 1), trackingType: 'cardio' })).toBe('cardio')
    expect(resolveWorkoutExerciseTrackingType(createExercise('legacy-running', 1), 'cardio')).toBe('cardio')
    expect(resolveWorkoutExerciseTrackingType(createExercise('legacy-press', 1))).toBe('strength')
  })

  it('reports missing program exercises and throws when a program cannot be materialized', () => {
    const day = createProgramDay({ routineSnapshot: { description: null, exercises: [{ exerciseName: '없는 종목', exerciseOrder: 1, notes: null, sets: [createPrescription(1)] }] } })
    expect(getMissingProgramExercises(day, [])).toEqual(['없는 종목'])
    expect(() => createProgramWorkoutDraft(day, [])).toThrow('없는 종목 종목을 찾지 못했어요.')
    expect(() => createProgramWorkoutDraft(createProgramDay({ dayType: 'strength', routineSnapshot: null }), [])).toThrow('이 Day에는 운동 처방이 없어요.')
  })
})

function createExercise(id: string, exerciseOrder: number): WorkoutExercise {
  return {
    id,
    exerciseId: `exercise-${id}`,
    exerciseName: id,
    primaryMuscle: 'full_body',
    exerciseOrder,
    notes: null,
    sets: [],
  }
}

function createSet(id: string, completedAt: string | null): WorkoutSetRecord {
  return {
    id,
    setOrder: 1,
    setType: 'working',
    weightKg: null,
    reps: null,
    durationSeconds: null,
    distanceKm: null,
    targetRir: null,
    actualRir: null,
    restSeconds: null,
    isCompleted: completedAt !== null,
    completedAt,
    notes: null,
  }
}

function createDraft(exercises: WorkoutExercise[]): WorkoutDraft {
  return {
    id: 'draft',
    routineId: null,
    routineName: null,
    status: 'in_progress',
    startedAt: '2026-08-31T09:00:00.000Z',
    completedAt: null,
    pausedSeconds: 0,
    notes: null,
    exercises,
  }
}

function createExerciseDefinition(id: string, name: string, defaultRestSeconds = 90, equipment: Exercise['equipment'] = 'barbell'): Exercise {
  return { id, userId: 'user', name, primaryMuscle: 'full_body', secondaryMuscles: [], equipment, brand: null, defaultRestSeconds, isArchived: false, createdAt: '2026-08-31T09:00:00.000Z', updatedAt: '2026-08-31T09:00:00.000Z' }
}

function createRoutine(id: string, exercises: Routine['exercises']): Routine {
  return { id, userId: 'user', name: '테스트 루틴', description: null, color: null, exercises, createdAt: '2026-08-31T09:00:00.000Z', updatedAt: '2026-08-31T09:00:00.000Z' }
}

function createRoutineExercise(exerciseId: string, exerciseName: string, exerciseOrder: number, setOrder: number) {
  return { id: `${exerciseId}-routine`, exerciseId, exerciseName, exerciseOrder, notes: null, sets: [createPrescription(setOrder)] }
}

function createPrescription(setOrder: number) {
  return { id: `set-${setOrder}`, setOrder, setType: 'working' as const, targetWeightKg: 40, targetRepsMin: 8, targetRepsMax: 10, targetDurationSeconds: null, targetDistanceKm: null, targetRir: 2, restSeconds: 90, notes: null }
}

function createProgramDay(overrides: Partial<ProgramRunDay> = {}): ProgramRunDay {
  return {
    id: 'day-1', userId: 'user', programRunId: 'run-1', dayNumber: 1, weekNumber: 1, dayOfWeek: 1,
    scheduledOn: '2026-08-31', dayType: 'strength', title: 'Day 1', instructions: null,
    routineSnapshot: { description: null, exercises: [] }, cardioTarget: null, isOptional: false,
    completedAt: null, workoutSession: null, createdAt: '2026-08-31T09:00:00.000Z', updatedAt: '2026-08-31T09:00:00.000Z',
    ...overrides,
  }
}
