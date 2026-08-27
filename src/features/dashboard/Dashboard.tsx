import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Dumbbell,
  Flame,
  Play,
  RefreshCw,
  Signal,
  Target,
  TrendingUp,
} from 'lucide-react'
import { getSessionDurationMinutes } from '../../lib/duration'
import { getDateInTimeZone } from '../../lib/localDate'
import { completedSetCount, getSessionVolume } from '../../lib/volume'
import { getMondayIndex, getWeekStart } from '../../lib/week'
import { useAppServices, useSettings } from '../../services'
import type { ProgramRun, Routine, WorkoutSession } from '../../types/domain'
import './Dashboard.css'

interface DashboardProps {
  onStartWorkout: () => void
  onViewRecords: () => void
  onSelectSession: (sessionId: string) => void
  onManageRoutines: () => void
  onSelectRoutine: (routineId: string) => void
  onOpenPrograms: () => void
  onStartProgramDay: (dayId: string) => void
}

interface DashboardData {
  profile: { displayName: string; avatarUrl: string | null }
  routines: Routine[]
  weekSessions: WorkoutSession[]
  recentSessions: WorkoutSession[]
  activeProgramRun: ProgramRun | null
}

const dayLabels = ['월', '화', '수', '목', '금', '토', '일']

export function Dashboard({ onStartWorkout, onViewRecords, onSelectSession, onManageRoutines, onSelectRoutine, onOpenPrograms, onStartProgramDay }: DashboardProps) {
  const { workoutRepository } = useAppServices()
  const settingsQuery = useSettings()
  const dashboardQuery = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: async (): Promise<DashboardData> => {
      const [profile, routines, weekSessions, recentSessions, activeProgramRun] = await Promise.all([
        workoutRepository.getProfile(),
        workoutRepository.listRoutines(),
        workoutRepository.listSessions({ status: 'completed', startedAfter: getWeekStart(new Date()).toISOString() }),
        workoutRepository.listSessions({ status: 'completed', limit: 4 }),
        workoutRepository.getActiveProgramRun(),
      ])
      return { profile, routines, weekSessions, recentSessions, activeProgramRun }
    },
  })

  if (dashboardQuery.isPending || settingsQuery.isPending) return <DashboardLoading />
  if (dashboardQuery.isError || !dashboardQuery.data || settingsQuery.isError || !settingsQuery.data) {
    return <DashboardError onRetry={() => { void dashboardQuery.refetch(); void settingsQuery.refetch() }} />
  }

  const { profile, routines, weekSessions, recentSessions, activeProgramRun } = dashboardQuery.data
  return <DashboardContent profile={profile} routines={routines} weekSessions={weekSessions} recentSessions={recentSessions} activeProgramRun={activeProgramRun} weightUnit={settingsQuery.data.weightUnit} timezone={settingsQuery.data.timezone} onStartWorkout={onStartWorkout} onViewRecords={onViewRecords} onSelectSession={onSelectSession} onManageRoutines={onManageRoutines} onSelectRoutine={onSelectRoutine} onOpenPrograms={onOpenPrograms} onStartProgramDay={onStartProgramDay} />
}

