import { useEffect, useState } from 'react'
import { getEffectivePausedSeconds } from '../../../lib/duration'
import { playRestFinishedAlert, primeRestAlert } from '../../../lib/restAlert'
import { disableRestAlerts, enableRestAlerts, notifyRestComplete, readRestAlertsEnabled, requestRestAlerts } from '../../../lib/restAlerts'
import { requestScreenWakeLock } from '../../../lib/wakeLock'
import {
  clearStoredWorkoutDraft,
  readStoredWorkoutDraft,
  type StoredWorkoutDraft,
  type WorkoutDraft,
  writeStoredWorkoutDraft,
} from '../../../entities/workout'
import { requestNativeRestNotificationPermission, syncNativeRestNotification, usesNativeRestNotifications } from './restNotifications'

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
  const hasDraft = draft !== null

  useEffect(() => {
    if (!hasDraft) return
    const interval = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [hasDraft])

  useEffect(() => {
    if (!draft || restEndsAt === null) return
    const targetEnd = restEndsAt
    const timeout = window.setTimeout(() => {
      setClock(Date.now())
      if (usesNativeRestNotifications()) {
        // 네이티브 알림을 켰다면 포그라운드도 OS가 소리를 낸다.
        // 권한을 끄면 화면이 열려 있을 때만 기존 알림을 유지한다.
        if (!restAlertsEnabled && document.visibilityState === 'visible') playRestFinishedAlert()
      } else if (document.visibilityState === 'visible') playRestFinishedAlert()
      else if (restAlertsEnabled) void notifyRestComplete()
      setRestEndsAt((current) => current === targetEnd ? null : current)
    }, Math.max(0, restEndsAt - Date.now()))
    return () => window.clearTimeout(timeout)
  }, [draft, restAlertsEnabled, restEndsAt])

  useEffect(() => {
    if (!usesNativeRestNotifications()) return
    void syncNativeRestNotification(draft && restAlertsEnabled ? restEndsAt : null, restAlertsEnabled)
      .catch(() => {
        // OS 알림 예약이 실패해도 운동 기록과 타이머는 계속 동작해야 한다.
      })
  }, [draft, restAlertsEnabled, restEndsAt])

  // 운동 중에는 화면을 켜 둔다. 웹에는 백그라운드 알림을 예약할 방법이 없어,
  // 휴식 알림이 들리려면 화면이 앞에 떠 있어야 한다.
  useEffect(() => {
    if (!hasDraft || !keepScreenAwake) return
    return requestScreenWakeLock()
  }, [hasDraft, keepScreenAwake])

  useEffect(() => {
    if (!draft) {
      // Storage is cleared only by the explicit clearDraft command. A passive
      // null-state effect must not remove a draft another tab may have written
      // after this hook's initial lazy read.
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

  // 시작 화면이 열려 있는 동안 다른 탭이 만든 초안이 생길 수 있다. 시작
  // 버튼에서는 초기 렌더 시점의 snapshot이 아니라 storage의 최신 상태를
  // 하나의 명령으로 복원해, 운동 내용과 실행 메타데이터를 함께 보존한다.
  const restoreStoredDraft = () => {
    const storedDraft = readStoredWorkoutDraft()
    if (!storedDraft) return false
    setDraft(storedDraft.draft)
    setActiveExerciseId(storedDraft.activeExerciseId)
    setRestEndsAt(storedDraft.restEndsAt)
    setPausedAt(storedDraft.pausedAt)
    setClock(Date.now())
    return true
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
    const enabled = usesNativeRestNotifications()
      ? await requestNativeRestNotificationPermission()
      : await requestRestAlerts()
    if (enabled) enableRestAlerts()
    setRestAlertsEnabled(enabled)
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
    restoreStoredDraft,
    clearDraft,
    togglePause,
    startRest,
    adjustRest,
    stopRest,
    toggleRestAlerts,
    getFinalPausedSeconds,
  }
}
