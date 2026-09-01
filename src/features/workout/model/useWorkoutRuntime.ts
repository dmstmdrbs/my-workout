import { useEffect, useState } from 'react'
import { getEffectivePausedSeconds } from '../../../lib/duration'
import { playRestFinishedAlert, primeRestAlert } from '../../../lib/restAlert'
import { disableRestAlerts, notifyRestComplete, readRestAlertsEnabled, requestRestAlerts } from '../../../lib/restAlerts'
import { requestScreenWakeLock } from '../../../lib/wakeLock'
import {
  clearStoredWorkoutDraft,
  readStoredWorkoutDraft,
  type StoredWorkoutDraft,
  type WorkoutDraft,
  writeStoredWorkoutDraft,
} from '../activeWorkoutDraft'

interface UseWorkoutRuntimeOptions {
  keepScreenAwake: boolean
  onDraftStateChange?: (draft: StoredWorkoutDraft | null) => void
}

export function useWorkoutRuntime({ keepScreenAwake, onDraftStateChange }: UseWorkoutRuntimeOptions) {
  const [restoredDraft] = useState<StoredWorkoutDraft | null>(() => readStoredWorkoutDraft())
  const [draft, setDraft] = useState<WorkoutDraft | null>(restoredDraft?.draft ?? null)
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(restoredDraft?.activeExerciseId ?? null)
  const [restEndsAt, setRestEndsAt] = useState<number | null>(restoredDraft?.restEndsAt ?? null)
  const [pausedAt, setPausedAt] = useState<number | null>(restoredDraft?.pausedAt ?? null)
  const [clock, setClock] = useState(Date.now())
  const [restAlertsEnabled, setRestAlertsEnabled] = useState(readRestAlertsEnabled)

  useEffect(() => {
    if (!draft) return
    const interval = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [draft])

  useEffect(() => {
    if (!draft || restEndsAt === null) return
    const targetEnd = restEndsAt
    const timeout = window.setTimeout(() => {
      setClock(Date.now())
      if (document.visibilityState === 'visible') playRestFinishedAlert()
      else if (restAlertsEnabled) void notifyRestComplete()
      setRestEndsAt((current) => current === targetEnd ? null : current)
    }, Math.max(0, restEndsAt - Date.now()))
    return () => window.clearTimeout(timeout)
  }, [draft, restAlertsEnabled, restEndsAt])

  // 운동 중에는 화면을 켜 둔다. 웹에는 백그라운드 알림을 예약할 방법이 없어,
  // 휴식 알림이 들리려면 화면이 앞에 떠 있어야 한다.
  useEffect(() => {
    if (!draft || !keepScreenAwake) return
    return requestScreenWakeLock()
  }, [draft, keepScreenAwake])

  useEffect(() => {
    if (!draft) {
      clearStoredWorkoutDraft()
      onDraftStateChange?.(null)
      return
    }
    const storedDraft = { draft, activeExerciseId, restEndsAt, pausedAt }
    writeStoredWorkoutDraft(storedDraft)
    onDraftStateChange?.(storedDraft)
  }, [activeExerciseId, draft, onDraftStateChange, pausedAt, restEndsAt])

  const beginDraft = (nextDraft: WorkoutDraft) => {
    setDraft(nextDraft)
    setActiveExerciseId(nextDraft.exercises[0]?.id ?? null)
  }

  const clearDraft = () => {
    clearStoredWorkoutDraft()
    setDraft(null)
    setActiveExerciseId(null)
    setRestEndsAt(null)
    setPausedAt(null)
  }

  const togglePause = () => {
    if (!draft) return
    const now = Date.now()
    if (pausedAt === null) {
      setPausedAt(now)
      return
    }
    const additionalPausedSeconds = Math.max(0, Math.floor((now - pausedAt) / 1_000))
    setDraft((current) => current ? { ...current, pausedSeconds: current.pausedSeconds + additionalPausedSeconds } : current)
    setPausedAt(null)
  }

  const startRest = (seconds: number) => {
    primeRestAlert()
    setClock(Date.now())
    setRestEndsAt(Date.now() + seconds * 1_000)
  }

  const adjustRest = (seconds: number) => {
    const now = Date.now()
    setClock(now)
    setRestEndsAt((current) => {
      const next = Math.max(now, Math.max(current ?? now, now) + seconds * 1_000)
      return next === now ? null : next
    })
  }

  const stopRest = () => setRestEndsAt(null)

  const toggleRestAlerts = async () => {
    if (restAlertsEnabled) {
      disableRestAlerts()
      setRestAlertsEnabled(false)
      return
    }
    setRestAlertsEnabled(await requestRestAlerts())
  }

  const getFinalPausedSeconds = () => draft
    ? getEffectivePausedSeconds(draft.pausedSeconds, pausedAt, Date.now())
    : 0

  return {
    draft,
    setDraft,
    activeExerciseId,
    setActiveExerciseId,
    restEndsAt,
    pausedAt,
    clock,
    restAlertsEnabled,
    beginDraft,
    clearDraft,
    togglePause,
    startRest,
    adjustRest,
    stopRest,
    toggleRestAlerts,
    getFinalPausedSeconds,
  }
}
