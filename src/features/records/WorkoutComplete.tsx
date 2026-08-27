import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, Download, RefreshCw, Share2, SlidersHorizontal } from 'lucide-react'
import { completedSetCount, getSessionVolume } from '../../lib/volume'
import { useAppServices, useSettings } from '../../services'
import { muscleLabel } from '../workout/exerciseLabels'
import {
  formatWorkoutDuration,
  formatWorkoutNumber,
  formatWorkoutRir,
  formatWorkoutSet,
} from './workoutShareFormat'
import { WorkoutShareCard } from './WorkoutShareCard'
import { downloadWorkoutCard, makeWorkoutCardPng, workoutCardFile } from './workoutShareImage'
import './Records.css'
import './WorkoutComplete.css'

type ExportState = 'idle' | 'exporting' | 'sharing' | 'success' | 'error'

export function WorkoutComplete({ sessionId, onViewRecord, onGoHome, onClose, variant = 'completion' }: {
  sessionId: string
  onViewRecord?: () => void
  onGoHome?: () => void
  onClose?: () => void
  variant?: 'completion' | 'share'
}) {
  const { workoutRepository } = useAppServices()
  const settingsQuery = useSettings()
  const sessionQuery = useQuery({
    queryKey: ['workout-record', sessionId],
    queryFn: () => workoutRepository.getSession(sessionId),
  })
  const [includeRir, setIncludeRir] = useState(true)
  const [exportState, setExportState] = useState<ExportState>('idle')
  const [exportMessage, setExportMessage] = useState('')
  const shareCardRef = useRef<HTMLElement>(null)
  const exit = onClose ?? onGoHome ?? (() => undefined)

  useEffect(() => {
    if (settingsQuery.data) setIncludeRir(settingsQuery.data.shareRirByDefault)
  }, [settingsQuery.data])

  if (sessionQuery.isPending || settingsQuery.isPending) return <CompleteMessage label="완료한 운동을 정리하는 중" />
  if (sessionQuery.isError || settingsQuery.isError) return <CompleteError onRetry={() => { void sessionQuery.refetch(); void settingsQuery.refetch() }} />
  if (!sessionQuery.data || !settingsQuery.data) return <CompleteNotFound onGoHome={exit} />

  const session = sessionQuery.data
  const weightUnit = settingsQuery.data.weightUnit
  const isBusy = exportState === 'exporting' || exportState === 'sharing'

  async function createPng() {
    if (!shareCardRef.current) throw new Error('공유 카드를 준비하지 못했어요.')
    return makeWorkoutCardPng(shareCardRef.current)
  }

  async function shareWorkout() {
    setExportState('sharing')
    setExportMessage('공유 이미지를 준비하는 중이에요.')
    let dataUrl: string | null = null
    try {
      dataUrl = await createPng()
      const file = await workoutCardFile(dataUrl, session)
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${session.routineName ?? '운동'} 운동 기록` })
        setExportState('success')
        setExportMessage('공유를 완료했어요.')
        return
      }
      downloadWorkoutCard(dataUrl, session)
      setExportState('success')
      setExportMessage('이 기기에서는 공유 이미지가 PNG로 저장됐어요.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setExportState('idle')
        setExportMessage('공유를 취소했어요.')
        return
      }
      if (dataUrl) {
        downloadWorkoutCard(dataUrl, session)
        setExportState('success')
        setExportMessage('공유창을 열지 못해 PNG 파일로 저장했어요.')
        return
      }
      setExportState('error')
      setExportMessage('공유 이미지를 만들지 못했어요. 다시 시도해 주세요.')
    }
  }

  async function savePng() {
    setExportState('exporting')
    setExportMessage('공유 이미지를 만드는 중이에요.')
    try {
      downloadWorkoutCard(await createPng(), session)
      setExportState('success')
      setExportMessage('PNG 이미지를 저장했어요.')
    } catch {
      setExportState('error')
      setExportMessage('이미지를 만들지 못했어요. 다시 시도해 주세요.')
    }
  }

  return <main className="workout-complete-page">
    <section className="workout-complete-hero" aria-labelledby="workout-complete-title">
      <span className="workout-complete-check"><Check size={25} strokeWidth={3} aria-hidden="true" /></span>
      <p className="eyebrow">{variant === 'share' ? 'WORKOUT SHARE' : 'WORKOUT SAVED'}</p>
      <h1 id="workout-complete-title">{variant === 'share' ? '운동 기록 공유' : '운동을 완료했어요'}</h1>
      <p>{formatCompletedDate(session.startedAt)} · {formatWorkoutDuration(session)}</p>
      <div className="workout-complete-stats" aria-label="완료한 운동 요약">
        <div><strong>{session.exercises.filter((exercise) => exercise.sets.some((set) => set.isCompleted)).length}</strong><span>종목</span></div>
        <div><strong>{completedSetCount(session)}</strong><span>세트</span></div>
        <div><strong>{formatWorkoutNumber(getSessionVolume(session))}</strong><span>볼륨 {weightUnit}</span></div>
      </div>
    </section>

    <section className="workout-complete-record" aria-labelledby="completed-record-title">
      <div className="workout-complete-section-heading"><div><p className="eyebrow">SESSION REVIEW</p><h2 id="completed-record-title">{session.routineName ?? '자유 운동'}</h2></div>{variant === 'completion' && onViewRecord && <button type="button" onClick={onViewRecord}>전체 기록 <ArrowRight size={15} /></button>}</div>
      <div className="workout-complete-exercises">
        {session.exercises.map((exercise) => {
          const sets = exercise.sets.filter((set) => set.isCompleted)
          if (!sets.length) return null
          return <article key={exercise.id}>
            <header><div><span>{muscleLabel(exercise.primaryMuscle)}</span><h3>{exercise.exerciseName}</h3></div><strong>{sets.length}세트</strong></header>
            <ol>{sets.map((set) => <li key={set.id}><span>{set.setOrder}</span><strong>{formatWorkoutSet(set, weightUnit)}</strong><small>{set.actualRir === null ? 'RIR 미기록' : `RIR ${formatWorkoutRir(set.actualRir)}`}</small></li>)}</ol>
          </article>
        })}
      </div>
    </section>

    <section className="workout-complete-share" aria-labelledby="completed-share-title">
      <div className="workout-complete-section-heading"><div><p className="eyebrow">SHARE CARD</p><h2 id="completed-share-title">오늘의 기록 공유</h2></div><button type="button" onClick={() => void savePng()} disabled={isBusy}><Download size={15} /> PNG 저장</button></div>
      <label className="rir-toggle">
        <span><SlidersHorizontal size={16} aria-hidden="true" /> 실제 RIR 표시</span>
        <input type="checkbox" checked={includeRir} onChange={(event) => setIncludeRir(event.target.checked)} />
        <span className="toggle-visual" aria-hidden="true" />
      </label>
      <WorkoutShareCard session={session} weightUnit={weightUnit} includeRir={includeRir} />
      <p className={`export-feedback ${exportState === 'error' ? 'is-error' : ''}`} role="status" aria-live="polite">{exportMessage || '공유 이미지에는 개인 계정 정보가 포함되지 않아요.'}</p>
    </section>

    <div className="share-card-export-target" aria-hidden="true"><WorkoutShareCard ref={shareCardRef} session={session} weightUnit={weightUnit} includeRir={includeRir} /></div>
    <footer className="workout-complete-bottom-actions">
      <button className="secondary-button" type="button" onClick={exit}>{variant === 'share' ? '닫기' : '홈으로'}</button>
      <button className="primary-button" type="button" onClick={() => void shareWorkout()} disabled={isBusy}><Share2 size={18} /> {exportState === 'sharing' ? '준비 중…' : '운동 기록 공유'}</button>
    </footer>
  </main>
}

function CompleteMessage({ label }: { label: string }) { return <main className="workout-complete-page complete-message" aria-label={label}><div className="skeleton-card" /></main> }
function CompleteError({ onRetry }: { onRetry: () => void }) { return <main className="workout-complete-page complete-message"><p className="eyebrow">CONNECTION ISSUE</p><h1>완료 기록을 불러오지 못했어요</h1><button className="primary-button" type="button" onClick={onRetry}><RefreshCw size={16} /> 다시 시도</button></main> }
function CompleteNotFound({ onGoHome }: { onGoHome: () => void }) { return <main className="workout-complete-page complete-message"><p className="eyebrow">NOT FOUND</p><h1>완료 기록을 찾을 수 없어요</h1><button className="primary-button" type="button" onClick={onGoHome}>홈으로</button></main> }
function formatCompletedDate(date: string) { return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(date)) }
