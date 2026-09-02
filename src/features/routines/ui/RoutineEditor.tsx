import { useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Check, Dumbbell, ListPlus, LoaderCircle, Plus, Save, SlidersHorizontal, Trash2 } from 'lucide-react'
import { CreateExerciseDialog, ExercisePickerSheet, snapshotExerciseName } from '../../../entities/exercise'
import { setTypeLabel, setTypeOptions } from '../../../entities/workout'
import type { Exercise, Rir, RoutineExercise, RoutineSetPrescription, SetType } from '../../../types/domain'
import { createId, countSets, makeSet, minutesToSeconds, normalizeExerciseOrder, normalizeSetOrder, parseRir, rirOptions, rirValue, toNullableInteger, toNullableNumber, type RoutineDraft } from '../model/routineDraft'

export function RoutineEditor({ draft, exercises, defaultRestSeconds, isSaving, saveError, notice, onBack, onChange, onSave, onClearNotice, onOpenExerciseManagement }: {
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
  onOpenExerciseManagement: () => void
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
      onOpenManage={onOpenExerciseManagement}
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
      <div className="routine-exercise-name"><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{exercise.exerciseName}</h3><small>{sets.length}세트 · 세트별 유형 지정</small></div></div>
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
      <button className="text-add-set" type="button" onClick={onAddSet}><Plus size={16} aria-hidden="true" /> 본세트 추가</button>
      <div className="apply-rir-control"><SlidersHorizontal size={15} aria-hidden="true" /><label>본세트 RIR <select value={rirValue(applyRir)} onChange={(event) => onApplyRirChange(parseRir(event.target.value))}>{rirOptions.map((option) => <option value={rirValue(option.value)} key={rirValue(option.value)}>{option.label}</option>)}</select></label><button type="button" onClick={onApplyRir} disabled={workingSetCount === 0}>일괄 적용</button></div>
    </div>
  </article>
}

function PrescriptionSetRow({ set, isCardio, onChange, onRemove }: { set: RoutineSetPrescription; isCardio: boolean; onChange: (changes: Partial<RoutineSetPrescription>) => void; onRemove: () => void }) {
  return <div className="routine-set-row">
    <span className="prescription-set-number"><small>세트</small>{set.setOrder}</span>
    <label><span className="routine-mobile-field-label">유형</span><select aria-label={`${set.setOrder}세트 유형`} value={set.setType} onChange={(event) => onChange({ setType: event.target.value as SetType })}>{setTypeOptions.map((type) => <option value={type} key={type}>{setTypeLabel(type)}</option>)}</select></label>
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
