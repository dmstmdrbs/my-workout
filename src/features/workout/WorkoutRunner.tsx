import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Bell,
  BellOff,
  Clock3,
  Dumbbell,
  GripVertical,
  ListOrdered,
  Pause,
  Play,
  Plus,
  Save,
  TimerReset,
  Trash2,
  X,
} from 'lucide-react'
import { Overlay } from '../../components/Overlay'
import { formatElapsedTime, getEffectivePausedSeconds } from '../../lib/duration'
import { completedSetCount, getSessionVolume } from '../../lib/volume'
import { suggestNextLoad } from '../../lib/loadSuggestion'
import { formatRelativeDay } from '../../lib/relativeDay'
import { playRestFinishedAlert, primeRestAlert } from '../../lib/restAlert'
import { requestScreenWakeLock } from '../../lib/wakeLock'
import { getDateInTimeZone } from '../../lib/localDate'
import { disableRestAlerts, notifyRestComplete, readRestAlertsEnabled, requestRestAlerts } from '../../lib/restAlerts'
import { useAppServices, useSettings } from '../../services'
import type { Equipment, Exercise, Id, IsoDateTime, ProgramRun, ProgramRunDay, Routine, Rir, WorkoutExercise, WorkoutSetRecord } from '../../types/domain'
import {
  clearStoredWorkoutDraft,
  readStoredWorkoutDraft,
  type StoredWorkoutDraft,
  type WorkoutDraft,
  writeStoredWorkoutDraft,
} from './activeWorkoutDraft'
import { CreateExerciseDialog, ExercisePickerSheet } from './ExercisePicker'
import { muscleLabel, snapshotExerciseName } from './exerciseLabels'
import { applyInitialWorkingWeights, getInitialWorkingWeightItems, type InitialWorkingWeightItem } from './initialWorkingWeights'
import { SetRow } from './SetRow'
import './WorkoutRunner.css'

interface WorkoutRunnerProps {
  onFinish: (sessionId: string) => void
  onCancel: () => void
  onDraftStateChange?: (draft: StoredWorkoutDraft | null) => void
  initialProgramRunDayId?: string | null
  onSelectProgramDay?: (dayId: string) => void
}

interface WorkoutSetupData {
  routines: Routine[]
  exercises: Exercise[]
  programDay: ProgramRunDay | null
  activeProgramRun: ProgramRun | null
}

function lastCompletedSetQueryKey(exerciseId: string) { return ['last-completed-set', exerciseId] as const }

