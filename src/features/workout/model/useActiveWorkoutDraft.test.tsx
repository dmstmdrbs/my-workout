import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  clearStoredWorkoutDraft,
  type StoredWorkoutDraft,
  workoutDraftStorageKey,
  writeStoredWorkoutDraft,
} from '../activeWorkoutDraft'
import { useActiveWorkoutDraft } from './useActiveWorkoutDraft'

function Probe() {
  const { draft } = useActiveWorkoutDraft(false)
  return <output data-testid="draft-id">{draft?.draft.id ?? 'none'}</output>
}

function createDraft(id: string): StoredWorkoutDraft {
  return {
    draft: {
      id,
      routineId: null,
      routineName: '테스트 운동',
      status: 'in_progress',
      startedAt: '2026-09-01T00:00:00.000Z',
      completedAt: null,
      pausedSeconds: 0,
      notes: null,
      exercises: [],
    },
    activeExerciseId: null,
    restEndsAt: null,
    pausedAt: null,
  }
}

describe('useActiveWorkoutDraft storage boundary', () => {
  beforeEach(() => localStorage.removeItem(workoutDraftStorageKey))
  afterEach(() => localStorage.removeItem(workoutDraftStorageKey))

  test('same-tab writes and clears update consumers without a storage event', async () => {
    render(<Probe />)
    expect(screen.getByTestId('draft-id').textContent).toBe('none')

    act(() => writeStoredWorkoutDraft(createDraft('same-tab')))
    await waitFor(() => expect(screen.getByTestId('draft-id').textContent).toBe('same-tab'))

    act(clearStoredWorkoutDraft)
    await waitFor(() => expect(screen.getByTestId('draft-id').textContent).toBe('none'))
  })

  test('cross-tab storage events refresh the same snapshot', async () => {
    render(<Probe />)
    const next = createDraft('cross-tab')
    localStorage.setItem(workoutDraftStorageKey, JSON.stringify(next))

    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: workoutDraftStorageKey,
        newValue: JSON.stringify(next),
      }))
      await waitFor(() => expect(screen.getByTestId('draft-id').textContent).toBe('cross-tab'))
    })

    expect(screen.getByTestId('draft-id').textContent).toBe('cross-tab')
  })
})
