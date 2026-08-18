import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Clock3,
  Dumbbell,
  GripVertical,
  ListOrdered,
  Minus,
  Pause,
  Play,
  Plus,
  Save,
  TimerReset,
  Trash2,
  X,
} from 'lucide-react'
import { formatElapsedTime, getEffectivePausedSeconds } from '../../lib/duration'
import { formatRelativeDay } from '../../lib/relativeDay'
import { useAppServices, useSettings } from '../../services'
import type { Equipment, Exercise, Id, IsoDateTime, Routine, Rir, SetType, WorkoutExercise, WorkoutSetRecord } from '../../types/domain'
import {
  clearStoredWorkoutDraft,
  readStoredWorkoutDraft,
  type StoredWorkoutDraft,
  type WorkoutDraft,
  writeStoredWorkoutDraft,
} from './activeWorkoutDraft'
import { CreateExerciseDialog, ExercisePickerSheet } from './ExercisePicker'
import { muscleLabel } from './exerciseLabels'
import './WorkoutRunner.css'

interface WorkoutRunnerProps {
  onFinish: (sessionId: string) => void
  onCancel: () => void
  onDraftStateChange?: (draft: StoredWorkoutDraft | null) => void
}

interface WorkoutSetupData {
  routines: Routine[]
  exercises: Exercise[]
}

function lastCompletedSetQueryKey(exerciseId: string) { return ['last-completed-set', exerciseId] as const }

const WEIGHT_STEP = 2.5
const REPS_STEP = 1

const rirChoices: Array<{ value: number; label: string }> = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5+' },
]

