import { useState } from 'react'
import { Calculator } from 'lucide-react'
import { REP_CEILING, estimateOneRepMax, weightForReps } from '../../lib/oneRepMax'

/** 환산표에 보여줄 반복 수. 1RM부터 REP_CEILING까지 실제로 쓰는 구간만 고른다. */
const TARGET_REPS = [1, 3, 5, 8, 10, 12] as const

function formatWeight(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function OneRepMaxCalculator({ weightUnit }: { weightUnit: string }) {
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')

  const weightValue = Number(weight)
  const repsValue = Number(reps)
  const hasInput = weight.trim() !== '' && reps.trim() !== ''
  const estimate = hasInput ? estimateOneRepMax(weightValue, repsValue) : null
  const overCeiling = hasInput && estimate === null && Number.isFinite(repsValue) && repsValue > REP_CEILING

  return (
    <section className="body-card" aria-labelledby="body-calculator-title">
      <h2 id="body-calculator-title">
        <Calculator size={16} aria-hidden="true" /> 1RM 계산기
      </h2>
      <p className="body-hint">기록하지 않은 세트도 넣어볼 수 있어요. 저장되지 않습니다.</p>
      <div className="body-form-grid">
        <label className="body-field">
          <span>중량 ({weightUnit})</span>
          <input
            aria-label={`계산할 중량 (${weightUnit})`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
          />
        </label>
        <label className="body-field">
          <span>반복 수</span>
          <input
            aria-label="계산할 반복 수"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={reps}
            onChange={(event) => setReps(event.target.value)}
          />
        </label>
      </div>

      {estimate === null && (
        <p className="body-hint">
          {overCeiling
            ? `${REP_CEILING}회를 넘는 세트는 추정이 신뢰할 수 없어 계산하지 않아요.`
            : '중량과 반복 수를 넣으면 예상 1RM을 보여드려요.'}
        </p>
      )}

      {estimate !== null && (
        <>
          <p className="calculator-result">
            예상 1RM <strong>{formatWeight(estimate)}{weightUnit}</strong>
          </p>
          <ul className="calculator-table">
            {TARGET_REPS.map((targetReps) => {
              const target = weightForReps(estimate, targetReps)
              if (target === null) return null
              return (
                <li key={targetReps}>
                  <span>{targetReps}회</span>
                  <strong>{formatWeight(target)}{weightUnit}</strong>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
