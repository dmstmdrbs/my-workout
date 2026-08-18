import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, Dumbbell, LineChart, Minus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { bestEstimatedOneRepMax } from '../../lib/oneRepMax'
import { getSessionVolume } from '../../lib/volume'
import { getMondayIndex, getWeekEnd, getWeekStart } from '../../lib/week'
import { useAppServices, useSettings } from '../../services'
import type { ExerciseProgressEntry } from '../../services'
import type { Exercise, MuscleGroup, WorkoutSession, WorkoutSetRecord } from '../../types/domain'
import { ExercisePickerSheet } from '../workout/ExercisePicker'
import { muscleLabel } from '../workout/exerciseLabels'
import './Stats.css'

const dayLabels = ['월', '화', '수', '목', '금', '토', '일']

/**
 * 종목별 진행 추이 조회 기간(일). AGENTS.md 11번 규칙은 세션 목록을
 * 무제한으로 훑는 걸 금지하는데, 세션 전체를 걸어 차트를 그리는 조회는
 * 정확히 그 규칙이 막으려는 모양이다. 180일(약 6개월)이면 개인 사용자가
 * 실제로 궁금해하는 최근 중량 변화는 대부분 포함하면서도, 조회 범위가
 * 유한하도록 고정한다.
 */
const EXERCISE_PROGRESS_PERIOD_DAYS = 180

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

  const isLoading = statsQuery.isPending || settingsQuery.isPending
  const isError = statsQuery.isError || !statsQuery.data || settingsQuery.isError || !settingsQuery.data

  // `ExerciseProgressCard` renders as a sibling of the weekly loading/error/
  // content branches below, at a fixed position in this single, persistent
  // <main> -- not nested inside whichever of those three components happens
  // to be showing. `statsQuery`'s key includes the selected week, so paging
  // to a different week flips it back to `isPending` on every click; if the
  // progress card lived inside the weekly-content branch (a different
  // component instance each time the branch switches), React would unmount
  // and remount it -- and its picked exercise -- on every ordinary week
  // navigation, even though the progress card's own period is completely
  // independent of the week being viewed.
  return (
    <main className="stats-page" aria-label={isLoading ? '통계 불러오는 중' : undefined} aria-labelledby={isLoading ? undefined : 'stats-title'}>
      {isLoading ? (
        <StatsLoading />
      ) : isError ? (
        <StatsError onRetry={() => { void statsQuery.refetch(); void settingsQuery.refetch() }} />
      ) : (
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
      )}
      <ExerciseProgressCard weightUnit={settingsQuery.data?.weightUnit ?? 'kg'} />
    </main>
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
    <>
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
    </>
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
    <>
      <section className="stats-heading skeleton-heading">
        <div className="skeleton-line small" />
        <div className="skeleton-line title" />
      </section>
      <section className="stats-grid">
        <div className="skeleton-card large" />
        <div className="skeleton-card metric" />
        <div className="skeleton-card metric" />
      </section>
    </>
  )
}

function StatsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="stats-message">
      <div className="message-icon"><RefreshCw size={22} /></div>
      <p className="eyebrow">CONNECTION ISSUE</p>
      <h1>통계를 불러오지 못했어요.</h1>
      <p>잠시 후 다시 시도해 주세요.</p>
      <button className="primary-button" type="button" onClick={onRetry}><RefreshCw size={16} /> 다시 시도</button>
    </div>
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

interface WeightedProgressPoint {
  sessionId: string
  startedAt: string
  weightKg: number
  reps: number
  oneRepMax: number | null
}

interface BodyweightProgressPoint {
  sessionId: string
  startedAt: string
  reps: number
}

interface CardioProgressPoint {
  sessionId: string
  startedAt: string
  /** 세션 안 유산소 세트의 합계. 인터벌을 여러 세트로 나눠 적어도 하루치가 된다. */
  durationSeconds: number
  distanceKm: number | null
}

/**
 * 종목별 중량 추이 카드. 주간 통계와 달리 이 카드는 선택한 운동과 고정된
 * 조회 기간(`EXERCISE_PROGRESS_PERIOD_DAYS`)만 따르며, 주 이동과는 무관하게
 * 항상 같은 내용을 보여준다.
 */
