import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ImageDown, Plus, RefreshCw, Save } from 'lucide-react'
import { Overlay } from '../../shared/ui'
import { invalidateWorkoutSessionQueries, recordEditExerciseQueryKey, useAppServices, useSettings, workoutRecordQueryKey } from '../../services'
import type { WorkoutExercise, WorkoutSession, WorkoutSetRecord } from '../../types/domain'
import { muscleLabel } from '../../entities/exercise'
import { SetRow, WorkoutExercisePanel } from '../../entities/workout'
// 로딩·오류·찾을 수 없음 화면과 확인 대화상자는 기록 화면의 클래스를 그대로
// 쓴다. /records/:id/edit로 바로 들어오면 Records는 마운트되지 않으므로 이
// 화면이 직접 import해야 스타일이 붙는다.
import './Records.css'
import './RecordEditor.css'

/**
 * 완료된 운동 기록을 고치는 화면.
 *
 * 저장은 새 API가 아니라 기존 `saveSession`을 그대로 쓴다. 세션 id를 함께
 * 보내면 저장소가 세션 행을 갱신하고 하위 종목·세트를 한 트랜잭션에서 전부
 * 교체한다(`save_workout_session`).
 *
 * 화면에는 **완료된 세트만** 보여준다. 기록 상세와 같은 기준이라, 그 화면에
 * 없던 세트가 편집 화면에서 갑자기 나타나는 일이 없다. 완료되지 않은 세트는
 * 저장 payload에 그대로 실어 보낸다 -- 편집이 눈에 보이지 않는 데이터를 조용히
 * 지우면 안 된다.
 *
 * 고칠 수 없는 것: 목표 RIR(루틴 처방이므로 실제 기록을 고치다 바뀌면 안 된다),
 * 종목 구성, 시작·종료 시각.
 */