export function WorkoutRunner({ onFinish, onCancel, onDraftStateChange, initialProgramRunDayId = null, onSelectProgramDay }: WorkoutRunnerProps) {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const settingsQuery = useSettings()
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null)
  const [restoredDraft] = useState<StoredWorkoutDraft | null>(() => readStoredWorkoutDraft())
  const [draft, setDraft] = useState<WorkoutDraft | null>(restoredDraft?.draft ?? null)
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(restoredDraft?.activeExerciseId ?? null)
  const [restEndsAt, setRestEndsAt] = useState<number | null>(restoredDraft?.restEndsAt ?? null)
  const [pausedAt, setPausedAt] = useState<number | null>(restoredDraft?.pausedAt ?? null)
  const [clock, setClock] = useState(Date.now())
  const [restAlertsEnabled, setRestAlertsEnabled] = useState(readRestAlertsEnabled)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isReorderOpen, setIsReorderOpen] = useState(false)
  const [isFinishConfirmOpen, setIsFinishConfirmOpen] = useState(false)
  const [pendingDraft, setPendingDraft] = useState<WorkoutDraft | null>(null)
  const [initialWeightDrafts, setInitialWeightDrafts] = useState<Record<string, string>>({})
  const [draggingExerciseId, setDraggingExerciseId] = useState<string | null>(null)
  const draggingExerciseIdRef = useRef<string | null>(null)

  const setupQuery = useQuery({
    queryKey: ['workout-runner-setup', initialProgramRunDayId],
    queryFn: async (): Promise<WorkoutSetupData> => {
      const [routines, exercises, programDay, activeProgramRun] = await Promise.all([
        workoutRepository.listRoutines(),
        workoutRepository.listExercises(),
        initialProgramRunDayId ? workoutRepository.getProgramRunDay(initialProgramRunDayId) : Promise.resolve(null),
        workoutRepository.getActiveProgramRun(),
      ])
      return { routines, exercises, programDay, activeProgramRun }
    },
  })

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

  // 설정은 이 아래 이른 반환보다 뒤에서 구조 분해되지만, 훅은 반환 위에
  // 있어야 하므로 여기서 값만 꺼내 쓴다.
  const keepScreenAwake = settingsQuery.data?.keepScreenAwake ?? false

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

  const finishMutation = useMutation({
    mutationFn: async (session: WorkoutDraft) => workoutRepository.saveSession({
      ...session,
      status: 'completed',
      completedAt: new Date().toISOString(),
    }),
    onSuccess: (saved) => {
      clearStoredWorkoutDraft()
      setDraft(null)
      setRestEndsAt(null)
      setPausedAt(null)
      void queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['completed-workout-records'] })
      void queryClient.invalidateQueries({ queryKey: ['workout-runner-setup'] })
      void queryClient.invalidateQueries({ queryKey: ['program-runs'] })
      void queryClient.invalidateQueries({ queryKey: ['active-program-run'] })
      // 방금 끝낸 운동이 루틴 선택 화면의 "마지막 수행"에 바로 반영되도록.
      void queryClient.invalidateQueries({ queryKey: routineLastPerformedQueryKey })
      // Prefix match (no `exact: true`) so every exercise id under
      // 'last-completed-set' is covered, not just the one active when this
      // workout finished -- otherwise a workout started within the 30s
      // staleTime still shows the pre-workout "지난 기록" value.
      void queryClient.invalidateQueries({ queryKey: ['last-completed-set'] })
      onFinish(saved.id)
    },
  })

  if (setupQuery.isPending || settingsQuery.isPending) return <RunnerLoading />
  if (setupQuery.isError || !setupQuery.data || settingsQuery.isError || !settingsQuery.data) {
    return <RunnerError onRetry={() => { void setupQuery.refetch(); void settingsQuery.refetch() }} onCancel={onCancel} />
  }

  const { routines, exercises, programDay, activeProgramRun } = setupQuery.data
  const { weightUnit, defaultRestSeconds, defaultRir, rirInputEnabled } = settingsQuery.data
  const selectedRoutine = routines.find((routine) => routine.id === selectedRoutineId) ?? routines[0]
  const remainingRest = restEndsAt === null ? 0 : Math.max(0, Math.ceil((restEndsAt - clock) / 1_000))
  const restIsRunning = remainingRest > 0
  const isPaused = pausedAt !== null
  // 일시정지 중에도 매초 clock은 계속 갱신되지만(휴식 타이머는 계속 흐르기
  // 때문), 지금까지 흐른 일시정지 시간도 함께 늘어나 서로 상쇄되므로 화면에
  // 보이는 경과 시간은 일시정지가 시작된 시점에 멈춰 보인다.
  const effectivePausedSeconds = draft ? getEffectivePausedSeconds(draft.pausedSeconds, pausedAt, clock) : 0
  const elapsedTime = draft ? formatElapsedTime(draft.startedAt, clock, effectivePausedSeconds) : '00:00'
  const restartRestSeconds = () => findMostRecentlyCompletedSet(draft)?.restSeconds ?? defaultRestSeconds

  const togglePause = () => {
    if (!draft) return
    const now = Date.now()
    if (pausedAt === null) {
      setPausedAt(now)
    } else {
      const additionalPausedSeconds = Math.max(0, Math.floor((now - pausedAt) / 1_000))
      setDraft((current) => current ? { ...current, pausedSeconds: current.pausedSeconds + additionalPausedSeconds } : current)
      setPausedAt(null)
    }
  }

  const updateSet = (exerciseId: string, setId: string, changes: Partial<WorkoutSetRecord>) => {
    setDraft((current) => current ? {
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id !== exerciseId ? exercise : {
        ...exercise,
        sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...changes } : set),
      }),
    } : current)
  }

  const startRest = (seconds: number | null) => {
    const duration = seconds ?? defaultRestSeconds
    // 자동재생 정책은 제스처 없이 시작된 소리를 막는다. 휴식이 끝나는 순간은
    // 타이머 콜백이라 제스처가 아니므로, 제스처인 지금 미리 깨워 둔다.
    primeRestAlert()
    setClock(Date.now())
    setRestEndsAt(Date.now() + duration * 1_000)
  }

  const adjustRest = (seconds: number) => {
    const now = Date.now()
    setClock(now)
    setRestEndsAt((current) => {
      const next = Math.max(now, Math.max(current ?? now, now) + seconds * 1_000)
      return next === now ? null : next
    })
  }

  const toggleRestAlerts = async () => {
    if (restAlertsEnabled) {
      disableRestAlerts()
      setRestAlertsEnabled(false)
      return
    }
    setRestAlertsEnabled(await requestRestAlerts())
  }

  const toggleSetComplete = (exerciseId: string, set: WorkoutSetRecord) => {
    const nextCompleted = !set.isCompleted
    updateSet(exerciseId, set.id, { isCompleted: nextCompleted, completedAt: nextCompleted ? new Date().toISOString() : null })
    if (nextCompleted) startRest(set.restSeconds)
  }

  const addWorkingSet = (exerciseId: string) => {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        exercises: current.exercises.map((exercise) => {
          if (exercise.id !== exerciseId) return exercise
          const reference = [...exercise.sets].reverse().find((set) => set.setType === 'working') ?? exercise.sets.at(-1)
          const nextSet: WorkoutSetRecord = {
            id: createId(),
            setOrder: exercise.sets.length + 1,
            setType: 'working',
            weightKg: reference?.weightKg ?? null,
            reps: reference?.reps ?? null, durationSeconds: null, distanceKm: null,
            targetRir: reference?.targetRir ?? null,
            actualRir: null,
            restSeconds: reference?.restSeconds ?? defaultRestSeconds,
            isCompleted: false,
            completedAt: null,
            notes: null,
          }
          return { ...exercise, sets: [...exercise.sets, nextSet] }
        }),
      }
    })
  }

  const addExercises = async (selectedExercises: Exercise[]) => {
    if (!draft || selectedExercises.length === 0) return
    const previousSets = await Promise.all(selectedExercises.map(async (exercise) => {
      try {
        return await queryClient.fetchQuery({
          queryKey: lastCompletedSetQueryKey(exercise.id),
          queryFn: () => workoutRepository.getLastCompletedSetForExercise(exercise.id),
        })
      } catch {
        // 한 종목의 지난 기록 조회가 실패해도 나머지 선택 종목은 모두 추가한다.
        return null
      }
    }))
    const firstExerciseOrder = draft.exercises.length + 1
    const nextExercises = selectedExercises.map((exercise, index) => createFreeWorkoutExercise({
      exercise,
      exerciseOrder: firstExerciseOrder + index,
      previousSet: previousSets[index],
      defaultRestSeconds,
      defaultRir,
    }))
    setDraft((current) => current ? { ...current, exercises: [...current.exercises, ...nextExercises] } : current)
    setActiveExerciseId(nextExercises.at(-1)?.id ?? null)
  }

  const selectExercisesFromPicker = (selectedExercises: Exercise[]) => {
    setIsPickerOpen(false)
    void addExercises(selectedExercises)
  }

  const addCreatedExercise = (exercise: Exercise) => {
    setIsCreateOpen(false)
    setIsPickerOpen(false)
    void addExercises([exercise])
  }

  const startOrConfirmWeights = (session: WorkoutDraft) => {
    const weightItems = getInitialWorkingWeightItems(session.exercises, exercises)
    if (weightItems.length === 0) {
      setDraft(session)
      setActiveExerciseId(session.exercises[0]?.id ?? null)
      return
    }
    setPendingDraft(session)
    setInitialWeightDrafts(Object.fromEntries(weightItems.map((item) => [item.exerciseId, item.suggestedWeightKg === null ? '' : String(item.suggestedWeightKg)])))
  }

  const confirmInitialWeights = () => {
    if (!pendingDraft) return
    const weightItems = getInitialWorkingWeightItems(pendingDraft.exercises, exercises)
    const selectedWeights = Object.fromEntries(weightItems.map((item) => [item.exerciseId, Number(initialWeightDrafts[item.exerciseId])]))
    if (Object.values(selectedWeights).some((weight) => !Number.isFinite(weight) || weight < 0)) return
    const session = { ...pendingDraft, exercises: applyInitialWorkingWeights(pendingDraft.exercises, selectedWeights) }
    setPendingDraft(null)
    setInitialWeightDrafts({})
    setDraft(session)
    setActiveExerciseId(session.exercises[0]?.id ?? null)
  }

  const beginWorkout = () => {
    const storedDraft = readStoredWorkoutDraft()
    if (storedDraft) {
      setDraft(storedDraft.draft)
      setActiveExerciseId(storedDraft.activeExerciseId)
      setRestEndsAt(storedDraft.restEndsAt)
      setPausedAt(storedDraft.pausedAt)
      setClock(Date.now())
      return
    }
    if (!selectedRoutine) return
    const session = createDraft(selectedRoutine, exercises)
    startOrConfirmWeights(session)
  }

  const beginFreeWorkout = () => {
    const storedDraft = readStoredWorkoutDraft()
    if (storedDraft) {
      setDraft(storedDraft.draft)
      setActiveExerciseId(storedDraft.activeExerciseId)
      setRestEndsAt(storedDraft.restEndsAt)
      setPausedAt(storedDraft.pausedAt)
      setClock(Date.now())
      return
    }
    const session = createFreeDraft()
    setDraft(session)
    setActiveExerciseId(null)
  }

  const beginProgramWorkout = () => {
    const storedDraft = readStoredWorkoutDraft()
    if (storedDraft) {
      setDraft(storedDraft.draft)
      setActiveExerciseId(storedDraft.activeExerciseId)
      setRestEndsAt(storedDraft.restEndsAt)
      setPausedAt(storedDraft.pausedAt)
      setClock(Date.now())
      return
    }
    if (!programDay) return
    const session = createProgramDraft(programDay, exercises)
    startOrConfirmWeights(session)
  }

  const finishWorkout = () => {
    if (!draft || finishMutation.isPending) return
    if (completedSetCount(draft) === 0) {
      setIsFinishConfirmOpen(false)
      clearStoredWorkoutDraft()
      setDraft(null)
      setActiveExerciseId(null)
      setRestEndsAt(null)
      setPausedAt(null)
      onCancel()
      return
    }
    // 일시정지 중에 종료하더라도 그 시점까지의 일시정지 시간이 저장 값에
    // 반영되도록, 진행 중인 일시정지를 먼저 누적치에 접어 넣는다.
    const finalPausedSeconds = getEffectivePausedSeconds(draft.pausedSeconds, pausedAt, Date.now())
    finishMutation.mutate({ ...draft, pausedSeconds: finalPausedSeconds })
  }

  const reorderExercises = (sourceExerciseId: string, targetExerciseId: string) => {
    if (sourceExerciseId === targetExerciseId) return
    setDraft((current) => {
      if (!current) return current
      const orderedExercises = sortExercises(current.exercises)
      const sourceIndex = orderedExercises.findIndex((exercise) => exercise.id === sourceExerciseId)
      const targetIndex = orderedExercises.findIndex((exercise) => exercise.id === targetExerciseId)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const nextExercises = [...orderedExercises]
      const [movedExercise] = nextExercises.splice(sourceIndex, 1)
      nextExercises.splice(targetIndex, 0, movedExercise)
      return { ...current, exercises: normalizeExerciseOrder(nextExercises) }
    })
  }

  const moveExercise = (exerciseId: string, direction: -1 | 1) => {
    if (!draft) return
    const orderedExercises = sortExercises(draft.exercises)
    const currentIndex = orderedExercises.findIndex((exercise) => exercise.id === exerciseId)
    const targetExercise = orderedExercises[currentIndex + direction]
    if (targetExercise) reorderExercises(exerciseId, targetExercise.id)
  }

  const removeExercise = (exerciseId: string) => {
    if (!draft) return
    // The stacked layout has no notion of a "selected" exercise, but
    // `activeExerciseId` still round-trips through the persisted draft for
    // backward compatibility (see activeWorkoutDraft.ts). Keep it pointing at
    // an exercise that still exists so a draft saved by this build restores
    // cleanly if an older build ever reads it back.
    if (activeExerciseId === exerciseId) {
      const remainingExercises = draft.exercises.filter((exercise) => exercise.id !== exerciseId)
      setActiveExerciseId(remainingExercises[0]?.id ?? null)
    }
    setDraft((current) => current ? { ...current, exercises: normalizeExerciseOrder(current.exercises.filter((exercise) => exercise.id !== exerciseId)) } : current)
  }

  const beginReorderDrag = (event: ReactPointerEvent<HTMLButtonElement>, exerciseId: string) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingExerciseIdRef.current = exerciseId
    setDraggingExerciseId(exerciseId)
  }

  const endReorderDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const sourceExerciseId = draggingExerciseIdRef.current
    const targetExerciseId = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-reorder-exercise-id]')?.dataset.reorderExerciseId
    if (sourceExerciseId && targetExerciseId) reorderExercises(sourceExerciseId, targetExerciseId)
    draggingExerciseIdRef.current = null
    setDraggingExerciseId(null)
  }

  const cancelReorderDrag = () => {
    draggingExerciseIdRef.current = null
    setDraggingExerciseId(null)
  }

  const cancelWorkout = () => {
    if (!draft) {
      onCancel()
      return
    }
    const shouldCancel = window.confirm('진행 중인 운동을 취소할까요? 임시로 저장된 초안이 삭제되고 완료 기록에는 남지 않습니다.')
    if (!shouldCancel) return
    clearStoredWorkoutDraft()
    setDraft(null)
    setRestEndsAt(null)
    setPausedAt(null)
    onCancel()
  }

  if (!draft) {
    if (pendingDraft) {
      const weightItems = getInitialWorkingWeightItems(pendingDraft.exercises, exercises)
      return <InitialWorkingWeightSetup
        title={pendingDraft.routineName ?? '운동'}
        items={weightItems}
        values={initialWeightDrafts}
        weightUnit={weightUnit}
        onChange={(exerciseId, value) => setInitialWeightDrafts((current) => ({ ...current, [exerciseId]: value }))}
        onConfirm={confirmInitialWeights}
        onCancel={() => { setPendingDraft(null); setInitialWeightDrafts({}) }}
      />
    }
    if (initialProgramRunDayId) {
      if (!programDay) return <ProgramDayUnavailable onCancel={onCancel} />
      const missingExercises = getMissingProgramExercises(programDay, exercises)
      return <ProgramDayStarter
        day={programDay}
        missingExercises={missingExercises}
        onBegin={beginProgramWorkout}
        onCancel={onCancel}
      />
    }
    return <RoutinePicker
      routines={routines}
      activeProgramRun={activeProgramRun}
      timezone={settingsQuery.data.timezone}
      selectedRoutine={selectedRoutine}
      onSelect={(routineId) => setSelectedRoutineId(routineId)}
      onSelectProgramDay={(dayId) => onSelectProgramDay?.(dayId)}
      onBegin={beginWorkout}
      onBeginFree={beginFreeWorkout}
      onCancel={onCancel}
    />
  }

  return (
    <main className="workout-page" aria-labelledby="workout-title">
      <header className="workout-header">
        <div>
          <p className="eyebrow">ACTIVE WORKOUT</p>
          <h1 id="workout-title">{draft.routineName ?? '자유 운동'}</h1>
          <div className="workout-progress-line">
            <p>{draft.exercises.length}개 종목 · 완료 {completedSetCount(draft)}/{countAllSets(draft)}세트 · <strong className="workout-volume">{formatVolume(getSessionVolume(draft))}{weightUnit}</strong></p>
            {draft.exercises.length > 1 && <button className="order-button" type="button" onClick={() => setIsReorderOpen(true)}><ListOrdered size={15} /> 순서 변경</button>}
          </div>
        </div>
        <div className="workout-header-actions">
          <span
            className={`workout-elapsed-time ${isPaused ? 'is-paused' : ''}`}
            aria-label={`운동 시간 ${elapsedTime}${isPaused ? ', 일시정지됨' : ''}`}
          >
            <Clock3 size={16} aria-hidden="true" /> {elapsedTime}
            {isPaused && <span className="workout-paused-badge">일시정지</span>}
          </span>
          <button
            className="pause-toggle-button"
            type="button"
            onClick={togglePause}
            aria-label={isPaused ? '운동 재개' : '운동 일시정지'}
            aria-pressed={isPaused}
          >
            {isPaused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button className="runner-text-button" type="button" onClick={cancelWorkout}><X size={17} /> 나가기</button>
          <button className="primary-button" type="button" onClick={() => setIsFinishConfirmOpen(true)} disabled={finishMutation.isPending}>
            <Save size={17} /> {finishMutation.isPending ? '저장 중…' : '운동 종료'}
          </button>
        </div>
      </header>

      {finishMutation.isError && <p className="runner-save-error" role="alert">운동을 저장하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.</p>}

      <div className="workout-cards">
        {draft.exercises.length === 0 && <section className="exercise-workspace free-workout-empty" aria-labelledby="free-workout-empty-title">
          <Dumbbell size={27} aria-hidden="true" />
          <h2 id="free-workout-empty-title">첫 운동을 추가해 주세요.</h2>
          <p>종목을 고르면 지난 기록과 기본 휴식 시간, 목표 RIR을 불러와 바로 기록할 수 있어요.</p>
          <button className="primary-button exercise-picker-trigger" type="button" onClick={() => setIsPickerOpen(true)}><Plus size={17} /> 종목 추가</button>
        </section>}

        {draft.exercises.map((exercise) => <ExerciseCard
          key={exercise.id}
          exercise={exercise}
          weightUnit={weightUnit}
          equipment={exercises.find((item) => item.id === exercise.exerciseId)?.equipment ?? 'other'}
          rirInputEnabled={rirInputEnabled}
          onChangeSet={(setId, changes) => updateSet(exercise.id, setId, changes)}
          onCompleteSet={(set) => toggleSetComplete(exercise.id, set)}
          onAddSet={() => addWorkingSet(exercise.id)}
          onRemove={() => removeExercise(exercise.id)}
        />)}

        {/* 목록 끝에 있던 인라인 버튼을 대신한다. 둘을 함께 두면 같은 이름의
            버튼이 화면에 두 개가 되므로 하나만 렌더링한다. */}
        {draft.exercises.length > 0 && <button className="exercise-add-fab" type="button" onClick={() => setIsPickerOpen(true)}>
          <Plus size={18} aria-hidden="true" /> 종목 추가
        </button>}
      </div>

      <div className="rest-timer-dock"><RestTimer remaining={remainingRest} isRunning={restIsRunning} alertsEnabled={restAlertsEnabled} onAdjust={adjustRest} onToggleAlerts={() => void toggleRestAlerts()} onRestart={() => startRest(restartRestSeconds())} onStop={() => setRestEndsAt(null)} compact /></div>
      <ExercisePickerSheet
        isOpen={isPickerOpen}
        exercises={exercises}
        onClose={() => setIsPickerOpen(false)}
        selectionMode="multiple"
        onSelectMany={selectExercisesFromPicker}
        onOpenCreate={() => setIsCreateOpen(true)}
      />
      <CreateExerciseDialog
        isOpen={isCreateOpen}
        defaultRestSeconds={defaultRestSeconds}
        onClose={() => setIsCreateOpen(false)}
        onCreated={addCreatedExercise}
      />
      {isReorderOpen && <ExerciseReorderDialog
        exercises={sortExercises(draft.exercises)}
        draggingExerciseId={draggingExerciseId}
        onClose={() => { cancelReorderDrag(); setIsReorderOpen(false) }}
        onMove={moveExercise}
        onPointerDown={beginReorderDrag}
        onPointerUp={endReorderDrag}
        onPointerCancel={cancelReorderDrag}
      />}
      <Overlay
        isOpen={isFinishConfirmOpen}
        onClose={() => { if (!finishMutation.isPending) setIsFinishConfirmOpen(false) }}
        presentation="dialog"
        labelledBy="finish-workout-title"
        describedBy="finish-workout-description"
        className="finish-workout-dialog"
      >
        <p className="eyebrow">FINISH WORKOUT</p>
        <h2 id="finish-workout-title">운동을 종료할까요?</h2>
        <p id="finish-workout-description">{completedSetCount(draft) === 0
          ? '아직 완료한 세트가 없어 운동 기록은 저장되지 않아요.'
          : `완료한 ${completedSetCount(draft)}세트와 총 볼륨 ${formatVolume(getSessionVolume(draft))}${weightUnit}을 저장합니다.`}</p>
        {finishMutation.isError && <p className="finish-workout-error" role="alert">운동을 저장하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.</p>}
        <div className="finish-workout-actions">
          <button className="secondary-button" type="button" onClick={() => setIsFinishConfirmOpen(false)} disabled={finishMutation.isPending}>계속 운동</button>
          <button className="primary-button" type="button" onClick={finishWorkout} disabled={finishMutation.isPending} data-overlay-initial-focus>
            <Save size={16} /> {finishMutation.isPending ? '저장 중…' : completedSetCount(draft) === 0 ? '기록 없이 종료' : '종료하고 저장'}
          </button>
        </div>
      </Overlay>
    </main>
  )
}

