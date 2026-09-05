import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  clearStoredWorkoutDraft,
  getStoredWorkoutDraftSnapshot,
  subscribeStoredWorkoutDraft,
  type StoredWorkoutDraft,
} from '../../../entities/workout'

export function useActiveWorkoutDraft(shouldTick: boolean) {
  const draft = useSyncExternalStore(
    subscribeStoredWorkoutDraft,
    getStoredWorkoutDraftSnapshot,
    () => null,
  )
  const [clock, setClock] = useState(Date.now())

  useEffect(() => {
    if (!draft) return
    const protectDraftOnUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectDraftOnUnload)
    return () => window.removeEventListener('beforeunload', protectDraftOnUnload)
  }, [draft])

  useEffect(() => {
    if (!draft || !shouldTick) return
    setClock(Date.now())
    const interval = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [draft, shouldTick])

  const updateDraft = useCallback((_nextDraft: StoredWorkoutDraft | null) => {
    // WorkoutRunner owns persistence. The shell callback only refreshes display
    // time, avoiding a second Preferences write for every reps/weight edit.
    setClock(Date.now())
  }, [])

  const clearDraft = useCallback(() => {
    clearStoredWorkoutDraft()
    setClock(Date.now())
  }, [])

  return { draft, clock, updateDraft, clearDraft }
}
