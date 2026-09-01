import { describe, expect, it } from 'vitest'
import type { WorkoutExercise, WorkoutSetRecord } from '../../../types/domain'
import type { WorkoutDraft } from '../activeWorkoutDraft'
import {
  findMostRecentlyCompletedSet,
  normalizeWorkoutExerciseOrder,
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
