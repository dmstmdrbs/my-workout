import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, X } from 'lucide-react'
import { Overlay } from '../../components/Overlay'
import { useAppServices } from '../../services'
import type { Equipment, Exercise, MuscleGroup } from '../../types/domain'
import { equipmentLabel, equipmentTypes, muscleGroups, muscleLabel } from './exerciseLabels'
import './ExercisePicker.css'

type MuscleFilter = MuscleGroup | 'all'
type EquipmentFilter = Equipment | 'all'

interface ExercisePickerSheetProps {
  isOpen: boolean
  exercises: Exercise[]
  onClose: () => void
  onSelect: (exercise: Exercise) => void
  onOpenCreate: () => void
}

export function ExercisePickerSheet({ isOpen, exercises, onClose, onSelect, onOpenCreate }: ExercisePickerSheetProps) {
  const [search, setSearch] = useState('')
  const [muscleFilter, setMuscleFilter] = useState<MuscleFilter>('all')
  const [equipmentFilter, setEquipmentFilter] = useState<EquipmentFilter>('all')

  useEffect(() => {
    if (!isOpen) return
    setSearch('')
    setMuscleFilter('all')
    setEquipmentFilter('all')
  }, [isOpen])

  const term = search.trim().toLowerCase()
  const filtered = exercises.filter((exercise) => {
    if (term && !exercise.name.toLowerCase().includes(term)) return false
    if (muscleFilter !== 'all' && exercise.primaryMuscle !== muscleFilter) return false
    if (equipmentFilter !== 'all' && exercise.equipment !== equipmentFilter) return false
    return true
  })

  return <Overlay isOpen={isOpen} onClose={onClose} presentation="sheet" labelledBy="exercise-picker-title" className="exercise-picker-sheet">
    <header className="exercise-picker-header">
      <div><p className="eyebrow">ADD EXERCISE</p><h2 id="exercise-picker-title">종목 추가</h2></div>
      <div className="exercise-picker-header-actions">
        <button className="icon-button" type="button" onClick={onOpenCreate} aria-label="새 운동 만들기"><Plus size={19} /></button>
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
      <label>
        <span className="exercise-picker-filter-label">부위</span>
        <select aria-label="부위로 필터" value={muscleFilter} onChange={(event) => setMuscleFilter(event.target.value as MuscleFilter)}>
          <option value="all">전체</option>
          {muscleGroups.map((muscle) => <option value={muscle} key={muscle}>{muscleLabel(muscle)}</option>)}
        </select>
      </label>
      <label>
        <span className="exercise-picker-filter-label">장비</span>
        <select aria-label="장비로 필터" value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value as EquipmentFilter)}>
          <option value="all">전체</option>
          {equipmentTypes.map((equipment) => <option value={equipment} key={equipment}>{equipmentLabel(equipment)}</option>)}
        </select>
      </label>
    </div>

    <ul className="exercise-picker-list">
      {filtered.map((exercise) => <li key={exercise.id}>
        <button type="button" className="exercise-picker-item" aria-label={exercise.name} onClick={() => onSelect(exercise)}>
          <span className="exercise-picker-item-name">{exercise.name}</span>
          <span className="exercise-picker-item-meta">{muscleLabel(exercise.primaryMuscle)} · {equipmentLabel(exercise.equipment)}</span>
        </button>
      </li>)}
      {filtered.length === 0 && <li className="exercise-picker-empty">조건에 맞는 운동이 없어요. 새로 만들어 보세요.</li>}
    </ul>
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
  const [restSeconds, setRestSeconds] = useState(defaultRestSeconds)

  useEffect(() => {
    if (!isOpen) return
    setName('')
    setPrimaryMuscle('chest')
    setEquipment('barbell')
    setRestSeconds(defaultRestSeconds)
  }, [isOpen, defaultRestSeconds])

  const createMutation = useMutation({
    mutationFn: () => workoutRepository.saveExercise({
      name: name.trim(),
      primaryMuscle,
      secondaryMuscles: [],
      equipment,
      defaultRestSeconds: restSeconds,
      isArchived: false,
    }),
    onSuccess: (exercise) => {
      void queryClient.invalidateQueries({ queryKey: ['workout-runner-setup'] })
      onCreated(exercise)
    },
  })

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
