import { useState } from 'react'
import { CheckCircle2, ChevronRight, Dumbbell, Footprints, History, MoonStar, Play, RefreshCw, RotateCcw, StopCircle } from 'lucide-react'
import { addCalendarDays, daysBetween } from '../../../lib/localDate'
import type { ProgramRun, ProgramRunDay } from '../../../types/domain'
import { formatDate, formatDetailedPrescription, formatShortDate, isProgramDayCompleted } from '../model/programView'

interface ActiveProgramProps {
  run: ProgramRun
  today: string
  selectedWeek: number
  onSelectWeek: (week: number) => void
  onStartDay: (dayId: string) => void
  onSelectSession: (sessionId: string) => void
  onCompleteRest: (dayId: string) => void
  completingRestDayId: string | null
  restCompletionError: string | null
  availableTemplateVersion: number | null
  onRefresh: () => void
  isRefreshing: boolean
  refreshError: string | null
  onEnd: (outcome: 'completed' | 'withdrawn') => void
  isEnding: boolean
}

export function ActiveProgram({ run, today, selectedWeek, onSelectWeek, onStartDay, onSelectSession, onCompleteRest, completingRestDayId, restCompletionError, availableTemplateVersion, onRefresh, isRefreshing, refreshError, onEnd, isEnding }: ActiveProgramProps) {
  const todayDay = run.days.find((day) => day.scheduledOn === today) ?? null
  const completed = run.days.filter(isProgramDayCompleted).length
  const totalDays = run.days.length
  const allDaysCompleted = completed === totalDays
  const offset = daysBetween(run.startDate, today)
  const isBeforeStart = offset < 0
  const isAfterProgram = offset >= run.days.length
  const focusDay = todayDay ?? (isBeforeStart ? run.days[0] : run.days.at(-1)!)
  const weekDays = run.days.filter((day) => day.weekNumber === selectedWeek)
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const selectedDay = weekDays.find((day) => day.id === selectedDayId)
    ?? weekDays.find((day) => day.scheduledOn === today)
    ?? weekDays[0]

  return <>
    {availableTemplateVersion && <section className="program-update-banner" aria-label="프로그램 업데이트">
      <span className="program-update-icon"><RefreshCw size={20} /></span>
      <div><p className="card-kicker">ROUTINE UPDATE · V{run.templateVersion} → V{availableTemplateVersion}</p><h2>진행 기록은 유지하고 최신 처방을 적용할 수 있어요.</h2><p>오늘 이후의 미완료 Day만 바뀌며, 이전 날짜와 완료했거나 운동 기록이 연결된 Day는 그대로 남습니다.</p>{refreshError && <p className="program-error" role="alert">{refreshError}</p>}</div>
      <button className="primary-button" type="button" onClick={onRefresh} disabled={isRefreshing}><RefreshCw size={16} /> {isRefreshing ? '적용 중' : '최신 처방 적용'}</button>
    </section>}
    <div className="program-active-workspace">
      <section className="program-now-grid" aria-label="현재 프로그램 요약">
        <article className="program-today-card" data-kind={focusDay.dayType}>
          <div className="program-today-top"><span>{isBeforeStart ? 'STARTS SOON' : isAfterProgram ? 'PROGRAM END' : 'TODAY'}</span><strong>{completed}/{totalDays}일 완료</strong></div>
          <p>WEEK {focusDay.weekNumber} · DAY {focusDay.dayNumber}</p>
          <h2>{isBeforeStart ? 'Day 1을 미리 시작할 수 있어요' : isAfterProgram ? '8주 일정을 모두 지나왔어요' : `오늘 · ${focusDay.title}`}</h2>
          <p className="program-today-copy">{isBeforeStart ? '예정일은 가이드일 뿐입니다. 아래 Day 목록에서 원하는 운동을 바로 시작할 수 있습니다.' : isAfterProgram ? '놓친 Day를 복습하거나 기록을 확인한 뒤 이번 회차를 완료하세요.' : focusDay.instructions}</p>
          <div className="program-today-actions">
            {focusDay.workoutSession && <button className="secondary-button" type="button" onClick={() => onSelectSession(focusDay.workoutSession!.id)}><CheckCircle2 size={17} /> 저장한 기록 보기</button>}
            {focusDay.dayType === 'rest' && !focusDay.completedAt && <button className="primary-button" type="button" onClick={() => onCompleteRest(focusDay.id)} disabled={completingRestDayId === focusDay.id}><MoonStar size={17} /> {completingRestDayId === focusDay.id ? '완료 처리 중' : '휴식 완료'}</button>}
            {focusDay.dayType === 'rest' && focusDay.completedAt && <span className="rest-message"><CheckCircle2 size={18} /> 휴식 완료</span>}
            {(isAfterProgram || allDaysCompleted) && <button className="primary-button" type="button" onClick={() => onEnd('completed')} disabled={isEnding}><CheckCircle2 size={17} /> 회차 완료</button>}
          </div>
        </article>
        <article className="program-progress-card">
          <div className="program-ring" style={{ '--progress': `${Math.round((completed / Math.max(totalDays, 1)) * 100)}%` } as React.CSSProperties}><div><strong>{Math.round((completed / Math.max(totalDays, 1)) * 100)}%</strong><span>진행률</span></div></div>
          <div><p className="card-kicker">CURRENT RUN</p><h3>{run.programName}</h3><p>{formatDate(run.startDate)} - {formatDate(addCalendarDays(run.startDate, run.days.length - 1))}</p></div>
        </article>
      </section>

      <section className="program-week-section">
        <div className="program-week-heading"><div><p className="card-kicker">FLEXIBLE PROGRAM</p><h2>주차와 Day 선택</h2></div><span>{selectedWeek} / {run.durationWeeks}주차</span></div>
        <div className="program-week-tabs" role="tablist" aria-label="프로그램 주차">
          {Array.from({ length: run.durationWeeks }, (_, index) => index + 1).map((week) => <button type="button" role="tab" aria-selected={week === selectedWeek} className={week === selectedWeek ? 'is-selected' : ''} key={week} onClick={() => onSelectWeek(week)}>{week}주차</button>)}
        </div>
        <div className="program-day-rail" role="list" aria-label={`${selectedWeek}주차 Day 목록`}>
          {weekDays.map((day) => <ProgramDayCard day={day} today={today} selected={selectedDay?.id === day.id} key={day.id} onSelect={() => setSelectedDayId(day.id)} />)}
        </div>
        {selectedDay && <ProgramDayDetail day={selectedDay} onStartDay={onStartDay} onSelectSession={onSelectSession} onCompleteRest={onCompleteRest} isCompletingRest={completingRestDayId === selectedDay.id} restCompletionError={restCompletionError} />}
      </section>
    </div>

    <div className="program-stop-row"><p>일정이 맞지 않으면 이 회차를 종료할 수 있습니다. 지금까지의 기록은 삭제되지 않습니다.</p><button type="button" onClick={() => onEnd('withdrawn')} disabled={isEnding}><StopCircle size={17} /> 중도 하차</button></div>
  </>
}

