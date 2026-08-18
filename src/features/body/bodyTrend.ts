import type { BodyMeasurement } from '../../types/domain'

/** 요약 카드가 다루는 세 지표. `BodyMeasurement`의 숫자 필드와 1:1이다. */
export type BodyMetricKey = 'weightKg' | 'skeletalMuscleMassKg' | 'bodyFatPercentage'

export interface MetricSummary {
  /** 이 지표가 기록된 가장 최근 측정의 값. 한 번도 기록되지 않았으면 null. */
  latest: number | null
  /** `latest`가 기록된 측정일. */
  latestOn: string | null
  /**
   * `latest`보다 앞선 측정 중 이 지표가 기록된 가장 최근 값과의 차이.
   * 비교 대상이 없으면 null이며, 이때 화면은 변화량을 그리지 않는다.
   */
  delta: number | null
}

/**
 * 지표마다 독립적으로 최신값을 찾는다. 사용자는 어느 날 체중만, 어느 날
 * 체성분까지 재는 식으로 부분 입력을 하므로, "가장 최근 측정 행"을 통째로
 * 요약에 쓰면 그날 비어 있던 지표가 "기록 없음"으로 보인다. 지표별로 값이
 * 있는 가장 최근 두 개를 각각 찾아야 실제로 잰 값이 계속 표시된다.
 *
 * `measurements`는 `listBodyMeasurements`의 계약대로 measuredOn 내림차순
 * (최신 우선)이라고 가정한다.
 */
export function summarizeMetric(measurements: BodyMeasurement[], key: BodyMetricKey): MetricSummary {
  const recorded = measurements.filter((measurement) => measurement[key] !== null)
  if (recorded.length === 0) return { latest: null, latestOn: null, delta: null }

  const latest = recorded[0][key] as number
  const previous = recorded.length > 1 ? (recorded[1][key] as number) : null
  return {
    latest,
    latestOn: recorded[0].measuredOn,
    delta: previous === null ? null : roundToOneDecimal(latest - previous),
  }
}

export interface WeightTrendPoint {
  measuredOn: string
  weightKg: number
}

/**
 * 체중이 기록된 측정만, 오래된 순으로 최대 `limit`개. 그래프는 왼쪽에서
 * 오른쪽으로 시간이 흐르므로 저장소의 내림차순을 여기서 뒤집는다.
 */
export function weightTrendPoints(measurements: BodyMeasurement[], limit: number): WeightTrendPoint[] {
  return measurements
    .filter((measurement): measurement is BodyMeasurement & { weightKg: number } => measurement.weightKg !== null)
    .slice(0, limit)
    .map((measurement) => ({ measuredOn: measurement.measuredOn, weightKg: measurement.weightKg }))
    .reverse()
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}
