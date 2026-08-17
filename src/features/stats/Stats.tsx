import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, ChevronLeft, ChevronRight, Dumbbell, Minus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { getSessionVolume } from '../../lib/volume'
import { getMondayIndex, getWeekEnd, getWeekStart } from '../../lib/week'
import { useAppServices, useSettings } from '../../services'
import type { MuscleGroup, WorkoutSession } from '../../types/domain'
import { muscleLabel } from '../workout/exerciseLabels'
import './Stats.css'

const dayLabels = ['월', '화', '수', '목', '금', '토', '일']

interface WeeklyStatsData {
  currentSessions: WorkoutSession[]
  previousSessions: WorkoutSession[]
}

type VolumeComparison = { kind: 'no-previous' } | { kind: 'change'; percent: number }

interface MuscleShare {
  muscle: MuscleGroup
  volume: number
}

interface WeeklyOverview {
  volume: number
  dailyVolume: number[]
  maxDailyVolume: number
  muscleDistribution: MuscleShare[]
}

export function Stats() {
  const { workoutRepository } = useAppServices()
  const settingsQuery = useSettings()
  // 0 = this week, negative = weeks in the past. Never allowed to go positive
  // (that would be a future week).
  const [weekOffset, setWeekOffset] = useState(0)

  // Deliberately not memoized with an empty dependency array -- that would
  // freeze "this week" at mount time, so a tab left open across a Sunday
  // midnight would keep treating the old week as current until the
  // component remounts. Recomputing on every render (matching how the
  // dashboard's equivalent re-derives `new Date()` on each query execution)
  // keeps it honest without meaningfully changing what gets rendered, since
  // it only actually changes value once a week boundary is crossed.
  const thisWeekStart = getWeekStart(new Date())
  const selectedWeekStart = useMemo(() => {
    const start = new Date(thisWeekStart)
    start.setDate(start.getDate() + weekOffset * 7)
    return start
  }, [thisWeekStart, weekOffset])
  const selectedWeekEnd = useMemo(() => getWeekEnd(selectedWeekStart), [selectedWeekStart])
  const previousWeekStart = useMemo(() => {
    const start = new Date(selectedWeekStart)
    start.setDate(start.getDate() - 7)
    return start
  }, [selectedWeekStart])

  const isCurrentWeek = weekOffset === 0
  const canGoToNextWeek = weekOffset < 0

  const statsQuery = useQuery({
    queryKey: ['weekly-stats', selectedWeekStart.toISOString()],
    queryFn: async (): Promise<WeeklyStatsData> => {
      const [currentSessions, previousSessions] = await Promise.all([
        workoutRepository.listSessions({
          status: 'completed',
          startedAfter: selectedWeekStart.toISOString(),
          startedBefore: selectedWeekEnd.toISOString(),
        }),
        workoutRepository.listSessions({
          status: 'completed',
          startedAfter: previousWeekStart.toISOString(),
          startedBefore: selectedWeekStart.toISOString(),
        }),
      ])
      return { currentSessions, previousSessions }
    },
  })

  const goToPreviousWeek = () => setWeekOffset((offset) => offset - 1)
  const goToNextWeek = () => setWeekOffset((offset) => Math.min(0, offset + 1))

  if (statsQuery.isPending || settingsQuery.isPending) return <StatsLoading />
  if (statsQuery.isError || !statsQuery.data || settingsQuery.isError || !settingsQuery.data) {
    return <StatsError onRetry={() => { void statsQuery.refetch(); void settingsQuery.refetch() }} />
  }

  return (
    <StatsContent
      data={statsQuery.data}
      weightUnit={settingsQuery.data.weightUnit}
      weekStart={selectedWeekStart}
      weekEnd={selectedWeekEnd}
      isCurrentWeek={isCurrentWeek}
      canGoToNextWeek={canGoToNextWeek}
      onPreviousWeek={goToPreviousWeek}
      onNextWeek={goToNextWeek}
    />
  )
}

