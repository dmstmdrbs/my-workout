import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageDown, Pencil, RefreshCw, Share2, Trash2, X } from 'lucide-react'
import { Overlay } from '../../components/Overlay'
import { completedSetCount, getSessionVolume } from '../../lib/volume'
import { useAppServices, useSettings } from '../../services'
import type { WorkoutSession, WorkoutSetRecord } from '../../types/domain'
import { muscleLabel } from '../workout/exerciseLabels'
import { RecordsCalendar } from './RecordsCalendar'
import { invalidateRecordQueries } from './recordQueries'
import {
  formatWorkoutDuration,
  formatWorkoutNumber,
  formatWorkoutRir,
  formatWorkoutSet,
} from './workoutShareFormat'
import { WorkoutComplete } from './WorkoutComplete'
import './Records.css'

const emptySessions: WorkoutSession[] = []
// Cursor-paginated page size for the records list. Exported so tests can
// derive how many sessions they need to seed rather than hardcoding a
// number that would silently go stale if this changes.
export const recordsPageSize = 20

export function Records({ initialSelectedSessionId = null, onSelectSession, onEditSession, onClearSelection }: {
  initialSelectedSessionId?: string | null
  onSelectSession?: (sessionId: string) => void
  onEditSession?: (sessionId: string) => void
  onClearSelection?: () => void
}) {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const settingsQuery = useSettings()
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedSessionId)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [sessionPendingDelete, setSessionPendingDelete] = useState<WorkoutSession | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const recordsQuery = useInfiniteQuery({
    queryKey: ['completed-workout-records'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => workoutRepository.listSessions({
      status: 'completed',
      limit: recordsPageSize,
      startedBefore: pageParam,
    }),
    getNextPageParam: (lastPage) =>
      lastPage.length < recordsPageSize ? undefined : lastPage.at(-1)?.startedAt,
  })

  const sessions = useMemo(
    () => recordsQuery.data?.pages.flat() ?? emptySessions,
    [recordsQuery.data],
  )

  // Direct address entry (e.g. /records/:sessionId) can name a session that
  // isn't among the loaded pages yet. Fall back to a single-session lookup;
  // a match already present in the loaded list always wins. This is gated on
  // page 1 having actually resolved (`recordsQuery.data`) so the common case
  // -- the target is already on page 1 -- never fires the fallback query.
  const sessionMissingFromList = Boolean(initialSelectedSessionId)
    && Boolean(recordsQuery.data)
    && !sessions.some((session) => session.id === initialSelectedSessionId)

  const directSessionQuery = useQuery({
    queryKey: ['workout-record', initialSelectedSessionId],
    queryFn: () => workoutRepository.getSession(initialSelectedSessionId as string),
    enabled: sessionMissingFromList,
  })

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId)
      ?? (selectedId && selectedId === directSessionQuery.data?.id ? directSessionQuery.data : null)
      ?? sessions[0]
      ?? null,
    [selectedId, sessions, directSessionQuery.data],
  )

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = recordsQuery
  useEffect(() => {
    const node = loadMoreRef.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage()
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  useEffect(() => {
    setSelectedId(initialSelectedSessionId)
    setIsShareOpen(false)
  }, [initialSelectedSessionId])

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => workoutRepository.deleteSession(sessionId),
    onSuccess: async (_result, deletedId) => {
      // Determine the next visible record before React Query refetches and
      // removes the current selection. The list route can then choose it as
      // its fallback selection without retaining a deleted detail URL.
      const nextSession = sessions.find((session) => session.id !== deletedId) ?? null
      setSessionPendingDelete(null)
      setSelectedId(nextSession?.id ?? null)
      setIsShareOpen(false)

      queryClient.removeQueries({ queryKey: ['workout-record', deletedId] })
      // Do not wait for every dependent query to refetch before leaving a
      // deleted detail URL. During that wait `getSession(deletedId)` resolves
      // to null and creates a visible not-found flash.
      void invalidateRecordQueries(queryClient)

      // A direct `/records/:id` must leave that URL after its resource is
      // deleted. Returning to `/records` also avoids a stale single-record
      // query briefly racing the freshly invalidated list query.
      if (onClearSelection) onClearSelection()
      else if (nextSession) onSelectSession?.(nextSession.id)
    },
  })

  const requestDelete = (session: WorkoutSession) => {
    deleteMutation.reset()
    setSessionPendingDelete(session)
  }

  const closeDeleteDialog = () => {
    if (deleteMutation.isPending) return
    deleteMutation.reset()
    setSessionPendingDelete(null)
  }

  if (recordsQuery.isPending || settingsQuery.isPending || (sessionMissingFromList && directSessionQuery.isPending)) return <RecordsLoading />

  // A failure loading page 1 (no data at all yet) has nothing to show and
  // legitimately owns the whole screen. A failure fetching a *later* page
  // (recordsQuery.data already holds the pages fetched so far) must not wipe
  // out an already-working list/detail/share layout -- that is handled
  // further down as an inline status near the load-more sentinel instead.
  const initialLoadFailed = recordsQuery.isError && !recordsQuery.data
  if (initialLoadFailed || !recordsQuery.data || settingsQuery.isError || !settingsQuery.data) {
    return <RecordsError onRetry={() => { void recordsQuery.refetch(); void settingsQuery.refetch() }} />
  }

  // The fallback single-session lookup failing -- or resolving with `null`,
  // which happens for an unknown/mistyped/deleted session id and is far more
  // likely than a rejection -- must never be papered over by silently
  // falling back to some other session. That would show the user a workout
  // they didn't ask for with no indication anything went wrong.
  if (sessionMissingFromList && (directSessionQuery.isError || directSessionQuery.data === null)) {
    return directSessionQuery.data === null
      ? <RecordsNotFound />
      : <RecordsError onRetry={() => { void directSessionQuery.refetch() }} />
  }

  const nextPageFailed = recordsQuery.isError && Boolean(recordsQuery.data)

  // Mirrors what a list-item click does: select immediately if the session is
  // already among the loaded pages, and always notify `onSelectSession` so the
  // URL stays in sync. A calendar day can name a session outside the loaded
  // pages (an older month scrolled past), in which case `onSelectSession`
  // navigates to `/records/:sessionId` and the existing direct-entry fallback
  // (`directSessionQuery` above) takes it from there -- the same path already
  // used for typed-in URLs.
  const selectSessionFromCalendar = (sessionId: string) => {
    if (sessions.some((session) => session.id === sessionId)) {
      setSelectedId(sessionId)
      setIsShareOpen(false)
    }
    onSelectSession?.(sessionId)
  }

  return (
    <main className="records-page">
      <section className="records-heading" aria-labelledby="records-title">
        <div>
          <p className="eyebrow">HISTORY &amp; SHARE</p>
          <h1 id="records-title">운동 기록</h1>
          <p>완료한 운동을 살펴보고, 나만의 운동 카드를 공유하세요.</p>
        </div>
      </section>

      {sessions.length === 0 ? <RecordsEmpty /> : selectedSession && (
        <div className="records-workspace">
          <aside className="records-navigation" aria-label="운동 기록 탐색">
            <RecordsCalendar onSelectDay={selectSessionFromCalendar} selectedSessionId={selectedSession.id} />
            <section className="records-list-panel" aria-label="완료한 운동 목록">
              <div className="records-list-title"><h2>완료한 운동</h2><span>{sessions.length}회 불러옴</span></div>
              <div className="records-list">
                {sessions.map((session) => (
                  <button
                    className={`record-list-item ${selectedSession.id === session.id ? 'is-selected' : ''}`}
                    key={session.id}
                    type="button"
                    onClick={() => { setSelectedId(session.id); setIsShareOpen(false); onSelectSession?.(session.id) }}
                    aria-pressed={selectedSession.id === session.id}
                  >
                    <span className="record-list-date">{formatDateShort(session.startedAt)}</span>
                    <strong>{session.routineName ?? '자유 운동'}</strong>
                    <span>{completedSetCount(session)}세트 · {formatWorkoutDuration(session)}</span>
                  </button>
                ))}
                {/* This div must pre-exist so `aria-live` is registered before its
                    content changes -- a live region mounted together with its
                    text is not reliably announced. It also carries loadMoreRef,
                    so it stays mounted across every page fetch regardless of
                    status text. The failure branch is a separate sibling with
                    role="alert" so an alert is never nested inside a status
                    region. */}
                <div className="records-list-status" ref={loadMoreRef} aria-live="polite">
                  {!nextPageFailed && (recordsQuery.isFetchingNextPage
                    ? '불러오는 중…'
                    : !recordsQuery.hasNextPage
                      ? '모든 기록을 불러왔어요.'
                      : null)}
                </div>
                {nextPageFailed && (
                  <div className="records-list-status" role="alert">
                    다음 페이지를 불러오지 못했어요.
                    <button type="button" className="records-status-retry" onClick={() => void recordsQuery.fetchNextPage()}>다시 시도</button>
                  </div>
                )}
              </div>
            </section>

          </aside>
          <div className="records-content">
            <section className="record-detail" aria-labelledby="record-detail-title">
              <header className="record-detail-heading">
                <div>
                  <p className="eyebrow">{formatDateFull(selectedSession.startedAt)}</p>
                  <h2 id="record-detail-title">{selectedSession.routineName ?? '자유 운동'}</h2>
                  <p>
                    {formatWorkoutDuration(selectedSession)} · {selectedSession.exercises.length}개 종목 · 완료 {completedSetCount(selectedSession)}세트
                    {selectedSession.editedAt && <span className="record-edited-badge" title={`${formatDateFull(selectedSession.editedAt)}에 수정`}>수정됨</span>}
                  </p>
                </div>
                <div className="record-detail-actions">
                  <div className="record-volume"><span>총 볼륨</span><strong>{formatWorkoutNumber(getSessionVolume(selectedSession))} <small>{settingsQuery.data.weightUnit}</small></strong></div>
                  <div className="record-detail-buttons record-action-buttons">
                    <button className="record-share-button" type="button" onClick={() => setIsShareOpen(true)}>
                      <Share2 size={15} aria-hidden="true" /> 공유
                    </button>
                    <button className="record-edit-button" type="button" onClick={() => onEditSession?.(selectedSession.id)}>
                      <Pencil size={15} aria-hidden="true" /> 수정
                    </button>
                    <button className="record-delete-button" type="button" onClick={() => requestDelete(selectedSession)}>
                      <Trash2 size={15} aria-hidden="true" /> 삭제
                    </button>
                  </div>
                </div>
              </header>

              <div className="record-exercises" aria-label="운동 상세">
                {selectedSession.exercises.map((exercise) => {
                  const completed = exercise.sets.filter((set) => set.isCompleted)
                  if (!completed.length) return null
                  return (
                    <article className="record-exercise" key={exercise.id}>
                      <header><div><span className="muscle-label">{muscleLabel(exercise.primaryMuscle)}</span><h3>{exercise.exerciseName}</h3></div><span>{completed.length}세트</span></header>
                      <div className="completed-set-list">
                        {completed.map((set) => <CompletedSetRow key={set.id} set={set} weightUnit={settingsQuery.data.weightUnit} />)}
                      </div>
                    </article>
                  )
                })}
              </div>
              {selectedSession.notes && <p className="record-note"><strong>메모</strong>{selectedSession.notes}</p>}
            </section>

          </div>
        </div>
      )}
      {selectedSession && <Overlay isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} presentation="fullscreen" labelledBy="record-share-layer-title" className="workout-share-layer">
        <header className="workout-share-layer-header"><div><p className="eyebrow">TRAINLOG SHARE</p><h2 id="record-share-layer-title">운동 기록 공유</h2></div><button className="icon-button" type="button" onClick={() => setIsShareOpen(false)} aria-label="공유 화면 닫기"><X size={20} /></button></header>
        <div className="workout-share-layer-scroll"><WorkoutComplete sessionId={selectedSession.id} variant="share" onClose={() => setIsShareOpen(false)} /></div>
      </Overlay>}
      <DeleteRecordDialog
        session={sessionPendingDelete}
        isDeleting={deleteMutation.isPending}
        isError={deleteMutation.isError}
        onCancel={closeDeleteDialog}
        onConfirm={() => { if (sessionPendingDelete) deleteMutation.mutate(sessionPendingDelete.id) }}
      />
    </main>
  )
}

