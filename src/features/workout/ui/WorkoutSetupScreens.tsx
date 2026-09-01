import { Check, Dumbbell, Play } from 'lucide-react'
import { getDateInTimeZone } from '../../../lib/localDate'
import { formatRelativeDay } from '../../../lib/relativeDay'
import type { IsoDateTime, ProgramRun, ProgramRunDay, Routine } from '../../../types/domain'
import type { InitialWorkingWeightItem } from '../initialWorkingWeights'
import {
  countRoutineSets,
  formatProgramDate,
  formatProgramPickerDate,
  formatProgramSetTarget,
  formatSuggestionWeight,
} from '../lib/formatWorkout'
import { useRoutineLastPerformed } from '../model/useRoutineLastPerformed'

interface RoutinePickerProps {
  routines: Routine[]
  activeProgramRun: ProgramRun | null
  timezone: string
  selectedRoutine: Routine | undefined
  onSelect: (id: string) => void
  onSelectProgramDay: (dayId: string) => void
  onBegin: () => void
  onBeginFree: () => void
  onCancel: () => void
}

export function RoutinePicker({ routines, activeProgramRun, timezone, selectedRoutine, onSelect, onSelectProgramDay, onBegin, onBeginFree, onCancel }: RoutinePickerProps) {
  const lastPerformed = useRoutineLastPerformed()
  const today = getDateInTimeZone(timezone)
  const programDay = activeProgramRun?.days.find((day) => day.scheduledOn === today)
    ?? (activeProgramRun && today < activeProgramRun.startDate ? activeProgramRun.days[0] : null)

  return <main className="routine-picker-page" aria-labelledby="routine-picker-title">
    <section className="routine-picker-heading"><div><p className="eyebrow">START TRAINING</p><h1 id="routine-picker-title">오늘 어떤 운동을 할까요?</h1><p>루틴의 처방을 따르거나, 자유 운동에서 원하는 종목을 바로 추가해 보세요.</p></div><button className="runner-text-button" type="button" onClick={onCancel}>대시보드로 돌아가기</button></section>
    {routines.length === 0 && !programDay ? <div className="runner-empty"><Dumbbell size={24} /><h2>아직 저장된 루틴이 없어요.</h2><p>자유 운동은 지금 바로 시작할 수 있고, 프로그램이나 개인 루틴을 가져올 수도 있어요.</p></div> : <div className="routine-choice-grid">
      {programDay && <ProgramRoutineChoiceCard run={activeProgramRun!} day={programDay} today={today} onStart={() => onSelectProgramDay(programDay.id)} />}
      {routines.map((routine) => <RoutineChoiceCard
        key={routine.id}
        routine={routine}
        isSelected={selectedRoutine?.id === routine.id}
        lastPerformedAt={lastPerformed.get(routine.id) ?? null}
        onSelect={() => onSelect(routine.id)}
      />)}
    </div>}
    <div className="begin-workout-actions">
      <button className="primary-button begin-workout-button" type="button" disabled={!selectedRoutine} onClick={onBegin}><Play size={17} fill="currentColor" /> {selectedRoutine?.name ?? '루틴'} 시작</button>
      <button className="secondary-button begin-workout-button" type="button" onClick={onBeginFree}><Dumbbell size={17} /> 자유 운동으로 시작</button>
    </div>
  </main>
}

export function RunnerLoading() {
  return <main className="workout-page runner-loading" aria-label="운동 데이터를 불러오는 중"><div /><div /><div /></main>
}

export function RunnerError({ onRetry, onCancel }: { onRetry: () => void; onCancel: () => void }) {
  return <main className="routine-picker-page runner-error"><Dumbbell size={24} /><h1>운동 데이터를 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p><div><button className="primary-button" type="button" onClick={onRetry}>다시 시도</button><button className="runner-text-button" type="button" onClick={onCancel}>대시보드로 돌아가기</button></div></main>
}