export function ProgramDayCard({ day, today, selected, onSelect }: { day: ProgramRunDay; today: string; selected: boolean; onSelect: () => void }) {
  const isToday = day.scheduledOn === today
  const isPast = day.scheduledOn < today
  const isCompleted = isProgramDayCompleted(day)
  const status = isCompleted ? '완료' : day.dayType === 'rest' ? '휴식일' : isPast ? '미완료' : isToday ? '오늘' : '예정'
  const Icon = day.dayType === 'rest' ? MoonStar : day.dayType === 'cardio' ? Footprints : Dumbbell
  return <button className={`program-day-card ${selected ? 'is-selected' : ''}`} data-today={isToday} type="button" onClick={onSelect} aria-pressed={selected} role="listitem">
    <span className="program-day-card-status" data-status={status}>{isCompleted ? <CheckCircle2 size={16} /> : <Icon size={16} />}</span>
    <strong>Day {day.dayNumber}</strong>
    <small>{status}</small>
  </button>
}

function ProgramDayDetail({ day, onStartDay, onSelectSession, onCompleteRest, isCompletingRest, restCompletionError }: { day: ProgramRunDay; onStartDay: (id: string) => void; onSelectSession: (id: string) => void; onCompleteRest: (id: string) => void; isCompletingRest: boolean; restCompletionError: string | null }) {
  const exercises = day.routineSnapshot?.exercises ?? []
  const Icon = day.dayType === 'rest' ? MoonStar : day.dayType === 'cardio' ? Footprints : Dumbbell

  return <article className="program-day-detail" data-kind={day.dayType}>
    <header>
      <span className="program-day-detail-icon"><Icon size={20} /></span>
      <div><p>WEEK {day.weekNumber} · DAY {day.dayNumber} · {formatShortDate(day.scheduledOn)}</p><h3>{day.title}</h3></div>
    </header>
    <p className="program-day-detail-copy">{day.instructions}</p>
    {exercises.length > 0 && <ol className="program-day-exercises">{exercises.map((exercise) => <li key={exercise.exerciseOrder}>
      <span>{String(exercise.exerciseOrder).padStart(2, '0')}</span>
      <div><strong>{exercise.exerciseName}</strong><small>{exercise.sets.length}세트</small></div>
      <em>{formatDetailedPrescription(exercise.sets[0])}</em>
    </li>)}</ol>}
    {day.cardioTarget && <div className="program-day-cardio"><Footprints size={18} /><strong>{day.cardioTarget.distanceKm}km 러닝</strong><span>RPE {day.cardioTarget.rpeMin}-{day.cardioTarget.rpeMax}</span></div>}
    <footer>
      {day.workoutSession && <button className="secondary-button" type="button" onClick={() => onSelectSession(day.workoutSession!.id)}><CheckCircle2 size={17} /> 저장한 기록 보기</button>}
      {day.dayType === 'rest'
        ? <button className={day.completedAt ? 'secondary-button' : 'primary-button'} type="button" onClick={() => onCompleteRest(day.id)} disabled={Boolean(day.completedAt) || isCompletingRest}><Icon size={17} /> {day.completedAt ? '휴식 완료됨' : isCompletingRest ? '완료 처리 중' : '휴식 완료'}</button>
        : <button className="primary-button" type="button" onClick={() => onStartDay(day.id)}><Play size={17} fill="currentColor" /> {day.workoutSession ? '다시 운동하기' : '운동 시작'}</button>}
    </footer>
    {restCompletionError && day.dayType === 'rest' && <p className="program-error program-day-error" role="alert">{restCompletionError}</p>}
  </article>
}

