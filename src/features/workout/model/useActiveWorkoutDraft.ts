import { useCallback, useEffect, useState } from 'react'
import {
  readStoredWorkoutDraft,
  workoutDraftStorageKey,
  type StoredWorkoutDraft,
} from '../activeWorkoutDraft'

export function useActiveWorkoutDraft(shouldTick: boolean) {
  const [draft, setDraft] = useState<StoredWorkoutDraft | null>(() => readStoredWorkoutDraft())
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
    const restoreExternalDraft = (event: StorageEvent) => {
      if (event.key !== workoutDraftStorageKey) return
      setDraft(readStoredWorkoutDraft())
      setClock(Date.now())
    }
    window.addEventListener('storage', restoreExternalDraft)
    return () => window.removeEventListener('storage', restoreExternalDraft)
  }, [])

  useEffect(() => {
    if (!draft || !shouldTick) return
    setClock(Date.now())
    const interval = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [draft, shouldTick])

  const updateDraft = useCallback((nextDraft: StoredWorkoutDraft | null) => {
    setDraft(nextDraft)
    setClock(Date.now())
  }, [])

  const clearDraft = useCallback(() => {
    setDraft(null)
    setClock(Date.now())
  }, [])

  return { draft, clock, updateDraft, clearDraft }
}