function DashboardContent({ profile, routines, weekSessions, recentSessions, activeProgramRun, weightUnit, timezone, onStartWorkout, onViewRecords, onSelectSession, onManageRoutines, onSelectRoutine, onOpenPrograms, onStartProgramDay }: DashboardData & DashboardProps & { weightUnit: string; timezone: string }) {
  const overview = useMemo(() => getOverview(weekSessions), [weekSessions])
  const nextRoutine = routines[0]
  const today = getDateInTimeZone(timezone)
  const programToday = activeProgramRun?.days.find((day) => day.scheduledOn === today) ?? null
  const programNext = activeProgramRun?.days.find((day) => day.scheduledOn >= today && day.dayType !== 'rest' && !day.workoutSession) ?? null
  const programRoutineDay = programToday ?? (activeProgramRun && today < activeProgramRun.startDate ? activeProgramRun.days[0] : null)
  const firstName = profile.displayName.split(' ').at(-1) || profile.displayName

  return (
    <main className="dashboard-page">
      <section className="dashboard-heading" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">TRAINING OVERVIEW</p>
          <h1 id="dashboard-title">좋은 하루예요, {firstName}.</h1>
          <p className="dashboard-subtitle">오늘의 컨디션에 맞춰 다음 세트를 시작해 보세요.</p>
        </div>
        <div className="profile-summary">
          <div className="profile-copy"><strong>{profile.displayName}</strong><span>개인 트레이닝 로그</span></div>
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="프로필" className="profile-avatar" /> : <div className="profile-avatar" aria-label={`${profile.displayName} 프로필`}>{profile.displayName.slice(0, 1)}</div>}
        </div>
      </section>

      <section className="primary-grid" aria-label="이번 주 요약">
        <article className="start-card">
          <div className="start-card-top"><span className="soft-icon"><Dumbbell size={19} /></span><span>{activeProgramRun ? '오늘의 프로그램' : '다음 운동'}</span></div>
          <h2>{programToday ? `Day ${programToday.dayNumber} · ${programToday.title}` : activeProgramRun && programNext ? `다음: Day ${programNext.dayNumber} · ${programNext.title}` : nextRoutine?.name ?? '새 루틴 만들기'}</h2>
          <p>{programToday ? programToday.dayType === 'rest' ? '오늘은 계획된 휴식일입니다. 회복 후 다음 Day를 이어가세요.' : programToday.workoutSession ? '오늘의 운동을 완료했습니다. 저장된 기록을 확인할 수 있어요.' : programToday.instructions ?? '오늘의 처방을 확인하고 운동을 시작하세요.' : activeProgramRun && programNext ? `${formatProgramDayDate(programNext.scheduledOn)} 예정 · 일정은 미수행 여부와 관계없이 고정됩니다.` : nextRoutine ? `${nextRoutine.exercises.length}개 종목 · ${countRoutineSets(nextRoutine)}세트 · ${nextRoutine.description ?? '나만의 루틴'}` : '내 첫 루틴을 설계해 보세요.'}</p>
          <button className="primary-button start-button" type="button" onClick={() => programToday && programToday.dayType !== 'rest' && !programToday.workoutSession ? onStartProgramDay(programToday.id) : activeProgramRun ? onOpenPrograms() : onStartWorkout()}>
            <Play size={17} fill="currentColor" aria-hidden="true" /> {programToday && programToday.dayType !== 'rest' && !programToday.workoutSession ? '오늘 운동 시작' : activeProgramRun ? '프로그램 보기' : '운동 시작'}
          </button>
        </article>

        <article className="week-card">
          <div className="card-heading"><div><span className="card-kicker">THIS WEEK</span><h2>이번 주 트레이닝</h2></div><Signal size={18} aria-hidden="true" /></div>
          <div className="week-stat"><strong>{overview.daysTrained}</strong><span>일 운동</span></div>
          <div className="week-chart" role="group" aria-label={`이번 주 ${overview.daysTrained}일 운동 완료`}>
            {overview.dailyVolume.map((volume, index) => <div className="day-column" key={dayLabels[index]}><span className="day-bar" role="img" aria-label={`${dayLabels[index]}요일 ${formatNumber(volume)} ${weightUnit}`} style={{ height: `${Math.max(7, (volume / overview.maxDailyVolume) * 46)}px` }} data-active={volume > 0} /><span aria-hidden="true">{dayLabels[index]}</span></div>)}
          </div>
        </article>
      </section>

      <section className="metric-grid" aria-label="운동 지표">
        <MetricCard icon={<TrendingUp size={18} />} label="총 볼륨" value={formatNumber(overview.volume)} unit={weightUnit} note="이번 주 완료 세트 기준" />
        <MetricCard icon={<Check size={18} />} label="완료 세트" value={String(overview.completedSets)} unit="세트" note="계획을 꾸준히 이어가고 있어요" />
        <MetricCard icon={<Target size={18} />} label="평균 실제 RIR" value={overview.averageRir === null ? '–' : overview.averageRir.toFixed(1)} unit="RIR" note={overview.averageRir === null ? '아직 RIR 기록이 없어요' : '여유 반복 수의 평균'} />
        <MetricCard icon={<Clock3 size={18} />} label="운동 시간" value={formatDuration(overview.totalMinutes)} unit="" note="이번 주 누적 시간" />
      </section>

      <section className="dashboard-sections">
        <article className="dashboard-card recent-card">
          <div className="section-heading"><div><p className="card-kicker">RECENT</p><h2>최근 운동 기록</h2></div><button className="text-button" type="button" onClick={onViewRecords}>전체 보기 <ChevronRight size={16} /></button></div>
          {recentSessions.length === 0 ? <EmptyState text="완료한 운동이 아직 없어요. 첫 기록을 시작해 보세요." /> : <div className="session-list">{recentSessions.map((session) => <SessionRow session={session} key={session.id} weightUnit={weightUnit} onSelect={() => onSelectSession(session.id)} />)}</div>}
        </article>

        <article className="dashboard-card routine-card">
          <div className="section-heading"><div><p className="card-kicker">ROUTINES</p><h2>내 루틴</h2></div><button className="text-button" type="button" onClick={onManageRoutines}>관리 <ChevronRight size={16} /></button></div>
          {routines.length === 0 && !programRoutineDay ? <EmptyState text="저장된 루틴이 없습니다." /> : <div className="routine-list">
            {programRoutineDay && <ProgramRoutineRow run={activeProgramRun!} day={programRoutineDay} today={today} onSelect={() => programRoutineDay.scheduledOn === today && programRoutineDay.dayType !== 'rest' && !programRoutineDay.workoutSession ? onStartProgramDay(programRoutineDay.id) : onOpenPrograms()} />}
            {routines.slice(0, programRoutineDay ? 2 : 3).map((routine) => <RoutineRow routine={routine} key={routine.id} onSelect={() => onSelectRoutine(routine.id)} />)}
          </div>}
        </article>
      </section>

      <button className="mobile-start-fab" type="button" onClick={onStartWorkout} aria-label="운동 시작"><Play size={19} fill="currentColor" aria-hidden="true" /><span>운동 시작</span></button>
    </main>
  )
}

