import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ImageDown, Pencil, RefreshCw, Share2, Trash2, X } from 'lucide-react'
import { Overlay } from '../../components/Overlay'
import { toLocalDateKey } from '../../lib/week'
import { completedSetCount, getSessionVolume } from '../../lib/volume'
import { useAppServices, useSettings } from '../../services'
import type { WorkoutSession, WorkoutSetRecord } from '../../types/domain'
import { muscleLabel } from '../workout/exerciseLabels'
import { invalidateRecordQueries } from './recordQueries'
import {
  formatWorkoutDuration,
  formatWorkoutNumber,
  formatWorkoutRir,
  formatWorkoutSet,
} from './workoutShareFormat'
import { WorkoutComplete } from './WorkoutComplete'
import './Records.css'

/**
 * 완료한 운동 하나의 상세. `/records/:sessionId` 전용 화면이다.
 *
 * 목록 화면과 한 화면을 나눠 쓰던 시절에는, 선택한 세션을 무한 목록에서 찾고
 * 없으면 단건 조회로 되돌아가는 두 갈래 경로가 필요했다. 전용 화면이 되면서
 * 조회는 `getSession` 하나로 줄었다.
 */
export function RecordDetail({ sessionId, onBack, onEdit }: {
  sessionId: string
  /** 목록으로 돌아갈 때. 보고 있던 날짜를 함께 넘겨 그 날이 다시 열리게 한다. */
  onBack: (dateKey: string | null) => void
  onEdit: (sessionId: string) => void
}) {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const settingsQuery = useSettings()
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [isDeletePending, setIsDeletePending] = useState(false)

  const sessionQuery = useQuery({
    queryKey: ['workout-record', sessionId],
    queryFn: () => workoutRepository.getSession(sessionId),
  })

  const session = sessionQuery.data ?? null
  const dateKey = session ? toLocalDateKey(new Date(session.startedAt)) : null

  const deleteMutation = useMutation({
    mutationFn: () => workoutRepository.deleteSession(sessionId),
    onSuccess: () => {
      setIsDeletePending(false)
      queryClient.removeQueries({ queryKey: ['workout-record', sessionId] })
      // 의존 쿼리가 모두 다시 불릴 때까지 기다리지 않는다. 그 사이
      // `getSession`은 null을 돌려주므로 "찾을 수 없음"이 잠깐 스쳐 보인다.
      void invalidateRecordQueries(queryClient)
      onBack(dateKey)
    },
  })

  if (sessionQuery.isPending || settingsQuery.isPending) return <DetailLoading />
  if (sessionQuery.isError || settingsQuery.isError || !settingsQuery.data) {
    return <DetailError onRetry={() => { void sessionQuery.refetch(); void settingsQuery.refetch() }} />
  }
  // 없는 id를 조용히 다른 기록으로 대체하지 않는다. 청하지 않은 남의 운동을
  // 보여 주면서 아무 신호도 주지 않는 것이 가장 나쁜 실패다.
  if (session === null) return <DetailNotFound />

  const { weightUnit } = settingsQuery.data

  return (
    <main className="record-detail-page">
      <header className="record-detail-heading">
        <div>
          <button className="record-detail-back" type="button" onClick={() => onBack(dateKey)} aria-label="기록 목록으로 돌아가기">
            <ArrowLeft size={16} aria-hidden="true" /> {formatDateFull(session.startedAt)}
          </button>
          <h1>{session.routineName ?? '자유 운동'}</h1>
          <p>
            {formatWorkoutDuration(session)} · {session.exercises.length}개 종목 · 완료 {completedSetCount(session)}세트
            {session.editedAt && <span className="record-edited-badge" title={`${formatDateFull(session.editedAt)}에 수정`}>수정됨</span>}
          </p>
        </div>
        <div className="record-detail-actions">
          <div className="record-volume"><span>총 볼륨</span><strong>{formatWorkoutNumber(getSessionVolume(session))} <small>{weightUnit}</small></strong></div>
          <div className="record-detail-buttons record-action-buttons">
            <button className="record-share-button" type="button" onClick={() => setIsShareOpen(true)}>
              <Share2 size={15} aria-hidden="true" /> 공유
            </button>
            <button className="record-edit-button" type="button" onClick={() => onEdit(session.id)}>
              <Pencil size={15} aria-hidden="true" /> 수정
            </button>
            <button className="record-delete-button" type="button" onClick={() => { deleteMutation.reset(); setIsDeletePending(true) }}>
              <Trash2 size={15} aria-hidden="true" /> 삭제
            </button>
          </div>
        </div>
      </header>

      <div className="record-exercises" aria-label="운동 상세">
        {session.exercises.map((exercise) => {
          const completed = exercise.sets.filter((set) => set.isCompleted)
          if (!completed.length) return null
          return (
            <article className="record-exercise" key={exercise.id}>
              <header><div><span className="muscle-label">{muscleLabel(exercise.primaryMuscle)}</span><h2>{exercise.exerciseName}</h2></div><span>{completed.length}세트</span></header>
              <div className="completed-set-list">
                {completed.map((set) => <CompletedSetRow key={set.id} set={set} weightUnit={weightUnit} />)}
              </div>
            </article>
          )
        })}
      </div>
      {session.notes && <p className="record-note"><strong>메모</strong>{session.notes}</p>}

      <Overlay isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} presentation="fullscreen" labelledBy="record-share-layer-title" className="workout-share-layer">
        <header className="workout-share-layer-header">
          <div><p className="eyebrow">TRAINLOG SHARE</p><h2 id="record-share-layer-title">운동 기록 공유</h2></div>
          <button className="icon-button" type="button" onClick={() => setIsShareOpen(false)} aria-label="공유 화면 닫기"><X size={20} /></button>
        </header>
        <div className="workout-share-layer-scroll"><WorkoutComplete sessionId={session.id} variant="share" onClose={() => setIsShareOpen(false)} /></div>
      </Overlay>

      <DeleteRecordDialog
        session={isDeletePending ? session : null}
        isDeleting={deleteMutation.isPending}
        isError={deleteMutation.isError}
        onCancel={() => { if (!deleteMutation.isPending) { deleteMutation.reset(); setIsDeletePending(false) } }}
        onConfirm={() => deleteMutation.mutate()}
      />
    </main>
  )
}

