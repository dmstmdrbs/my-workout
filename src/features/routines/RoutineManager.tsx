import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, Dumbbell, ListPlus, ListX, LoaderCircle, Plus, Save, SlidersHorizontal, Trash2 } from 'lucide-react'
import { getDateInTimeZone } from '../../lib/localDate'
import { useAppServices, useSettings } from '../../services'
import type { Exercise, ProgramRun, Rir, Routine, RoutineExercise, RoutineSetPrescription, SetType } from '../../types/domain'
import { CreateExerciseDialog, ExercisePickerSheet } from '../workout/ExercisePicker'
import { snapshotExerciseName } from '../workout/exerciseLabels'
import './RoutineManager.css'

interface RoutineManagerData {
  routines: Routine[]
  exercises: Exercise[]
  activeProgramRun: ProgramRun | null
}

type RoutineDraft = Omit<Routine, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }

type PendingNavigation =
  | { kind: 'select'; routine: Routine }
  | { kind: 'create' }
  | { kind: 'mobile-list' }

const rirOptions: Array<{ value: Rir; label: string }> = [
  { value: null, label: '미설정' },
  { value: 0, label: 'RIR 0' },
  { value: 1, label: 'RIR 1' },
  { value: 2, label: 'RIR 2' },
  { value: 3, label: 'RIR 3' },
  { value: 4, label: 'RIR 4' },
  { value: 5, label: 'RIR 5+' },
]

const setTypeLabels: Record<SetType, string> = { warmup: '워밍업', working: '작업', dropset: '드롭' }

