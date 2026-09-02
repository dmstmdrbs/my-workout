import { Check, Minus, Plus, Trash2 } from 'lucide-react'
import {
  DISTANCE_STEP_KM,
  DURATION_STEP_SECONDS,
  REPS_STEP,
  WEIGHT_STEP,
  decrementValue,
  formatRir,
  incrementValue,
  rirChoices,
  roundDistance,
  setTypeLabel,
  setTypeMarker,
  toNullableInteger,
  toNullableMinutes,
  toNullableNumber,
} from '../../entities/workout'
import type { WorkoutSetRecord } from '../../types/domain'
// 세트 행의 스타일(.set-row, .numeric-stepper, .rir-choice-row …)은
// WorkoutRunner.css의 미디어쿼리 네 곳에 다른 규칙과 한 줄로 뭉쳐 있다.
// 떼어내면 반응형이 조용히 깨질 위험이 이득보다 크므로, 컴포넌트가 그 파일을
// 직접 import해 스타일이 컴포넌트와 함께 따라가게만 했다. CSS 분리는 별도
// 작업으로 남긴다.
import './WorkoutRunner.css'

/**
 * 세트 한 줄. 운동 진행 화면(`WorkoutRunner`)과 완료된 기록 편집 화면
 * (`RecordEditor`)이 함께 쓴다.
 *
 * 맨 끝 칸은 화면에 따라 다르다. 진행 중에는 세트를 완료 처리하는 버튼이,
 * 이미 완료된 기록을 고칠 때는 세트를 지우는 버튼이 온다. 둘 다 없으면 빈
 * 칸으로 둔다.
 */
export interface SetRowProps {
  set: WorkoutSetRecord
  weightUnit: string
  weightLabel: string
  weightShortLabel: string
  isBodyweight: boolean
  isCardio: boolean
  rirInputEnabled: boolean
  onChange: (changes: Partial<WorkoutSetRecord>) => void
  onComplete?: () => void
  onDelete?: () => void
  /** 지정하면 삭제 버튼을 비활성화하고 이 문구를 이유로 알린다. */
  deleteDisabledReason?: string
}

export function SetRow({ set, weightUnit, weightLabel, weightShortLabel, isBodyweight, isCardio, rirInputEnabled, onChange, onComplete, onDelete, deleteDisabledReason }: SetRowProps) {
  if (isCardio) return <CardioSetRow set={set} rirInputEnabled={rirInputEnabled} onChange={onChange} onComplete={onComplete} onDelete={onDelete} deleteDisabledReason={deleteDisabledReason} />

  return <div className={`set-row ${set.isCompleted ? 'is-completed' : ''} ${rirInputEnabled ? '' : 'is-rir-hidden'}`}>
    <SetNumber set={set} />
    <label>
      <span className="mobile-field-label">{weightLabel}</span>
      <div className="numeric-stepper">
        <button type="button" className="stepper-button" aria-label={`${set.setOrder}세트 ${weightShortLabel} ${WEIGHT_STEP}${weightUnit} 감소`} onClick={() => onChange({ weightKg: decrementValue(set.weightKg, WEIGHT_STEP) })}><Minus size={14} /></button>
        <input aria-label={`${set.setOrder}세트 ${weightLabel}`} inputMode="decimal" type="number" min="0" step="0.5" placeholder={isBodyweight ? '맨몸' : undefined} value={set.weightKg ?? ''} onChange={(event) => onChange({ weightKg: toNullableNumber(event.target.value) })} />
        <button type="button" className="stepper-button" aria-label={`${set.setOrder}세트 ${weightShortLabel} ${WEIGHT_STEP}${weightUnit} 증가`} onClick={() => onChange({ weightKg: incrementValue(set.weightKg, WEIGHT_STEP) })}><Plus size={14} /></button>
      </div>
    </label>
    <label>
      <span className="mobile-field-label">횟수</span>
      <div className="numeric-stepper">
        <button type="button" className="stepper-button" aria-label={`${set.setOrder}세트 횟수 ${REPS_STEP} 감소`} onClick={() => onChange({ reps: decrementValue(set.reps, REPS_STEP) })}><Minus size={14} /></button>
        <input aria-label={`${set.setOrder}세트 횟수`} inputMode="numeric" type="number" min="0" step="1" value={set.reps ?? ''} onChange={(event) => onChange({ reps: toNullableInteger(event.target.value) })} />
        <button type="button" className="stepper-button" aria-label={`${set.setOrder}세트 횟수 ${REPS_STEP} 증가`} onClick={() => onChange({ reps: incrementValue(set.reps, REPS_STEP) })}><Plus size={14} /></button>
      </div>
    </label>
    <span className="target-rir"><small className="mobile-field-label">목표 RIR</small>{formatRir(set.targetRir)}</span>
    {rirInputEnabled && <ActualRirPicker set={set} onChange={onChange} />}
    <SetRowTrailingAction set={set} onComplete={onComplete} onDelete={onDelete} deleteDisabledReason={deleteDisabledReason} />
  </div>
}

/**
 * 유산소 세트는 중량·횟수 대신 시간과 거리를 받는다. 시간은 초로 저장하고
 * 화면에서는 분으로 다룬다 -- 러닝 기록을 "1800초"로 적는 사람은 없다.
 * RIR 열은 그대로 두되 값이 없으면 비워 둔다. 유산소에 목표 RIR을 처방하는
 * 경우는 드물지만, 넣고 싶은 사람의 자리를 없앨 이유도 없다.
 */
