import { useDeferredValue, useEffect, useState } from 'react'
import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Footprints,
  Gauge,
  Layers3,
  MoonStar,
  Play,
  Search,
  Timer,
  X,
} from 'lucide-react'
import { Overlay } from '../../../shared/ui'
import { addCalendarDays } from '../../../lib/localDate'
import type { ProgramRun } from '../../../types/domain'
import { filterPrograms, formatDate, formatPrescription } from '../model/programView'
import { trainingProgramCatalog, type TrainingProgramDefinition } from '../programTemplate'

export function ProgramLibrary({ selectedProgram, selectedWeek, startDate, minDate, activeRun, isStarting, error, onSelectProgram, onSelectWeek, onChangeDate, onStart }: {
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

  const resetCatalog = () => setVisibleCount(8)

  return <section className="program-library" aria-labelledby="program-library-title">
    <div className="section-heading program-library-heading"><div><p className="card-kicker">PROGRAM LIBRARY</p><h2 id="program-library-title">프로그램을 골라 내 루틴으로</h2><p>목표와 가능한 운동 횟수로 찾고, 실제 Day 구성을 비교해 보세요.</p></div><span>{trainingProgramCatalog.length} PROGRAMS</span></div>
    <div className="program-catalog-toolbar">
      <label className="program-catalog-search"><Search size={17} /><input type="search" value={catalogQuery} onChange={(event) => { setCatalogQuery(event.target.value); resetCatalog() }} placeholder="프로그램 이름, 목표, 태그 검색" aria-label="프로그램 검색" /></label>
      <div className="program-catalog-filters" role="group" aria-label="주간 운동 횟수 필터">
        <button className={sessionFilter === null ? 'is-selected' : ''} type="button" aria-pressed={sessionFilter === null} onClick={() => { setSessionFilter(null); resetCatalog() }}>전체</button>
        {sessionOptions.map((sessions) => <button className={sessionFilter === sessions ? 'is-selected' : ''} type="button" aria-pressed={sessionFilter === sessions} key={sessions} onClick={() => { setSessionFilter(sessions); resetCatalog() }}>주 {sessions}회</button>)}
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