export function RecordEditor({ sessionId, onDone, onDirtyChange }: {
  sessionId: string
  /** 저장 또는 취소로 편집이 끝났을 때. 기록 상세로 돌려보낸다. */
  onDone: () => void
  /** 고친 내용이 남아 있는지. 앱 셸이 다른 화면으로 나가려 할 때 확인을 띄운다. */
  onDirtyChange?: (isDirty: boolean) => void
}) {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const settingsQuery = useSettings()

  const sessionQuery = useQuery({
    queryKey: workoutRecordQueryKey.byId(sessionId),
    queryFn: () => workoutRepository.getSession(sessionId),
  })

  // 보관 처리된 종목의 과거 기록도 열 수 있어야 하므로 보관 포함으로 읽는다.
  // 여기서 필요한 것은 장비 종류뿐이다 -- 유산소는 중량·횟수 대신 시간·거리를
  // 받고, 맨몸은 중량 칸의 이름이 "추가 중량"이 된다.
  const exercisesQuery = useQuery({
    queryKey: recordEditExerciseQueryKey,
    queryFn: () => workoutRepository.listExercises({ includeArchived: true }),
  })

  const [edit, setEdit] = useState<EditState | null>(null)
  const [isDiscardPending, setIsDiscardPending] = useState(false)

  const loaded = sessionQuery.data ?? null

  // 초기값은 세션당 정확히 한 번만 넣는다. `useEffect`로 `loaded`를 따라가면
  // 창 포커스 복귀나 다른 화면의 무효화로 이 쿼리가 다시 불릴 때 고치던 값이
  // 조용히 되돌아간다.
  if (loaded && edit?.sessionId !== loaded.id) {
    const exercises = loaded.exercises.map((exercise) => ({ ...exercise, sets: renumberSets(exercise.sets) }))
    const notes = loaded.notes ?? ''
    setEdit({ sessionId: loaded.id, exercises, notes, baseline: signature(exercises, notes) })
  }

  const isDirty = edit !== null && signature(edit.exercises, edit.notes) !== edit.baseline

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  // 화면을 떠날 때는 고친 내용이 남아 있어도 앱 셸의 확인이 더 이상 필요 없다.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  useEffect(() => {
    if (!isDirty) return
    const protectEditOnUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectEditOnUnload)
    return () => window.removeEventListener('beforeunload', protectEditOnUnload)
  }, [isDirty])

  const catalogByExerciseId = useMemo(
    () => new Map((exercisesQuery.data ?? []).map((exercise) => [exercise.id, exercise])),
    [exercisesQuery.data],
  )

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!loaded || !edit) throw new Error('편집할 기록을 불러오지 못했어요.')
      return workoutRepository.saveSession({
        id: loaded.id,
        routineId: loaded.routineId,
        routineName: loaded.routineName,
        status: loaded.status,
        startedAt: loaded.startedAt,
        completedAt: loaded.completedAt,
        pausedSeconds: loaded.pausedSeconds,
        notes: edit.notes.trim() === '' ? null : edit.notes,
        exercises: edit.exercises.map((exercise) => ({ ...exercise, sets: renumberSets(exercise.sets) })),
      })
    },
    onSuccess: () => {
      onDirtyChange?.(false)
      queryClient.removeQueries({ queryKey: workoutRecordQueryKey.byId(sessionId) })
      // 기록 삭제와 같은 이유로 기다리지 않는다. 의존 쿼리가 모두 다시 불릴
      // 때까지 편집 화면에 머무르면 저장이 끝났는데도 멈춰 있는 것처럼 보인다.
      void invalidateWorkoutSessionQueries(queryClient)
      onDone()
    },
  })

  const updateSet = (exerciseId: string, setId: string, changes: Partial<WorkoutSetRecord>) => {
    setEdit((current) => current && {
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id !== exerciseId ? exercise : {
        ...exercise,
        sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...changes } : set),
      }),
    })
  }

  const addSet = (exerciseId: string) => {
    if (!loaded) return
    setEdit((current) => current && {
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id !== exerciseId ? exercise : {
        ...exercise,
        sets: renumberSets([...exercise.sets, createEditedSet(exercise, loaded)]),
      }),
    })
  }

  const removeSet = (exerciseId: string, setId: string) => {
    setEdit((current) => current && {
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id !== exerciseId ? exercise : {
        ...exercise,
        sets: renumberSets(exercise.sets.filter((set) => set.id !== setId)),
      }),
    })
  }

  const requestClose = () => {
    if (isDirty) setIsDiscardPending(true)
    else onDone()
  }

  if (sessionQuery.isPending || settingsQuery.isPending || exercisesQuery.isPending) return <EditorLoading />
  if (sessionQuery.isError || settingsQuery.isError || exercisesQuery.isError || !settingsQuery.data) {
    return <EditorError onRetry={() => {
      void sessionQuery.refetch()
      void settingsQuery.refetch()
      void exercisesQuery.refetch()
    }} />
  }
  if (loaded === null) return <EditorNotFound />
  if (!edit) return <EditorLoading />

  const { weightUnit, rirInputEnabled } = settingsQuery.data

  return (
    <main className="record-editor-page">
      <header className="record-editor-header">
        <div>
          <button className="record-editor-back" type="button" onClick={requestClose}>
            <ArrowLeft size={16} aria-hidden="true" /> 기록으로 돌아가기
          </button>
          <h1>기록 수정</h1>
          <p>{loaded.routineName ?? '자유 운동'} · {formatDateFull(loaded.startedAt)}</p>
        </div>
      </header>

      <p className="record-editor-scope">
        완료한 세트의 값과 세트 수, 운동 메모만 고칠 수 있어요. 목표 RIR과 종목 구성, 운동 시각은 그대로 유지돼요.
      </p>

      <div className="record-editor-cards">
        {edit.exercises.map((exercise) => {
          const completed = exercise.sets.filter((set) => set.isCompleted)
          if (!completed.length) return null
          const catalogExercise = catalogByExerciseId.get(exercise.exerciseId)
          // 카탈로그에서 종목을 못 찾으면(지워진 종목의 과거 기록) 세트에 적힌
          // 값으로 판정한다. 유산소가 아니면 시간·거리가 채워질 일이 없어
          // 기록 상세가 쓰는 것과 같은 기준이다.
          const isCardio = catalogExercise
            ? catalogExercise.equipment === 'cardio'
            : exercise.sets.some((set) => set.durationSeconds !== null || set.distanceKm !== null)
          const isBodyweight = catalogExercise?.equipment === 'bodyweight'
          const weightShortLabel = isBodyweight ? '추가 중량' : '중량'
          const weightLabel = `${weightShortLabel} (${weightUnit})`
          const titleId = `record-editor-exercise-${exercise.id}`

          return (
            <WorkoutExercisePanel
              key={exercise.id}
              titleId={titleId}
              exerciseName={exercise.exerciseName}
              primaryMuscleLabel={muscleLabel(exercise.primaryMuscle)}
              notes={exercise.notes}
            >

              <div className="set-table" role="region" aria-label={`${exercise.exerciseName} 세트 기록`} tabIndex={0}>
                <div className={`set-row set-table-head ${rirInputEnabled ? '' : 'is-rir-hidden'}`} aria-hidden="true">
                  <span>세트</span>
                  <span>{isCardio ? '시간 (분)' : weightLabel}</span>
                  <span>{isCardio ? '거리 (km)' : '횟수'}</span>
                  <span>목표 RIR</span>
                  {rirInputEnabled && <span>실제 RIR</span>}
                  <span />
                </div>
                {completed.map((set) => <SetRow
                  key={set.id}
                  set={set}
                  weightUnit={weightUnit}
                  weightLabel={weightLabel}
                  weightShortLabel={weightShortLabel}
                  isBodyweight={isBodyweight}
                  isCardio={isCardio}
                  rirInputEnabled={rirInputEnabled}
                  onChange={(changes) => updateSet(exercise.id, set.id, changes)}
                  onDelete={() => removeSet(exercise.id, set.id)}
                  // 완료 세트를 0개로 만들면 이 종목이 기록에서 통째로 사라진다.
                  // 그건 세트 삭제가 아니라 종목 삭제이고 이 화면의 범위가 아니다.
                  deleteDisabledReason={completed.length === 1 ? '종목의 마지막 세트는 지울 수 없어요.' : undefined}
                />)}
              </div>
              <button className="add-set-button" type="button" aria-label={`${exercise.exerciseName} 세트 추가`} onClick={() => addSet(exercise.id)}>
                <Plus size={17} aria-hidden="true" /> 세트 추가
              </button>
            </WorkoutExercisePanel>
          )
        })}

        <section className="record-editor-notes" aria-labelledby="record-editor-notes-title">
          <h2 id="record-editor-notes-title">운동 메모</h2>
          <textarea
            aria-label="운동 메모"
            rows={3}
            placeholder="그날의 컨디션이나 다음에 기억할 것을 적어 두세요."
            value={edit.notes}
            onChange={(event) => setEdit((current) => current && { ...current, notes: event.target.value })}
          />
        </section>
      </div>

      {saveMutation.isError && (
        <p className="record-editor-error" role="alert">기록을 저장하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.</p>
      )}

      <div className="record-editor-actionbar">
        <button className="secondary-button" type="button" onClick={requestClose} disabled={saveMutation.isPending}>취소</button>
        <button className="primary-button" type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !isDirty}>
          <Save size={16} aria-hidden="true" /> {saveMutation.isPending ? '저장 중…' : '저장하기'}
        </button>
      </div>

      <DiscardEditDialog
        isOpen={isDiscardPending}
        onKeepEditing={() => setIsDiscardPending(false)}
        onDiscard={() => { setIsDiscardPending(false); onDirtyChange?.(false); onDone() }}
      />
    </main>
  )
}

