import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { muscleLabel } from '../../../entities/exercise'
import { suggestNextLoad } from '../../../lib/loadSuggestion'
import type { Equipment, WorkoutExercise, WorkoutSetRecord } from '../../../types/domain'
import { formatPreviousSessionSummary, formatSuggestionWeight } from '../lib/formatWorkout'
import { usePreviousExerciseSession } from '../model/usePreviousExerciseSession'
import { SetRow } from '../SetRow'

interface WorkoutExerciseCardProps {
  exercise: WorkoutExercise
  weightUnit: string
  equipment: Equipment
  rirInputEnabled: boolean
  onChangeSet: (setId: string, changes: Partial<WorkoutSetRecord>) => void
  onCompleteSet: (set: WorkoutSetRecord) => void
  onAddSet: () => void
  onReplace: () => void
  onRemove: () => void
}

export function WorkoutExerciseCard({ exercise, weightUnit, equipment, rirInputEnabled, onChangeSet, onCompleteSet, onAddSet, onReplace, onRemove }: WorkoutExerciseCardProps) {
  const previousSessionQuery = usePreviousExerciseSession(exercise.exerciseId)
  const previousSession = previousSessionQuery.data ?? null
  const previousSet = previousSession?.sets.at(-1) ?? null
  const titleId = `exercise-title-${exercise.id}`
  const isBodyweight = equipment === 'bodyweight'
  // 유산소는 중량 × 횟수로 적을 수 없다. 같은 자리에 시간과 거리를 받는다.
  const isCardio = equipment === 'cardio'
  const weightShortLabel = isBodyweight ? '추가 중량' : '중량'
  const weightLabel = `${weightShortLabel} (${weightUnit})`

  return <section className="exercise-workspace" aria-labelledby={titleId}>
    <div className="exercise-workspace-heading">
      <div>
        <p className="eyebrow">{muscleLabel(exercise.primaryMuscle)}</p>
        <h2 id={titleId}>{exercise.exerciseName}</h2>
        {exercise.notes && <p className="exercise-note">{exercise.notes}</p>}
      </div>
      <div className="exercise-workspace-actions">
        <div className="previous-context"><span>이전 완료 세션</span><strong>{formatPreviousSessionSummary(previousSession)}</strong></div>
        <div className="exercise-workspace-buttons">
          <button className="exercise-replace-button" type="button" onClick={onReplace}><RefreshCw size={15} /> 종목 교체</button>
          <button className="exercise-remove-button" type="button" onClick={onRemove}><Trash2 size={15} /> 종목 삭제</button>
        </div>
      </div>
    </div>

    {rirInputEnabled && <LoadSuggestionBanner
      previousSet={previousSet}
      weightUnit={weightUnit}
      onApply={(weightKg) => {
        const target = exercise.sets.find((set) => !set.isCompleted)
        if (target) onChangeSet(target.id, { weightKg })
      }}
    />}

    <div className="set-table" role="region" aria-label={`${exercise.exerciseName} 세트 기록`} tabIndex={0}>
      <div className={`set-row set-table-head ${rirInputEnabled ? '' : 'is-rir-hidden'}`} aria-hidden="true"><span>세트</span><span>{isCardio ? '시간 (분)' : weightLabel}</span><span>{isCardio ? '거리 (km)' : '횟수'}</span><span>목표 RIR</span>{rirInputEnabled && <span>실제 RIR</span>}<span /></div>
      {exercise.sets.map((set) => <SetRow
        key={set.id}
        set={set}
        weightUnit={weightUnit}
        weightLabel={weightLabel}
        weightShortLabel={weightShortLabel}
        isBodyweight={isBodyweight}
        isCardio={isCardio}
        rirInputEnabled={rirInputEnabled}
        onChange={(changes) => onChangeSet(set.id, changes)}
        onComplete={() => onCompleteSet(set)}
      />)}
    </div>
    <button className="add-set-button" type="button" onClick={onAddSet}><Plus size={17} /> 본세트 추가</button>
  </section>
}

/** 지난 세트의 목표/실제 RIR 차이로 다음 중량을 제안한다. */
function LoadSuggestionBanner({ previousSet, weightUnit, onApply }: { previousSet: WorkoutSetRecord | null; weightUnit: string; onApply: (weightKg: number) => void }) {
  const suggestion = suggestNextLoad(previousSet)
  if (!suggestion) return null

  const { weightKg, deltaKg, reason, previousWeightKg, targetRir, actualRir } = suggestion
  const verdict = reason === 'harder'
    ? '계획보다 힘들었어요'
    : reason === 'easier'
      ? '계획보다 여유 있었어요'
      : '계획대로였어요'
  const advice = deltaKg === 0
    ? `${formatSuggestionWeight(weightKg)}${weightUnit} 그대로 가보세요`
    : `${formatSuggestionWeight(weightKg)}${weightUnit}로 ${deltaKg > 0 ? '올려' : '낮춰'} 보세요`

  return <div className={`load-suggestion tone-${reason}`} role="note">
    <div className="load-suggestion-copy">
      <strong>{verdict}</strong>
      <small>지난 세트 {formatSuggestionWeight(previousWeightKg)}{weightUnit} · 목표 RIR {targetRir} → 실제 {actualRir}</small>
    </div>
    <button type="button" className="load-suggestion-apply" onClick={() => onApply(weightKg)}>{advice}</button>
  </div>
}
