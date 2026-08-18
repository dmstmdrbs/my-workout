import type { WorkoutSetRecord } from '../types/domain'

/**
 * 지난 세트의 "목표 RIR 대비 실제 RIR"로 다음 중량을 제안한다.
 *
 * 이 앱이 목표 RIR과 실제 RIR을 **둘 다** 기록하는 이유가 여기 있다. 계획보다
 * 힘들었는지(실제 < 목표) 여유가 있었는지(실제 > 목표)는 기록된 두 숫자의
 * 차이로 곧장 나온다 -- 근거 없는 모델을 세울 필요가 없다.
 *
 * 조정 폭은 RIR 한 칸당 `STEP_KG`이고 `MAX_STEPS`칸에서 멈춘다. RIR과 중량의
 * 관계는 사람·종목마다 달라 정확한 환산식이 없으므로, 한 번에 크게 움직이기
 * 보다 다음 세션에서 다시 재는 편이 안전하다.
 */

/** 이 앱의 중량 스테퍼와 같은 단위. 원판 계산과도 맞는다. */
const STEP_KG = 2.5

/** 한 번에 움직일 수 있는 최대 칸 수. RIR이 4 벌어져도 5kg에서 멈춘다. */
const MAX_STEPS = 2

export type LoadSuggestionReason = 'harder' | 'easier' | 'onPlan'

export interface LoadSuggestion {
  /** 제안 중량. 0 밑으로는 내려가지 않는다. */
  weightKg: number
  /** 지난 중량 대비 변화. `onPlan`이면 0이다. */
  deltaKg: number
  reason: LoadSuggestionReason
  /** 판단 근거가 된 지난 세트의 값. 화면이 "왜"를 설명할 수 있게 함께 준다. */
  previousWeightKg: number
  targetRir: number
  actualRir: number
}

/**
 * 제안할 수 없으면 `null`이다. 지난 기록이 없거나, 중량이 없는 종목이거나
 * (맨몸·유산소), 목표나 실제 RIR 중 하나라도 비어 있으면 판단할 근거가 없다.
 * **추측해서 숫자를 내놓지 않는다.**
 */
export function suggestNextLoad(previous: WorkoutSetRecord | null): LoadSuggestion | null {
  if (!previous) return null
  if (previous.weightKg === null || previous.weightKg <= 0) return null
  if (previous.targetRir === null || previous.actualRir === null) return null

  const gap = previous.actualRir - previous.targetRir
  const steps = Math.max(-MAX_STEPS, Math.min(MAX_STEPS, gap))
  const deltaKg = roundToStep(steps * STEP_KG)
  const weightKg = Math.max(0, roundToStep(previous.weightKg + deltaKg))

  return {
    weightKg,
    deltaKg,
    reason: gap === 0 ? 'onPlan' : gap < 0 ? 'harder' : 'easier',
    previousWeightKg: previous.weightKg,
    targetRir: previous.targetRir,
    actualRir: previous.actualRir,
  }
}

function roundToStep(value: number) {
  return Math.round(value / STEP_KG) * STEP_KG
}
