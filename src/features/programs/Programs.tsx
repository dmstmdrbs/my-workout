import { useDeferredValue, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Dumbbell,
  Footprints,
  Gauge,
  History,
  Layers3,
  MoonStar,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  StopCircle,
  Timer,
  X,
} from 'lucide-react'
import { Overlay } from '../../components/Overlay'
import { addCalendarDays, daysBetween, getDateInTimeZone } from '../../lib/localDate'
import { useAppServices, useSettings } from '../../services'
import type { ExerciseOneRepMax, ProgramRun, ProgramRunDay } from '../../types/domain'
import { OneRepMaxSetupSheet, type OneRepMaxValue } from './OneRepMaxSetup'
import {
  getProgramOneRepMaxRequirements,
  missingProgramOneRepMaxes,
  personalizeProgramRun,
} from './programPersonalization'
import {
  getTrainingProgram,
  trainingProgramCatalog,
  type TrainingProgramDefinition,
} from './programTemplate'
import './Programs.css'

interface ProgramsProps {
  onStartDay: (dayId: string) => void
  onSelectSession: (sessionId: string) => void
}

export function Programs({ onStartDay, onSelectSession }: ProgramsProps) {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const settingsQuery = useSettings()
  const runsQuery = useQuery({ queryKey: ['program-runs'], queryFn: () => workoutRepository.listProgramRuns() })
  const personalizationQuery = useQuery({
    queryKey: ['program-personalization'],
    queryFn: async () => {
      const [exercises, maxes] = await Promise.all([
        workoutRepository.listExercises(),
        workoutRepository.listExerciseOneRepMaxes(),
      ])
      return { exercises, maxes }
    },
  })
  const [startDate, setStartDate] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [selectedProgramKey, setSelectedProgramKey] = useState(trainingProgramCatalog[0].key)
  const [previewWeek, setPreviewWeek] = useState(1)
  const [isMaxSetupOpen, setIsMaxSetupOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<'mine' | 'explore'>('mine')

  const timezone = settingsQuery.data?.timezone ?? 'Asia/Seoul'
  const today = getDateInTimeZone(timezone)
  const runs = runsQuery.data ?? []
  const activeRun = runs.find((run) => run.status === 'active') ?? null
  const activeRunId = activeRun?.id
  const activeRunStartDate = activeRun?.startDate
  const activeRunDurationWeeks = activeRun?.durationWeeks
  const selectedProgram = getTrainingProgram(selectedProgramKey)

  useEffect(() => {
    if (!startDate) setStartDate(today)
  }, [startDate, today])

  useEffect(() => {
    if (!activeRunId || !activeRunStartDate || !activeRunDurationWeeks) {
      setSelectedWeek(1)
      return
    }
    const offset = daysBetween(activeRunStartDate, today)
    setSelectedWeek(Math.min(activeRunDurationWeeks, Math.max(1, Math.floor(offset / 7) + 1)))
  }, [activeRunDurationWeeks, activeRunId, activeRunStartDate, today])

  const refreshProgramQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['program-runs'] }),
      queryClient.invalidateQueries({ queryKey: ['active-program-run'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] }),
    ])
  }

  const startMutation = useMutation({
    mutationFn: (maxes: ExerciseOneRepMax[]) => {
      if (!personalizationQuery.data) throw new Error('개인화 정보를 불러오지 못했어요.')
      const input = personalizeProgramRun(
        selectedProgram.build(startDate),
        personalizationQuery.data.exercises,
        maxes,
      )
      return workoutRepository.startProgramRun(input)
    },
    onSuccess: async () => {
      setIsMaxSetupOpen(false)
      setActiveSection('mine')
      await refreshProgramQueries()
    },
  })

  const saveMaxesAndStartMutation = useMutation({
    mutationFn: async (values: OneRepMaxValue[]) => {
      const saved = await Promise.all(values.map((value) =>
        workoutRepository.saveExerciseOneRepMax(value.exerciseId, value.oneRepMaxKg)))
      const savedIds = new Set(saved.map((item) => item.exerciseId))
      const merged = [
        ...(personalizationQuery.data?.maxes ?? []).filter((item) => !savedIds.has(item.exerciseId)),
        ...saved,
      ]
      await startMutation.mutateAsync(merged)
      return merged
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['program-personalization'] })
    },
  })

  const endMutation = useMutation({
    mutationFn: ({ run, outcome }: { run: ProgramRun; outcome: 'completed' | 'withdrawn' }) => workoutRepository.endProgramRun(run.id, outcome),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['program-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['active-program-run'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] }),
      ])
      setStartDate(today)
    },
  })

  const completeRestMutation = useMutation({
    mutationFn: (dayId: string) => workoutRepository.completeProgramRunDay(dayId),
    onSuccess: refreshProgramQueries,
  })

  if (runsQuery.isPending || settingsQuery.isPending || personalizationQuery.isPending) return <ProgramsLoading />
  if (runsQuery.isError || settingsQuery.isError || personalizationQuery.isError || !personalizationQuery.data) return <ProgramsError onRetry={() => { void runsQuery.refetch(); void settingsQuery.refetch(); void personalizationQuery.refetch() }} />

  const startInput = selectedProgram.build(startDate || today)
  const maxRequirements = getProgramOneRepMaxRequirements(startInput, personalizationQuery.data.exercises)
  const requiredMaxExercises = maxRequirements.map((requirement) => requirement.exercise)

  const beginProgram = () => {
    const missing = missingProgramOneRepMaxes(maxRequirements, personalizationQuery.data.maxes)
    if (missing.length > 0) {
      startMutation.reset()
      saveMaxesAndStartMutation.reset()
      setIsMaxSetupOpen(true)
      return
    }
    startMutation.mutate(personalizationQuery.data.maxes)
  }

  const endRun = (run: ProgramRun, outcome: 'completed' | 'withdrawn') => {
    const message = outcome === 'completed'
      ? '이 프로그램 회차를 완료할까요? 저장된 운동 기록은 그대로 유지됩니다.'
      : '프로그램을 중도 하차할까요? 지금까지 저장한 운동 기록은 유지되며, 다시 시작하면 새로운 회차의 Day 1부터 시작합니다.'
    if (window.confirm(message)) endMutation.mutate({ run, outcome })
  }

  return <main className="programs-page">
    <header className="programs-heading">
      <div><p className="eyebrow">TRAINING PROGRAM</p><h1>8주의 흐름을 놓치지 않게.</h1><p>예정일은 가이드로 보고, 원하는 Day를 수행하거나 다시 복습할 수 있습니다.</p></div>
      {activeRun && <span className="program-active-pill"><span /> {activeRun.startDate} 시작</span>}
    </header>

    <nav className="program-section-tabs" role="tablist" aria-label="프로그램 메뉴">
      <button id="my-programs-tab" type="button" role="tab" aria-selected={activeSection === 'mine'} aria-controls="my-programs-panel" className={activeSection === 'mine' ? 'is-selected' : ''} onClick={() => setActiveSection('mine')}>
        <Dumbbell size={17} /><span>내 프로그램</span>{activeRun && <em>진행 중</em>}
      </button>
      <button id="explore-programs-tab" type="button" role="tab" aria-selected={activeSection === 'explore'} aria-controls="explore-programs-panel" className={activeSection === 'explore' ? 'is-selected' : ''} onClick={() => setActiveSection('explore')}>
        <Compass size={17} /><span>둘러보기</span><em>{trainingProgramCatalog.length}</em>
      </button>
    </nav>

    <section id="my-programs-panel" className="program-tab-panel" role="tabpanel" aria-labelledby="my-programs-tab" hidden={activeSection !== 'mine'}>
      {activeRun ? <ActiveProgram
          run={activeRun}
          today={today}
          selectedWeek={selectedWeek}
          onSelectWeek={setSelectedWeek}
          onStartDay={onStartDay}
          onSelectSession={onSelectSession}
          onCompleteRest={(dayId) => completeRestMutation.mutate(dayId)}
          completingRestDayId={completeRestMutation.isPending ? completeRestMutation.variables : null}
          restCompletionError={completeRestMutation.isError ? getErrorMessage(completeRestMutation.error) : null}
          onEnd={(outcome) => endRun(activeRun, outcome)}
          isEnding={endMutation.isPending}
        /> : <ProgramEmptyState onExplore={() => setActiveSection('explore')} />}

      <ProgramHistory runs={runs.filter((run) => run.status !== 'active')} onSelectSession={onSelectSession} />
    </section>

    <section id="explore-programs-panel" className="program-tab-panel" role="tabpanel" aria-labelledby="explore-programs-tab" hidden={activeSection !== 'explore'}>
      <ProgramLibrary
        selectedProgram={selectedProgram}
        selectedWeek={previewWeek}
        startDate={startDate}
        minDate={today}
        activeRun={activeRun}
        isStarting={startMutation.isPending || saveMaxesAndStartMutation.isPending}
        error={startMutation.isError ? getErrorMessage(startMutation.error) : saveMaxesAndStartMutation.isError ? getErrorMessage(saveMaxesAndStartMutation.error) : null}
        onSelectProgram={(key) => { setSelectedProgramKey(key); setPreviewWeek(1); startMutation.reset() }}
        onSelectWeek={setPreviewWeek}
        onChangeDate={setStartDate}
        onStart={beginProgram}
      />
    </section>

    <OneRepMaxSetupSheet
      isOpen={isMaxSetupOpen}
      exercises={requiredMaxExercises}
      maxes={personalizationQuery.data.maxes}
      isSaving={saveMaxesAndStartMutation.isPending}
      error={saveMaxesAndStartMutation.isError ? getErrorMessage(saveMaxesAndStartMutation.error) : null}
      onClose={() => setIsMaxSetupOpen(false)}
      onSave={(values) => saveMaxesAndStartMutation.mutate(values)}
    />

  </main>
}

