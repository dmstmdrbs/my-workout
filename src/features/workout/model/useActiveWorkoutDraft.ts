import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  clearStoredWorkoutDraft,
  getStoredWorkoutDraftSnapshot,
  subscribeStoredWorkoutDraft,
  writeStoredWorkoutDraft,
  type StoredWorkoutDraft,
} from '../activeWorkoutDraft'

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

  const updateDraft = useCallback((nextDraft: StoredWorkoutDraft | null) => {
    if (nextDraft) {
      // WorkoutRunner already persists the value before notifying its shell.
      // Keeping this callback on the same store boundary also covers callers
      // that only know about the app-level draft callback.
      writeStoredWorkoutDraft(nextDraft)
    } else {
      clearStoredWorkoutDraft()
    }
    setClock(Date.now())
  }, [])

  const clearDraft = useCallback(() => {
    clearStoredWorkoutDraft()
    setClock(Date.now())
  }, [])

  return { draft, clock, updateDraft, clearDraft }
}