interface EditState {
  sessionId: string
  exercises: WorkoutExercise[]
  notes: string
  /** 초기값의 지문. 이것과 다르면 고친 내용이 남아 있다는 뜻이다. */
  baseline: string
}

function signature(exercises: WorkoutExercise[], notes: string) {
  return JSON.stringify({ exercises, notes })
}

/**
 * 세트 번호를 1부터 다시 매긴다. 완료된 세트가 앞, 완료되지 않은 세트가 뒤다.
 *
 * 번호를 다시 매기지 않으면 가운데 세트를 지운 뒤 화면에 1, 3세트가 남고 저장
 * payload도 그렇게 나간다. 저장소의 `unique (workout_exercise_id, set_order)`가
 * 깨지지는 않지만, 세트 번호가 "몇 번째로 수행했는지"를 뜻하는 값이라 구멍이
 * 남으면 거짓이 된다. 완료되지 않은 세트를 뒤로 미는 것도 같은 제약 때문이다 --
 * 화면에 없는 세트가 완료 세트와 같은 번호를 가지면 저장이 실패한다.
 */
function renumberSets(sets: WorkoutSetRecord[]): WorkoutSetRecord[] {
  const completed = sets.filter((set) => set.isCompleted)
  const pending = sets.filter((set) => !set.isCompleted)
  return [
    ...completed.map((set, index) => ({ ...set, setOrder: index + 1 })),
    ...pending.map((set, index) => ({ ...set, setOrder: completed.length + index + 1 })),
  ]
}