function ExerciseProgressCard({ weightUnit }: { weightUnit: string }) {
  const { workoutRepository } = useAppServices()
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  const exercisesQuery = useQuery({
    queryKey: ['stats-exercise-catalog'],
    queryFn: () => workoutRepository.listExercises(),
  })

  // Deliberately not memoized -- recomputed each render like `thisWeekStart`
  // above, so a tab left open for days doesn't freeze the lookback window at
  // whatever "now" happened to be at mount time.
  const periodStart = getProgressPeriodStart(new Date())

  const progressQuery = useQuery({
    queryKey: ['exercise-progress', selectedExerciseId, periodStart.toISOString().slice(0, 10)],
    queryFn: () => workoutRepository.listExerciseProgress(selectedExerciseId!, { completedAfter: periodStart.toISOString() }),
    enabled: selectedExerciseId !== null,
  })

  const exercises = exercisesQuery.data ?? []
  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId) ?? null
  // Bodyweight exercises don't log a working weight, so "heaviest set" and
  // Brzycki e1RM don't mean anything for them -- see report for the reasoning.
  const isBodyweight = selectedExercise?.equipment === 'bodyweight'
  // 유산소는 중량도 반복 수도 없어 위 둘 중 어느 쪽으로도 그릴 수 없다.
  // 시간(과 있으면 거리)으로 그린다.
  const isCardio = selectedExercise?.equipment === 'cardio'

  const weightedPoints = useMemo(
    () => (progressQuery.data && !isBodyweight && !isCardio ? buildWeightedProgress(progressQuery.data) : []),
    [progressQuery.data, isBodyweight, isCardio],
  )
  const bodyweightPoints = useMemo(
    () => (progressQuery.data && isBodyweight ? buildBodyweightProgress(progressQuery.data) : []),
    [progressQuery.data, isBodyweight],
  )
  const cardioPoints = useMemo(
    () => (progressQuery.data && isCardio ? buildCardioProgress(progressQuery.data) : []),
    [progressQuery.data, isCardio],
  )

  return (
    <article className="stats-card progress-card">
      <div className="card-heading">
        <div><span className="card-kicker">EXERCISE PROGRESS</span><h2>종목별 중량 추이</h2></div>
        <LineChart size={18} aria-hidden="true" />
      </div>

      <button type="button" className="secondary-button progress-exercise-trigger" onClick={() => setIsPickerOpen(true)}>
        {selectedExercise ? selectedExercise.name : '운동 선택'}
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {!selectedExercise && (
        <p className="progress-hint">운동을 선택하면 최근 {EXERCISE_PROGRESS_PERIOD_DAYS}일 동안의 진행 추이를 보여드려요.</p>
      )}

      {selectedExercise && progressQuery.isPending && <p className="progress-hint">불러오는 중…</p>}

      {selectedExercise && progressQuery.isError && (
        <p className="progress-hint progress-error" role="alert">
          진행 추이를 불러오지 못했어요.
          <button className="secondary-button" type="button" onClick={() => void progressQuery.refetch()}>다시 시도</button>
        </p>
      )}

      {selectedExercise && progressQuery.isSuccess && (
        isCardio
          ? <CardioProgressView exercise={selectedExercise} points={cardioPoints} />
          : isBodyweight
            ? <BodyweightProgressView exercise={selectedExercise} points={bodyweightPoints} />
            : <WeightedProgressView exercise={selectedExercise} points={weightedPoints} weightUnit={weightUnit} />
      )}

      <ExercisePickerSheet
        isOpen={isPickerOpen}
        exercises={exercises}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(exercise) => { setSelectedExerciseId(exercise.id); setIsPickerOpen(false) }}
      />
    </article>
  )
}

