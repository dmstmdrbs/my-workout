import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Flame, RefreshCw } from 'lucide-react'
import { STREAK_LOOKBACK_CAP_DAYS, computeStreak } from '../../lib/streak'
import { getMondayIndex, getMonthEnd, getMonthStart, toLocalDateKey } from '../../lib/week'
import { recordsCalendarQueryKey, useAppServices } from '../../services'
import type { WorkoutSession } from '../../types/domain'
import './RecordsCalendar.css'

const dayLabels = ['월', '화', '수', '목', '금', '토', '일']

interface RecordsCalendarProps {
  /** 운동이 있는 날을 눌렀을 때. 세션이 아니라 **날짜**를 넘긴다 -- 하루에 두
   * 번 운동한 날이 있으므로 그 날의 세션을 고르는 일은 이 컴포넌트가 아니라
   * 아래 목록의 몫이다. 값은 `toLocalDateKey` 형식(`YYYY-MM-DD`)이다. */
  onSelectDay: (dateKey: string) => void
  selectedDateKey: string | null
}

export function RecordsCalendar({ onSelectDay, selectedDateKey }: RecordsCalendarProps) {
  const { workoutRepository } = useAppServices()
  // 모바일에서는 이 달력이 날짜를 옮길 유일한 수단이므로 펼친 채로 시작한다.
  // 접힌 채로 시작하던 시절에는 화면 아래에 완료한 운동 전체 목록이 따로 있어
  // 달력 없이도 다른 날로 갈 수 있었다. 접기 자체는 남겨 둔다 -- 그 날 기록이
  // 많으면 목록을 위로 끌어올릴 수 있어야 한다.
  const [isExpanded, setIsExpanded] = useState(true)
  // 0 = 이번 달, 음수 = 과거. 미래로는 절대 넘어가지 않는다.
  const [monthOffset, setMonthOffset] = useState(0)

  // Stats.tsx의 thisWeekStart와 같은 이유로 의도적으로 메모이제이션하지 않는다
  // -- 화면을 계속 열어 둔 채 자정을 넘기면 "이번 달"도 그에 맞춰 갱신되어야
  // 한다.
  const thisMonthStart = getMonthStart(new Date())
  const displayedMonthStart = useMemo(() => {
    const start = new Date(thisMonthStart)
    start.setMonth(start.getMonth() + monthOffset)
    return start
  }, [thisMonthStart, monthOffset])
  const displayedMonthEnd = useMemo(() => getMonthEnd(displayedMonthStart), [displayedMonthStart])

  const isCurrentMonth = monthOffset === 0
  const canGoNext = monthOffset < 0

  const monthQuery = useQuery({
    queryKey: recordsCalendarQueryKey.month(displayedMonthStart.toISOString()),
    queryFn: () => workoutRepository.listSessions({
      status: 'completed',
      startedAfter: displayedMonthStart.toISOString(),
      startedBefore: displayedMonthEnd.toISOString(),
    }),
  })

  const today = new Date()
  const streakWindowStart = new Date(today)
  streakWindowStart.setHours(0, 0, 0, 0)
  streakWindowStart.setDate(streakWindowStart.getDate() - STREAK_LOOKBACK_CAP_DAYS)

  // 기간 집계 조회(AGENTS.md 11번 규칙): 커서 없이 `startedAfter`만으로 상한을
  // 두어, 전체 세션이 아니라 최근 `STREAK_LOOKBACK_CAP_DAYS`일만 훑는다.
  const streakQuery = useQuery({
    queryKey: recordsCalendarQueryKey.streak(streakWindowStart.toISOString()),
    queryFn: () => workoutRepository.listSessions({
      status: 'completed',
      startedAfter: streakWindowStart.toISOString(),
    }),
  })

  // 하루에 두 번 운동한 날이 있다. 예전에는 첫 세션만 남기고 나머지를 버려서
  // 그 날의 두 번째 운동은 달력에서 열 방법이 아예 없었다. 이제는 날짜마다
  // 세션을 모두 모아 두고, 개수는 칸의 접근성 이름에 쓴다.
  const monthSessionsByDay = useMemo(() => {
    const map = new Map<string, WorkoutSession[]>()
    for (const session of monthQuery.data ?? []) {
      const key = toLocalDateKey(new Date(session.startedAt))
      const bucket = map.get(key)
      if (bucket) bucket.push(session)
      else map.set(key, [session])
    }
    return map
  }, [monthQuery.data])

  const streakDayKeys = useMemo(() => {
    const set = new Set<string>()
    for (const session of streakQuery.data ?? []) {
      set.add(toLocalDateKey(new Date(session.startedAt)))
    }
    return set
  }, [streakQuery.data])

  const streak = computeStreak(streakDayKeys, today, STREAK_LOOKBACK_CAP_DAYS)
  const trainedToday = streakDayKeys.has(toLocalDateKey(today))

  const isLoading = monthQuery.isPending || streakQuery.isPending
  const isError = monthQuery.isError || streakQuery.isError

  const monthLabelBase = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' }).format(displayedMonthStart)
  const monthLabel = `${monthLabelBase}${isCurrentMonth ? ' · 이번 달' : ''}`
  const daysInMonth = new Date(displayedMonthStart.getFullYear(), displayedMonthStart.getMonth() + 1, 0).getDate()
  const leadingBlanks = getMondayIndex(displayedMonthStart)
  const monthTrainedDayCount = monthSessionsByDay.size
  const monthPercent = daysInMonth > 0 ? Math.round((monthTrainedDayCount / daysInMonth) * 100) : 0

  const streakLabel = streak.isCapped ? `${STREAK_LOOKBACK_CAP_DAYS}일 이상` : `${streak.days}일`
  const streakCaption = streak.isCapped
    ? `${STREAK_LOOKBACK_CAP_DAYS}일이 넘는 연속 기록은 정확한 일수 대신 이렇게 표시해요.`
    : streak.days === 0
      ? '운동을 완료하면 연속 기록이 시작돼요.'
      : !trainedToday
        ? '오늘 운동을 완료하면 계속 이어져요.'
        : null

  return (
    <section className="records-calendar" aria-labelledby="records-calendar-title" data-expanded={isExpanded}>
      <div className="calendar-header">
        <div className="calendar-nav" role="group" aria-label="달 선택">
          <button className="icon-button calendar-nav-button" type="button" onClick={() => setMonthOffset((offset) => offset - 1)} aria-label="이전 달">
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h2 className="calendar-month-label" id="records-calendar-title">{monthLabel}</h2>
          <button
            className="icon-button calendar-nav-button"
            type="button"
            onClick={() => setMonthOffset((offset) => Math.min(0, offset + 1))}
            disabled={!canGoNext}
            aria-label="다음 달"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <button
          className="calendar-toggle"
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
        >
          {isExpanded ? '달력 접기' : '달력 보기'}
          <ChevronDown size={15} aria-hidden="true" className={`calendar-toggle-icon ${isExpanded ? 'is-open' : ''}`} />
        </button>
      </div>

      {isError ? (
        <div className="calendar-message" role="alert">
          달력을 불러오지 못했어요.
          <button type="button" className="calendar-retry" onClick={() => { void monthQuery.refetch(); void streakQuery.refetch() }}>
            <RefreshCw size={13} aria-hidden="true" /> 다시 시도
          </button>
        </div>
      ) : (
        <>
          <div className="calendar-stats" role="group" aria-label="운동 기록 요약">
            <div className="calendar-stat">
              <Flame size={17} aria-hidden="true" />
              <div>
                <strong>{isLoading ? '–' : streakLabel}</strong>
                <span>연속 기록</span>
              </div>
            </div>
            <div className="calendar-stat">
              <CalendarDays size={17} aria-hidden="true" />
              <div>
                <strong>{isLoading ? '–' : `${monthTrainedDayCount} / ${daysInMonth}일`}</strong>
                <span>{isCurrentMonth ? '이번 달' : '이 달'} 운동일{isLoading ? '' : ` · ${monthPercent}%`}</span>
              </div>
            </div>
          </div>
          {!isLoading && streakCaption && <p className="calendar-stat-caption">{streakCaption}</p>}

          <div className="calendar-body">
            {isLoading ? (
              <p className="calendar-hint">달력을 불러오는 중…</p>
            ) : (
              <>
                <div className="calendar-weekdays" aria-hidden="true">
                  {dayLabels.map((label) => <span key={label}>{label}</span>)}
                </div>
                <div className="calendar-grid" role="group" aria-label={`${monthLabel} 운동 달력`}>
                  {Array.from({ length: leadingBlanks }, (_, index) => (
                    <div className="calendar-cell is-spacer" aria-hidden="true" key={`blank-${index}`} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
                    const cellDate = new Date(displayedMonthStart)
                    cellDate.setDate(day)
                    const key = toLocalDateKey(cellDate)
                    const daySessions = monthSessionsByDay.get(key)
                    const hasWorkout = daySessions !== undefined
                    const isToday = key === toLocalDateKey(today)
                    const isSelected = hasWorkout && key === selectedDateKey
                    const weekdayLabel = dayLabels[getMondayIndex(cellDate)]
                    const workoutLabel = daySessions ? `운동 ${daySessions.length}회 완료` : '운동 기록 없음'
                    const dayLabel = `${monthLabelBase} ${day}일 ${weekdayLabel}요일${isToday ? ', 오늘' : ''}, ${workoutLabel}`
                    return (
                      <button
                        type="button"
                        key={key}
                        className={`calendar-cell calendar-day ${hasWorkout ? 'has-workout' : ''} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                        disabled={!hasWorkout}
                        aria-pressed={hasWorkout ? isSelected : undefined}
                        aria-label={dayLabel}
                        onClick={() => { if (hasWorkout) onSelectDay(key) }}
                      >
                        <span aria-hidden="true">{day}</span>
                        {hasWorkout && <span className="calendar-day-mark" aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
                {monthTrainedDayCount === 0 && <p className="calendar-empty-note">이 달에는 완료한 운동이 없어요.</p>}
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
