import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Dumbbell, Pencil, Plus, RefreshCw, Search } from 'lucide-react'
import { Overlay } from '../../shared/ui'
import { useAppServices, useSettings } from '../../services'
import type { Equipment, Exercise, ExerciseBrand, MuscleGroup } from '../../types/domain'
import { brandLabel, exerciseCatalogQueryKey, equipmentLabel, equipmentTypes, exerciseBrands, muscleGroups, muscleLabel } from '../../entities/exercise'
import './ExerciseCatalog.css'

/**
 * 이 화면만 보관된 종목까지 조회한다(`includeArchived`). 다른 화면은 옵션 없이
 * 부르므로 보관한 종목이 자연스럽게 빠진다. 캐시 키를 따로 쓰는 이유가 이것이다
 * -- 같은 키를 공유하면 보관함까지 담긴 목록이 종목 추가 시트에도 흘러간다.
 */
type MuscleFilter = MuscleGroup | 'all'
type EquipmentFilter = Equipment | 'all'
type BrandFilter = ExerciseBrand | 'all' | 'none'

const exerciseManagementQueryKey = [...exerciseCatalogQueryKey, 'management'] as const

export function ExerciseCatalog() {
  const { workoutRepository } = useAppServices()
  const settingsQuery = useSettings()
  const [search, setSearch] = useState('')
  const [muscleFilter, setMuscleFilter] = useState<MuscleFilter>('all')
  const [equipmentFilter, setEquipmentFilter] = useState<EquipmentFilter>('all')
  const [brandFilter, setBrandFilter] = useState<BrandFilter>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Exercise | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const exercisesQuery = useQuery({
    queryKey: exerciseManagementQueryKey,
    queryFn: () => workoutRepository.listExercises({ includeArchived: true }),
  })

  const term = search.trim().toLowerCase()
  const exercises = (exercisesQuery.data ?? []).filter((exercise) => {
    if (exercise.isArchived !== showArchived) return false
    if (term && !exercise.name.toLowerCase().includes(term)) return false
    if (muscleFilter !== 'all' && exercise.primaryMuscle !== muscleFilter) return false
    if (equipmentFilter !== 'all' && exercise.equipment !== equipmentFilter) return false
    if (brandFilter === 'none' && exercise.brand) return false
    if (brandFilter !== 'all' && brandFilter !== 'none' && exercise.brand !== brandFilter) return false
    return true
  })

  const archivedCount = (exercisesQuery.data ?? []).filter((exercise) => exercise.isArchived).length

  return (
    <main className="catalog-page" aria-labelledby="catalog-title">
      <section className="catalog-heading">
        <div>
          <p className="eyebrow">EXERCISE CATALOG</p>
          <h1 id="catalog-title">종목 관리</h1>
          <p>기구 제조사를 나눠 두면 같은 이름의 기구라도 기록이 섞이지 않아요.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setIsCreating(true)}>
          <Plus size={17} aria-hidden="true" /> 새 종목
        </button>
      </section>

      <section className="catalog-filters" aria-label="종목 검색과 필터">
        <label className="catalog-search">
          <Search size={15} aria-hidden="true" />
          <input type="search" aria-label="종목 이름 검색" placeholder="종목 이름으로 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label>
          <span>부위</span>
          <select aria-label="부위로 필터" value={muscleFilter} onChange={(event) => setMuscleFilter(event.target.value as MuscleFilter)}>
            <option value="all">전체</option>
            {muscleGroups.map((muscle) => <option value={muscle} key={muscle}>{muscleLabel(muscle)}</option>)}
          </select>
        </label>
        <label>
          <span>장비</span>
          <select aria-label="장비로 필터" value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value as EquipmentFilter)}>
            <option value="all">전체</option>
            {equipmentTypes.map((equipment) => <option value={equipment} key={equipment}>{equipmentLabel(equipment)}</option>)}
          </select>
        </label>
        <label>
          <span>브랜드</span>
          <select aria-label="브랜드로 필터" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value as BrandFilter)}>
            <option value="all">전체</option>
            <option value="none">브랜드 없음</option>
            {exerciseBrands.map((brand) => <option value={brand} key={brand}>{brandLabel(brand)}</option>)}
          </select>
        </label>
      </section>

      <section className="catalog-list-card" aria-labelledby="catalog-list-title">
        <div className="catalog-list-heading">
          <h2 id="catalog-list-title">{showArchived ? '보관함' : '사용 중인 종목'}</h2>
          <button className="secondary-button catalog-archive-toggle" type="button" onClick={() => setShowArchived((current) => !current)}>
            {showArchived ? '사용 중인 종목 보기' : `보관함 보기 (${archivedCount})`}
          </button>
        </div>

        {exercisesQuery.isPending && <p className="catalog-empty">불러오는 중…</p>}
        {exercisesQuery.isError && (
          <div className="catalog-empty">
            <p>종목을 불러오지 못했어요.</p>
            <button className="secondary-button" type="button" onClick={() => void exercisesQuery.refetch()}>
              <RefreshCw size={15} aria-hidden="true" /> 다시 시도
            </button>
          </div>
        )}
        {!exercisesQuery.isPending && !exercisesQuery.isError && exercises.length === 0 && (
          <div className="catalog-empty">
            <Dumbbell size={18} aria-hidden="true" />
            <p>{showArchived ? '보관한 종목이 없어요.' : '조건에 맞는 종목이 없어요.'}</p>
          </div>
        )}

        {exercises.length > 0 && (
          <ul className="catalog-list">
            {exercises.map((exercise) => (
              <li key={exercise.id}>
                <button className="catalog-item" type="button" onClick={() => setEditing(exercise)} aria-label={`${exercise.name} 수정`}>
                  <span className="catalog-item-copy">
                    <strong>
                      {exercise.brand && <span className="exercise-brand-badge">{brandLabel(exercise.brand)}</span>}
                      <span className="catalog-item-title">{exercise.name}</span>
                    </strong>
                    <small>{muscleLabel(exercise.primaryMuscle)} · {equipmentLabel(exercise.equipment)} · 휴식 {exercise.defaultRestSeconds}초</small>
                  </span>
                  <Pencil size={16} aria-hidden="true" />
                </button>
                <ArchiveButton exercise={exercise} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ExerciseFormDialog
        key={editing?.id ?? (isCreating ? 'new' : 'closed')}
        exercise={editing}
        isOpen={isCreating || editing !== null}
        defaultRestSeconds={settingsQuery.data?.defaultRestSeconds ?? 90}
        onClose={() => { setEditing(null); setIsCreating(false) }}
      />
    </main>
  )
}

/**
 * 보관은 삭제가 아니다. 과거 기록이 `exerciseId`로 이 행을 참조하고 있어
 * 지우면 기록이 깨진다. 보관하면 종목 추가 시트에서만 사라지고 기록은 남는다.
 */
function ArchiveButton({ exercise }: { exercise: Exercise }) {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => workoutRepository.saveExercise({
      id: exercise.id,
      name: exercise.name,
      primaryMuscle: exercise.primaryMuscle,
      secondaryMuscles: exercise.secondaryMuscles,
      equipment: exercise.equipment,
      brand: exercise.brand,
      defaultRestSeconds: exercise.defaultRestSeconds,
      isArchived: !exercise.isArchived,
    }),
    onSuccess: () => invalidateExerciseCaches(queryClient),
  })

  return (
    <button
      className="catalog-archive-button"
      type="button"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      aria-label={exercise.isArchived ? `${exercise.name} 보관 해제` : `${exercise.name} 보관`}
    >
      {exercise.isArchived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
    </button>
  )
}

function ExerciseFormDialog({ exercise, isOpen, defaultRestSeconds, onClose }: {
  exercise: Exercise | null
  isOpen: boolean
  defaultRestSeconds: number
  onClose: () => void
}) {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const [name, setName] = useState(exercise?.name ?? '')
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup>(exercise?.primaryMuscle ?? 'chest')
  const [equipment, setEquipment] = useState<Equipment>(exercise?.equipment ?? 'machine')
  const [brand, setBrand] = useState<ExerciseBrand | null>(exercise?.brand ?? null)
  const [restSeconds, setRestSeconds] = useState(exercise?.defaultRestSeconds ?? defaultRestSeconds)

  const saveMutation = useMutation({
    mutationFn: () => workoutRepository.saveExercise({
      ...(exercise ? { id: exercise.id } : {}),
      name: name.trim(),
      primaryMuscle,
      secondaryMuscles: exercise?.secondaryMuscles ?? [],
      equipment,
      brand,
      defaultRestSeconds: restSeconds,
      isArchived: exercise?.isArchived ?? false,
    }),
    onSuccess: () => {
      invalidateExerciseCaches(queryClient)
      onClose()
    },
  })
  const resetMutation = saveMutation.reset

  useEffect(() => {
    if (!isOpen) return
    resetMutation()
  }, [isOpen, resetMutation])

  const canSave = name.trim().length > 0 && !saveMutation.isPending
  const title = exercise ? '종목 수정' : '새 종목 만들기'

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    saveMutation.mutate()
  }

  return (
    <Overlay isOpen={isOpen} onClose={onClose} presentation="dialog" labelledBy="catalog-form-title" className="catalog-form-dialog">
      <h2 id="catalog-form-title">{title}</h2>
      <form className="catalog-form" onSubmit={handleSubmit}>
        <label>
          <span>종목 이름</span>
          <input aria-label="종목 이름" value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 체스트 프레스" data-overlay-initial-focus />
        </label>
        <label>
          <span>브랜드</span>
          <select aria-label="종목 브랜드" value={brand ?? ''} onChange={(event) => setBrand(event.target.value === '' ? null : event.target.value as ExerciseBrand)}>
            <option value="">없음</option>
            {exerciseBrands.map((item) => <option value={item} key={item}>{brandLabel(item)}</option>)}
          </select>
          <small className="catalog-form-hint">목록에 없는 제조사는 종목 이름에 적어 주세요.</small>
        </label>
        <label>
          <span>주요 부위</span>
          <select aria-label="종목 주요 부위" value={primaryMuscle} onChange={(event) => setPrimaryMuscle(event.target.value as MuscleGroup)}>
            {muscleGroups.map((muscle) => <option value={muscle} key={muscle}>{muscleLabel(muscle)}</option>)}
          </select>
        </label>
        <label>
          <span>장비</span>
          <select aria-label="종목 장비" value={equipment} onChange={(event) => setEquipment(event.target.value as Equipment)}>
            {equipmentTypes.map((item) => <option value={item} key={item}>{equipmentLabel(item)}</option>)}
          </select>
        </label>
        <label>
          <span>기본 휴식 시간 (초)</span>
          <input aria-label="종목 기본 휴식 시간(초)" type="number" inputMode="numeric" min="0" step="5" value={restSeconds} onChange={(event) => setRestSeconds(Math.max(0, Number(event.target.value) || 0))} />
        </label>

        {exercise && (
          <p className="catalog-form-note">
            이미 기록한 운동의 종목 이름은 바뀌지 않아요. 그때 쓴 기구 그대로 남습니다.
          </p>
        )}
        {saveMutation.isError && <p className="catalog-form-error" role="alert">종목을 저장하지 못했어요. 다시 시도해 주세요.</p>}

        <footer className="catalog-form-actions">
          <button className="secondary-button" type="button" onClick={onClose}>취소</button>
          <button className="primary-button" type="submit" disabled={!canSave}>{saveMutation.isPending ? '저장 중…' : '저장'}</button>
        </footer>
      </form>
    </Overlay>
  )
}

/** 카탈로그를 캐싱하는 세 화면이 서로 다른 키를 쓴다. 한 곳에서 모두 갱신한다. */
function invalidateExerciseCaches(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: exerciseCatalogQueryKey })
}
