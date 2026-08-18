import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { toPng } from 'html-to-image'
import { Download, ImageDown, RefreshCw, Share2, SlidersHorizontal } from 'lucide-react'
import { getSessionDurationMinutes } from '../../lib/duration'
import { bestEstimatedOneRepMax } from '../../lib/oneRepMax'
import { completedSetCount, getSessionVolume } from '../../lib/volume'
import { useAppServices, useSettings } from '../../services'
import type { WorkoutSession, WorkoutSetRecord } from '../../types/domain'
import { muscleLabel } from '../workout/exerciseLabels'
import { RecordsCalendar } from './RecordsCalendar'
import './Records.css'

type ExportState = 'idle' | 'exporting' | 'sharing' | 'success' | 'error'

const emptySessions: WorkoutSession[] = []
/**
 * 내보내는 이미지의 CSS 폭. pixelRatio 2와 곱해져 1080px PNG가 된다 -- 폰
 * 갤러리와 공유 시트가 기대하는 세로형 카드 폭이다. 720px이던 시절에는
 * 종목 이름과 세트가 양 끝으로 벌어져 가운데가 텅 빈 채로 뽑혔다.
 */
const shareCardExportWidth = 540
const maxShareCardPixels = 32_000_000

// Cursor-paginated page size for the records list. Exported so tests can
// derive how many sessions they need to seed rather than hardcoding a
// number that would silently go stale if this changes.
export const recordsPageSize = 20