function WeightedProgressView({ exercise, points, weightUnit }: { exercise: Exercise; points: WeightedProgressPoint[]; weightUnit: string }) {
  if (points.length === 0) {
    return <p className="progress-empty">최근 {EXERCISE_PROGRESS_PERIOD_DAYS}일 동안 완료한 {exercise.name} 세트가 없어요.</p>
  }

  if (points.length === 1) {
    const only = points[0]
    return (
      <div className="progress-single">
        <p>
          {formatFullDate(only.startedAt)} · {formatWeightValue(only.weightKg)}{weightUnit} × {only.reps}회
          {only.oneRepMax !== null && ` · 예상 1RM ${formatWeightValue(only.oneRepMax)}${weightUnit}`}
        </p>
        <p className="progress-hint">비교할 이전 기록이 없어 추이를 표시할 수 없어요.</p>
      </div>
    )
  }

  const maxWeight = Math.max(...points.map((point) => point.weightKg), 1)
  return (
    <div className="progress-chart" role="group" aria-label={`${exercise.name} 최고 중량 추이`}>
      {points.map((point) => (
        <div className="progress-column" key={point.sessionId}>
          <span
            className="progress-bar"
            role="img"
            aria-label={buildWeightedPointLabel(point, weightUnit)}
            style={{ height: `${Math.max(7, (point.weightKg / maxWeight) * 110)}px` }}
          />
          <span className="progress-column-value" aria-hidden="true">
            {point.oneRepMax !== null ? `1RM ${formatWeightValue(point.oneRepMax)}` : '—'}
          </span>
          <span className="progress-column-date" aria-hidden="true">{formatShortDate(point.startedAt)}</span>
        </div>
      ))}
    </div>
  )
}

