import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ListChecks, Plus, Search, X } from 'lucide-react'
import { Overlay } from '../../components/Overlay'
import { useAppServices } from '../../services'
import type { Equipment, Exercise, ExerciseBrand, MuscleGroup } from '../../types/domain'
import { brandLabel, equipmentLabel, equipmentTypes, exerciseBrands, muscleGroups, muscleLabel } from './exerciseLabels'
import './ExercisePicker.css'

type MuscleFilter = MuscleGroup | 'all'
type EquipmentFilter = Equipment | 'all'

interface ExercisePickerSheetProps {
  isOpen: boolean
  exercises: Exercise[]
  onClose: () => void
  onSelect?: (exercise: Exercise) => void
  onSelectMany?: (exercises: Exercise[]) => void
  selectionMode?: 'single' | 'multiple'
  /**
   * 운동 진행 화면은 즉석에서 새 운동을 만들 수 있어야 하지만, 통계처럼
   * 기존 운동의 기록을 조회하기만 하는 화면에는 만들기 동작 자체가 없다
   * (막 만든 운동은 어차피 완료 기록이 없어 보여줄 추이가 없다). 그런
   * 화면에서 시트를 두 번째로 구현하는 대신, 이 콜백을 선택으로 두고
   * 생략되면 "새 운동 만들기" 버튼 자체를 렌더링하지 않는다.
   */
  onOpenCreate?: () => void
}