function StatsContent({
  data,
  weightUnit,
  weekStart,
  weekEnd,
  isCurrentWeek,
  canGoToNextWeek,
  onPreviousWeek,
  onNextWeek,
}: {
  data: WeeklyStatsData
  weightUnit: string
  weekStart: Date
  weekEnd: Date
  isCurrentWeek: boolean
  canGoToNextWeek: boolean
  onPreviousWeek: () => void
  onNextWeek: () => void
}) {
  const { currentSessions, previousSessions } = data
  const overview = useMemo(() => getWeeklyOverview(currentSessions), [currentSessions])
  const previousVolume = useMemo(
    () => previousSessions.reduce((sum, session) => sum + getSessionVolume(session), 0),
    [previousSessions],
  )
  const comparison = getVolumeComparison(overview.volume, previousVolume)
  const hasSessions = currentSessions.length > 0
  const topMuscleVolume = overview.muscleDistribution[0]?.volume ?? 0

  return (
    <main className="stats-page" aria-labelledby="stats-title">
      <section className="stats-heading">
        <p className="eyebrow">STATISTICS</p>
        <h1 id="stats-title">주간 통계</h1>
        <div className="stats-week-nav" role="group" aria-label="주 선택">
          <button className="icon-button week-nav-button" type="button" onClick={onPreviousWeek} aria-label="이전 주">
            <ChevronLeft size={19} aria-hidden="true" />
          </button>
          <span className="stats-week-range">
            {formatWeekRange(weekStart, weekEnd)}
            {isCurrentWeek ? ' · 이번 주' : ''}
          </span>
          <button
            className="icon-button week-nav-button"
            type="button"
            onClick={onNextWeek}
            disabled={!canGoToNextWeek}
            aria-label="다음 주"
          >
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        </div>
      </section>

      {!hasSessions ? (
        <StatsEmpty />
      ) : (
        <div className="stats-grid">
          <article className="stats-card volume-card">
            <div className="card-heading">
              <div><span className="card-kicker">TOTAL VOLUME</span><h2>총 볼륨</h2></div>
              <BarChart3 size={18} aria-hidden="true" />
            </div>
            <div className="stats-volume-value"><strong>{formatNumber(overview.volume)}</strong><span>{weightUnit}</span></div>
            <ComparisonBadge comparison={comparison} />
          </article>

          <article className="stats-card weekday-card">
            <div className="card-heading">
              <div><span className="card-kicker">BY WEEKDAY</span><h2>요일별 볼륨</h2></div>
            </div>
            <div className="stats-weekday-chart" role="group" aria-label="요일별 볼륨">
              {overview.dailyVolume.map((volume, index) => (
                <div className="day-column" key={dayLabels[index]}>
                  <span
                    className="day-bar"
                    role="img"
                    aria-label={`${dayLabels[index]}요일 ${formatNumber(volume)} ${weightUnit}`}
                    style={{ height: `${Math.max(7, (volume / overview.maxDailyVolume) * 90)}px` }}
                    data-active={volume > 0}
                  />
                  <span aria-hidden="true">{dayLabels[index]}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="stats-card muscle-card">
            <div className="card-heading">
              <div><span className="card-kicker">BY MUSCLE GROUP</span><h2>부위별 볼륨</h2></div>
              <Dumbbell size={18} aria-hidden="true" />
            </div>
            <div className="muscle-distribution">
              {overview.muscleDistribution.map((entry) => (
                <div className="muscle-row" key={entry.muscle}>
                  <span className="muscle-row-label">{muscleLabel(entry.muscle)}</span>
                  <span className="muscle-row-bar-track">
                    <span
                      className="muscle-row-bar"
                      style={{ width: `${topMuscleVolume > 0 ? (entry.volume / topMuscleVolume) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="muscle-row-value">{formatNumber(entry.volume)}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </main>
  )
}

function ComparisonBadge({ comparison }: { comparison: VolumeComparison }) {
  if (comparison.kind === 'no-previous') {
    return (
      <p className="stats-comparison is-neutral">
        <Minus size={14} aria-hidden="true" /> 지난주 기록이 없어 비교할 수 없어요.
      </p>
    )
  }
  const { percent } = comparison
  if (percent === 0) {
    return (
      <p className="stats-comparison is-neutral">
        <Minus size={14} aria-hidden="true" /> 지난주와 볼륨이 같아요.
      </p>
    )
  }
  const isUp = percent > 0
  return (
    <p className={`stats-comparison ${isUp ? 'is-up' : 'is-down'}`}>
      {isUp ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
      지난주 대비 {Math.abs(percent)}% {isUp ? '증가' : '감소'}
    </p>
  )
}

function StatsLoading() {
  return (
    <main className="stats-page" aria-label="통계 불러오는 중">
      <section className="stats-heading skeleton-heading">
        <div className="skeleton-line small" />
        <div className="skeleton-line title" />
      </section>
      <section className="stats-grid">
        <div className="skeleton-card large" />
        <div className="skeleton-card metric" />
        <div className="skeleton-card metric" />
      </section>
    </main>
  )
}

function StatsError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="stats-page stats-message">
      <div className="message-icon"><RefreshCw size={22} /></div>
      <p className="eyebrow">CONNECTION ISSUE</p>
      <h1>통계를 불러오지 못했어요.</h1>
      <p>잠시 후 다시 시도해 주세요.</p>
      <button className="primary-button" type="button" onClick={onRetry}><RefreshCw size={16} /> 다시 시도</button>
    </main>
  )
}

function StatsEmpty() {
  return (
    <section className="stats-empty">
      <BarChart3 size={23} aria-hidden="true" />
      <h2>이 주에는 완료한 운동이 없어요.</h2>
      <p>운동을 완료하면 이 주의 볼륨과 부위별 분포를 확인할 수 있어요.</p>
    </section>
  )
}

function getWeeklyOverview(sessions: WorkoutSession[]): WeeklyOverview {
  const dailyVolume = Array.from({ length: 7 }, () => 0)
  const muscleVolume = new Map<MuscleGroup, number>()
  let volume = 0

  sessions.forEach((session) => {
    const sessionVolume = getSessionVolume(session)
    volume += sessionVolume
    const weekday = getMondayIndex(new Date(session.startedAt))
    dailyVolume[weekday] += sessionVolume

    session.exercises.forEach((exercise) => {
      const exerciseVolume = exercise.sets
        .filter((set) => set.isCompleted)
        .reduce((sum, set) => sum + (set.weightKg ?? 0) * (set.reps ?? 0), 0)
      if (exerciseVolume === 0) return
      muscleVolume.set(exercise.primaryMuscle, (muscleVolume.get(exercise.primaryMuscle) ?? 0) + exerciseVolume)
    })
  })

  const muscleDistribution = [...muscleVolume.entries()]
    .map(([muscle, muscleVolumeValue]) => ({ muscle, volume: muscleVolumeValue }))
    .sort((a, b) => b.volume - a.volume)

  return { volume, dailyVolume, maxDailyVolume: Math.max(...dailyVolume, 1), muscleDistribution }
}

/**
 * 지난주 볼륨이 0이면 증감률 자체가 의미가 없다(0으로 나누면 Infinity/NaN).
 * 그 경우를 별도 상태로 구분해 UI가 숫자 대신 "비교할 수 없다"는 문구를
 * 보여주게 한다.
 */
function getVolumeComparison(current: number, previous: number): VolumeComparison {
  if (previous <= 0) return { kind: 'no-previous' }
  return { kind: 'change', percent: Math.round(((current - previous) / previous) * 100) }
}

function formatWeekRange(start: Date, end: Date) {
  const lastDay = new Date(end)
  lastDay.setDate(lastDay.getDate() - 1)
  const startLabel = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(start)
  const sameMonth = start.getFullYear() === lastDay.getFullYear() && start.getMonth() === lastDay.getMonth()
  const endLabel = sameMonth
    ? new Intl.DateTimeFormat('ko-KR', { day: 'numeric' }).format(lastDay)
    : new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(lastDay)
  return `${startLabel} – ${endLabel}`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(Math.round(value))
}