export function RoutineManager({ initialSelectedRoutineId = null, initialCreate = false, onRoutineChange, onStartProgramDay }: { initialSelectedRoutineId?: string | null; initialCreate?: boolean; onRoutineChange?: (routineId: string | 'new' | null) => void; onStartProgramDay?: (dayId: string) => void }) {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const settingsQuery = useSettings()
  const [draft, setDraft] = useState<RoutineDraft | null>(null)
  const [lastSavedDraft, setLastSavedDraft] = useState<RoutineDraft | null>(null)
  const [isMobileEditorOpen, setIsMobileEditorOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null)
  const appliedRouteSelection = useRef<string | null>(null)

  const setupQuery = useQuery({
    queryKey: ['routine-manager-data'],
    queryFn: async (): Promise<RoutineManagerData> => {
      const [routines, exercises, activeProgramRun] = await Promise.all([
        workoutRepository.listRoutines(),
        workoutRepository.listExercises(),
        workoutRepository.getActiveProgramRun(),
      ])
      return { routines, exercises, activeProgramRun }
    },
  })

  useEffect(() => {
    if (!setupQuery.data) return
    const routeSelection = initialCreate ? 'new' : initialSelectedRoutineId ?? 'list'
    if (appliedRouteSelection.current === routeSelection) return

    if (initialCreate) {
      setDraft({ name: '새 루틴', description: null, color: '#2563eb', exercises: [] })
      setLastSavedDraft(null)
      setNotice(null)
      setIsMobileEditorOpen(true)
    } else if (!setupQuery.data.routines.length) {
      setDraft(null)
      setLastSavedDraft(null)
    } else if (!(initialSelectedRoutineId && draft?.id === initialSelectedRoutineId)) {
      // An `initialSelectedRoutineId` that names no known routine (a deleted
      // or mistyped id) must never fall back to some other routine -- that
      // would let the person edit and save a routine they didn't ask for
      // while the URL still names the one they think they're editing. Leave
      // the draft empty; the render below shows a not-found screen instead.
      const initialRoutine = initialSelectedRoutineId
        ? setupQuery.data.routines.find((routine) => routine.id === initialSelectedRoutineId) ?? null
        : setupQuery.data.routines[0]
      if (initialRoutine) {
        const initialDraft = toDraft(initialRoutine)
        setDraft(initialDraft)
        setLastSavedDraft(initialDraft)
        setNotice(null)
      } else {
        setDraft(null)
        setLastSavedDraft(null)
      }
    }
    appliedRouteSelection.current = routeSelection
  }, [draft?.id, initialCreate, initialSelectedRoutineId, setupQuery.data])

  const saveMutation = useMutation({
    mutationFn: (routine: RoutineDraft) => workoutRepository.saveRoutine({
      ...routine,
      name: routine.name.trim(),
      description: blankToNull(routine.description),
    }),
    onSuccess: (saved) => {
      const savedDraft = toDraft(saved)
      setDraft(savedDraft)
      setLastSavedDraft(savedDraft)
      setNotice('루틴을 저장했어요.')
      void queryClient.invalidateQueries({ queryKey: ['routine-manager-data'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['workout-runner-setup'] })
      onRoutineChange?.(saved.id)
    },
  })

  const routineCount = (setupQuery.data?.routines.length ?? 0) + (setupQuery.data?.activeProgramRun ? 1 : 0)
  const isDirty = draft !== null && (lastSavedDraft === null || draftFingerprint(draft) !== draftFingerprint(lastSavedDraft))

  const performNavigation = (navigation: PendingNavigation) => {
    if (navigation.kind === 'select') {
      const selectedDraft = toDraft(navigation.routine)
      setDraft(selectedDraft)
      setLastSavedDraft(selectedDraft)
      setNotice(null)
      setIsMobileEditorOpen(true)
      onRoutineChange?.(navigation.routine.id)
      return
    }
    if (navigation.kind === 'create') {
      setDraft({ name: '새 루틴', description: null, color: '#2563eb', exercises: [] })
      setLastSavedDraft(null)
      setNotice(null)
      setIsMobileEditorOpen(true)
      onRoutineChange?.('new')
      return
    }
    setIsMobileEditorOpen(false)
  }

  const requestNavigation = (navigation: PendingNavigation) => {
    if (isDirty) {
      setPendingNavigation(navigation)
      return
    }
    performNavigation(navigation)
  }

  const createRoutine = () => requestNavigation({ kind: 'create' })
  const selectRoutine = (routine: Routine) => requestNavigation({ kind: 'select', routine })

  const updateDraft = (changes: Partial<RoutineDraft>) => setDraft((current) => current ? { ...current, ...changes } : current)

  if (setupQuery.isPending || settingsQuery.isPending) return <RoutineManagerLoading />
  if (setupQuery.isError || !setupQuery.data || settingsQuery.isError || !settingsQuery.data) {
    return <RoutineManagerError onRetry={() => { void setupQuery.refetch(); void settingsQuery.refetch() }} />
  }

  const { routines, exercises, activeProgramRun } = setupQuery.data
  const today = getDateInTimeZone(settingsQuery.data.timezone)
  const programDay = activeProgramRun?.days.find((day) => day.scheduledOn === today)
    ?? (activeProgramRun && today < activeProgramRun.startDate ? activeProgramRun.days[0] : null)
  const canStartProgramDay = Boolean(programDay && programDay.scheduledOn === today && programDay.dayType !== 'rest' && !programDay.workoutSession)

  // Gated on `setupQuery.data` above (not just truthy `routines`) so this
  // never fires during the loading window before the routine list has
  // actually resolved -- otherwise every direct visit to /routines/:id would
  // flash "not found" before the real list arrives.
  const routineNotFound = Boolean(initialSelectedRoutineId)
    && !initialCreate
    && !routines.some((routine) => routine.id === initialSelectedRoutineId)
  if (routineNotFound) return <RoutineNotFound onBackToList={() => onRoutineChange?.(null)} />

  const { defaultRestSeconds } = settingsQuery.data
  const selectedRoutineId = draft?.id ?? null

  return (
    <main className="routine-manager-page" aria-labelledby="routine-manager-title">
      <header className="routine-manager-heading">
        <div>
          <p className="eyebrow">ROUTINE BUILDER</p>
          <h1 id="routine-manager-title">루틴 관리</h1>
          <p>운동 구성과 세트별 목표 중량, 반복 수, RIR을 한 곳에서 설계하세요.</p>
        </div>
        <button className="primary-button routine-new-button" type="button" onClick={createRoutine}>
          <Plus size={17} aria-hidden="true" /> 새 루틴
        </button>
      </header>

      <div className={`routine-manager-layout ${isMobileEditorOpen ? 'is-editor-open' : ''}`}>
        <aside className="routine-list-pane" aria-label="루틴 목록">
          <div className="routine-list-heading"><span>내 루틴</span><strong>{routineCount}</strong></div>
          {routines.length === 0 && !programDay ? (
            <div className="routine-list-empty"><Dumbbell size={20} aria-hidden="true" /><p>아직 만든 루틴이 없어요.</p></div>
          ) : (
            <div className="routine-list">
              {programDay && <button className="routine-list-item program-routine-list-item" type="button" onClick={() => canStartProgramDay && onStartProgramDay?.(programDay.id)} disabled={!canStartProgramDay}>
                <span className="routine-color-dot" aria-hidden="true" />
                <span className="routine-list-copy"><span>PROGRAM DAY {programDay.dayNumber}</span><strong>{programDay.title}</strong><small>{activeProgramRun!.programName} · {programDay.workoutSession ? '완료' : programDay.dayType === 'rest' ? '휴식일' : programDay.scheduledOn === today ? '오늘 수행' : `${programDay.scheduledOn} 시작`}</small></span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>}
              {routines.map((routine) => (
                <button
                  className={`routine-list-item ${selectedRoutineId === routine.id ? 'is-selected' : ''}`}
                  key={routine.id}
                  type="button"
                  onClick={() => selectRoutine(routine)}
                  aria-current={selectedRoutineId === routine.id ? 'true' : undefined}
                >
                  <span className="routine-color-dot" style={{ background: routine.color ?? 'var(--accent)' }} aria-hidden="true" />
                  <span className="routine-list-copy"><strong>{routine.name}</strong><small>{routine.exercises.length}개 종목 · {countSets(routine.exercises)}세트</small></span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
          <button className="routine-list-create" type="button" onClick={createRoutine}><Plus size={16} aria-hidden="true" /> 새 루틴 만들기</button>
        </aside>

        <section className="routine-editor-pane" aria-label="루틴 편집">
          {draft ? (
            <RoutineEditor
              draft={draft}
              exercises={exercises}
              defaultRestSeconds={defaultRestSeconds}
              isSaving={saveMutation.isPending}
              saveError={saveMutation.isError}
              notice={notice}
              onBack={() => requestNavigation({ kind: 'mobile-list' })}
              onChange={updateDraft}
              onSave={() => {
                if (!draft.name.trim() || saveMutation.isPending) return
                saveMutation.mutate(draft)
              }}
              onClearNotice={() => setNotice(null)}
            />
          ) : (
            <EmptyRoutineEditor onCreate={createRoutine} />
          )}
        </section>
      </div>
      {pendingNavigation && <DiscardChangesDialog
        destination={navigationLabel(pendingNavigation)}
        onCancel={() => setPendingNavigation(null)}
        onDiscard={() => {
          performNavigation(pendingNavigation)
          setPendingNavigation(null)
        }}
      />}
    </main>
  )
}

function RoutineEditor({ draft, exercises, defaultRestSeconds, isSaving, saveError, notice, onBack, onChange, onSave, onClearNotice }: {
  draft: RoutineDraft
  exercises: Exercise[]
  defaultRestSeconds: number
  isSaving: boolean
  saveError: boolean
  notice: string | null
  onBack: () => void
  onChange: (changes: Partial<RoutineDraft>) => void
  onSave: () => void
  onClearNotice: () => void
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [applyRir, setApplyRir] = useState<Rir>(2)
  const orderedExercises = useMemo(() => [...draft.exercises].sort((a, b) => a.exerciseOrder - b.exerciseOrder), [draft.exercises])

  const updateExercises = (nextExercises: RoutineExercise[]) => onChange({ exercises: normalizeExerciseOrder(nextExercises) })

  const addExercises = (selectedExercises: Exercise[]) => {
    const newExercises: RoutineExercise[] = selectedExercises.map((exercise, index) => ({
      id: createId(),
      exerciseId: exercise.id,
      exerciseName: snapshotExerciseName(exercise),
      exerciseOrder: draft.exercises.length + index + 1,
      notes: null,
      sets: [makeSet(1, 'working', exercise.defaultRestSeconds || defaultRestSeconds)],
    }))
    updateExercises([...draft.exercises, ...newExercises])
  }

  const selectExercisesFromPicker = (selectedExercises: Exercise[]) => {
    setIsPickerOpen(false)
    addExercises(selectedExercises)
  }

  // 새로 만든 종목은 시트로 돌아가지 않고 곧장 루틴에 들어간다 -- 방금 만든
  // 이유가 그것이므로, 목록에서 한 번 더 찾게 하지 않는다.
  const addCreatedExercise = (exercise: Exercise) => {
    setIsCreateOpen(false)
    setIsPickerOpen(false)
    addExercises([exercise])
  }

  const updateExercise = (exerciseId: string, changes: Partial<RoutineExercise>) => {
    updateExercises(draft.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, ...changes } : exercise))
  }

  const removeExercise = (exerciseId: string) => updateExercises(draft.exercises.filter((exercise) => exercise.id !== exerciseId))

  const moveExercise = (exerciseId: string, direction: -1 | 1) => {
    const index = orderedExercises.findIndex((exercise) => exercise.id === exerciseId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= orderedExercises.length) return
    const next = [...orderedExercises]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    updateExercises(next)
  }

  const updateSet = (exerciseId: string, setId: string, changes: Partial<RoutineSetPrescription>) => {
    const exercise = draft.exercises.find((item) => item.id === exerciseId)
    if (!exercise) return
    const nextSets = exercise.sets.map((set) => set.id === setId ? { ...set, ...changes } : set)
    updateExercise(exerciseId, { sets: normalizeSetOrder(nextSets) })
  }

  const addSet = (exerciseId: string) => {
    const exercise = draft.exercises.find((item) => item.id === exerciseId)
    if (!exercise) return
    const reference = [...exercise.sets].reverse().find((set) => set.setType === 'working') ?? exercise.sets.at(-1)
    const nextSet = makeSet(exercise.sets.length + 1, 'working', reference?.restSeconds ?? defaultRestSeconds, reference)
    updateExercise(exerciseId, { sets: [...exercise.sets, nextSet] })
  }

  const removeSet = (exerciseId: string, setId: string) => {
    const exercise = draft.exercises.find((item) => item.id === exerciseId)
    if (!exercise) return
    updateExercise(exerciseId, { sets: normalizeSetOrder(exercise.sets.filter((set) => set.id !== setId)) })
  }

  const applyRirToWorkingSets = (exerciseId: string) => {
    const exercise = draft.exercises.find((item) => item.id === exerciseId)
    if (!exercise) return
    updateExercise(exerciseId, { sets: exercise.sets.map((set) => set.setType === 'working' ? { ...set, targetRir: applyRir } : set) })
  }

  return <>
    <header className="routine-editor-header">
      <button className="routine-back-button" type="button" onClick={onBack} aria-label="루틴 목록으로 돌아가기"><ArrowLeft size={19} aria-hidden="true" /></button>
      <div className="routine-editor-title"><span>루틴 편집</span><strong>{draft.id ? '저장된 루틴' : '새 루틴'}</strong></div>
      <button className="primary-button routine-save-button" type="button" disabled={!draft.name.trim() || isSaving} onClick={onSave}>
        {isSaving ? <LoaderCircle className="spinning" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
        {isSaving ? '저장 중' : '저장'}
      </button>
    </header>

    <div className="routine-editor-scroll">
      <section className="routine-details-card" aria-label="루틴 기본 정보">
        <label className="routine-name-field"><span>루틴 이름</span><input value={draft.name} onChange={(event) => { onClearNotice(); onChange({ name: event.target.value }) }} placeholder="예: Pull Day" maxLength={80} /></label>
        <label className="routine-description-field"><span>설명 <em>(선택)</em></span><input value={draft.description ?? ''} onChange={(event) => { onClearNotice(); onChange({ description: event.target.value || null }) }} placeholder="예: 등과 이두 중심" maxLength={180} /></label>
        <label className="routine-color-field"><span>색상</span><input aria-label="루틴 색상" type="color" value={draft.color ?? '#2563eb'} onChange={(event) => onChange({ color: event.target.value })} /></label>
      </section>

      {notice && <p className="routine-notice" role="status"><Check size={16} aria-hidden="true" /> {notice}</p>}
      {saveError && <p className="routine-save-error" role="alert">루틴을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.</p>}

      <section className="routine-exercise-section" aria-labelledby="routine-exercises-title">
        <div className="routine-section-heading"><div><p className="eyebrow">EXERCISES</p><h2 id="routine-exercises-title">운동 구성</h2></div><span>{orderedExercises.length}개 종목 · {countSets(orderedExercises)}세트</span></div>

        {orderedExercises.length === 0 ? <div className="routine-empty-exercises"><Dumbbell size={22} aria-hidden="true" /><strong>첫 운동을 추가해 보세요.</strong><p>운동을 추가한 뒤 세트별 목표와 RIR을 설계할 수 있어요.</p><button className="primary-button" type="button" onClick={() => setIsPickerOpen(true)}><ListPlus size={16} aria-hidden="true" /> 종목 추가</button></div> : (
          <div className="routine-exercise-list">
            {orderedExercises.map((exercise, index) => <ExerciseEditor
              key={exercise.id}
              exercise={exercise}
              isCardio={exercises.find((item) => item.id === exercise.exerciseId)?.equipment === 'cardio'}
              index={index}
              total={orderedExercises.length}
              applyRir={applyRir}
              onApplyRirChange={setApplyRir}
              onApplyRir={() => applyRirToWorkingSets(exercise.id)}
              onMove={(direction) => moveExercise(exercise.id, direction)}
              onRemove={() => removeExercise(exercise.id)}
              onUpdateSet={(setId, changes) => updateSet(exercise.id, setId, changes)}
              onAddSet={() => addSet(exercise.id)}
              onRemoveSet={(setId) => removeSet(exercise.id, setId)}
            />)}
          </div>
        )}

        {orderedExercises.length > 0 && <div className="add-exercise-control">
          <button className="secondary-button routine-add-exercise-button" type="button" onClick={() => setIsPickerOpen(true)}><ListPlus size={16} aria-hidden="true" /> 종목 추가</button>
        </div>}
      </section>
    </div>

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
  </>
}

function ExerciseEditor({ exercise, isCardio, index, total, applyRir, onApplyRirChange, onApplyRir, onMove, onRemove, onUpdateSet, onAddSet, onRemoveSet }: {
  exercise: RoutineExercise
  isCardio: boolean
  index: number
  total: number
  applyRir: Rir
  onApplyRirChange: (rir: Rir) => void
  onApplyRir: () => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  onUpdateSet: (setId: string, changes: Partial<RoutineSetPrescription>) => void
  onAddSet: () => void
  onRemoveSet: (setId: string) => void
}) {
  const sets = [...exercise.sets].sort((a, b) => a.setOrder - b.setOrder)
  const workingSetCount = sets.filter((set) => set.setType === 'working').length

  return <article className="routine-exercise-card">
    <header className="routine-exercise-card-header">
      <div className="routine-exercise-name"><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{exercise.exerciseName}</h3><small>{sets.length}세트 · 작업 세트 {workingSetCount}개</small></div></div>
      <div className="exercise-card-actions">
        <button type="button" className="compact-icon-button" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`${exercise.exerciseName} 위로 이동`}><ArrowUp size={16} aria-hidden="true" /></button>
        <button type="button" className="compact-icon-button" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={`${exercise.exerciseName} 아래로 이동`}><ArrowDown size={16} aria-hidden="true" /></button>
        <button type="button" className="compact-icon-button is-danger" onClick={onRemove} aria-label={`${exercise.exerciseName} 제거`}><Trash2 size={16} aria-hidden="true" /></button>
      </div>
    </header>
    <div className="routine-set-table" role="region" aria-label={`${exercise.exerciseName} 세트 처방`} tabIndex={0}>
      <div className="routine-set-row routine-set-head" aria-hidden="true"><span>세트</span><span>유형</span><span>{isCardio ? '시간' : '중량'}</span><span>{isCardio ? '거리' : '반복 수'}</span><span>목표 RIR</span><span>휴식</span><span /></div>
      {sets.map((set) => <PrescriptionSetRow key={set.id} set={set} isCardio={isCardio} onChange={(changes) => onUpdateSet(set.id, changes)} onRemove={() => onRemoveSet(set.id)} />)}
    </div>
    <div className="routine-exercise-footer">
      <button className="text-add-set" type="button" onClick={onAddSet}><Plus size={16} aria-hidden="true" /> 작업 세트 추가</button>
      <div className="apply-rir-control"><SlidersHorizontal size={15} aria-hidden="true" /><label>작업 세트 RIR <select value={rirValue(applyRir)} onChange={(event) => onApplyRirChange(parseRir(event.target.value))}>{rirOptions.map((option) => <option value={rirValue(option.value)} key={rirValue(option.value)}>{option.label}</option>)}</select></label><button type="button" onClick={onApplyRir} disabled={workingSetCount === 0}>일괄 적용</button></div>
    </div>
  </article>
}

function PrescriptionSetRow({ set, isCardio, onChange, onRemove }: { set: RoutineSetPrescription; isCardio: boolean; onChange: (changes: Partial<RoutineSetPrescription>) => void; onRemove: () => void }) {
  return <div className="routine-set-row">
    <span className="prescription-set-number"><small>세트</small>{set.setOrder}</span>
    <label><span className="routine-mobile-field-label">유형</span><select aria-label={`${set.setOrder}세트 유형`} value={set.setType} onChange={(event) => onChange({ setType: event.target.value as SetType })}>{(Object.keys(setTypeLabels) as SetType[]).map((type) => <option value={type} key={type}>{setTypeLabels[type]}</option>)}</select></label>
    {isCardio ? <>
      <label><span className="routine-mobile-field-label">시간 분</span><input aria-label={`${set.setOrder}세트 목표 시간(분)`} type="number" inputMode="numeric" min="0" step="1" value={set.targetDurationSeconds === null ? '' : Math.round(set.targetDurationSeconds / 60)} onChange={(event) => onChange({ targetDurationSeconds: minutesToSeconds(event.target.value) })} placeholder="–" /></label>
      <label><span className="routine-mobile-field-label">거리 km</span><input aria-label={`${set.setOrder}세트 목표 거리(km)`} type="number" inputMode="decimal" min="0" step="0.1" value={set.targetDistanceKm ?? ''} onChange={(event) => onChange({ targetDistanceKm: toNullableNumber(event.target.value) })} placeholder="–" /></label>
    </> : <>
      <label><span className="routine-mobile-field-label">중량 kg</span><input aria-label={`${set.setOrder}세트 목표 중량`} type="number" inputMode="decimal" min="0" step="0.5" value={set.targetWeightKg ?? ''} onChange={(event) => onChange({ targetWeightKg: toNullableNumber(event.target.value) })} placeholder="–" /></label>
      <label className="rep-range-input"><span className="routine-mobile-field-label">반복 수</span><input aria-label={`${set.setOrder}세트 최소 반복 수`} type="number" inputMode="numeric" min="0" step="1" value={set.targetRepsMin ?? ''} onChange={(event) => onChange({ targetRepsMin: toNullableInteger(event.target.value) })} placeholder="최소" /><i>~</i><input aria-label={`${set.setOrder}세트 최대 반복 수`} type="number" inputMode="numeric" min="0" step="1" value={set.targetRepsMax ?? ''} onChange={(event) => onChange({ targetRepsMax: toNullableInteger(event.target.value) })} placeholder="최대" /></label>
    </>}
    <label><span className="routine-mobile-field-label">목표 RIR</span><select aria-label={`${set.setOrder}세트 목표 RIR`} value={rirValue(set.targetRir)} onChange={(event) => onChange({ targetRir: parseRir(event.target.value) })}>{rirOptions.map((option) => <option value={rirValue(option.value)} key={rirValue(option.value)}>{option.label}</option>)}</select></label>
    <label><span className="routine-mobile-field-label">휴식 초</span><input aria-label={`${set.setOrder}세트 휴식 시간(초)`} type="number" inputMode="numeric" min="0" step="5" value={set.restSeconds ?? ''} onChange={(event) => onChange({ restSeconds: toNullableInteger(event.target.value) })} placeholder="–" /></label>
    <button type="button" className="remove-set-button" onClick={onRemove} aria-label={`${set.setOrder}세트 제거`}><Trash2 size={15} aria-hidden="true" /></button>
  </div>
}

function EmptyRoutineEditor({ onCreate }: { onCreate: () => void }) {
  return <div className="routine-editor-empty"><span><Dumbbell size={25} aria-hidden="true" /></span><h2>루틴을 선택하거나 새로 만드세요.</h2><p>세트별 중량, 반복 수, 휴식 시간, 목표 RIR을 직접 설계할 수 있습니다.</p><button className="primary-button" type="button" onClick={onCreate}><Plus size={16} aria-hidden="true" /> 첫 루틴 만들기</button></div>
}

function DiscardChangesDialog({ destination, onCancel, onDiscard }: { destination: string; onCancel: () => void; onDiscard: () => void }) {
  return <div className="routine-discard-backdrop">
    <section className="routine-discard-dialog" role="dialog" aria-modal="true" aria-labelledby="discard-dialog-title" aria-describedby="discard-dialog-description">
      <p className="eyebrow">UNSAVED CHANGES</p>
      <h2 id="discard-dialog-title">저장하지 않은 변경사항이 있어요.</h2>
      <p id="discard-dialog-description">저장하지 않고 {destination} 이동하면 현재 편집 내용은 사라집니다.</p>
      <div className="routine-discard-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>취소</button>
        <button className="danger-button" type="button" onClick={onDiscard}>저장하지 않고 나가기</button>
      </div>
    </section>
  </div>
}

function RoutineManagerLoading() { return <main className="routine-manager-page" aria-label="루틴을 불러오는 중"><div className="routine-loading-heading" /><div className="routine-loading-layout"><div /><div /></div></main> }
function RoutineManagerError({ onRetry }: { onRetry: () => void }) { return <main className="routine-manager-message"><span><Dumbbell size={25} aria-hidden="true" /></span><h1>루틴을 불러오지 못했어요.</h1><p>저장소 연결을 확인한 뒤 다시 시도해 주세요.</p><button className="primary-button" type="button" onClick={onRetry}>다시 시도</button></main> }
function RoutineNotFound({ onBackToList }: { onBackToList: () => void }) { return <main className="routine-manager-message"><span><ListX size={25} aria-hidden="true" /></span><h1>루틴을 찾을 수 없어요.</h1><p>주소가 잘못되었거나 삭제된 루틴일 수 있어요.</p><button className="primary-button" type="button" onClick={onBackToList}>루틴 목록으로 돌아가기</button></main> }

function toDraft(routine: Routine): RoutineDraft { return { id: routine.id, name: routine.name, description: routine.description, color: routine.color, exercises: structuredClone(routine.exercises) } }
function createId() { return globalThis.crypto?.randomUUID?.() ?? `routine-${Date.now()}-${Math.random().toString(36).slice(2)}` }
function makeSet(setOrder: number, setType: SetType, restSeconds: number | null, reference?: RoutineSetPrescription): RoutineSetPrescription { return { id: createId(), setOrder, setType, targetWeightKg: reference?.targetWeightKg ?? null, targetRepsMin: reference?.targetRepsMin ?? null, targetRepsMax: reference?.targetRepsMax ?? null, targetDurationSeconds: reference?.targetDurationSeconds ?? null, targetDistanceKm: reference?.targetDistanceKm ?? null, targetRir: reference?.targetRir ?? null, restSeconds } }
function normalizeExerciseOrder(exercises: RoutineExercise[]) { return exercises.map((exercise, index) => ({ ...exercise, exerciseOrder: index + 1 })) }
function normalizeSetOrder(sets: RoutineSetPrescription[]) { return sets.map((set, index) => ({ ...set, setOrder: index + 1 })) }
function countSets(exercises: RoutineExercise[]) { return exercises.reduce((total, exercise) => total + exercise.sets.length, 0) }
function blankToNull(value: string | null) { return value?.trim() || null }
function draftFingerprint(draft: RoutineDraft) {
  return JSON.stringify({
    id: draft.id ?? null,
    name: draft.name,
    description: draft.description,
    color: draft.color,
    exercises: [...draft.exercises].sort((a, b) => a.exerciseOrder - b.exerciseOrder).map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
      exerciseOrder: exercise.exerciseOrder,
      notes: exercise.notes,
      sets: [...exercise.sets].sort((a, b) => a.setOrder - b.setOrder).map((set) => ({
        id: set.id,
        setOrder: set.setOrder,
        setType: set.setType,
        targetWeightKg: set.targetWeightKg,
        targetRepsMin: set.targetRepsMin,
        targetRepsMax: set.targetRepsMax,
        targetRir: set.targetRir,
        restSeconds: set.restSeconds,
      })),
    })),
  })
}
function navigationLabel(navigation: PendingNavigation) { return navigation.kind === 'select' ? `“${navigation.routine.name}” 루틴으로` : navigation.kind === 'create' ? '새 루틴으로' : '루틴 목록으로' }
function rirValue(rir: Rir) { return rir === null ? '' : String(rir) }
function parseRir(value: string): Rir { if (value === '') return null; const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 0 ? parsed : null }
function toNullableNumber(value: string) { if (value.trim() === '') return null; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null }
/** 분 입력을 초로. 기록 쪽과 같은 규칙이다. */
function minutesToSeconds(value: string) { const parsed = toNullableInteger(value); return parsed === null ? null : parsed * 60 }
function toNullableInteger(value: string) { const parsed = toNullableNumber(value); return parsed === null ? null : Math.floor(parsed) }