export function ExercisePickerSheet({
  isOpen,
  exercises,
  onClose,
  onSelect,
  onSelectMany,
  selectionMode = 'single',
  onOpenCreate,
}: ExercisePickerSheetProps) {
  // 시트에서 바로 종목 관리로 갈 수 있어야, 운동 중에 브랜드를 잘못 고른 종목을
  // 그 자리에서 고칠 수 있다. 진행 중인 초안은 저장돼 있어 나갔다 와도 이어진다.
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [muscleFilter, setMuscleFilter] = useState<MuscleFilter>('all')
  const [equipmentFilter, setEquipmentFilter] = useState<EquipmentFilter>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    if (!isOpen) return
    setSearch('')
    setMuscleFilter('all')
    setEquipmentFilter('all')
    setSelectedIds([])
  }, [isOpen])

  const term = search.trim().toLowerCase()
  const filtered = exercises.filter((exercise) => {
    if (term && !exercise.name.toLowerCase().includes(term)) return false
    if (muscleFilter !== 'all' && exercise.primaryMuscle !== muscleFilter) return false
    if (equipmentFilter !== 'all' && exercise.equipment !== equipmentFilter) return false
    return true
  })
  const selectedExercises = selectedIds.flatMap((id) => {
    const exercise = exercises.find((item) => item.id === id)
    return exercise ? [exercise] : []
  })

  const handleExerciseClick = (exercise: Exercise) => {
    if (selectionMode === 'single') {
      onSelect?.(exercise)
      return
    }
    setSelectedIds((current) => current.includes(exercise.id)
      ? current.filter((id) => id !== exercise.id)
      : [...current, exercise.id])
  }

  const confirmSelection = () => {
    if (selectedExercises.length === 0) return
    onSelectMany?.(selectedExercises)
  }

  return <Overlay isOpen={isOpen} onClose={onClose} presentation="sheet" labelledBy="exercise-picker-title" className="exercise-picker-sheet">
    <header className="exercise-picker-header">
      <div><p className="eyebrow">ADD EXERCISE</p><h2 id="exercise-picker-title">종목 추가</h2></div>
      <div className="exercise-picker-header-actions">
        <button className="icon-button" type="button" onClick={() => { onClose(); navigate('/exercises') }} aria-label="종목 관리로 이동"><ListChecks size={18} /></button>
        {onOpenCreate && <button className="icon-button" type="button" onClick={onOpenCreate} aria-label="새 운동 만들기"><Plus size={19} /></button>}
        <button className="icon-button" type="button" onClick={onClose} aria-label="종목 추가 닫기"><X size={19} /></button>
      </div>
    </header>

    <div className="exercise-picker-filters">
      <label className="exercise-picker-search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          aria-label="운동 이름 검색"
          placeholder="운동 이름으로 검색"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          data-overlay-initial-focus
        />
      </label>
      <div className="exercise-picker-muscle-filter" role="group" aria-label="부위로 필터">
        <span className="exercise-picker-filter-label">부위</span>
        <div className="exercise-picker-filter-chips">
          <button type="button" aria-pressed={muscleFilter === 'all'} onClick={() => setMuscleFilter('all')}>전체</button>
          {muscleGroups.map((muscle) => <button type="button" aria-pressed={muscleFilter === muscle} onClick={() => setMuscleFilter(muscle)} key={muscle}>{muscleLabel(muscle)}</button>)}
        </div>
      </div>
      <label className="exercise-picker-equipment-filter">
        <span className="exercise-picker-filter-label">장비</span>
        <select aria-label="장비로 필터" value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value as EquipmentFilter)}>
          <option value="all">전체</option>
          {equipmentTypes.map((equipment) => <option value={equipment} key={equipment}>{equipmentLabel(equipment)}</option>)}
        </select>
      </label>
    </div>

    <ul className="exercise-picker-list">
      {filtered.map((exercise) => {
        const selectionIndex = selectedIds.indexOf(exercise.id)
        const isSelected = selectionIndex >= 0
        return <li key={exercise.id}>
          <button
            type="button"
            className={`exercise-picker-item${isSelected ? ' exercise-picker-item--selected' : ''}`}
            aria-label={exercise.name}
            aria-pressed={selectionMode === 'multiple' ? isSelected : undefined}
            onClick={() => handleExerciseClick(exercise)}
          >
            <span className="exercise-picker-item-copy">
              <span className="exercise-picker-item-name">
                {exercise.brand && <span className="exercise-brand-badge">{brandLabel(exercise.brand)}</span>}
                {exercise.name}
              </span>
              <span className="exercise-picker-item-meta">{muscleLabel(exercise.primaryMuscle)} · {equipmentLabel(exercise.equipment)}</span>
            </span>
            {selectionMode === 'multiple' && <span className="exercise-picker-selection-mark" aria-hidden="true">
              {isSelected ? selectionIndex + 1 : <Check size={14} />}
            </span>}
          </button>
        </li>
      })}
      {filtered.length === 0 && <li className="exercise-picker-empty">조건에 맞는 운동이 없어요. 새로 만들어 보세요.</li>}
    </ul>

    {selectionMode === 'multiple' && <footer className="exercise-picker-selection-footer">
      <div className="exercise-picker-selection-summary" aria-live="polite">
        <div>
          <strong>{selectedExercises.length > 0 ? `${selectedExercises.length}개 선택` : '운동을 선택해 주세요'}</strong>
          <span>{selectedExercises.length > 0 ? '선택한 순서대로 추가돼요' : '여러 종목을 한 번에 담을 수 있어요'}</span>
        </div>
        {selectedExercises.length > 0 && <button type="button" onClick={() => setSelectedIds([])}>전체 해제</button>}
      </div>
      {selectedExercises.length > 0 && <ol className="exercise-picker-selected-list" aria-label="선택한 운동 순서">
        {selectedExercises.map((exercise, index) => <li key={exercise.id}>
          <button type="button" onClick={() => handleExerciseClick(exercise)} aria-label={`${exercise.name} 선택 해제`}>
            <span>{index + 1}</span>{exercise.name}<X size={12} aria-hidden="true" />
          </button>
        </li>)}
      </ol>}
      <button className="primary-button exercise-picker-confirm" type="button" disabled={selectedExercises.length === 0} onClick={confirmSelection}>
        {selectedExercises.length > 0 ? `선택한 ${selectedExercises.length}개 추가` : '운동을 선택해 주세요'}
      </button>
    </footer>}
  </Overlay>
}

interface CreateExerciseDialogProps {
  isOpen: boolean
  defaultRestSeconds: number
  onClose: () => void
  onCreated: (exercise: Exercise) => void
}