function CompletedSetRow({ set, weightUnit }: { set: WorkoutSetRecord; weightUnit: string }) {
  return <div className="completed-set-row"><span>{set.setOrder}</span><strong>{formatWorkoutSet(set, weightUnit)}</strong><span>{set.actualRir === null ? 'RIR 미기록' : `실제 RIR ${formatWorkoutRir(set.actualRir)}`}</span></div>
}

function DeleteRecordDialog({ session, isDeleting, isError, onCancel, onConfirm }: {
  session: WorkoutSession | null
  isDeleting: boolean
  isError: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Overlay isOpen={session !== null} onClose={onCancel} presentation="dialog" labelledBy="delete-record-title" describedBy="delete-record-description" className="record-delete-dialog">
      <p className="eyebrow">DELETE WORKOUT</p>
      <h2 id="delete-record-title">운동 기록을 삭제할까요?</h2>
      <p id="delete-record-description"><strong>{session?.routineName ?? '자유 운동'}</strong> 기록과 세트 정보가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없어요.</p>
      {isError && <p className="record-delete-error" role="alert">기록을 삭제하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.</p>}
      <div className="record-delete-actions">
        <button className="secondary-button" type="button" onClick={onCancel} disabled={isDeleting}>취소</button>
        <button className="record-delete-confirm" type="button" onClick={onConfirm} disabled={isDeleting} data-overlay-initial-focus>
          <Trash2 size={16} aria-hidden="true" /> {isDeleting ? '삭제 중…' : '삭제하기'}
        </button>
      </div>
    </Overlay>
  )
}

function DetailLoading() {
  return <main className="record-detail-page" aria-label="운동 기록 불러오는 중">
    <div className="skeleton-line small" /><div className="skeleton-line title" />
    <div className="skeleton-card records-detail-skeleton" />
  </main>
}

function DetailError({ onRetry }: { onRetry: () => void }) {
  return <main className="record-detail-page records-message">
    <div className="message-icon"><RefreshCw size={22} /></div>
    <p className="eyebrow">CONNECTION ISSUE</p>
    <h1>운동 기록을 불러오지 못했어요.</h1>
    <p>잠시 후 다시 시도해 주세요.</p>
    <button className="primary-button" type="button" onClick={onRetry}><RefreshCw size={16} /> 다시 시도</button>
  </main>
}

function DetailNotFound() {
  return <main className="record-detail-page records-message">
    <div className="message-icon"><ImageDown size={22} /></div>
    <p className="eyebrow">NOT FOUND</p>
    <h1>기록을 찾을 수 없어요.</h1>
    <p>주소가 잘못되었거나 삭제된 기록일 수 있어요.</p>
  </main>
}

function formatDateFull(date: string) { return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(date)) }