export function Records({ initialSelectedSessionId = null, onSelectSession }: { initialSelectedSessionId?: string | null; onSelectSession?: (sessionId: string) => void }) {
  const { workoutRepository } = useAppServices()
  const settingsQuery = useSettings()
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedSessionId)
  const [includeRir, setIncludeRir] = useState(true)
  const [exportState, setExportState] = useState<ExportState>('idle')
  const [exportMessage, setExportMessage] = useState('')
  const shareCardRef = useRef<HTMLElement>(null)
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
    if (settingsQuery.data) setIncludeRir(settingsQuery.data.shareRirByDefault)
  }, [settingsQuery.data])

  useEffect(() => {
    setSelectedId(initialSelectedSessionId)
    setExportState('idle')
    setExportMessage('')
  }, [initialSelectedSessionId])

  async function makeCardPng() {
    if (!shareCardRef.current) throw new Error('공유 카드를 준비하지 못했어요.')
    const height = Math.ceil(shareCardRef.current.scrollHeight)
    const pixelRatio = Math.min(2, Math.max(1, Math.sqrt(maxShareCardPixels / (shareCardExportWidth * height))))
    return toPng(shareCardRef.current, {
      cacheBust: true,
      backgroundColor: '#111214',
      width: shareCardExportWidth,
      height,
      pixelRatio,
      skipAutoScale: true,
    })
  }

  async function downloadCard() {
    if (!selectedSession) return
    setExportState('exporting')
    setExportMessage('공유 이미지를 만드는 중이에요.')
    try {
      const dataUrl = await makeCardPng()
      downloadDataUrl(dataUrl, shareFileName(selectedSession))
      setExportState('success')
      setExportMessage('PNG 이미지를 저장했어요.')
    } catch {
      setExportState('error')
      setExportMessage('이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.')
    }
  }

  async function shareCard() {
    if (!selectedSession) return
    setExportState('sharing')
    setExportMessage('공유 이미지를 준비하는 중이에요.')
    let dataUrl: string | null = null
    try {
      dataUrl = await makeCardPng()
      const file = await dataUrlToFile(dataUrl, shareFileName(selectedSession))
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${selectedSession.routineName ?? '운동'} 운동 기록` })
        setExportState('success')
        setExportMessage('공유를 완료했어요.')
        return
      }
      downloadDataUrl(dataUrl, file.name)
      setExportState('success')
      setExportMessage('이 브라우저에서는 파일 공유 대신 PNG를 저장했어요.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setExportState('idle')
        setExportMessage('공유를 취소했어요.')
        return
      }
      if (dataUrl) {
        downloadDataUrl(dataUrl, shareFileName(selectedSession))
        setExportState('success')
        setExportMessage('공유창을 열지 못해 PNG 파일로 저장했어요.')
        return
      }
      setExportState('error')
      setExportMessage('공유 이미지를 만들지 못했어요. PNG 저장을 다시 시도해 주세요.')
    }
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
      setExportState('idle')
      setExportMessage('')
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
        <>
          <RecordsCalendar onSelectDay={selectSessionFromCalendar} selectedSessionId={selectedSession.id} />
          <div className="records-layout">
            <aside className="records-list-panel" aria-label="완료한 운동 목록">
              <div className="records-list-title"><h2>완료한 운동</h2><span>{sessions.length}회 불러옴</span></div>
              <div className="records-list">
                {sessions.map((session) => (
                  <button
                    className={`record-list-item ${selectedSession.id === session.id ? 'is-selected' : ''}`}
                    key={session.id}
                    type="button"
                    onClick={() => { setSelectedId(session.id); setExportState('idle'); setExportMessage(''); onSelectSession?.(session.id) }}
                    aria-pressed={selectedSession.id === session.id}
                  >
                    <span className="record-list-date">{formatDateShort(session.startedAt)}</span>
                    <strong>{session.routineName ?? '자유 운동'}</strong>
                    <span>{completedSetCount(session)}세트 · {formatDuration(session)}</span>
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
            </aside>

            <section className="record-detail" aria-labelledby="record-detail-title">
              <header className="record-detail-heading">
                <div>
                  <p className="eyebrow">{formatDateFull(selectedSession.startedAt)}</p>
                  <h2 id="record-detail-title">{selectedSession.routineName ?? '자유 운동'}</h2>
                  <p>{formatDuration(selectedSession)} · {selectedSession.exercises.length}개 종목 · 완료 {completedSetCount(selectedSession)}세트</p>
                </div>
                <div className="record-volume"><span>총 볼륨</span><strong>{formatNumber(getSessionVolume(selectedSession))} <small>{settingsQuery.data.weightUnit}</small></strong></div>
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

            <section className="share-panel" aria-labelledby="share-title">
              <div className="share-panel-heading"><div><p className="eyebrow">WORKOUT CARD</p><h2 id="share-title">공유 카드</h2></div><ImageDown size={19} aria-hidden="true" /></div>
              <label className="rir-toggle">
                <span><SlidersHorizontal size={16} aria-hidden="true" /> 실제 RIR 표시</span>
                <input type="checkbox" checked={includeRir} onChange={(event) => setIncludeRir(event.target.checked)} />
                <span className="toggle-visual" aria-hidden="true" />
              </label>

              <WorkoutShareCard session={selectedSession} weightUnit={settingsQuery.data.weightUnit} includeRir={includeRir} />

              <div className="share-actions">
                <button className="primary-button" type="button" onClick={() => void shareCard()} disabled={exportState === 'exporting' || exportState === 'sharing'}>
                  <Share2 size={16} aria-hidden="true" /> {exportState === 'sharing' ? '준비 중…' : '공유하기'}
                </button>
                <button className="secondary-button share-download" type="button" onClick={() => void downloadCard()} disabled={exportState === 'exporting' || exportState === 'sharing'}>
                  <Download size={16} aria-hidden="true" /> {exportState === 'exporting' ? '생성 중…' : 'PNG 저장'}
                </button>
              </div>
              <p className={`export-feedback ${exportState === 'error' ? 'is-error' : ''}`} role="status" aria-live="polite">{exportMessage || '공유 카드에는 개인 계정 정보가 포함되지 않아요.'}</p>
            </section>
          </div>
        </>
      )}
      {selectedSession && (
        <div className="share-card-export-target" aria-hidden="true">
          <WorkoutShareCard ref={shareCardRef} session={selectedSession} weightUnit={settingsQuery.data.weightUnit} includeRir={includeRir} />
        </div>
      )}
    </main>
  )
}

const ShareCard = ({ session, weightUnit, includeRir, cardRef }: { session: WorkoutSession; weightUnit: string; includeRir: boolean; cardRef: Ref<HTMLElement> }) => (
  <article className="workout-share-card" ref={cardRef} aria-label={`${session.routineName ?? '자유 운동'} 공유 카드`}>
    <header className="share-card-header"><div><span className="share-card-brand">TRAINLOG</span><p>{formatCardDate(session.startedAt)} · {formatDuration(session)}</p></div><span className="share-card-mark">TL</span></header>
    <h3>{session.routineName ?? '자유 운동'}</h3>
    <div className={`share-card-summary ${includeRir ? '' : 'without-rir'}`}><div><strong>{formatNumber(getSessionVolume(session))}</strong><span>총 볼륨 {weightUnit}</span></div><div><strong>{completedSetCount(session)}</strong><span>완료 세트</span></div>{includeRir && <div><strong>{formatAverageRir(session)}</strong><span>평균 실제 RIR</span></div>}</div>
    <div className="share-card-exercises">
      {session.exercises.map((exercise) => {
        const completed = exercise.sets.filter((set) => set.isCompleted)
        if (!completed.length) return null
        const bestEstimate = bestEstimatedOneRepMax(completed)
        return (
          <div className="share-card-exercise" key={exercise.id}>
            <div className="share-card-exercise-name">
              <strong>{exercise.exerciseName}</strong>
              {bestEstimate !== null && <span className="share-card-e1rm">예상 1RM {formatWeight(bestEstimate)}{weightUnit}</span>}
            </div>
            <div className="share-card-exercise-sets">{completed.map((set) => <span key={set.id}>{formatSet(set, weightUnit)}{includeRir && set.actualRir !== null ? ` · RIR ${formatRir(set.actualRir)}` : ''}</span>)}</div>
          </div>
        )
      })}
    </div>
    <footer>TRAIN WITH INTENTION</footer>
  </article>
)

const WorkoutShareCard = forwardRef<HTMLElement, { session: WorkoutSession; weightUnit: string; includeRir: boolean }>(function WorkoutShareCard({ session, weightUnit, includeRir }, cardRef) {
  return <ShareCard session={session} weightUnit={weightUnit} includeRir={includeRir} cardRef={cardRef} />
})

function CompletedSetRow({ set, weightUnit }: { set: WorkoutSetRecord; weightUnit: string }) {
  return <div className="completed-set-row"><span>{set.setOrder}</span><strong>{formatSet(set, weightUnit)}</strong><span>{set.actualRir === null ? 'RIR 미기록' : `실제 RIR ${formatRir(set.actualRir)}`}</span></div>
}

function RecordsLoading() { return <main className="records-page" aria-label="운동 기록 불러오는 중"><section className="records-heading skeleton-heading"><div className="skeleton-line small" /><div className="skeleton-line title" /></section><section className="records-skeleton-grid"><div className="skeleton-card records-list-skeleton" /><div className="skeleton-card records-detail-skeleton" /><div className="skeleton-card records-share-skeleton" /></section></main> }
function RecordsError({ onRetry }: { onRetry: () => void }) { return <main className="records-page records-message"><div className="message-icon"><RefreshCw size={22} /></div><p className="eyebrow">CONNECTION ISSUE</p><h1>운동 기록을 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p><button className="primary-button" type="button" onClick={onRetry}><RefreshCw size={16} /> 다시 시도</button></main> }
function RecordsNotFound() { return <main className="records-page records-message"><div className="message-icon"><ImageDown size={22} /></div><p className="eyebrow">NOT FOUND</p><h1>기록을 찾을 수 없어요.</h1><p>주소가 잘못되었거나 삭제된 기록일 수 있어요.</p></main> }
function RecordsEmpty() { return <section className="records-empty"><ImageDown size={23} aria-hidden="true" /><h2>아직 완료한 운동이 없어요.</h2><p>운동을 완료하면 이곳에서 세부 기록을 보고 공유 카드도 만들 수 있어요.</p></section> }

function getActualRirs(session: WorkoutSession) { return session.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.isCompleted && set.actualRir !== null).map((set) => set.actualRir as number) }
function formatAverageRir(session: WorkoutSession) { const rirs = getActualRirs(session); if (!rirs.length) return '–'; const average = rirs.reduce((sum, value) => sum + value, 0) / rirs.length; return average >= 5 ? '5+' : average.toFixed(1) }
function formatRir(rir: number) { return rir >= 5 ? '5+' : String(rir) }
function formatSet(set: WorkoutSetRecord, weightUnit: string) { return `${formatWeight(set.weightKg)} ${weightUnit} × ${set.reps ?? '–'}` }
function formatWeight(weight: number | null) { return weight === null ? '–' : Number.isInteger(weight) ? String(weight) : weight.toFixed(1) }
function formatNumber(value: number) { return new Intl.NumberFormat('ko-KR').format(Math.round(value)) }
function formatDuration(session: WorkoutSession) { if (!session.completedAt) return '기록 중'; const minutes = getSessionDurationMinutes(session); return minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ''}` }
function formatDateShort(date: string) { return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(date)) }
function formatDateFull(date: string) { return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(date)) }
function formatCardDate(date: string) { return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date)).replace(/\.$/, '') }
function shareFileName(session: WorkoutSession) { const date = new Date(session.startedAt); const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; return `trainlog-${localDate}.png` }
function downloadDataUrl(dataUrl: string, filename: string) { const link = document.createElement('a'); link.href = dataUrl; link.download = filename; document.body.append(link); link.click(); link.remove() }
async function dataUrlToFile(dataUrl: string, filename: string) { const response = await fetch(dataUrl); const blob = await response.blob(); return new File([blob], filename, { type: 'image/png' }) }