function ExerciseReorderDialog({ exercises, draggingExerciseId, onClose, onMove, onPointerDown, onPointerUp, onPointerCancel }: {
  exercises: WorkoutExercise[]
  draggingExerciseId: string | null
  onClose: () => void
  onMove: (exerciseId: string, direction: -1 | 1) => void
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, exerciseId: string) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel: () => void
}) {
  return <div className="exercise-reorder-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="exercise-reorder-dialog" role="dialog" aria-modal="true" aria-labelledby="exercise-reorder-title">
      <header><div><p className="eyebrow">EXERCISE ORDER</p><h2 id="exercise-reorder-title">운동 순서 변경</h2><p>핸들을 길게 눌러 끌어 놓거나, 화살표로 순서를 바꿀 수 있어요.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="순서 변경 닫기"><X size={18} /></button></header>
      <ol className="exercise-reorder-list">
        {exercises.map((exercise, index) => <li data-reorder-exercise-id={exercise.id} className={draggingExerciseId === exercise.id ? 'is-dragging' : ''} key={exercise.id}>
          <span className="exercise-reorder-index">{index + 1}</span>
          <strong>{exercise.exerciseName}</strong>
          <div className="exercise-reorder-actions">
            <button type="button" className="reorder-move-button" disabled={index === 0} onClick={() => onMove(exercise.id, -1)} aria-label={`${exercise.exerciseName} 위로`}>&uarr;</button>
            <button type="button" className="reorder-move-button" disabled={index === exercises.length - 1} onClick={() => onMove(exercise.id, 1)} aria-label={`${exercise.exerciseName} 아래로`}>&darr;</button>
            <button className="reorder-drag-handle" type="button" aria-label={`${exercise.exerciseName} 순서 변경, 끌어 놓기`} onPointerDown={(event) => onPointerDown(event, exercise.id)} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}><GripVertical size={18} /></button>
          </div>
        </li>)}
      </ol>
      <footer><button className="secondary-button" type="button" onClick={onClose}>완료</button></footer>
    </section>
  </div>
}