function BodyweightProgressView({ exercise, points }: { exercise: Exercise; points: BodyweightProgressPoint[] }) {
  if (points.length === 0) {
    return <p className="progress-empty">최근 {EXERCISE_PROGRESS_PERIOD_DAYS}일 동안 완료한 {exercise.name} 세트가 없어요.</p>
  }

  if (points.length === 1) {
    const only = points[0]
    return (
      <div className="progress-single">
        <p>{formatFullDate(only.startedAt)} · 최고 반복 {only.reps}회</p>
        <p className="progress-hint">비교할 이전 기록이 없어 추이를 표시할 수 없어요.</p>
      </div>
    )
  }

  const maxReps = Math.max(...points.map((point) => point.reps), 1)
  return (
    <>
      <p className="progress-hint">체중 운동은 기록된 중량이 없어, 중량 대신 세션별 최고 반복 수로 추이를 보여드려요.</p>
      <div className="progress-chart" role="group" aria-label={`${exercise.name} 최고 반복 수 추이`}>
        {points.map((point) => (
          <div className="progress-column" key={point.sessionId}>
            <span
              className="progress-bar"
              role="img"
              aria-label={`${formatFullDate(point.startedAt)} 최고 반복 ${point.reps}회`}
              style={{ height: `${Math.max(7, (point.reps / maxReps) * 110)}px` }}
            />
            <span className="progress-column-date" aria-hidden="true">{formatShortDate(point.startedAt)}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function getProgressPeriodStart(now: Date): Date {
  const start = new Date(now)
  start.setDate(start.getDate() - EXERCISE_PROGRESS_PERIOD_DAYS)
  return start
}

/**
 * 세션별로 이 종목의 완료 세트 중 가장 무거운(동률이면 반복이 더 많은) 세트
 * 하나를 골라 그 세트의 중량·반복으로 최고 중량 포인트를 만든다 -- 이건
 * "이 세션에서 든 가장 무거운 무게"를 추적하는 값이라 세트 선택이 그대로다.
 *
 * 예상 1RM(oneRepMax)은 다른 질문이라 다르게 고른다: 그 무거운 세트만의
 * 추정치가 아니라, 세션의 완료 세트 전체 중 e1RM이 가장 높은 값을 쓴다
 * (`bestEstimatedOneRepMax`, 공유 카드와 동일한 규칙) -- 가벼운 세트가 반복
 * 수 덕분에 더 높은 추정치를 낼 수 있어서다. 중량이나 반복이 null인 세트
 * (체중 운동, 혹은 기록 누락)는 최고 중량 후보에서 제외한다 -- 0으로 취급해
 * 그리면 실제로 무거웠던 세션이 빈 세션처럼 보이게 된다.
 */
function CardioProgressView({ exercise, points }: { exercise: Exercise; points: CardioProgressPoint[] }) {
  if (points.length === 0) {
    return <p className="progress-empty">최근 {EXERCISE_PROGRESS_PERIOD_DAYS}일 동안 기록한 {exercise.name} 시간이 없어요.</p>
  }

  if (points.length === 1) {
    const only = points[0]
    return (
      <div className="progress-single">
        <p>{formatFullDate(only.startedAt)} · {formatCardioPoint(only)}</p>
        <p className="progress-hint">비교할 이전 기록이 없어 추이를 표시할 수 없어요.</p>
      </div>
    )
  }

  const maxDuration = Math.max(...points.map((point) => point.durationSeconds), 1)
  return (
    <>
      <p className="progress-hint">유산소는 중량이 없어, 세션별 총 운동 시간으로 추이를 보여드려요.</p>
      <div className="progress-chart" role="group" aria-label={`${exercise.name} 운동 시간 추이`}>
        {points.map((point) => (
          <div className="progress-column" key={point.sessionId}>
            <span
              className="progress-bar"
              role="img"
              aria-label={`${formatFullDate(point.startedAt)} ${formatCardioPoint(point)}`}
              style={{ height: `${Math.max(7, (point.durationSeconds / maxDuration) * 110)}px` }}
            />
            <span className="progress-column-value" aria-hidden="true">{Math.round(point.durationSeconds / 60)}분</span>
            <span className="progress-column-date" aria-hidden="true">{formatShortDate(point.startedAt)}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function formatCardioPoint(point: CardioProgressPoint): string {
  const minutes = `${Math.round(point.durationSeconds / 60)}분`
  return point.distanceKm === null ? minutes : `${minutes} · ${point.distanceKm}km`
}

function buildWeightedProgress(entries: ExerciseProgressEntry[]): WeightedProgressPoint[] {
  const points: WeightedProgressPoint[] = []
  for (const entry of entries) {
    let best: WorkoutSetRecord | null = null
    for (const set of entry.sets) {
      if (set.weightKg === null || set.reps === null) continue
      if (!best || set.weightKg > (best.weightKg as number) || (set.weightKg === best.weightKg && set.reps > (best.reps as number))) {
        best = set
      }
    }
    if (!best || best.weightKg === null || best.reps === null) continue
    points.push({
      sessionId: entry.sessionId,
      startedAt: entry.startedAt,
      weightKg: best.weightKg,
      reps: best.reps,
      oneRepMax: bestEstimatedOneRepMax(entry.sets),
    })
  }
  return points
}

/** 체중 운동은 중량이 항상 null이므로, 세션별 최고 반복 수로 진행을 추적한다. */
function buildBodyweightProgress(entries: ExerciseProgressEntry[]): BodyweightProgressPoint[] {
  const points: BodyweightProgressPoint[] = []
  for (const entry of entries) {
    let maxReps: number | null = null
    for (const set of entry.sets) {
      if (set.reps === null) continue
      if (maxReps === null || set.reps > maxReps) maxReps = set.reps
    }
    if (maxReps === null) continue
    points.push({ sessionId: entry.sessionId, startedAt: entry.startedAt, reps: maxReps })
  }
  return points
}

function buildCardioProgress(entries: ExerciseProgressEntry[]): CardioProgressPoint[] {
  const points: CardioProgressPoint[] = []
  for (const entry of entries) {
    let durationSeconds = 0
    let distanceKm = 0
    let hasDistance = false
    for (const set of entry.sets) {
      if (set.durationSeconds !== null) durationSeconds += set.durationSeconds
      if (set.distanceKm !== null) { distanceKm += set.distanceKm; hasDistance = true }
    }
    // 시간이 없으면 그릴 축이 없다. 거리만 적은 세션은 다음 단계에서 다룬다.
    if (durationSeconds === 0) continue
    points.push({
      sessionId: entry.sessionId,
      startedAt: entry.startedAt,
      durationSeconds,
      distanceKm: hasDistance ? Math.round(distanceKm * 10) / 10 : null,
    })
  }
  return points
}

function buildWeightedPointLabel(point: WeightedProgressPoint, weightUnit: string): string {
  const base = `${formatFullDate(point.startedAt)} 최고 중량 ${formatWeightValue(point.weightKg)}${weightUnit} × ${point.reps}회`
  return point.oneRepMax !== null ? `${base} · 예상 1RM ${formatWeightValue(point.oneRepMax)}${weightUnit}` : base
}

function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(iso))
}

function formatFullDate(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso))
}

function formatWeightValue(value: number): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value)
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
