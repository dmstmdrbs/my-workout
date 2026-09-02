import type { Ref } from 'react'
import { ChevronRight, Dumbbell, Plus } from 'lucide-react'
import type { ProgramRunDay, Routine } from '../../../types/domain'
import { countSets } from '../model/routineDraft'

export function RoutineListPane({ routines, activeProgramName, programDay, today, canStartProgramDay, selectedRoutineId, onStartProgramDay, onSelectRoutine, onCreateRoutine, routineListPaneRef }: {
  routines: Routine[]
  activeProgramName: string | null
  programDay: ProgramRunDay | null
  today: string | null
  canStartProgramDay: boolean
  selectedRoutineId: string | null
  onStartProgramDay?: (dayId: string) => void
  onSelectRoutine: (routine: Routine) => void
  onCreateRoutine: () => void
  routineListPaneRef: Ref<HTMLElement>
}) {
  const routineCount = routines.length + (programDay ? 1 : 0)

  return <aside className="routine-list-pane" aria-label="루틴 목록" ref={routineListPaneRef} tabIndex={-1}>
    <div className="routine-list-heading"><span>내 루틴</span><strong>{routineCount}</strong></div>
    {routines.length === 0 && !programDay ? (
      <div className="routine-list-empty"><Dumbbell size={20} aria-hidden="true" /><p>아직 만든 루틴이 없어요.</p></div>
    ) : (
      <div className="routine-list">
        {programDay && <button className="routine-list-item program-routine-list-item" type="button" onClick={() => canStartProgramDay && onStartProgramDay?.(programDay.id)} disabled={!canStartProgramDay}>
          <span className="routine-color-dot" aria-hidden="true" />
          <span className="routine-list-copy"><span>PROGRAM DAY {programDay.dayNumber}</span><strong>{programDay.title}</strong><small>{activeProgramName} · {programDay.workoutSession ? '완료' : programDay.dayType === 'rest' ? '휴식일' : programDay.scheduledOn === today ? '오늘 수행' : `${programDay.scheduledOn} 시작`}</small></span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>}
        {routines.map((routine) => (
          <button
            className={`routine-list-item ${selectedRoutineId === routine.id ? 'is-selected' : ''}`}
            key={routine.id}
            type="button"
            onClick={() => onSelectRoutine(routine)}
            aria-current={selectedRoutineId === routine.id ? 'true' : undefined}
          >
            <span className="routine-color-dot" style={{ background: routine.color ?? 'var(--accent)' }} aria-hidden="true" />
            <span className="routine-list-copy"><strong>{routine.name}</strong><small>{routine.exercises.length}개 종목 · {countSets(routine.exercises)}세트</small></span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        ))}
      </div>
    )}
    <button className="routine-list-create" type="button" onClick={onCreateRoutine}><Plus size={16} aria-hidden="true" /> 새 루틴 만들기</button>
  </aside>
}