function ExerciseCard({ exercise, weightUnit, equipment, rirInputEnabled, onChangeSet, onCompleteSet, onAddSet, onRemove }: {
  exercise: WorkoutExercise
  weightUnit: string
  equipment: Equipment
  rirInputEnabled: boolean
  onChangeSet: (setId: string, changes: Partial<WorkoutSetRecord>) => void
  onCompleteSet: (set: WorkoutSetRecord) => void
  onAddSet: () => void
  onRemove: () => void
}) {
  const { workoutRepository } = useAppServices()
  const lastCompletedSetQuery = useQuery({
    queryKey: lastCompletedSetQueryKey(exercise.exerciseId),
    queryFn: () => workoutRepository.getLastCompletedSetForExercise(exercise.exerciseId),
  })
  const previousSet = lastCompletedSetQuery.data ?? null
  const titleId = `exercise-title-${exercise.id}`
  const isBodyweight = equipment === 'bodyweight'
  // 유산소는 중량 × 횟수로 적을 수 없다. 같은 자리에 시간과 거리를 받는다.
  const isCardio = equipment === 'cardio'
  const weightShortLabel = isBodyweight ? '추가 중량' : '중량'
  const weightLabel = `${weightShortLabel} (${weightUnit})`

  return <section className="exercise-workspace" aria-labelledby={titleId}>
    <div className="exercise-workspace-heading">
      <div>
        <p className="eyebrow">{muscleLabel(exercise.primaryMuscle)}</p>
        <h2 id={titleId}>{exercise.exerciseName}</h2>
        {exercise.notes && <p className="exercise-note">{exercise.notes}</p>}
      </div>
      <div className="exercise-workspace-actions"><div className="previous-context"><span>지난 기록</span><strong>{formatPrevious(previousSet, weightUnit)}</strong></div><button className="exercise-remove-button" type="button" onClick={onRemove}><Trash2 size={15} /> 종목 삭제</button></div>
    </div>

    {rirInputEnabled && <LoadSuggestionBanner
      previousSet={previousSet}
      weightUnit={weightUnit}
      onApply={(weightKg) => {
        const target = exercise.sets.find((set) => !set.isCompleted)
        if (target) onChangeSet(target.id, { weightKg })
      }}
    />}

    <div className="set-table" role="region" aria-label={`${exercise.exerciseName} 세트 기록`} tabIndex={0}>
      <div className={`set-row set-table-head ${rirInputEnabled ? '' : 'is-rir-hidden'}`} aria-hidden="true"><span>세트</span><span>{isCardio ? '시간 (분)' : weightLabel}</span><span>{isCardio ? '거리 (km)' : '횟수'}</span><span>목표 RIR</span>{rirInputEnabled && <span>실제 RIR</span>}<span /></div>
      {exercise.sets.map((set) => <SetRow
        key={set.id}
        set={set}
        weightUnit={weightUnit}
        weightLabel={weightLabel}
        weightShortLabel={weightShortLabel}
        isBodyweight={isBodyweight}
        isCardio={isCardio}
        rirInputEnabled={rirInputEnabled}
        onChange={(changes) => onChangeSet(set.id, changes)}
        onComplete={() => onCompleteSet(set)}
      />)}
    </div>
    <button className="add-set-button" type="button" onClick={onAddSet}><Plus size={17} /> 본세트 추가</button>
  </section>
}