function MetricCard({ icon, label, value, unit, note }: { icon: React.ReactNode; label: string; value: string; unit: string; note: string }) {
  return <article className="metric-card"><div className="metric-icon">{icon}</div><p>{label}</p><div className="metric-value"><strong>{value}</strong>{unit && <span>{unit}</span>}</div><small>{note}</small></article>
}

function SessionRow({ session, weightUnit, onSelect }: { session: WorkoutSession; weightUnit: string; onSelect: () => void }) {
  const volume = getSessionVolume(session)
  const setCount = completedSetCount(session)
  return <button className="session-row" type="button" onClick={onSelect} aria-label={`${session.routineName ?? '자유 운동'} 기록 보기`}><span className="session-icon"><Flame size={18} aria-hidden="true" /></span><span className="session-details"><strong>{session.routineName ?? '자유 운동'}</strong><span>{formatSessionDate(session.startedAt)} · {session.exercises.length}개 종목 · {setCount}세트</span></span><span className="session-volume"><strong>{formatNumber(volume)} {weightUnit}</strong><span>{formatDuration(getSessionDurationMinutes(session))}</span></span><ArrowUpRight size={17} className="session-arrow" aria-hidden="true" /></button>
}

function RoutineRow({ routine, onSelect }: { routine: Routine; onSelect: () => void }) {
  const exercises = routine.exercises.slice(0, 2).map((exercise) => exercise.exerciseName).join(' · ')
  return <button className="routine-row" type="button" onClick={onSelect} aria-label={`${routine.name} 루틴 편집`}><span className="routine-dot" style={{ background: routine.color ?? 'var(--accent)' }} /><span className="routine-row-copy"><strong>{routine.name}</strong><span>{routine.exercises.length}개 종목 · {countRoutineSets(routine)}세트</span><small>{exercises}</small></span><ChevronRight size={18} aria-hidden="true" /></button>
}