function ProgramEmptyState({ onExplore }: { onExplore: () => void }) {
  return <section className="program-empty-state">
    <span><Compass size={24} /></span>
    <div><p className="card-kicker">MY PROGRAM</p><h2>진행 중인 프로그램이 없어요.</h2><p>목표와 일정에 맞는 프로그램을 둘러보고 Day 1부터 시작해 보세요.</p></div>
    <button className="primary-button" type="button" onClick={onExplore}><Compass size={17} /> 프로그램 둘러보기</button>
  </section>
}

function ProgramLibrary({ selectedProgram, selectedWeek, startDate, minDate, activeRun, isStarting, error, onSelectProgram, onSelectWeek, onChangeDate, onStart }: {
  selectedProgram: TrainingProgramDefinition
  selectedWeek: number
  startDate: string
  minDate: string
  activeRun: ProgramRun | null
  isStarting: boolean
  error: string | null
  onSelectProgram: (key: string) => void
  onSelectWeek: (week: number) => void
  onChangeDate: (date: string) => void
  onStart: () => void
}) {
  const [catalogQuery, setCatalogQuery] = useState('')
  const [sessionFilter, setSessionFilter] = useState<number | null>(null)
  const [visibleCount, setVisibleCount] = useState(8)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const deferredQuery = useDeferredValue(catalogQuery)
  const sessionOptions = [...new Set(trainingProgramCatalog.map((program) => program.sessionsPerWeek))].sort((a, b) => a - b)
  const filteredPrograms = filterPrograms(deferredQuery, sessionFilter)
  const visiblePrograms = filteredPrograms.slice(0, visibleCount)

  useEffect(() => {
    if (activeRun) setIsDetailOpen(false)
  }, [activeRun])

  return <section className="program-library" aria-labelledby="program-library-title">
    <div className="section-heading program-library-heading"><div><p className="card-kicker">PROGRAM LIBRARY</p><h2 id="program-library-title">프로그램을 골라 내 루틴으로</h2><p>목표와 가능한 운동 횟수로 찾고, 실제 Day 구성을 비교해 보세요.</p></div><span>{trainingProgramCatalog.length} PROGRAMS</span></div>
    <div className="program-catalog-toolbar">
      <label className="program-catalog-search"><Search size={17} /><input type="search" value={catalogQuery} onChange={(event) => { setCatalogQuery(event.target.value); setVisibleCount(8) }} placeholder="프로그램 이름, 목표, 태그 검색" aria-label="프로그램 검색" /></label>
      <div className="program-catalog-filters" role="group" aria-label="주간 운동 횟수 필터">
        <button className={sessionFilter === null ? 'is-selected' : ''} type="button" aria-pressed={sessionFilter === null} onClick={() => { setSessionFilter(null); setVisibleCount(8) }}>전체</button>
        {sessionOptions.map((sessions) => <button className={sessionFilter === sessions ? 'is-selected' : ''} type="button" aria-pressed={sessionFilter === sessions} key={sessions} onClick={() => { setSessionFilter(sessions); setVisibleCount(8) }}>주 {sessions}회</button>)}
      </div>
      <span className="program-catalog-result" role="status" aria-live="polite"><strong>{filteredPrograms.length}</strong>개 찾음</span>
    </div>
    <div className="program-catalog-grid">
      {visiblePrograms.map((program) => {
        const index = trainingProgramCatalog.findIndex((item) => item.key === program.key)
        const isSelected = program.key === selectedProgram.key
        return <button className={`program-catalog-card ${isSelected ? 'is-selected' : ''}`} style={{ '--program-color': program.color } as React.CSSProperties} type="button" key={program.key} onClick={() => { onSelectProgram(program.key); setIsDetailOpen(true) }} aria-haspopup="dialog">
          <span className="program-catalog-visual">
            <span className="program-catalog-icon"><ProgramCatalogIcon programKey={program.key} /></span>
            <span className="program-catalog-index">{String(index + 1).padStart(2, '0')}</span>
          </span>
          <span className="program-catalog-copy">
            <small>{program.eyebrow}</small>
            <strong>{program.name}</strong>
            <em>{program.focus}</em>
            <span className="program-catalog-tags">{program.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</span>
          </span>
          <span className="program-catalog-meta">
            <span><b>{program.durationWeeks}</b>주</span><span><b>{program.sessionsPerWeek}</b>회/주</span>
            <strong>프로그램 보기 <ChevronRight size={15} /></strong>
          </span>
        </button>
      })}
    </div>
    {filteredPrograms.length === 0 && <div className="program-catalog-empty"><Search size={22} /><strong>조건에 맞는 프로그램이 없어요.</strong><p>검색어나 주간 횟수 필터를 바꿔보세요.</p></div>}
    {visiblePrograms.length < filteredPrograms.length && <button className="program-catalog-more" type="button" onClick={() => setVisibleCount((current) => current + 8)}><ChevronDown size={17} /> 프로그램 더 보기 <span>{filteredPrograms.length - visiblePrograms.length}개 남음</span></button>}

    <ProgramDetailSheet
      key={selectedProgram.key}
      isOpen={isDetailOpen}
      program={selectedProgram}
      selectedWeek={selectedWeek}
      startDate={startDate}
      minDate={minDate}
      activeRun={activeRun}
      isStarting={isStarting}
      error={error}
      onClose={() => setIsDetailOpen(false)}
      onSelectWeek={onSelectWeek}
      onChangeDate={onChangeDate}
      onStart={onStart}
    />
  </section>
}

function ProgramDetailSheet({ isOpen, program, selectedWeek, startDate, minDate, activeRun, isStarting, error, onClose, onSelectWeek, onChangeDate, onStart }: {
  isOpen: boolean
  program: TrainingProgramDefinition
  selectedWeek: number
  startDate: string
  minDate: string
  activeRun: ProgramRun | null
  isStarting: boolean
  error: string | null
  onClose: () => void
  onSelectWeek: (week: number) => void
  onChangeDate: (date: string) => void
  onStart: () => void
}) {
  const preview = program.build(startDate || minDate)
  const weekDays = preview.days.filter((day) => Math.ceil(day.dayNumber / 7) === selectedWeek)
  const [selectedPreviewDayNumber, setSelectedPreviewDayNumber] = useState<number | null>(null)
  const selectedPreviewDay = weekDays.find((day) => day.dayNumber === selectedPreviewDayNumber) ?? weekDays[0]
  const endDate = addCalendarDays(startDate || minDate, program.durationWeeks * 7 - 1)
  const selectPreviewWeek = (week: number) => {
    setSelectedPreviewDayNumber(null)
    onSelectWeek(week)
  }

  return <Overlay isOpen={isOpen} onClose={onClose} presentation="sheet" labelledBy="program-detail-sheet-title" className="program-detail-sheet">
    <div className="program-sheet-grabber" aria-hidden="true"><span /></div>
    <header className="program-sheet-header">
      <div><p className="card-kicker">PROGRAM DETAIL</p><h2 id="program-detail-sheet-title">{program.name}</h2></div>
      <button className="icon-button" type="button" onClick={onClose} aria-label="프로그램 상세 닫기"><X size={19} /></button>
    </header>
    <div className="program-detail-sheet-body" style={{ '--program-color': program.color } as React.CSSProperties}>
      <section className="program-detail-heading">
        <div><p className="card-kicker">{program.eyebrow}</p><h3>{program.name}</h3><p>{program.summary}</p><div className="program-tags">{program.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
        <div className="program-detail-stat"><CalendarDays size={21} /><strong>{program.durationWeeks * 7}</strong><span>고정 Day</span></div>
      </section>
      <div className="program-preview-heading"><div><p className="card-kicker">ROUTINE PREVIEW</p><h3>{selectedWeek}주차 Day 구성</h3></div><div><button type="button" onClick={() => selectPreviewWeek(Math.max(1, selectedWeek - 1))} disabled={selectedWeek === 1} aria-label="미리보기 이전 주"><ChevronLeft size={18} /></button><span>{selectedWeek} / {program.durationWeeks}</span><button type="button" onClick={() => selectPreviewWeek(Math.min(program.durationWeeks, selectedWeek + 1))} disabled={selectedWeek === program.durationWeeks} aria-label="미리보기 다음 주"><ChevronRight size={18} /></button></div></div>
      <div className="program-preview-day-tabs" role="tablist" aria-label={`${selectedWeek}주차 Day 선택`}>
        {weekDays.map((day) => {
          const Icon = day.dayType === 'rest' ? MoonStar : day.dayType === 'cardio' ? Footprints : Dumbbell
          const isSelected = selectedPreviewDay?.dayNumber === day.dayNumber
          return <button type="button" role="tab" aria-selected={isSelected} className={isSelected ? 'is-selected' : ''} key={day.dayNumber} onClick={() => setSelectedPreviewDayNumber(day.dayNumber)}>
            <span><Icon size={16} /></span><small>DAY {day.dayNumber}</small><strong>{day.title}</strong>
          </button>
        })}
      </div>
      <div className="program-routine-preview">{selectedPreviewDay && <ProgramTemplateDay day={selectedPreviewDay} />}</div>
    </div>
    <footer className="program-import-panel">
      <div className="program-start-form">
        <label>시작일<input type="date" value={startDate} min={minDate} onChange={(event) => onChangeDate(event.target.value)} /></label>
        <button className="primary-button" type="button" onClick={onStart} disabled={!startDate || isStarting || Boolean(activeRun)}><Play size={17} fill="currentColor" /> {isStarting ? '내 루틴에 가져오는 중' : '프로그램 시작하기 · 내 루틴에 가져오기'}</button>
      </div>
      {activeRun ? <p className="program-import-note">현재 진행 중인 <strong>{activeRun.programName}</strong> 회차를 종료하면 이 프로그램을 시작할 수 있습니다.</p> : <p className="program-import-note">{formatDate(startDate || minDate)}이 Day 1이며, {formatDate(endDate)}까지 내 루틴에 매일의 Program Day가 표시됩니다.</p>}
      {error && <p className="program-error" role="alert">{error}</p>}
    </footer>
  </Overlay>
}

function ProgramCatalogIcon({ programKey }: { programKey: string }) {
  if (programKey.includes('plateau')) return <Gauge size={24} />
  if (programKey.includes('specialization')) return <Layers3 size={24} />
  if (programKey.includes('busy')) return <Timer size={24} />
  return <BriefcaseBusiness size={24} />
}

function filterPrograms(query: string, sessionsPerWeek: number | null) {
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR')
  return trainingProgramCatalog.filter((program) => {
    if (sessionsPerWeek !== null && program.sessionsPerWeek !== sessionsPerWeek) return false
    if (!normalizedQuery) return true
    const searchable = [program.name, program.eyebrow, program.focus, ...program.tags].join(' ').toLocaleLowerCase('ko-KR')
    return searchable.includes(normalizedQuery)
  })
}

function ProgramTemplateDay({ day }: { day: ReturnType<TrainingProgramDefinition['build']>['days'][number] }) {
  const Icon = day.dayType === 'rest' ? MoonStar : day.dayType === 'cardio' ? Footprints : Dumbbell
  const exercises = day.routineSnapshot?.exercises ?? []
  const summary = day.dayType === 'rest' ? '계획된 휴식' : day.dayType === 'cardio' ? `${day.cardioTarget?.distanceKm ?? ''}km · RPE ${day.cardioTarget?.rpeMin}-${day.cardioTarget?.rpeMax}` : `${exercises.length}개 종목 · ${exercises.reduce((sum, item) => sum + item.sets.length, 0)}세트`
  return <article className="program-template-day">
    <header><span className="program-template-icon"><Icon size={17} /></span><span><small>DAY {day.dayNumber}</small><strong>{day.title}</strong></span><em>{summary}</em></header>
    <div className="program-template-content">
      <p>{day.instructions}</p>
      {exercises.length > 0 && <ol>{exercises.map((item) => <li key={item.exerciseOrder}><span>{item.exerciseOrder}</span><strong>{item.exerciseName}</strong><small>{item.sets.length}세트 · {formatPrescription(item.sets[0])}</small></li>)}</ol>}
      {day.cardioTarget && <div className="program-cardio-target"><Footprints size={17} /><span><strong>{day.cardioTarget.distanceKm}km 러닝</strong><small>목표 RPE {day.cardioTarget.rpeMin}-{day.cardioTarget.rpeMax}</small></span></div>}
    </div>
  </article>
}

function ActiveProgram({ run, today, selectedWeek, onSelectWeek, onStartDay, onSelectSession, onCompleteRest, completingRestDayId, restCompletionError, onEnd, isEnding }: { run: ProgramRun; today: string; selectedWeek: number; onSelectWeek: (week: number) => void; onStartDay: (dayId: string) => void; onSelectSession: (sessionId: string) => void; onCompleteRest: (dayId: string) => void; completingRestDayId: string | null; restCompletionError: string | null; onEnd: (outcome: 'completed' | 'withdrawn') => void; isEnding: boolean }) {
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

function ProgramDayCard({ day, today, selected, onSelect }: { day: ProgramRunDay; today: string; selected: boolean; onSelect: () => void }) {
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

function ProgramHistory({ runs, onSelectSession }: { runs: ProgramRun[]; onSelectSession: (sessionId: string) => void }) {
  if (runs.length === 0) return null
  return <section className="program-history"><div className="section-heading"><div><p className="card-kicker">RUN HISTORY</p><h2>지난 프로그램 회차</h2></div><History size={19} /></div><div className="program-history-list">{runs.map((run, index) => {
    const sessions = run.days.flatMap((day) => day.workoutSession ? [{ ...day.workoutSession, day }] : [])
    return <details key={run.id}><summary><span className="history-index">{String(runs.length - index).padStart(2, '0')}</span><span><strong>{run.programName}</strong><small>{formatDate(run.startDate)} 시작 · {sessions.length}회 기록 · {run.status === 'completed' ? '완료' : '중도 하차'}</small></span><RotateCcw size={17} /></summary><div className="history-sessions">{sessions.length === 0 ? <p>이 회차에 저장된 운동 기록이 없습니다.</p> : sessions.map((session) => <button type="button" key={session.id} onClick={() => onSelectSession(session.id)}><span>Day {session.day.dayNumber}</span><strong>{session.day.title}</strong><small>{formatShortDate(session.day.scheduledOn)}</small><ChevronRight size={16} /></button>)}</div></details>
  })}</div></section>
}

function ProgramsLoading() { return <main className="programs-page" aria-label="프로그램 불러오는 중"><div className="programs-loading" /><div className="programs-loading large" /></main> }
function ProgramsError({ onRetry }: { onRetry: () => void }) { return <main className="programs-page programs-error"><RefreshCw size={24} /><h1>프로그램을 불러오지 못했어요.</h1><button className="primary-button" type="button" onClick={onRetry}><RefreshCw size={16} /> 다시 시도</button></main> }
function formatDate(value: string) { return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${value}T12:00:00`)) }
function formatShortDate(value: string) { return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T12:00:00`)) }
function formatPrescription(set: NonNullable<ReturnType<TrainingProgramDefinition['build']>['days'][number]['routineSnapshot']>['exercises'][number]['sets'][number]) {
  if (set.targetRepsMin === null && set.targetRepsMax === null) return set.notes ?? '시간·거리 기록'
  const reps = set.targetRepsMin === set.targetRepsMax ? `${set.targetRepsMin}회` : `${set.targetRepsMin}-${set.targetRepsMax}회`
  const load = set.targetWeightKg !== null ? `${set.targetWeightKg}kg` : set.targetOneRepMaxPercent != null ? `1RM ${set.targetOneRepMaxPercent}%` : '자율 중량'
  return `${load} · ${reps} · RIR ${set.targetRir ?? '–'}`
}
function formatDetailedPrescription(set: NonNullable<ProgramRunDay['routineSnapshot']>['exercises'][number]['sets'][number]) {
  if (set.targetRepsMin === null && set.targetRepsMax === null) return set.notes ?? '시간·거리 기록'
  const reps = set.targetRepsMin === set.targetRepsMax ? `${set.targetRepsMin}회` : `${set.targetRepsMin}-${set.targetRepsMax}회`
  const load = set.targetWeightKg !== null
    ? `${set.targetWeightKg}kg${set.targetOneRepMaxPercent != null ? ` · ${set.targetOneRepMaxPercent}%` : ''}`
    : set.targetOneRepMaxPercent != null ? `1RM ${set.targetOneRepMaxPercent}%` : '자율'
  return `${load} · ${reps} · RIR ${set.targetRir ?? '–'}`
}
function getErrorMessage(error: unknown) { return error instanceof Error ? error.message : '프로그램을 시작하지 못했어요.' }
function isProgramDayCompleted(day: ProgramRunDay) { return Boolean(day.completedAt || day.workoutSession) }
