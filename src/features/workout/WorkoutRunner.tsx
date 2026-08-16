import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronRight,
  Clock3,
  Dumbbell,
  GripVertical,
  ListOrdered,
  Play,
  Plus,
  Save,
  TimerReset,
  Trash2,
  X,
} from 'lucide-react'
import { useAppServices, useSettings } from '../../services'
import type { Exercise, Routine, Rir, SetType, WorkoutExercise, WorkoutSetRecord } from '../../types/domain'
import {
  clearStoredWorkoutDraft,
  formatElapsedTime,
  readStoredWorkoutDraft,
  type StoredWorkoutDraft,
  type WorkoutDraft,
  writeStoredWorkoutDraft,
} from './activeWorkoutDraft'
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
  const [clock, setClock] = useState(Date.now())
  const [exerciseToAddId, setExerciseToAddId] = useState<string>('')
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
    const storedDraft = { draft, activeExerciseId, restEndsAt }
    writeStoredWorkoutDraft(storedDraft)
    onDraftStateChange?.(storedDraft)
  }, [activeExerciseId, draft, onDraftStateChange, restEndsAt])

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
      void queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['completed-workout-records'] })
      void queryClient.invalidateQueries({ queryKey: ['workout-runner-setup'] })
      // Prefix match (no `exact: true`) so every exercise id under
      // 'last-completed-set' is covered, not just the one active when this
      // workout finished -- otherwise a workout started within the 30s
      // staleTime still shows the pre-workout "지난 기록" value.
      void queryClient.invalidateQueries({ queryKey: ['last-completed-set'] })
      onFinish(saved.id)
    },
  })

  const activeExercise = draft?.exercises.find((exercise) => exercise.id === activeExerciseId) ?? draft?.exercises[0] ?? null

  const lastCompletedSetQuery = useQuery({
    queryKey: activeExercise ? lastCompletedSetQueryKey(activeExercise.exerciseId) : lastCompletedSetQueryKey('none'),
    queryFn: () => workoutRepository.getLastCompletedSetForExercise(activeExercise!.exerciseId),
    enabled: activeExercise !== null,
  })

  if (setupQuery.isPending || settingsQuery.isPending) return <RunnerLoading />
  if (setupQuery.isError || !setupQuery.data || settingsQuery.isError || !settingsQuery.data) {
    return <RunnerError onRetry={() => { void setupQuery.refetch(); void settingsQuery.refetch() }} onCancel={onCancel} />
  }

  const { routines, exercises } = setupQuery.data
  const { weightUnit, defaultRestSeconds, defaultRir } = settingsQuery.data
  const selectedRoutine = routines.find((routine) => routine.id === selectedRoutineId) ?? routines[0]
  const activeIndex = activeExercise ? draft?.exercises.findIndex((exercise) => exercise.id === activeExercise.id) ?? 0 : 0
  const previousSet = activeExercise ? lastCompletedSetQuery.data ?? null : null
  const remainingRest = restEndsAt === null ? 0 : Math.max(0, Math.ceil((restEndsAt - clock) / 1_000))
  const restIsRunning = remainingRest > 0
  const elapsedTime = draft ? formatElapsedTime(draft.startedAt, clock) : '00:00'

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

  const addExercise = async () => {
    if (!draft || !exerciseToAddId) return
    const exercise = exercises.find((item) => item.id === exerciseToAddId)
    if (!exercise) return
    const exerciseOrder = draft.exercises.length + 1
    setExerciseToAddId('')
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

  const beginWorkout = () => {
    const storedDraft = readStoredWorkoutDraft()
    if (storedDraft) {
      setDraft(storedDraft.draft)
      setActiveExerciseId(storedDraft.activeExerciseId)
      setRestEndsAt(storedDraft.restEndsAt)
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
      onCancel()
      return
    }
    finishMutation.mutate(draft)
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
    const orderedExercises = sortExercises(draft.exercises)
    const removedIndex = orderedExercises.findIndex((exercise) => exercise.id === exerciseId)
    if (removedIndex < 0) return
    const remainingExercises = orderedExercises.filter((exercise) => exercise.id !== exerciseId)
    if (activeExerciseId === exerciseId) {
      setActiveExerciseId(remainingExercises[removedIndex]?.id ?? remainingExercises[removedIndex - 1]?.id ?? null)
      setRestEndsAt(null)
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
          <p>{draft.exercises.length}개 종목 · 완료한 세트 {countCompletedSets(draft)}개</p>
        </div>
        <div className="workout-header-actions">
          <span className="workout-elapsed-time" aria-label={`운동 시간 ${elapsedTime}`}><Clock3 size={16} aria-hidden="true" /> {elapsedTime}</span>
          <button className="runner-text-button" type="button" onClick={cancelWorkout}><X size={17} /> 나가기</button>
          <button className="primary-button" type="button" onClick={finishWorkout} disabled={finishMutation.isPending}>
            <Save size={17} /> {finishMutation.isPending ? '저장 중…' : '운동 종료'}
          </button>
        </div>
      </header>

      {finishMutation.isError && <p className="runner-save-error" role="alert">운동을 저장하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.</p>}

      <div className="workout-layout">
        <aside className="exercise-rail" aria-label="운동 종목">
          <div className="rail-heading"><span>운동 순서</span><div><strong>{draft.exercises.length ? `${activeIndex + 1} / ${draft.exercises.length}` : '0 / 0'}</strong>{draft.exercises.length > 1 && <button className="rail-order-button" type="button" onClick={() => setIsReorderOpen(true)}><ListOrdered size={15} /> 순서 변경</button>}</div></div>
          <div className="exercise-nav-list">
            {draft.exercises.map((exercise, index) => {
              const completeCount = exercise.sets.filter((set) => set.isCompleted).length
              return <button className={`exercise-nav-item ${activeExercise?.id === exercise.id ? 'is-active' : ''}`} onClick={() => setActiveExerciseId(exercise.id)} type="button" key={exercise.id}>
                <span className="exercise-index">{String(index + 1).padStart(2, '0')}</span>
                <span><strong>{exercise.exerciseName}</strong><small>{completeCount}/{exercise.sets.length} 세트 완료</small></span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            })}
          </div>
          {activeExercise && <ExerciseAdder
            exercises={exercises}
            selectedExerciseId={exerciseToAddId}
            onSelectionChange={setExerciseToAddId}
            onAdd={() => { void addExercise() }}
            compact
          />}
        </aside>

        {activeExercise && <section className="exercise-workspace" aria-labelledby="active-exercise-title">
          <div className="exercise-workspace-heading">
            <div>
              <p className="eyebrow">{muscleLabel(activeExercise.primaryMuscle)}</p>
              <h2 id="active-exercise-title">{activeExercise.exerciseName}</h2>
              {activeExercise.notes && <p className="exercise-note">{activeExercise.notes}</p>}
            </div>
            <div className="exercise-workspace-actions"><div className="previous-context"><span>지난 기록</span><strong>{formatPrevious(previousSet, weightUnit)}</strong></div><button className="exercise-remove-button" type="button" onClick={() => removeExercise(activeExercise.id)}><Trash2 size={15} /> 종목 삭제</button></div>
          </div>

          <div className="set-table" role="region" aria-label={`${activeExercise.exerciseName} 세트 기록`} tabIndex={0}>
            <div className="set-row set-table-head" aria-hidden="true"><span>세트</span><span>중량 ({weightUnit})</span><span>횟수</span><span>목표 RIR</span><span>실제 RIR</span><span /></div>
            {activeExercise.sets.map((set) => <SetRow
              key={set.id}
              set={set}
              weightUnit={weightUnit}
              onChange={(changes) => updateSet(activeExercise.id, set.id, changes)}
              onComplete={() => toggleSetComplete(activeExercise.id, set)}
            />)}
          </div>
          <button className="add-set-button" type="button" onClick={() => addWorkingSet(activeExercise.id)}><Plus size={17} /> 작업 세트 추가</button>
        </section>}

        {!activeExercise && <section className="exercise-workspace free-workout-empty" aria-labelledby="free-workout-empty-title">
          <Dumbbell size={27} aria-hidden="true" />
          <h2 id="free-workout-empty-title">첫 운동을 추가해 주세요.</h2>
          <p>종목을 고르면 지난 기록과 기본 휴식 시간, 목표 RIR을 불러와 바로 기록할 수 있어요.</p>
          <ExerciseAdder
            exercises={exercises}
            selectedExerciseId={exerciseToAddId}
            onSelectionChange={setExerciseToAddId}
            onAdd={() => { void addExercise() }}
          />
        </section>}

        <aside className="workout-side-panel">
          <RestTimer remaining={remainingRest} isRunning={restIsRunning} onRestart={() => startRest(activeExercise?.sets.findLast((set) => set.isCompleted)?.restSeconds ?? defaultRestSeconds)} onStop={() => setRestEndsAt(null)} />
          <article className="target-card">
            <div className="target-card-icon"><Dumbbell size={18} /></div>
            <div><span>현재 목표</span><strong>{activeExercise ? formatTarget(activeExercise.sets.find((set) => !set.isCompleted) ?? activeExercise.sets.at(-1), weightUnit) : '–'}</strong></div>
          </article>
          <article className="workout-progress-card">
            <div><span>운동 진행률</span><strong>{countCompletedSets(draft)} / {countAllSets(draft)} 세트</strong></div>
            <div className="progress-track"><span style={{ width: `${getProgress(draft)}%` }} /></div>
          </article>
        </aside>
      </div>

      <div className="mobile-rest-dock"><RestTimer remaining={remainingRest} isRunning={restIsRunning} onRestart={() => startRest(activeExercise?.sets.findLast((set) => set.isCompleted)?.restSeconds ?? defaultRestSeconds)} onStop={() => setRestEndsAt(null)} compact /></div>
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

function RoutinePicker({ routines, selectedRoutine, onSelect, onBegin, onBeginFree, onCancel }: { routines: Routine[]; selectedRoutine: Routine | undefined; onSelect: (id: string) => void; onBegin: () => void; onBeginFree: () => void; onCancel: () => void }) {
  return <main className="routine-picker-page" aria-labelledby="routine-picker-title">
    <section className="routine-picker-heading"><div><p className="eyebrow">START TRAINING</p><h1 id="routine-picker-title">오늘 어떤 운동을 할까요?</h1><p>루틴의 처방을 따르거나, 자유 운동에서 원하는 종목을 바로 추가해 보세요.</p></div><button className="runner-text-button" type="button" onClick={onCancel}>대시보드로 돌아가기</button></section>
    {routines.length === 0 ? <div className="runner-empty"><Dumbbell size={24} /><h2>아직 저장된 루틴이 없어요.</h2><p>자유 운동은 지금 바로 시작할 수 있고, 필요하면 루틴을 만들어 둘 수도 있어요.</p></div> : <div className="routine-choice-grid">
      {routines.map((routine) => <button className={`routine-choice ${selectedRoutine?.id === routine.id ? 'is-selected' : ''}`} type="button" key={routine.id} onClick={() => onSelect(routine.id)}>
        <span className="routine-choice-marker" style={{ background: routine.color ?? 'var(--accent)' }} />
        <span className="routine-choice-copy"><strong>{routine.name}</strong><small>{routine.description ?? '나만의 운동 구성'}</small><em>{routine.exercises.length}개 종목 · {countRoutineSets(routine)}세트</em></span>
        {selectedRoutine?.id === routine.id && <span className="choice-check"><Check size={16} /></span>}
      </button>)}
    </div>}
    <div className="begin-workout-actions">
      <button className="primary-button begin-workout-button" type="button" disabled={!selectedRoutine} onClick={onBegin}><Play size={17} fill="currentColor" /> {selectedRoutine?.name ?? '루틴'} 시작</button>
      <button className="secondary-button begin-workout-button" type="button" onClick={onBeginFree}><Dumbbell size={17} /> 자유 운동으로 시작</button>
    </div>
  </main>
}

function ExerciseAdder({ exercises, selectedExerciseId, onSelectionChange, onAdd, compact = false }: { exercises: Exercise[]; selectedExerciseId: string; onSelectionChange: (id: string) => void; onAdd: () => void; compact?: boolean }) {
  return <div className={`exercise-adder ${compact ? 'is-compact' : ''}`}>
    <label>
      <span>{compact ? '종목 추가' : '운동 종목'}</span>
      <select aria-label="운동 종목 추가" value={selectedExerciseId} onChange={(event) => onSelectionChange(event.target.value)}>
        <option value="">운동을 선택하세요</option>
        {exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
      </select>
    </label>
    <button className="secondary-button" type="button" onClick={onAdd} disabled={!selectedExerciseId}><Plus size={16} /> 추가</button>
  </div>
}

function SetRow({ set, weightUnit, onChange, onComplete }: { set: WorkoutSetRecord; weightUnit: string; onChange: (changes: Partial<WorkoutSetRecord>) => void; onComplete: () => void }) {
  return <div className={`set-row ${set.isCompleted ? 'is-completed' : ''}`}>
    <span className="set-number"><small>세트</small>{set.setOrder}<em>{setTypeLabel(set.setType)}</em></span>
    <label><span className="mobile-field-label">중량 ({weightUnit})</span><input aria-label={`${set.setOrder}세트 중량 (${weightUnit})`} inputMode="decimal" type="number" min="0" step="0.5" value={set.weightKg ?? ''} onChange={(event) => onChange({ weightKg: toNullableNumber(event.target.value) })} /></label>
    <label><span className="mobile-field-label">횟수</span><input aria-label={`${set.setOrder}세트 횟수`} inputMode="numeric" type="number" min="0" step="1" value={set.reps ?? ''} onChange={(event) => onChange({ reps: toNullableInteger(event.target.value) })} /></label>
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
    id: createId(), routineId: routine.id, routineName: routine.name, status: 'in_progress', startedAt, completedAt: null, notes: null,
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
    id: createId(), routineId: null, routineName: null, status: 'in_progress', startedAt: new Date().toISOString(), completedAt: null, notes: null, exercises: [],
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
function formatTarget(set: WorkoutSetRecord | undefined, weightUnit: string) { if (!set) return '목표 없음'; const weight = set.weightKg === null ? '중량 자유' : `${set.weightKg}${weightUnit}`; const reps = set.reps === null ? '횟수 자유' : `${set.reps}회`; return `${weight} × ${reps} · RIR ${formatRir(set.targetRir)}` }
function formatRir(rir: Rir) { if (rir === null) return '–'; return rir >= 5 ? '5+' : String(rir) }
function formatTimer(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
function countCompletedSets(session: WorkoutDraft) { return session.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.isCompleted).length }
function countAllSets(session: WorkoutDraft) { return session.exercises.reduce((count, exercise) => count + exercise.sets.length, 0) }
function getProgress(session: WorkoutDraft) { const all = countAllSets(session); return all === 0 ? 0 : (countCompletedSets(session) / all) * 100 }
function countRoutineSets(routine: Routine) { return routine.exercises.reduce((count, exercise) => count + exercise.sets.length, 0) }
function setTypeLabel(setType: SetType) { return setType === 'warmup' ? '워밍업' : setType === 'dropset' ? '드롭' : '작업' }
function muscleLabel(muscle: WorkoutExercise['primaryMuscle']) { return ({ chest: '가슴', back: '등', shoulders: '어깨', biceps: '이두', triceps: '삼두', quadriceps: '대퇴사두', hamstrings: '햄스트링', glutes: '둔근', calves: '종아리', core: '코어', cardio: '유산소', full_body: '전신' })[muscle] }