function ProgramRoutineRow({ run, day, today, onSelect }: { run: ProgramRun; day: ProgramRun['days'][number]; today: string; onSelect: () => void }) {
  const status = day.workoutSession ? '완료' : day.dayType === 'rest' ? '휴식일' : day.scheduledOn === today ? '오늘 수행' : `${formatProgramDayDate(day.scheduledOn)} 시작`
  const exercises = day.routineSnapshot?.exercises.slice(0, 2).map((item) => item.exerciseName).join(' · ') ?? day.instructions
  return <button className="routine-row program-routine-row" type="button" onClick={onSelect} aria-label={`프로그램 Day ${day.dayNumber} ${day.title}`}><span className="routine-dot" /><span className="routine-row-copy"><em>PROGRAM DAY {day.dayNumber}</em><strong>{day.title}</strong><span>{run.programName} · {status}</span><small>{exercises}</small></span><ChevronRight size={18} aria-hidden="true" /></button>
}

function EmptyState({ text }: { text: string }) { return <div className="empty-state"><Dumbbell size={18} aria-hidden="true" /><p>{text}</p></div> }
function DashboardLoading() { return <main className="dashboard-page" aria-label="대시보드 불러오는 중"><section className="dashboard-heading skeleton-heading"><div className="skeleton-line small" /><div className="skeleton-line title" /><div className="skeleton-line paragraph" /></section><section className="primary-grid"><div className="skeleton-card large" /><div className="skeleton-card large" /></section><section className="metric-grid">{[1, 2, 3, 4].map((item) => <div className="skeleton-card metric" key={item} />)}</section></main> }
function DashboardError({ onRetry }: { onRetry: () => void }) { return <main className="dashboard-page dashboard-message"><div className="message-icon"><RefreshCw size={22} /></div><p className="eyebrow">CONNECTION ISSUE</p><h1>대시보드를 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요. 기록은 기기에 안전하게 남아 있습니다.</p><button className="primary-button" type="button" onClick={onRetry}><RefreshCw size={16} /> 다시 시도</button></main> }

function getOverview(weekSessions: WorkoutSession[]) {
  const dailyVolume = Array.from({ length: 7 }, () => 0)
  weekSessions.forEach((session) => { const weekday = getMondayIndex(new Date(session.startedAt)); dailyVolume[weekday] += getSessionVolume(session) })
  const allSets = weekSessions.flatMap((session) => session.exercises.flatMap((exercise) => exercise.sets)).filter((set) => set.isCompleted)
  const rirs = allSets.flatMap((set) => set.actualRir === null ? [] : [set.actualRir])
  return { daysTrained: weekSessions.length, volume: weekSessions.reduce((sum, session) => sum + getSessionVolume(session), 0), completedSets: allSets.length, averageRir: rirs.length ? rirs.reduce((sum, rir) => sum + rir, 0) / rirs.length : null, totalMinutes: weekSessions.reduce((sum, session) => sum + getSessionDurationMinutes(session), 0), dailyVolume, maxDailyVolume: Math.max(...dailyVolume, 1) }
}

function countRoutineSets(routine: Routine) { return routine.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0) }
function formatNumber(value: number) { return new Intl.NumberFormat('ko-KR').format(Math.round(value)) }
function formatDuration(minutes: number) { if (minutes < 60) return `${minutes}분`; return `${Math.floor(minutes / 60)}시간 ${minutes % 60 ? `${minutes % 60}분` : ''}` }
function formatSessionDate(date: string) { return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(date)) }
function formatProgramDayDate(date: string) { return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T12:00:00`)) }