export function ProgramHistory({ runs, onSelectSession }: { runs: ProgramRun[]; onSelectSession: (sessionId: string) => void }) {
  if (runs.length === 0) return null
  return <section className="program-history"><div className="section-heading"><div><p className="card-kicker">RUN HISTORY</p><h2>지난 프로그램 회차</h2></div><History size={19} /></div><div className="program-history-list">{runs.map((run, index) => {
    const sessions = run.days.flatMap((day) => day.workoutSession ? [{ ...day.workoutSession, day }] : [])
    return <details key={run.id}><summary><span className="history-index">{String(runs.length - index).padStart(2, '0')}</span><span><strong>{run.programName}</strong><small>{formatDate(run.startDate)} 시작 · {sessions.length}회 기록 · {run.status === 'completed' ? '완료' : '중도 하차'}</small></span><RotateCcw size={17} /></summary><div className="history-sessions">{sessions.length === 0 ? <p>이 회차에 저장된 운동 기록이 없습니다.</p> : sessions.map((session) => <button type="button" key={session.id} onClick={() => onSelectSession(session.id)}><span>Day {session.day.dayNumber}</span><strong>{session.day.title}</strong><small>{formatShortDate(session.day.scheduledOn)}</small><ChevronRight size={16} /></button>)}</div></details>
  })}</div></section>
}
