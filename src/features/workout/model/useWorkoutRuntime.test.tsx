import { render } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { readStoredWorkoutDraft, writeStoredWorkoutDraft, type StoredWorkoutDraft } from '../../../entities/workout'
import { useWorkoutRuntime } from './useWorkoutRuntime'

const externalDraft: StoredWorkoutDraft = {
  draft: {
    id: 'tab-b-draft',
    routineId: null,
    routineName: '탭 B 운동',
    status: 'in_progress',
    startedAt: '2026-08-30T09:00:00.000Z',
    completedAt: null,
    pausedSeconds: 0,
    notes: null,
    exercises: [],
  },
  activeExerciseId: null,
  restEndsAt: null,
  pausedAt: null,
}

function RuntimeRaceHarness() {
  useWorkoutRuntime({ keepScreenAwake: false })
  useLayoutEffect(() => {
    // Simulate tab B committing its draft after tab A's lazy read but before A's
    // passive persistence effects run.
    writeStoredWorkoutDraft(externalDraft)
  }, [])
  return null
}

describe('useWorkoutRuntime persistence lifecycle', () => {
  afterEach(() => {
    localStorage.clear()
  })

  test('null 상태의 passive effect는 다른 탭이 새로 쓴 초안을 삭제하지 않는다', () => {
    render(<RuntimeRaceHarness />)

    expect(readStoredWorkoutDraft()).toEqual(externalDraft)
  })
})
