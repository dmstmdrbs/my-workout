import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ImageDown, RefreshCw } from 'lucide-react'
import { fromLocalDateKey, getDayEnd, toLocalDateKey } from '../../lib/week'
import { completedSetCount } from '../../lib/volume'
import { recordsQueryKey, useAppServices } from '../../services'
import type { WorkoutSession } from '../../types/domain'
import { RecordsCalendar } from './RecordsCalendar'
import { formatWorkoutDuration } from './workoutShareFormat'
import './Records.css'

const emptySessions: WorkoutSession[] = []

/**
 * 기록 탭. 달력에서 날짜를 고르면 그 날 한 운동들이 아래(데스크톱은 옆)에
 * 목록으로 나오고, 목록에서 하나를 고르면 `/records/:sessionId` 상세로 간다.
 *
 * 예전에는 이 화면이 달력·전체 목록·상세를 한꺼번에 담고 있었다. 전체 목록은
 * 없앴다 -- 날짜별 목록이 생기면서 한 화면에 목록이 둘이 되고, 무엇을 봐야
 * 하는지가 모호해졌다. 기간을 건너뛰는 탐색은 달력이 맡는다.
 */
export function Records({ selectedDateKey, onSelectDay, onSelectSession }: {
  /** 보고 있는 날짜(`YYYY-MM-DD`). null이면 가장 최근에 운동한 날을 연다. */
  selectedDateKey: string | null
  onSelectDay: (dateKey: string) => void
  onSelectSession: (sessionId: string) => void
}) {
  const { workoutRepository } = useAppServices()

  // 날짜를 고르지 않고 들어왔을 때 열어 줄 날. 오늘로 두면 대부분의 방문이 빈
  // 목록으로 시작한다. 세션 목록 전체를 받지 않도록 한 건만 요청한다
  // (AGENTS.md 11번 규칙).
  const latestQuery = useQuery({
    queryKey: recordsQueryKey.latestSession,
    queryFn: () => workoutRepository.listSessions({ status: 'completed', limit: 1 }),
    enabled: selectedDateKey === null,
  })

  const latestDateKey = latestQuery.data?.[0]
    ? toLocalDateKey(new Date(latestQuery.data[0].startedAt))
    : null
  const activeDateKey = selectedDateKey ?? latestDateKey

  const dayQuery = useQuery({
    queryKey: recordsQueryKey.day(activeDateKey),
    queryFn: () => {
      const dayStart = fromLocalDateKey(activeDateKey as string)
      return workoutRepository.listSessions({
        status: 'completed',
        startedAfter: dayStart.toISOString(),
        startedBefore: getDayEnd(dayStart).toISOString(),
      })
    },
    enabled: activeDateKey !== null,
  })

  // 하루 안에서는 먼저 한 운동이 위로 오는 게 자연스럽다. `listSessions`는
  // 최신순이라 뒤집는다.
  const daySessions = useMemo(
    () => [...(dayQuery.data ?? emptySessions)].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    [dayQuery.data],
  )

  const hasNoRecordsAtAll = selectedDateKey === null && latestQuery.isSuccess && latestDateKey === null

  return (
    <main className="records-page">
      <section className="records-heading" aria-labelledby="records-title">
        <div>
          <p className="eyebrow">HISTORY &amp; SHARE</p>
          <h1 id="records-title">운동 기록</h1>
          <p>달력에서 날짜를 고르면 그 날 한 운동을 볼 수 있어요.</p>
        </div>
      </section>

      {hasNoRecordsAtAll ? <RecordsEmpty /> : (
        <div className="records-workspace">
          <RecordsCalendar onSelectDay={onSelectDay} selectedDateKey={activeDateKey} />
          <section className="records-day-panel" aria-label="선택한 날의 운동">
            <div className="records-day-title">
              <h2>{activeDateKey ? formatDayHeading(activeDateKey) : '날짜를 선택하세요'}</h2>
              {daySessions.length > 0 && <span>{daySessions.length}회</span>}
            </div>
            <DayList
              isPending={activeDateKey === null ? latestQuery.isPending : dayQuery.isPending}
              isError={dayQuery.isError || latestQuery.isError}
              onRetry={() => { void dayQuery.refetch(); void latestQuery.refetch() }}
              sessions={daySessions}
              onSelectSession={onSelectSession}
            />
          </section>
        </div>
      )}
    </main>
  )
}

function DayList({ isPending, isError, onRetry, sessions, onSelectSession }: {
  isPending: boolean
  isError: boolean
  onRetry: () => void
  sessions: WorkoutSession[]
  onSelectSession: (sessionId: string) => void
}) {
  if (isError) {
    return (
      <div className="records-day-status" role="alert">
        이 날의 기록을 불러오지 못했어요.
        <button type="button" className="records-status-retry" onClick={onRetry}>다시 시도</button>
      </div>
    )
  }
  if (isPending) return <div className="records-day-status" aria-live="polite">불러오는 중…</div>
  if (!sessions.length) return <p className="records-day-status">이 날에는 완료한 운동이 없어요.</p>

  return (
    <ul className="records-day-list">
      {sessions.map((session) => (
        <li key={session.id}>
          <button className="record-day-item" type="button" onClick={() => onSelectSession(session.id)}>
            <span className="record-day-time">{formatStartTime(session.startedAt)}</span>
            <strong>{session.routineName ?? '자유 운동'}</strong>
            <span className="record-day-summary">
              {completedSetCount(session)}세트 · {formatWorkoutDuration(session)}
              {session.editedAt && <span className="record-edited-badge">수정됨</span>}
            </span>
            <ChevronRight className="record-day-chevron" size={18} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function RecordsEmpty() {
  return <section className="records-empty">
    <ImageDown size={23} aria-hidden="true" />
    <h2>아직 완료한 운동이 없어요.</h2>
    <p>운동을 완료하면 이곳 달력에 표시되고, 날짜를 눌러 세부 기록을 볼 수 있어요.</p>
  </section>
}

/** 목록을 아예 열지 못한 경우. 라우트가 이 화면 대신 보여 준다. */
export function RecordsError({ onRetry }: { onRetry: () => void }) {
  return <main className="records-page records-message">
    <div className="message-icon"><RefreshCw size={22} /></div>
    <p className="eyebrow">CONNECTION ISSUE</p>
    <h1>운동 기록을 불러오지 못했어요.</h1>
    <p>잠시 후 다시 시도해 주세요.</p>
    <button className="primary-button" type="button" onClick={onRetry}><RefreshCw size={16} /> 다시 시도</button>
  </main>
}

function formatDayHeading(dateKey: string) {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(fromLocalDateKey(dateKey))
}

function formatStartTime(startedAt: string) {
  return new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(new Date(startedAt))
}