/**
 * 편집 중에 더하는 세트. 값은 그 종목의 마지막 완료 세트를 본뜬다 -- 빼먹은
 * 세트를 채우는 경우가 대부분이라 직전 세트와 비슷할 가능성이 높다.
 *
 * `completedAt`은 **세션의 완료 시각**이다. 지금 시각을 넣으면 3일 전 운동에
 * 오늘 날짜가 박혀 거짓이 되고, 저장소의
 * `check ((is_completed and completed_at is not null) or ...)` 제약 때문에
 * 비워 둘 수도 없다.
 */
function createEditedSet(exercise: WorkoutExercise, session: WorkoutSession): WorkoutSetRecord {
  const template = exercise.sets.filter((set) => set.isCompleted).at(-1) ?? null
  return {
    id: createId(),
    setOrder: 0, // renumberSets가 정한다.
    setType: 'working',
    weightKg: template?.weightKg ?? null,
    reps: template?.reps ?? null,
    durationSeconds: template?.durationSeconds ?? null,
    distanceKm: template?.distanceKm ?? null,
    targetRir: template?.targetRir ?? null,
    actualRir: template?.actualRir ?? null,
    restSeconds: template?.restSeconds ?? null,
    isCompleted: true,
    completedAt: session.completedAt ?? session.startedAt,
    notes: null,
  }
}

function createId() { return globalThis.crypto?.randomUUID?.() ?? `record-set-${Date.now()}-${Math.random().toString(36).slice(2)}` }

function DiscardEditDialog({ isOpen, onKeepEditing, onDiscard }: { isOpen: boolean; onKeepEditing: () => void; onDiscard: () => void }) {
  return (
    <Overlay isOpen={isOpen} onClose={onKeepEditing} presentation="dialog" labelledBy="discard-edit-title" describedBy="discard-edit-description" className="record-delete-dialog">
      <p className="eyebrow">DISCARD CHANGES</p>
      <h2 id="discard-edit-title">고친 내용을 버릴까요?</h2>
      <p id="discard-edit-description">저장하지 않은 수정은 사라지고, 기록은 고치기 전 상태로 남아요.</p>
      <div className="record-delete-actions">
        <button className="secondary-button" type="button" onClick={onKeepEditing} data-overlay-initial-focus>계속 편집</button>
        <button className="record-delete-confirm" type="button" onClick={onDiscard}>버리기</button>
      </div>
    </Overlay>
  )
}

function EditorLoading() {
  return <main className="record-editor-page" aria-label="편집할 기록을 불러오는 중">
    <div className="skeleton-line small" />
    <div className="skeleton-line title" />
    <div className="skeleton-card records-detail-skeleton" />
  </main>
}

function EditorError({ onRetry }: { onRetry: () => void }) {
  return <main className="record-editor-page records-message">
    <div className="message-icon"><RefreshCw size={22} /></div>
    <p className="eyebrow">CONNECTION ISSUE</p>
    <h1>편집할 기록을 불러오지 못했어요.</h1>
    <p>잠시 후 다시 시도해 주세요.</p>
    <button className="primary-button" type="button" onClick={onRetry}><RefreshCw size={16} /> 다시 시도</button>
  </main>
}

function EditorNotFound() {
  return <main className="record-editor-page records-message">
    <div className="message-icon"><ImageDown size={22} /></div>
    <p className="eyebrow">NOT FOUND</p>
    <h1>기록을 찾을 수 없어요.</h1>
    <p>주소가 잘못되었거나 삭제된 기록일 수 있어요.</p>
  </main>
}

function formatDateFull(date: string) { return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(date)) }