export function ProgramDayUnavailable({ onCancel }: { onCancel: () => void }) {
  return <main className="routine-picker-page runner-error"><Dumbbell size={24} /><h1>시작할 수 없는 프로그램 Day예요.</h1><p>종료된 회차이거나 존재하지 않는 일정입니다.</p><div><button className="primary-button" type="button" onClick={onCancel}>프로그램으로 돌아가기</button></div></main>
}

interface InitialWorkingWeightSetupProps {
  title: string
  items: InitialWorkingWeightItem[]
  values: Record<string, string>
  weightUnit: string
  onChange: (exerciseId: string, value: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export function InitialWorkingWeightSetup({ title, items, values, weightUnit, onChange, onConfirm, onCancel }: InitialWorkingWeightSetupProps) {
  const isComplete = items.every((item) => {
    const value = values[item.exerciseId]?.trim() ?? ''
    return value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
  })

  return <main className="routine-picker-page initial-weight-page" aria-labelledby="initial-weight-title">
    <section className="routine-picker-heading"><div><p className="eyebrow">BEFORE TRAINING</p><h1 id="initial-weight-title">초기 작업 중량 확인</h1><p>{title}의 시작 중량을 확인해 주세요. 운동 중에도 세트별로 바꿀 수 있어요.</p></div><button className="runner-text-button" type="button" onClick={onCancel}>이전으로</button></section>
    <form className="initial-weight-card" onSubmit={(event) => { event.preventDefault(); onConfirm() }}>
      <div className="initial-weight-intro"><Dumbbell size={21} aria-hidden="true" /><div><strong>종목별 첫 작업 중량</strong><span>처방 또는 1RM 계산값이 있으면 제안값으로 채웠어요.</span></div></div>
      <div className="initial-weight-fields">
        {items.map((item, index) => <label key={item.exerciseId}>
          <span><strong>{item.exerciseName}</strong><small>{item.suggestedWeightKg === null ? '직접 입력' : `제안 ${formatSuggestionWeight(item.suggestedWeightKg)}${weightUnit}`}</small></span>
          <span className="initial-weight-input"><input
            data-overlay-initial-focus={index === 0 || undefined}
            aria-label={`${item.exerciseName} 초기 작업 중량`}
            type="number"
            inputMode="decimal"
            min="0"
            max="1000"
            step="0.5"
            placeholder="0"
            required
            value={values[item.exerciseId] ?? ''}
            onChange={(event) => onChange(item.exerciseId, event.target.value)}
          /><small>{weightUnit}</small></span>
        </label>)}
      </div>
      <p className="initial-weight-help">세트별 처방 중량 차이는 유지하고, 비어 있던 세트에는 입력한 중량을 넣습니다. 맨몸·유산소 종목은 이 단계에서 제외됩니다.</p>
      <div className="initial-weight-actions"><button className="secondary-button" type="button" onClick={onCancel}>취소</button><button className="primary-button" type="submit" disabled={!isComplete}><Play size={17} fill="currentColor" /> 이 중량으로 시작</button></div>
    </form>
  </main>
}

export function ProgramDayStarter({ day, missingExercises, onBegin, onCancel }: { day: ProgramRunDay; missingExercises: string[]; onBegin: () => void; onCancel: () => void }) {
  const target = day.cardioTarget
  const summary = day.dayType === 'cardio' && target
    ? [target.distanceKm !== null ? `${target.distanceKm}km` : null, target.durationMinutes !== null ? `${target.durationMinutes}분` : null, target.rpeMin !== null ? `RPE ${target.rpeMin}-${target.rpeMax ?? target.rpeMin}` : null].filter(Boolean).join(' · ')
    : day.routineSnapshot ? `${day.routineSnapshot.exercises.length}개 종목 · ${day.routineSnapshot.exercises.reduce((total, item) => total + item.sets.length, 0)}세트` : '휴식일'
  const disabled = day.dayType === 'rest' || missingExercises.length > 0
  const buttonLabel = day.workoutSession ? '다시 운동하기' : day.dayType === 'rest' ? '휴식일' : '운동 시작'

  return <main className="routine-picker-page program-day-starter" aria-labelledby="program-workout-title">
    <section className="routine-picker-heading"><div><p className="eyebrow">PROGRAM DAY {day.dayNumber}</p><h1 id="program-workout-title">{day.title}</h1><p>{formatProgramDate(day.scheduledOn)} · {summary}</p></div><button className="runner-text-button" type="button" onClick={onCancel}>프로그램으로 돌아가기</button></section>
    <article className="program-workout-preview">
      <div><span>WEEK {day.weekNumber}</span><strong>Day {day.dayNumber}</strong></div>
      <p>{day.instructions}</p>
      {day.routineSnapshot && <ol>{day.routineSnapshot.exercises.map((item) => <li key={`${item.exerciseOrder}-${item.exerciseName}`}><strong>{item.exerciseName}</strong><span>{item.sets.length}세트 · {formatProgramSetTarget(item.sets[0])}</span></li>)}</ol>}
      {missingExercises.length > 0 && <p className="runner-inline-error">운동 목록에서 찾지 못한 종목: {missingExercises.join(', ')}</p>}
      <button className="primary-button begin-workout-button" type="button" onClick={onBegin} disabled={disabled}><Play size={17} fill="currentColor" /> {buttonLabel}</button>
    </article>
  </main>
}

const ROUTINE_PREVIEW_EXERCISES = 3

function ProgramRoutineChoiceCard({ run, day, today, onStart }: { run: ProgramRun; day: ProgramRunDay; today: string; onStart: () => void }) {
  const isToday = day.scheduledOn === today
  const canStart = day.dayType !== 'rest'
  const exercises = day.routineSnapshot?.exercises ?? []
  const preview = exercises.slice(0, ROUTINE_PREVIEW_EXERCISES).map((item) => item.exerciseName).join(' · ')
  const status = day.workoutSession ? '수행 완료 · 다시 가능' : day.dayType === 'rest' ? '휴식일' : isToday ? '오늘 수행 예정' : `${formatProgramPickerDate(day.scheduledOn)} 예정`
  return <button className="routine-choice program-routine-choice" type="button" onClick={onStart} disabled={!canStart}>
    <span className="routine-choice-marker" />
    <span className="routine-choice-copy">
      <span className="program-routine-label">PROGRAM DAY {day.dayNumber}</span>
      <strong>{day.title}</strong>
      <small>{preview || day.instructions}</small>
      <em>{run.programName} · {status}</em>
    </span>
    {canStart && <span className="program-routine-start"><Play size={14} fill="currentColor" /> 시작</span>}
  </button>
}

function RoutineChoiceCard({ routine, isSelected, lastPerformedAt, onSelect }: { routine: Routine; isSelected: boolean; lastPerformedAt: IsoDateTime | null; onSelect: () => void }) {
  const preview = routine.exercises.slice(0, ROUTINE_PREVIEW_EXERCISES).map((exercise) => exercise.exerciseName).join(' · ')
  const remaining = routine.exercises.length - ROUTINE_PREVIEW_EXERCISES

  return <button className={`routine-choice ${isSelected ? 'is-selected' : ''}`} type="button" onClick={onSelect}>
    <span className="routine-choice-marker" style={{ background: routine.color ?? 'var(--accent)' }} />
    <span className="routine-choice-copy">
      <strong>{routine.name}</strong>
      <small>{preview ? `${preview}${remaining > 0 ? ` 외 ${remaining}개` : ''}` : routine.description ?? '나만의 운동 구성'}</small>
      <em>{routine.exercises.length}개 종목 · {countRoutineSets(routine)}세트</em>
      {lastPerformedAt && <span className="routine-choice-last">마지막 수행 {formatRelativeDay(lastPerformedAt, new Date())}</span>}
    </span>
    {isSelected && <span className="choice-check"><Check size={16} /></span>}
  </button>
}