export function WorkoutRunner({ onFinish, onCancel, onDraftStateChange }: WorkoutRunnerProps) {
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
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isReorderOpen, setIsReorderOpen] = useState(false)
  const [draggingExerciseId, setDraggingExerciseId] = useState<string | null>(null)
  const draggingExerciseIdRef = useRef<string | null>(null)

  const setupQuery = useQuery({
    queryKey: ['workout-runner-setup'],
    queryFn: async (): Promise<WorkoutSetupData> => {
      const [routines, exercises] = await Promise.all([
        workoutRepository.listRoutines(),
        workoutRepository.listExercises(),
      ])
      return { routines, exercises }
    },
  })

  useEffect(() => {
    if (!draft) return
    const interval = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [draft])

  useEffect(() => {
    if (restEndsAt !== null && restEndsAt <= clock) setRestEndsAt(null)
  }, [clock, restEndsAt])

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

  const { routines, exercises } = setupQuery.data
  const { weightUnit, defaultRestSeconds, defaultRir } = settingsQuery.data
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
    setClock(Date.now())
    setRestEndsAt(Date.now() + duration * 1_000)
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
            reps: reference?.reps ?? null,
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

  const addExercise = async (exercise: Exercise) => {
    if (!draft) return
    const exerciseOrder = draft.exercises.length + 1
    let previousSet: WorkoutSetRecord | null = null
    try {
      previousSet = await queryClient.fetchQuery({
        queryKey: lastCompletedSetQueryKey(exercise.id),
        queryFn: () => workoutRepository.getLastCompletedSetForExercise(exercise.id),
      })
    } catch {
      // 지난 기록을 못 불러와도 종목 추가는 막지 않는다. 빈 세트로 추가한다.
      previousSet = null
    }
    const nextExercise = createFreeWorkoutExercise({
      exercise,
      exerciseOrder,
      previousSet,
      defaultRestSeconds,
      defaultRir,
    })
    setDraft((current) => current ? { ...current, exercises: [...current.exercises, nextExercise] } : current)
    setActiveExerciseId(nextExercise.id)
  }

  const selectExerciseFromPicker = (exercise: Exercise) => {
    setIsPickerOpen(false)
    void addExercise(exercise)
  }

  const addCreatedExercise = (exercise: Exercise) => {
    setIsCreateOpen(false)
    setIsPickerOpen(false)
    void addExercise(exercise)
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
    setDraft(session)
    setActiveExerciseId(session.exercises[0]?.id ?? null)
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

  const finishWorkout = () => {
    if (!draft || finishMutation.isPending) return
    if (countCompletedSets(draft) === 0) {
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
    return <RoutinePicker
      routines={routines}
      selectedRoutine={selectedRoutine}
      onSelect={(routineId) => setSelectedRoutineId(routineId)}
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
            <p>{draft.exercises.length}개 종목 · 완료 {countCompletedSets(draft)}세트 · {countCompletedSets(draft)}/{countAllSets(draft)}</p>
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
          <button className="primary-button" type="button" onClick={finishWorkout} disabled={finishMutation.isPending}>
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
          onChangeSet={(setId, changes) => updateSet(exercise.id, setId, changes)}
          onCompleteSet={(set) => toggleSetComplete(exercise.id, set)}
          onAddSet={() => addWorkingSet(exercise.id)}
          onRemove={() => removeExercise(exercise.id)}
        />)}

        {draft.exercises.length > 0 && <div className="exercise-adder-trailing">
          <button className="secondary-button exercise-picker-trigger" type="button" onClick={() => setIsPickerOpen(true)}><Plus size={17} /> 종목 추가</button>
        </div>}
      </div>

      <div className="rest-timer-dock"><RestTimer remaining={remainingRest} isRunning={restIsRunning} onRestart={() => startRest(restartRestSeconds())} onStop={() => setRestEndsAt(null)} compact /></div>
      <ExercisePickerSheet
        isOpen={isPickerOpen}
        exercises={exercises}
        onClose={() => setIsPickerOpen(false)}
        onSelect={selectExerciseFromPicker}
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

function ExerciseCard({ exercise, weightUnit, equipment, onChangeSet, onCompleteSet, onAddSet, onRemove }: {
  exercise: WorkoutExercise
  weightUnit: string
  equipment: Equipment
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

    <div className="set-table" role="region" aria-label={`${exercise.exerciseName} 세트 기록`} tabIndex={0}>
      <div className="set-row set-table-head" aria-hidden="true"><span>세트</span><span>{weightLabel}</span><span>횟수</span><span>목표 RIR</span><span>실제 RIR</span><span /></div>
      {exercise.sets.map((set) => <SetRow
        key={set.id}
        set={set}
        weightUnit={weightUnit}
        weightLabel={weightLabel}
        weightShortLabel={weightShortLabel}
        isBodyweight={isBodyweight}
        onChange={(changes) => onChangeSet(set.id, changes)}
        onComplete={() => onCompleteSet(set)}
      />)}
    </div>
    <button className="add-set-button" type="button" onClick={onAddSet}><Plus size={17} /> 작업 세트 추가</button>
  </section>
}

function RoutinePicker({ routines, selectedRoutine, onSelect, onBegin, onBeginFree, onCancel }: { routines: Routine[]; selectedRoutine: Routine | undefined; onSelect: (id: string) => void; onBegin: () => void; onBeginFree: () => void; onCancel: () => void }) {
  const lastPerformed = useRoutineLastPerformed()

  return <main className="routine-picker-page" aria-labelledby="routine-picker-title">
    <section className="routine-picker-heading"><div><p className="eyebrow">START TRAINING</p><h1 id="routine-picker-title">오늘 어떤 운동을 할까요?</h1><p>루틴의 처방을 따르거나, 자유 운동에서 원하는 종목을 바로 추가해 보세요.</p></div><button className="runner-text-button" type="button" onClick={onCancel}>대시보드로 돌아가기</button></section>
    {routines.length === 0 ? <div className="runner-empty"><Dumbbell size={24} /><h2>아직 저장된 루틴이 없어요.</h2><p>자유 운동은 지금 바로 시작할 수 있고, 필요하면 루틴을 만들어 둘 수도 있어요.</p></div> : <div className="routine-choice-grid">
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

function SetRow({ set, weightUnit, weightLabel, weightShortLabel, isBodyweight, onChange, onComplete }: { set: WorkoutSetRecord; weightUnit: string; weightLabel: string; weightShortLabel: string; isBodyweight: boolean; onChange: (changes: Partial<WorkoutSetRecord>) => void; onComplete: () => void }) {
  return <div className={`set-row ${set.isCompleted ? 'is-completed' : ''}`}>
    <span className="set-number"><small>세트</small>{set.setOrder}<em>{setTypeLabel(set.setType)}</em></span>
    <label>
      <span className="mobile-field-label">{weightLabel}</span>
      <div className="numeric-stepper">
        <button type="button" className="stepper-button" aria-label={`${set.setOrder}세트 ${weightShortLabel} ${WEIGHT_STEP}${weightUnit} 감소`} onClick={() => onChange({ weightKg: decrementValue(set.weightKg, WEIGHT_STEP) })}><Minus size={14} /></button>
        <input aria-label={`${set.setOrder}세트 ${weightLabel}`} inputMode="decimal" type="number" min="0" step="0.5" placeholder={isBodyweight ? '맨몸' : undefined} value={set.weightKg ?? ''} onChange={(event) => onChange({ weightKg: toNullableNumber(event.target.value) })} />
        <button type="button" className="stepper-button" aria-label={`${set.setOrder}세트 ${weightShortLabel} ${WEIGHT_STEP}${weightUnit} 증가`} onClick={() => onChange({ weightKg: incrementValue(set.weightKg, WEIGHT_STEP) })}><Plus size={14} /></button>
      </div>
    </label>
    <label>
      <span className="mobile-field-label">횟수</span>
      <div className="numeric-stepper">
        <button type="button" className="stepper-button" aria-label={`${set.setOrder}세트 횟수 ${REPS_STEP} 감소`} onClick={() => onChange({ reps: decrementValue(set.reps, REPS_STEP) })}><Minus size={14} /></button>
        <input aria-label={`${set.setOrder}세트 횟수`} inputMode="numeric" type="number" min="0" step="1" value={set.reps ?? ''} onChange={(event) => onChange({ reps: toNullableInteger(event.target.value) })} />
        <button type="button" className="stepper-button" aria-label={`${set.setOrder}세트 횟수 ${REPS_STEP} 증가`} onClick={() => onChange({ reps: incrementValue(set.reps, REPS_STEP) })}><Plus size={14} /></button>
      </div>
    </label>
    <span className="target-rir"><small className="mobile-field-label">목표 RIR</small>{formatRir(set.targetRir)}</span>
    <div className="actual-rir"><span className="mobile-field-label">실제 RIR</span><div className="rir-choice-row" role="group" aria-label={`${set.setOrder}세트 실제 RIR`}>
      {rirChoices.map((choice) => <button className={set.actualRir === choice.value ? 'is-selected' : ''} type="button" key={choice.value} onClick={() => onChange({ actualRir: choice.value })}>{choice.label}</button>)}
      <button className={set.actualRir === null ? 'is-selected is-empty' : 'is-empty'} type="button" onClick={() => onChange({ actualRir: null })}>–</button>
    </div></div>
    <button className={`complete-set-button ${set.isCompleted ? 'is-completed' : ''}`} type="button" onClick={onComplete} aria-label={`${set.setOrder}세트 ${set.isCompleted ? '완료 취소' : '완료'}`}>
      {set.isCompleted ? <Check size={17} /> : '완료'}
    </button>
  </div>
}

function RestTimer({ remaining, isRunning, onRestart, onStop, compact = false }: { remaining: number; isRunning: boolean; onRestart: () => void; onStop: () => void; compact?: boolean }) {
  return <article className={`rest-timer ${compact ? 'is-compact' : ''}`}>
    <div className="rest-timer-copy"><span><Clock3 size={16} /> 휴식 타이머</span><strong>{formatTimer(remaining)}</strong></div>
    <div className="rest-timer-actions">
      <button className="timer-control" type="button" onClick={onRestart} aria-label="휴식 타이머 다시 시작"><TimerReset size={16} /></button>
      {isRunning && <button className="timer-stop" type="button" onClick={onStop}>건너뛰기</button>}
    </div>
  </article>
}

function RunnerLoading() { return <main className="workout-page runner-loading" aria-label="운동 데이터를 불러오는 중"><div /><div /><div /></main> }
function RunnerError({ onRetry, onCancel }: { onRetry: () => void; onCancel: () => void }) { return <main className="routine-picker-page runner-error"><Dumbbell size={24} /><h1>운동 데이터를 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p><div><button className="primary-button" type="button" onClick={onRetry}>다시 시도</button><button className="runner-text-button" type="button" onClick={onCancel}>대시보드로 돌아가기</button></div></main> }

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
        reps: prescription.targetRepsMax ?? prescription.targetRepsMin, targetRir: prescription.targetRir, actualRir: null,
        restSeconds: prescription.restSeconds, isCompleted: false, completedAt: null, notes: null,
      })),
    })),
  }
}