export function CreateExerciseDialog({ isOpen, defaultRestSeconds, onClose, onCreated }: CreateExerciseDialogProps) {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup>('chest')
  const [equipment, setEquipment] = useState<Equipment>('barbell')
  const [brand, setBrand] = useState<ExerciseBrand | null>(null)
  const [restSeconds, setRestSeconds] = useState(defaultRestSeconds)

  const createMutation = useMutation({
    mutationFn: () => workoutRepository.saveExercise({
      name: name.trim(),
      primaryMuscle,
      secondaryMuscles: [],
      equipment,
      brand,
      defaultRestSeconds: restSeconds,
      isArchived: false,
    }),
    onSuccess: (exercise) => {
      void queryClient.invalidateQueries({ queryKey: ['workout-runner-setup'] })
      // RoutineManager caches the same catalog under its own key
      // (`listExercises()` again, independently) -- without this, a routine
      // opened within its 30s staleTime right after creating an exercise
      // here would show an editor missing the exercise just created.
      void queryClient.invalidateQueries({ queryKey: ['routine-manager-data'] })
      onCreated(exercise)
    },
  })
  const resetMutation = createMutation.reset

  useEffect(() => {
    if (!isOpen) return
    setName('')
    setPrimaryMuscle('chest')
    setEquipment('barbell')
    setBrand(null)
    setRestSeconds(defaultRestSeconds)
    // Without this, a save that failed on a previous open leaves its error
    // banner showing on the next, otherwise-blank form.
    resetMutation()
  }, [isOpen, defaultRestSeconds, resetMutation])

  const trimmedName = name.trim()
  const canSave = trimmedName.length > 0 && !createMutation.isPending

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    createMutation.mutate()
  }

  return <Overlay isOpen={isOpen} onClose={onClose} presentation="dialog" labelledBy="create-exercise-title" className="create-exercise-dialog">
    <header className="create-exercise-header">
      <div><p className="eyebrow">NEW EXERCISE</p><h2 id="create-exercise-title">새 운동 만들기</h2></div>
      <button className="icon-button" type="button" onClick={onClose} aria-label="새 운동 만들기 닫기"><X size={18} /></button>
    </header>
    <form className="create-exercise-form" onSubmit={handleSubmit}>
      <label>
        <span>운동 이름</span>
        <input aria-label="새 운동 이름" value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 인클라인 덤벨 프레스" data-overlay-initial-focus />
      </label>
      <label>
        <span>주요 부위</span>
        <select aria-label="새 운동 주요 부위" value={primaryMuscle} onChange={(event) => setPrimaryMuscle(event.target.value as MuscleGroup)}>
          {muscleGroups.map((muscle) => <option value={muscle} key={muscle}>{muscleLabel(muscle)}</option>)}
        </select>
      </label>
      <label>
        <span>장비</span>
        <select aria-label="새 운동 장비" value={equipment} onChange={(event) => setEquipment(event.target.value as Equipment)}>
          {equipmentTypes.map((item) => <option value={item} key={item}>{equipmentLabel(item)}</option>)}
        </select>
      </label>
      <label>
        <span>브랜드</span>
        <select aria-label="새 운동 브랜드" value={brand ?? ''} onChange={(event) => setBrand(event.target.value === '' ? null : event.target.value as ExerciseBrand)}>
          <option value="">없음</option>
          {exerciseBrands.map((item) => <option value={item} key={item}>{brandLabel(item)}</option>)}
        </select>
        <small className="create-exercise-hint">목록에 없는 제조사는 운동 이름에 적어 주세요.</small>
      </label>
      <label>
        <span>기본 휴식 시간 (초)</span>
        <input aria-label="새 운동 기본 휴식 시간(초)" type="number" inputMode="numeric" min="0" step="5" value={restSeconds} onChange={(event) => setRestSeconds(Math.max(0, Number(event.target.value) || 0))} />
      </label>
      {createMutation.isError && <p className="create-exercise-error" role="alert">운동을 저장하지 못했어요. 다시 시도해 주세요.</p>}
      <footer className="create-exercise-actions">
        <button className="secondary-button" type="button" onClick={onClose}>취소</button>
        <button className="primary-button" type="submit" disabled={!canSave}>{createMutation.isPending ? '저장 중…' : '만들고 추가'}</button>
      </footer>
    </form>
  </Overlay>
}
