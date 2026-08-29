/**
 * 세트 입력 칸이 쓰는 단위·선택지·파싱 헬퍼.
 *
 * `WorkoutRunner`에만 있던 것들인데, 완료된 기록을 고치는 화면(`RecordEditor`)이
 * 같은 입력 칸을 그대로 써야 해서 꺼냈다. 두 화면이 각자 스테퍼 단위를 들고
 * 있으면 한쪽만 2.5kg이고 한쪽은 5kg이 되는 식으로 조용히 갈라진다.
 */
import type { Rir, SetType } from '../../types/domain'

export const WEIGHT_STEP = 2.5
export const REPS_STEP = 1
export const DURATION_STEP_SECONDS = 60
export const DISTANCE_STEP_KM = 0.1

export const setTypeOptions = ['warmup', 'working', 'topset', 'backoff', 'dropset'] as const satisfies readonly SetType[]

const setTypeLabels: Record<SetType, string> = {
  warmup: '웜업',
  working: '본세트',
  topset: '탑세트',
  backoff: '백오프',
  dropset: '드롭',
}

export const rirChoices: Array<{ value: number; label: string }> = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5+' },
]

export function toNullableNumber(value: string) { if (value.trim() === '') return null; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null }
export function toNullableInteger(value: string) { const number = toNullableNumber(value); return number === null ? null : Math.floor(number) }

/** 분 입력을 초로. 빈 칸과 음수는 값 없음으로 본다. */
export function toNullableMinutes(value: string) {
  const parsed = toNullableInteger(value)
  return parsed === null ? null : parsed * 60
}

/** 0.1km 단위 스테퍼가 부동소수 오차로 3.3000000000000003이 되지 않게 한다. */
export function roundDistance(value: number) { return Math.round(value * 10) / 10 }

// 빈 칸(`null`)에서 +를 누르면 정확히 한 스텝 값이 되도록(그대로 null이거나
// NaN이 되지 않도록) 하고, 아래로는 floor 밑으로 내려가지 않게 한다.
export function incrementValue(value: number | null, step: number, floor = 0) { return Math.max(floor, (value ?? 0) + step) }
export function decrementValue(value: number | null, step: number, floor = 0) { return Math.max(floor, (value ?? 0) - step) }

export function formatRir(rir: Rir) { if (rir === null) return '–'; return rir >= 5 ? '5+' : String(rir) }
export function setTypeLabel(setType: SetType) { return setTypeLabels[setType] ?? '본세트' }