function createFreeDraft(): WorkoutDraft {
  return {
    id: createId(), routineId: null, routineName: null, status: 'in_progress', startedAt: new Date().toISOString(), completedAt: null, pausedSeconds: 0, notes: null, exercises: [],
  }
}

function createFreeWorkoutExercise({ exercise, exerciseOrder, previousSet, defaultRestSeconds, defaultRir }: { exercise: Exercise; exerciseOrder: number; previousSet: WorkoutSetRecord | null; defaultRestSeconds: number; defaultRir: Rir }): WorkoutExercise {
  return {
    id: createId(), exerciseId: exercise.id, exerciseName: exercise.name, primaryMuscle: exercise.primaryMuscle, exerciseOrder, notes: null,
    sets: [{
      id: createId(), setOrder: 1, setType: 'working', weightKg: previousSet?.weightKg ?? null, reps: previousSet?.reps ?? null,
      targetRir: defaultRir, actualRir: null, restSeconds: exercise.defaultRestSeconds || defaultRestSeconds, isCompleted: false, completedAt: null, notes: null,
    }],
  }
}

function sortExercises(exercises: WorkoutExercise[]) { return [...exercises].sort((left, right) => left.exerciseOrder - right.exerciseOrder) }
function normalizeExerciseOrder(exercises: WorkoutExercise[]) { return exercises.map((exercise, index) => ({ ...exercise, exerciseOrder: index + 1 })) }
function createId() { return globalThis.crypto?.randomUUID?.() ?? `workout-${Date.now()}-${Math.random().toString(36).slice(2)}` }
function toNullableNumber(value: string) { if (value.trim() === '') return null; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null }
function toNullableInteger(value: string) { const number = toNullableNumber(value); return number === null ? null : Math.floor(number) }
function formatPrevious(set: WorkoutSetRecord | null, weightUnit: string) { return set?.weightKg !== null && set?.weightKg !== undefined && set.reps !== null && set.reps !== undefined ? `${set.weightKg}${weightUnit} × ${set.reps}` : '기록 없음' }
function formatRir(rir: Rir) { if (rir === null) return '–'; return rir >= 5 ? '5+' : String(rir) }
function formatTimer(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
function countCompletedSets(session: WorkoutDraft) { return session.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.isCompleted).length }
function countAllSets(session: WorkoutDraft) { return session.exercises.reduce((count, exercise) => count + exercise.sets.length, 0) }
function countRoutineSets(routine: Routine) { return routine.exercises.reduce((count, exercise) => count + exercise.sets.length, 0) }
// A null field is treated as an empty 0 baseline: incrementing it once lands
// on exactly one step (rather than staying null or producing NaN), and
// decrementing it clamps at the floor like any other value.
function incrementValue(value: number | null, step: number, floor = 0) { return Math.max(floor, (value ?? 0) + step) }
function decrementValue(value: number | null, step: number, floor = 0) { return Math.max(floor, (value ?? 0) - step) }
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
function setTypeLabel(setType: SetType) { return setType === 'warmup' ? '워밍업' : setType === 'dropset' ? '드롭' : '작업' }