/**
 * 지난 세트의 목표 RIR과 실제 RIR 차이로 다음 중량을 제안한다. 목표와 실제를
 * 둘 다 기록하는 이 앱만 할 수 있는 계산이라, 기록해 둔 값이 실제로 쓰이는
 * 유일한 자리이기도 하다.
 */
function LoadSuggestionBanner({ previousSet, weightUnit, onApply }: { previousSet: WorkoutSetRecord | null; weightUnit: string; onApply: (weightKg: number) => void }) {
  const suggestion = suggestNextLoad(previousSet)
  if (!suggestion) return null

  const { weightKg, deltaKg, reason, previousWeightKg, targetRir, actualRir } = suggestion
  const verdict = reason === 'harder'
    ? '계획보다 힘들었어요'
    : reason === 'easier'
      ? '계획보다 여유 있었어요'
      : '계획대로였어요'
  const advice = deltaKg === 0
    ? `${formatSuggestionWeight(weightKg)}${weightUnit} 그대로 가보세요`
    : `${formatSuggestionWeight(weightKg)}${weightUnit}로 ${deltaKg > 0 ? '올려' : '낮춰'} 보세요`

  return (
    <div className={`load-suggestion tone-${reason}`} role="note">
      <div className="load-suggestion-copy">
        <strong>{verdict}</strong>
        <small>지난 세트 {formatSuggestionWeight(previousWeightKg)}{weightUnit} · 목표 RIR {targetRir} → 실제 {actualRir}</small>
      </div>
      <button type="button" className="load-suggestion-apply" onClick={() => onApply(weightKg)}>
        {advice}
      </button>
    </div>
  )
}

function formatSuggestionWeight(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(1) }

function RoutinePicker({ routines, activeProgramRun, timezone, selectedRoutine, onSelect, onSelectProgramDay, onBegin, onBeginFree, onCancel }: { routines: Routine[]; activeProgramRun: ProgramRun | null; timezone: string; selectedRoutine: Routine | undefined; onSelect: (id: string) => void; onSelectProgramDay: (dayId: string) => void; onBegin: () => void; onBeginFree: () => void; onCancel: () => void }) {
  const lastPerformed = useRoutineLastPerformed()
  const today = getDateInTimeZone(timezone)
  const programDay = activeProgramRun?.days.find((day) => day.scheduledOn === today)
    ?? (activeProgramRun && today < activeProgramRun.startDate ? activeProgramRun.days[0] : null)

  return <main className="routine-picker-page" aria-labelledby="routine-picker-title">
    <section className="routine-picker-heading"><div><p className="eyebrow">START TRAINING</p><h1 id="routine-picker-title">오늘 어떤 운동을 할까요?</h1><p>루틴의 처방을 따르거나, 자유 운동에서 원하는 종목을 바로 추가해 보세요.</p></div><button className="runner-text-button" type="button" onClick={onCancel}>대시보드로 돌아가기</button></section>
    {routines.length === 0 && !programDay ? <div className="runner-empty"><Dumbbell size={24} /><h2>아직 저장된 루틴이 없어요.</h2><p>자유 운동은 지금 바로 시작할 수 있고, 프로그램이나 개인 루틴을 가져올 수도 있어요.</p></div> : <div className="routine-choice-grid">
      {programDay && <ProgramRoutineChoiceCard run={activeProgramRun!} day={programDay} today={today} onStart={() => onSelectProgramDay(programDay.id)} />}
      {routines.map((routine) => <RoutineChoiceCard
        key={routine.id}
        routine={routine}
        isSelected={selectedRoutine?.id === routine.id}
        lastPerformedAt={lastPerformed.get(routine.id) ?? null}
        onSelect={() => onSelect(routine.id)}
      />)}
    </div>}
    <div className="begin-workout-actions">
      <button className="primary-button begin-workout-button" type="button" disabled={!selectedRoutine} onClick={onBegin}><Play size={17} fill="currentColor" /> {selectedRoutine?.name ?? '루틴'} 시작</button>
      <button className="secondary-button begin-workout-button" type="button" onClick={onBeginFree}><Dumbbell size={17} /> 자유 운동으로 시작</button>
    </div>
  </main>
}