function CompletedSetRow({ set, weightUnit }: { set: WorkoutSetRecord; weightUnit: string }) {
  return <div className="completed-set-row"><span>{set.setOrder}</span><strong>{formatWorkoutSet(set, weightUnit)}</strong><span>{set.actualRir === null ? 'RIR 미기록' : `실제 RIR ${formatWorkoutRir(set.actualRir)}`}</span></div>
}

function RecordsLoading() { return <main className="records-page" aria-label="운동 기록 불러오는 중"><section className="records-heading skeleton-heading"><div className="skeleton-line small" /><div className="skeleton-line title" /></section><section className="records-skeleton-grid"><div className="skeleton-card records-list-skeleton" /><div className="skeleton-card records-detail-skeleton" /><div className="skeleton-card records-share-skeleton" /></section></main> }
function RecordsError({ onRetry }: { onRetry: () => void }) { return <main className="records-page records-message"><div className="message-icon"><RefreshCw size={22} /></div><p className="eyebrow">CONNECTION ISSUE</p><h1>운동 기록을 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p><button className="primary-button" type="button" onClick={onRetry}><RefreshCw size={16} /> 다시 시도</button></main> }
function RecordsNotFound() { return <main className="records-page records-message"><div className="message-icon"><ImageDown size={22} /></div><p className="eyebrow">NOT FOUND</p><h1>기록을 찾을 수 없어요.</h1><p>주소가 잘못되었거나 삭제된 기록일 수 있어요.</p></main> }
function RecordsEmpty() { return <section className="records-empty"><ImageDown size={23} aria-hidden="true" /><h2>아직 완료한 운동이 없어요.</h2><p>운동을 완료하면 이곳에서 세부 기록을 보고 공유 카드도 만들 수 있어요.</p></section> }

function DeleteRecordDialog({ session, isDeleting, isError, onCancel, onConfirm }: {
  session: WorkoutSession | null
  isDeleting: boolean
  isError: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const isOpen = session !== null
  return (
    <Overlay isOpen={isOpen} onClose={onCancel} presentation="dialog" labelledBy="delete-record-title" describedBy="delete-record-description" className="record-delete-dialog">
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

function formatDateShort(date: string) { return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(date)) }
function formatDateFull(date: string) { return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(date)) }