function CardioSetRow({ set, rirInputEnabled, onChange, onComplete, onDelete, deleteDisabledReason }: Pick<SetRowProps, 'set' | 'rirInputEnabled' | 'onChange' | 'onComplete' | 'onDelete' | 'deleteDisabledReason'>) {
  const minutes = set.durationSeconds === null ? '' : String(Math.round(set.durationSeconds / 60))
  const stepDuration = (delta: number) => onChange({ durationSeconds: Math.max(0, (set.durationSeconds ?? 0) + delta) })
  const stepDistance = (delta: number) => onChange({ distanceKm: roundDistance(Math.max(0, (set.distanceKm ?? 0) + delta)) })

  return <div className={`set-row ${set.isCompleted ? 'is-completed' : ''} ${rirInputEnabled ? '' : 'is-rir-hidden'}`}>
    <SetNumber set={set} />
    <label>
      <span className="mobile-field-label">시간 (분)</span>
      <div className="numeric-stepper">
        <button type="button" className="stepper-button" aria-label={`${set.setOrder}세트 시간 1분 감소`} onClick={() => stepDuration(-DURATION_STEP_SECONDS)}><Minus size={14} /></button>
        <input aria-label={`${set.setOrder}세트 시간 (분)`} inputMode="numeric" type="number" min="0" step="1" value={minutes} onChange={(event) => onChange({ durationSeconds: toNullableMinutes(event.target.value) })} />
        <button type="button" className="stepper-button" aria-label={`${set.setOrder}세트 시간 1분 증가`} onClick={() => stepDuration(DURATION_STEP_SECONDS)}><Plus size={14} /></button>
      </div>
    </label>
    <label>
      <span className="mobile-field-label">거리 (km)</span>
      <div className="numeric-stepper">
        <button type="button" className="stepper-button" aria-label={`${set.setOrder}세트 거리 0.1km 감소`} onClick={() => stepDistance(-DISTANCE_STEP_KM)}><Minus size={14} /></button>
        <input aria-label={`${set.setOrder}세트 거리 (km)`} inputMode="decimal" type="number" min="0" step="0.1" value={set.distanceKm ?? ''} onChange={(event) => onChange({ distanceKm: toNullableNumber(event.target.value) })} />
        <button type="button" className="stepper-button" aria-label={`${set.setOrder}세트 거리 0.1km 증가`} onClick={() => stepDistance(DISTANCE_STEP_KM)}><Plus size={14} /></button>
      </div>
    </label>
    <span className="target-rir"><small className="mobile-field-label">목표 RIR</small>{formatRir(set.targetRir)}</span>
    {rirInputEnabled && <ActualRirPicker set={set} onChange={onChange} />}
    <SetRowTrailingAction set={set} onComplete={onComplete} onDelete={onDelete} deleteDisabledReason={deleteDisabledReason} />
  </div>
}

function ActualRirPicker({ set, onChange }: Pick<SetRowProps, 'set' | 'onChange'>) {
  return <div className="actual-rir">
    <span className="mobile-field-label">실제 RIR</span>
    <div className="rir-choice-row" role="group" aria-label={`${set.setOrder}세트 실제 RIR`}>
      {rirChoices.map((choice) => <button className={set.actualRir === choice.value ? 'is-selected' : ''} type="button" key={choice.value} onClick={() => onChange({ actualRir: choice.value })}>{choice.label}</button>)}
      <button className={set.actualRir === null ? 'is-selected is-empty' : 'is-empty'} type="button" onClick={() => onChange({ actualRir: null })}>–</button>
    </div>
    <select className="rir-compact-select" aria-label={`${set.setOrder}세트 실제 RIR 선택`} value={set.actualRir ?? ''} onChange={(event) => onChange({ actualRir: event.target.value === '' ? null : Number(event.target.value) })}>
      <option value="">–</option>
      {rirChoices.map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}
    </select>
  </div>
}

function SetNumber({ set }: { set: WorkoutSetRecord }) {
  const label = setTypeLabel(set.setType)
  return <span className={`set-number set-type-${set.setType}`} title={label}>
    <span className="set-number-a11y">{set.setOrder}세트 {label}</span>
    <small aria-hidden="true">세트</small>
    <span className="set-number-marker" aria-hidden="true">{setTypeMarker(set.setType, set.setOrder)}</span>
  </span>
}

function SetRowTrailingAction({ set, onComplete, onDelete, deleteDisabledReason }: Pick<SetRowProps, 'set' | 'onComplete' | 'onDelete' | 'deleteDisabledReason'>) {
  if (onComplete) {
    return <button className={`complete-set-button ${set.isCompleted ? 'is-completed' : ''}`} type="button" onClick={onComplete} aria-label={`${set.setOrder}세트 ${set.isCompleted ? '완료 취소' : '완료'}`}>
      {set.isCompleted ? <Check size={17} /> : '완료'}
    </button>
  }
  if (onDelete) {
    return <button className="set-delete-button" type="button" onClick={onDelete} disabled={Boolean(deleteDisabledReason)} title={deleteDisabledReason} aria-label={`${set.setOrder}세트 삭제`}>
      <Trash2 size={15} aria-hidden="true" />
    </button>
  }
  return <span />
}