function ProgramRoutineChoiceCard({ run, day, today, onStart }: { run: ProgramRun; day: ProgramRunDay; today: string; onStart: () => void }) {
  const isToday = day.scheduledOn === today
  const canStart = day.dayType !== 'rest'
  const exercises = day.routineSnapshot?.exercises ?? []
  const preview = exercises.slice(0, ROUTINE_PREVIEW_EXERCISES).map((item) => item.exerciseName).join(' · ')
  const status = day.workoutSession ? '수행 완료 · 다시 가능' : day.dayType === 'rest' ? '휴식일' : isToday ? '오늘 수행 예정' : `${formatProgramPickerDate(day.scheduledOn)} 예정`
  return <button className="routine-choice program-routine-choice" type="button" onClick={onStart} disabled={!canStart}>
    <span className="routine-choice-marker" />
    <span className="routine-choice-copy">
      <span className="program-routine-label">PROGRAM DAY {day.dayNumber}</span>
      <strong>{day.title}</strong>
      <small>{preview || day.instructions}</small>
      <em>{run.programName} · {status}</em>
    </span>
    {canStart && <span className="program-routine-start"><Play size={14} fill="currentColor" /> 시작</span>}
  </button>
}

const routineLastPerformedQueryKey = ['routine-last-performed'] as const

/** 카드가 미리 보여주는 종목 수. 넘치면 "외 N개"로 접는다. */
const ROUTINE_PREVIEW_EXERCISES = 3

/**
 * 마지막 수행일을 채우기 위해 훑는 완료 세션 수. 전부 조회하면 이 화면
 * 하나 때문에 전 기간 세션·세트를 받게 되므로 최근 것만 본다. 이 범위 밖의
 * 루틴은 날짜를 표시하지 않을 뿐이며(없다고 단정하지 않는다), 조회가 실패해도
 * 카드는 나머지 정보로 그대로 그려진다.
 */
const LAST_PERFORMED_SESSION_SCAN = 40

function useRoutineLastPerformed(): Map<Id, IsoDateTime> {
  const { workoutRepository } = useAppServices()
  const query = useQuery({
    queryKey: routineLastPerformedQueryKey,
    queryFn: () => workoutRepository.listSessions({ status: 'completed', limit: LAST_PERFORMED_SESSION_SCAN }),
  })

  return useMemo(() => {
    const latest = new Map<Id, IsoDateTime>()
    for (const session of query.data ?? []) {
      if (!session.routineId) continue
      const seen = latest.get(session.routineId)
      // listSessions는 최신순이지만, 어댑터가 바뀌어도 옳도록 실제 시각을 비교한다.
      if (!seen || new Date(session.startedAt).getTime() > new Date(seen).getTime()) {
        latest.set(session.routineId, session.startedAt)
      }
    }
    return latest
  }, [query.data])
}

function RoutineChoiceCard({ routine, isSelected, lastPerformedAt, onSelect }: { routine: Routine; isSelected: boolean; lastPerformedAt: IsoDateTime | null; onSelect: () => void }) {
  const preview = routine.exercises.slice(0, ROUTINE_PREVIEW_EXERCISES).map((exercise) => exercise.exerciseName).join(' · ')
  const remaining = routine.exercises.length - ROUTINE_PREVIEW_EXERCISES

  return <button className={`routine-choice ${isSelected ? 'is-selected' : ''}`} type="button" onClick={onSelect}>
    <span className="routine-choice-marker" style={{ background: routine.color ?? 'var(--accent)' }} />
    <span className="routine-choice-copy">
      <strong>{routine.name}</strong>
      <small>{preview ? `${preview}${remaining > 0 ? ` 외 ${remaining}개` : ''}` : routine.description ?? '나만의 운동 구성'}</small>
      <em>{routine.exercises.length}개 종목 · {countRoutineSets(routine)}세트</em>
      {lastPerformedAt && <span className="routine-choice-last">마지막 수행 {formatRelativeDay(lastPerformedAt, new Date())}</span>}
    </span>
    {isSelected && <span className="choice-check"><Check size={16} /></span>}
  </button>
}

function RestTimer({ remaining, isRunning, alertsEnabled, onAdjust, onToggleAlerts, onRestart, onStop, compact = false }: { remaining: number; isRunning: boolean; alertsEnabled: boolean; onAdjust: (seconds: number) => void; onToggleAlerts: () => void; onRestart: () => void; onStop: () => void; compact?: boolean }) {
  return <article className={`rest-timer ${compact ? 'is-compact' : ''}`} aria-label="휴식 타이머">
    <div className="rest-timer-copy"><span><Clock3 size={16} /> 휴식 타이머</span><strong>{formatTimer(remaining)}</strong></div>
    <div className="rest-timer-actions">
      <button className="timer-adjust" type="button" onClick={() => onAdjust(-10)} aria-label="휴식 시간 10초 줄이기">-10</button>
      <button className="timer-adjust" type="button" onClick={() => onAdjust(10)} aria-label="휴식 시간 10초 늘리기">+10</button>
      <button className={`timer-control ${alertsEnabled ? 'is-enabled' : ''}`} type="button" onClick={onToggleAlerts} aria-label={alertsEnabled ? '휴식 종료 알림 끄기' : '휴식 종료 알림 켜기'} aria-pressed={alertsEnabled}>{alertsEnabled ? <Bell size={16} /> : <BellOff size={16} />}</button>
      <button className="timer-control" type="button" onClick={onRestart} aria-label="휴식 타이머 다시 시작"><TimerReset size={16} /></button>
      {isRunning && <button className="timer-stop" type="button" onClick={onStop}>건너뛰기</button>}
    </div>
  </article>
}

function RunnerLoading() { return <main className="workout-page runner-loading" aria-label="운동 데이터를 불러오는 중"><div /><div /><div /></main> }
function RunnerError({ onRetry, onCancel }: { onRetry: () => void; onCancel: () => void }) { return <main className="routine-picker-page runner-error"><Dumbbell size={24} /><h1>운동 데이터를 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p><div><button className="primary-button" type="button" onClick={onRetry}>다시 시도</button><button className="runner-text-button" type="button" onClick={onCancel}>대시보드로 돌아가기</button></div></main> }

function ProgramDayUnavailable({ onCancel }: { onCancel: () => void }) {
  return <main className="routine-picker-page runner-error"><Dumbbell size={24} /><h1>시작할 수 없는 프로그램 Day예요.</h1><p>종료된 회차이거나 존재하지 않는 일정입니다.</p><div><button className="primary-button" type="button" onClick={onCancel}>프로그램으로 돌아가기</button></div></main>
}

function InitialWorkingWeightSetup({ title, items, values, weightUnit, onChange, onConfirm, onCancel }: {
  title: string
  items: InitialWorkingWeightItem[]
  values: Record<string, string>
  weightUnit: string
  onChange: (exerciseId: string, value: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const isComplete = items.every((item) => {
    const value = values[item.exerciseId]?.trim() ?? ''
    return value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
  })

  return <main className="routine-picker-page initial-weight-page" aria-labelledby="initial-weight-title">
    <section className="routine-picker-heading"><div><p className="eyebrow">BEFORE TRAINING</p><h1 id="initial-weight-title">초기 작업 중량 확인</h1><p>{title}의 시작 중량을 확인해 주세요. 운동 중에도 세트별로 바꿀 수 있어요.</p></div><button className="runner-text-button" type="button" onClick={onCancel}>이전으로</button></section>
    <form className="initial-weight-card" onSubmit={(event) => { event.preventDefault(); onConfirm() }}>
      <div className="initial-weight-intro"><Dumbbell size={21} aria-hidden="true" /><div><strong>종목별 첫 작업 중량</strong><span>처방 또는 1RM 계산값이 있으면 제안값으로 채웠어요.</span></div></div>
      <div className="initial-weight-fields">
        {items.map((item, index) => <label key={item.exerciseId}>
          <span><strong>{item.exerciseName}</strong><small>{item.suggestedWeightKg === null ? '직접 입력' : `제안 ${formatSuggestionWeight(item.suggestedWeightKg)}${weightUnit}`}</small></span>
          <span className="initial-weight-input"><input
            data-overlay-initial-focus={index === 0 || undefined}
            aria-label={`${item.exerciseName} 초기 작업 중량`}
            type="number"
            inputMode="decimal"
            min="0"
            max="1000"
            step="0.5"
            placeholder="0"
            required
            value={values[item.exerciseId] ?? ''}
            onChange={(event) => onChange(item.exerciseId, event.target.value)}
          /><small>{weightUnit}</small></span>
        </label>)}
      </div>
      <p className="initial-weight-help">세트별 처방 중량 차이는 유지하고, 비어 있던 세트에는 입력한 중량을 넣습니다. 맨몸·유산소 종목은 이 단계에서 제외됩니다.</p>
      <div className="initial-weight-actions"><button className="secondary-button" type="button" onClick={onCancel}>취소</button><button className="primary-button" type="submit" disabled={!isComplete}><Play size={17} fill="currentColor" /> 이 중량으로 시작</button></div>
    </form>
  </main>
}

function ProgramDayStarter({ day, missingExercises, onBegin, onCancel }: { day: ProgramRunDay; missingExercises: string[]; onBegin: () => void; onCancel: () => void }) {
  const target = day.cardioTarget
  const summary = day.dayType === 'cardio' && target
    ? [target.distanceKm !== null ? `${target.distanceKm}km` : null, target.durationMinutes !== null ? `${target.durationMinutes}분` : null, target.rpeMin !== null ? `RPE ${target.rpeMin}-${target.rpeMax ?? target.rpeMin}` : null].filter(Boolean).join(' · ')
    : day.routineSnapshot ? `${day.routineSnapshot.exercises.length}개 종목 · ${day.routineSnapshot.exercises.reduce((total, item) => total + item.sets.length, 0)}세트` : '휴식일'
  const disabled = day.dayType === 'rest' || missingExercises.length > 0
  const buttonLabel = day.workoutSession ? '다시 운동하기' : day.dayType === 'rest' ? '휴식일' : '운동 시작'

  return <main className="routine-picker-page program-day-starter" aria-labelledby="program-workout-title">
    <section className="routine-picker-heading"><div><p className="eyebrow">PROGRAM DAY {day.dayNumber}</p><h1 id="program-workout-title">{day.title}</h1><p>{formatProgramDate(day.scheduledOn)} · {summary}</p></div><button className="runner-text-button" type="button" onClick={onCancel}>프로그램으로 돌아가기</button></section>
    <article className="program-workout-preview">
      <div><span>WEEK {day.weekNumber}</span><strong>Day {day.dayNumber}</strong></div>
      <p>{day.instructions}</p>
      {day.routineSnapshot && <ol>{day.routineSnapshot.exercises.map((item) => <li key={`${item.exerciseOrder}-${item.exerciseName}`}><strong>{item.exerciseName}</strong><span>{item.sets.length}세트 · {formatProgramSetTarget(item.sets[0])}</span></li>)}</ol>}
      {missingExercises.length > 0 && <p className="runner-inline-error">운동 목록에서 찾지 못한 종목: {missingExercises.join(', ')}</p>}
      <button className="primary-button begin-workout-button" type="button" onClick={onBegin} disabled={disabled}><Play size={17} fill="currentColor" /> {buttonLabel}</button>
    </article>
  </main>
}

function createDraft(routine: Routine, exercises: Exercise[]): WorkoutDraft {
  const startedAt = new Date().toISOString()
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  return {
    id: createId(), routineId: routine.id, routineName: routine.name, status: 'in_progress', startedAt, completedAt: null, pausedSeconds: 0, notes: null,
    exercises: [...routine.exercises].sort((a, b) => a.exerciseOrder - b.exerciseOrder).map((routineExercise): WorkoutExercise => ({
      id: createId(), exerciseId: routineExercise.exerciseId, exerciseName: routineExercise.exerciseName,
      primaryMuscle: exerciseById.get(routineExercise.exerciseId)?.primaryMuscle ?? 'full_body', exerciseOrder: routineExercise.exerciseOrder, notes: routineExercise.notes,
      sets: [...routineExercise.sets].sort((a, b) => a.setOrder - b.setOrder).map((prescription): WorkoutSetRecord => ({
        id: createId(), setOrder: prescription.setOrder, setType: prescription.setType, weightKg: prescription.targetWeightKg,
        reps: prescription.targetRepsMax ?? prescription.targetRepsMin,
        // 유산소 처방은 시간·거리로 들어온다. 처방이 없으면 null 그대로 두고
        // 사용자가 채운다.
        durationSeconds: prescription.targetDurationSeconds, distanceKm: prescription.targetDistanceKm,
        targetRir: prescription.targetRir, actualRir: null,
        restSeconds: prescription.restSeconds, isCompleted: false, completedAt: null, notes: null,
      })),
    })),
  }
}

function createProgramDraft(day: ProgramRunDay, exercises: Exercise[]): WorkoutDraft {
  const exerciseByName = new Map(exercises.map((exercise) => [exercise.name, exercise]))
  const startedAt = new Date().toISOString()

  if (day.dayType === 'cardio' && day.cardioTarget) {
    const target = day.cardioTarget
    const exercise = exerciseByName.get(target.exerciseName)
    if (!exercise) throw new Error(`${target.exerciseName} 종목을 찾지 못했어요.`)
    return {
      id: createId(), routineId: null, routineName: `Day ${day.dayNumber} · ${day.title}`, programRunDayId: day.id,
      status: 'in_progress', startedAt, completedAt: null, pausedSeconds: 0, notes: day.instructions,
      exercises: [{
        id: createId(), exerciseId: exercise.id, exerciseName: exercise.name, primaryMuscle: exercise.primaryMuscle, exerciseOrder: 1,
        notes: target.rpeMin === null ? day.instructions : `목표 RPE ${target.rpeMin}-${target.rpeMax ?? target.rpeMin}`,
        sets: [{
          id: createId(), setOrder: 1, setType: 'working', weightKg: null, reps: null,
          durationSeconds: target.durationMinutes === null ? null : target.durationMinutes * 60,
          distanceKm: target.distanceKm, targetRir: null, actualRir: null, restSeconds: null,
          isCompleted: false, completedAt: null, notes: null,
        }],
      }],
    }
  }

  if (!day.routineSnapshot) throw new Error('이 Day에는 운동 처방이 없어요.')
  return {
    id: createId(), routineId: null, routineName: `Day ${day.dayNumber} · ${day.title}`, programRunDayId: day.id,
    status: 'in_progress', startedAt, completedAt: null, pausedSeconds: 0, notes: day.instructions,
    exercises: day.routineSnapshot.exercises.map((prescription): WorkoutExercise => {
      const exercise = exerciseByName.get(prescription.exerciseName)
      if (!exercise) throw new Error(`${prescription.exerciseName} 종목을 찾지 못했어요.`)
      return {
        id: createId(), exerciseId: exercise.id, exerciseName: exercise.name, primaryMuscle: exercise.primaryMuscle,
        exerciseOrder: prescription.exerciseOrder, notes: prescription.notes,
        sets: prescription.sets.map((set): WorkoutSetRecord => ({
          id: createId(), setOrder: set.setOrder, setType: set.setType, weightKg: set.targetWeightKg,
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

function createFreeDraft(): WorkoutDraft {
  return {
    id: createId(), routineId: null, routineName: null, status: 'in_progress', startedAt: new Date().toISOString(), completedAt: null, pausedSeconds: 0, notes: null, exercises: [],
  }
}

function createFreeWorkoutExercise({ exercise, exerciseOrder, previousSet, defaultRestSeconds, defaultRir }: { exercise: Exercise; exerciseOrder: number; previousSet: WorkoutSetRecord | null; defaultRestSeconds: number; defaultRir: Rir }): WorkoutExercise {
  return {
    id: createId(), exerciseId: exercise.id, exerciseName: snapshotExerciseName(exercise), primaryMuscle: exercise.primaryMuscle, exerciseOrder, notes: null,
    sets: [{
      id: createId(), setOrder: 1, setType: 'working', weightKg: previousSet?.weightKg ?? null, reps: previousSet?.reps ?? null, durationSeconds: null, distanceKm: null,
      targetRir: defaultRir, actualRir: null, restSeconds: exercise.defaultRestSeconds || defaultRestSeconds, isCompleted: false, completedAt: null, notes: null,
    }],
  }
}

function sortExercises(exercises: WorkoutExercise[]) { return [...exercises].sort((left, right) => left.exerciseOrder - right.exerciseOrder) }
function normalizeExerciseOrder(exercises: WorkoutExercise[]) { return exercises.map((exercise, index) => ({ ...exercise, exerciseOrder: index + 1 })) }
function createId() { return globalThis.crypto?.randomUUID?.() ?? `workout-${Date.now()}-${Math.random().toString(36).slice(2)}` }
function formatPrevious(set: WorkoutSetRecord | null, weightUnit: string) {
  if (!set) return '기록 없음'
  if (set.durationSeconds !== null || set.distanceKm !== null) {
    const parts = []
    if (set.durationSeconds !== null) parts.push(`${Math.round(set.durationSeconds / 60)}분`)
    if (set.distanceKm !== null) parts.push(`${set.distanceKm}km`)
    return parts.join(' · ')
  }
  return set.weightKg !== null && set.reps !== null ? `${set.weightKg}${weightUnit} × ${set.reps}` : '기록 없음'
}
function formatTimer(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
/** 볼륨은 kg 소수점을 보여줄 만큼 정밀하지 않아 정수로 끊고 천 단위만 구분한다. */
function formatVolume(volume: number) { return Math.round(volume).toLocaleString('ko-KR') }
function countAllSets(session: WorkoutDraft) { return session.exercises.reduce((count, exercise) => count + exercise.sets.length, 0) }
function countRoutineSets(routine: Routine) { return routine.exercises.reduce((count, exercise) => count + exercise.sets.length, 0) }
function findMostRecentlyCompletedSet(draft: WorkoutDraft | null): WorkoutSetRecord | null {
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
function getMissingProgramExercises(day: ProgramRunDay, exercises: Exercise[]) {
  const available = new Set(exercises.map((exercise) => exercise.name))
  const names = day.dayType === 'cardio' && day.cardioTarget
    ? [day.cardioTarget.exerciseName]
    : day.routineSnapshot?.exercises.map((exercise) => exercise.exerciseName) ?? []
  return names.filter((name) => !available.has(name))
}
function formatProgramDate(value: string) { return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T12:00:00`)) }
function formatProgramPickerDate(value: string) { return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T12:00:00`)) }
function formatProgramSetTarget(set: { targetWeightKg: number | null; targetRepsMin: number | null; targetRepsMax: number | null; targetRir: Rir; notes?: string | null }) {
  if (set.targetRepsMin === null && set.targetRepsMax === null) return set.notes ?? '시간·거리 기록'
  const weight = set.targetWeightKg === null ? '' : `${set.targetWeightKg}kg · `
  const reps = set.targetRepsMin === set.targetRepsMax ? `${set.targetRepsMin ?? '-'}회` : `${set.targetRepsMin ?? '-'}-${set.targetRepsMax ?? '-'}회`
  return `${weight}${reps} · RIR ${set.targetRir ?? '-'}`
}
