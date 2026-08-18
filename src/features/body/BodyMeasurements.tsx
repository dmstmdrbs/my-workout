import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Scale } from 'lucide-react'
import { useAppServices, useSettings } from '../../services'
import type { BodyMeasurement } from '../../types/domain'
import { OneRepMaxCalculator } from './OneRepMaxCalculator'
import { summarizeMetric, weightTrendPoints } from './bodyTrend'
import type { BodyMetricKey } from './bodyTrend'
import './BodyMeasurements.css'

/** 추이 그래프가 한 번에 그리는 최대 측정 수. 그 이상은 좁은 화면에서 읽히지 않는다. */
const WEIGHT_TREND_LIMIT = 12

const bodyMeasurementsQueryKey = ['body-measurements'] as const

interface MeasurementForm {
  measuredOn: string
  weightKg: string
  skeletalMuscleMassKg: string
  bodyFatPercentage: string
  notes: string
}

function todayIsoDate() {
  const now = new Date()
  const offsetMinutes = now.getTimezoneOffset()
  return new Date(now.getTime() - offsetMinutes * 60_000).toISOString().slice(0, 10)
}

function emptyForm(): MeasurementForm {
  return { measuredOn: todayIsoDate(), weightKg: '', skeletalMuscleMassKg: '', bodyFatPercentage: '', notes: '' }
}

function toNullableNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function BodyMeasurements() {
  const { workoutRepository } = useAppServices()
  const settingsQuery = useSettings()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<MeasurementForm>(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const measurementsQuery = useQuery({
    queryKey: bodyMeasurementsQueryKey,
    queryFn: () => workoutRepository.listBodyMeasurements(),
  })

  const saveMutation = useMutation({
    mutationFn: (input: Omit<BodyMeasurement, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }) =>
      workoutRepository.saveBodyMeasurement(input),
    onSuccess: () => {
      setError(null)
      setForm(emptyForm())
      void queryClient.invalidateQueries({ queryKey: bodyMeasurementsQueryKey })
    },
    onError: () => setError('측정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'),
  })

  const submit = async () => {
    // This guard covers "list absent": saving while the list hasn't loaded
    // (or failed to load) at all is unsafe, so it stays blocked here.
    if (measurementsQuery.isPending || measurementsQuery.isError) {
      setError('측정 목록을 아직 불러오지 못해 저장할 수 없어요. 잠시 후 다시 시도해 주세요.')
      return
    }

    const weightKg = toNullableNumber(form.weightKg)
    const skeletalMuscleMassKg = toNullableNumber(form.skeletalMuscleMassKg)
    const bodyFatPercentage = toNullableNumber(form.bodyFatPercentage)

    if (weightKg === null && skeletalMuscleMassKg === null && bodyFatPercentage === null) {
      setError('체중·골격근량·체지방률 중 하나는 입력해 주세요.')
      return
    }

    // This covers "list stale": measurementsQuery.data is only as fresh as
    // this tab's last fetch. With refetchOnWindowFocus disabled, a `/body`
    // tab left open while another device saves today's row would otherwise
    // merge against a cache that still lacks that row, and every field the
    // user didn't retype would go out as null -- overwriting (Supabase
    // upsert) or duplicating (mock, matches only by id) the real stored
    // values. Fetching fresh at submit time, not render time, closes that
    // window.
    let latestMeasurements
    try {
      latestMeasurements = await queryClient.fetchQuery({
        queryKey: bodyMeasurementsQueryKey,
        queryFn: () => workoutRepository.listBodyMeasurements(),
        staleTime: 0,
      })
    } catch {
      setError('측정 목록을 다시 확인하지 못해 저장할 수 없어요. 잠시 후 다시 시도해 주세요.')
      return
    }

    // Same-day entries update the existing row instead of stacking duplicates.
    const existing = latestMeasurements.find((item) => item.measuredOn === form.measuredOn)
    const notes = form.notes.trim()

    saveMutation.mutate({
      ...(existing ? { id: existing.id } : {}),
      measuredOn: form.measuredOn,
      weightKg: weightKg ?? existing?.weightKg ?? null,
      skeletalMuscleMassKg: skeletalMuscleMassKg ?? existing?.skeletalMuscleMassKg ?? null,
      bodyFatPercentage: bodyFatPercentage ?? existing?.bodyFatPercentage ?? null,
      notes: notes || existing?.notes || null,
    })
  }

  const measurements = measurementsQuery.data ?? []
  const weightUnit = settingsQuery.data?.weightUnit ?? 'kg'

  return (
    <main className="body-page" aria-labelledby="body-title">
      <section className="body-heading">
        <p className="eyebrow">BODY LOG</p>
        <h1 id="body-title">신체 기록</h1>
        <p>체중과 체성분을 기록해 두면 훈련 변화와 함께 볼 수 있어요.</p>
      </section>

      {error && <p className="body-error" role="alert">{error}</p>}

      {measurements.length > 0 && (
        <>
          <BodySummaryCard measurements={measurements} weightUnit={weightUnit} />
          <WeightTrendCard measurements={measurements} weightUnit={weightUnit} />
        </>
      )}

      <section className="body-card" aria-labelledby="body-form-title">
        <h2 id="body-form-title">측정 추가</h2>
        <div className="body-form-grid">
          <label className="body-field body-field-date">
            <span>측정일</span>
            <input aria-label="측정일" type="date" value={form.measuredOn} onChange={(event) => setForm((current) => ({ ...current, measuredOn: event.target.value }))} />
          </label>
          <label className="body-field">
            <span>체중 (kg)</span>
            <input aria-label="체중 (kg)" type="number" inputMode="decimal" min="0" step="0.1" value={form.weightKg} onChange={(event) => setForm((current) => ({ ...current, weightKg: event.target.value }))} />
          </label>
          <label className="body-field">
            <span>골격근량 (kg)</span>
            <input aria-label="골격근량 (kg)" type="number" inputMode="decimal" min="0" step="0.1" value={form.skeletalMuscleMassKg} onChange={(event) => setForm((current) => ({ ...current, skeletalMuscleMassKg: event.target.value }))} />
          </label>
          <label className="body-field">
            <span>체지방률 (%)</span>
            <input aria-label="체지방률 (%)" type="number" inputMode="decimal" min="0" step="0.1" value={form.bodyFatPercentage} onChange={(event) => setForm((current) => ({ ...current, bodyFatPercentage: event.target.value }))} />
          </label>
          <label className="body-field body-field-wide">
            <span>메모</span>
            <input aria-label="메모" type="text" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          </label>
        </div>
        <button
          className="primary-button body-save-button"
          type="button"
          onClick={() => void submit()}
          disabled={saveMutation.isPending || measurementsQuery.isPending || measurementsQuery.isError}
        >
          <Plus size={17} aria-hidden="true" /> {saveMutation.isPending ? '저장 중…' : '저장'}
        </button>
        {(measurementsQuery.isPending || measurementsQuery.isError) && (
          <p className="body-hint">
            {measurementsQuery.isError
              ? '기존 기록을 불러오지 못해 지금은 저장할 수 없어요. 아래에서 다시 시도해 주세요.'
              : '기존 기록을 불러오는 중이에요. 잠시 후 저장할 수 있어요.'}
          </p>
        )}
      </section>

      <section className="body-card" aria-labelledby="body-list-title">
        <h2 id="body-list-title">최근 기록</h2>
        {measurementsQuery.isPending && <p className="body-empty">불러오는 중…</p>}
        {measurementsQuery.isError && (
          <div className="body-empty">
            <p>기록을 불러오지 못했어요.</p>
            <button className="secondary-button" type="button" onClick={() => void measurementsQuery.refetch()}>
              <RefreshCw size={15} aria-hidden="true" /> 다시 시도
            </button>
          </div>
        )}
        {!measurementsQuery.isPending && !measurementsQuery.isError && measurements.length === 0 && (
          <div className="body-empty"><Scale size={18} aria-hidden="true" /><p>아직 기록이 없어요. 첫 측정을 남겨 보세요.</p></div>
        )}
        {measurements.length > 0 && (
          <ul className="measurement-list">
            {measurements.map((measurement) => (
              <li key={measurement.id}>
                <strong>{measurement.measuredOn}</strong>
                <span>
                  {measurement.weightKg !== null && `${measurement.weightKg} kg`}
                  {measurement.skeletalMuscleMassKg !== null && ` · 골격근 ${measurement.skeletalMuscleMassKg} kg`}
                  {measurement.bodyFatPercentage !== null && ` · 체지방 ${measurement.bodyFatPercentage}%`}
                </span>
                {measurement.notes && <small>{measurement.notes}</small>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <OneRepMaxCalculator weightUnit={weightUnit} />
    </main>
  )
}

interface MetricDefinition {
  key: BodyMetricKey
  label: string
  /** 단위. 체중만 사용자 설정을 따르므로 렌더 시점에 채운다. */
  unit: string
  /** 값이 늘어나는 것이 좋은 방향인지. 증감 색을 정하는 데 쓴다. */
  higherIsBetter: boolean
}

/**
 * 체중은 좋고 나쁨을 앱이 판단하지 않는다 -- 증량이 목표인 사람과 감량이
 * 목표인 사람이 같은 화면을 쓰기 때문이다. 그래서 체중의 증감은 중립 색으로
 * 두고, 방향이 분명한 골격근량·체지방률만 색을 준다.
 */
type MetricTone = 'good' | 'bad' | 'neutral'

function metricTone(definition: MetricDefinition, delta: number): MetricTone {
  if (definition.key === 'weightKg' || delta === 0) return 'neutral'
  return definition.higherIsBetter === delta > 0 ? 'good' : 'bad'
}

function formatMetricValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatDelta(delta: number): string {
  if (delta === 0) return '변화 없음'
  return `${delta > 0 ? '+' : '−'}${formatMetricValue(Math.abs(delta))}`
}

function BodySummaryCard({ measurements, weightUnit }: { measurements: BodyMeasurement[]; weightUnit: string }) {
  const definitions: MetricDefinition[] = [
    { key: 'weightKg', label: '체중', unit: weightUnit, higherIsBetter: false },
    { key: 'skeletalMuscleMassKg', label: '골격근량', unit: weightUnit, higherIsBetter: true },
    { key: 'bodyFatPercentage', label: '체지방률', unit: '%', higherIsBetter: false },
  ]
  const summaries = definitions.map((definition) => ({ definition, summary: summarizeMetric(measurements, definition.key) }))

  if (summaries.every(({ summary }) => summary.latest === null)) return null

  return (
    <section className="body-card" aria-labelledby="body-summary-title">
      <h2 id="body-summary-title">최근 체성분</h2>
      <p className="body-hint">숫자 아래는 직전 측정 대비 변화예요.</p>
      <ul className="body-summary-grid">
        {summaries.map(({ definition, summary }) => (
          <li className="body-summary-item" key={definition.key}>
            <span className="body-summary-label">{definition.label}</span>
            {summary.latest === null ? (
              <span className="body-summary-empty">기록 없음</span>
            ) : (
              <>
                <span className="body-summary-value">
                  <strong>{formatMetricValue(summary.latest)}</strong>
                  <small>{definition.unit}</small>
                </span>
                <span className={`body-summary-delta tone-${summary.delta === null ? 'neutral' : metricTone(definition, summary.delta)}`}>
                  {summary.delta === null ? '첫 기록' : `${formatDelta(summary.delta)}${summary.delta === 0 ? '' : definition.unit}`}
                </span>
                <span className="body-summary-date">{summary.latestOn}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function WeightTrendCard({ measurements, weightUnit }: { measurements: BodyMeasurement[]; weightUnit: string }) {
  const points = weightTrendPoints(measurements, WEIGHT_TREND_LIMIT)
  if (points.length === 0) return null

  const values = points.map((point) => point.weightKg)
  const max = Math.max(...values)
  const min = Math.min(...values)
  // 체중은 0에서 시작하는 축으로 그리면 변화가 보이지 않는다(70kg -> 71kg은
  // 1.4% 차이다). 그래서 관측 구간에 맞춰 축을 자르는데, 축을 자른 그래프를
  // 막대로 그리면 2.8kg 감량이 "6분의 1로 줄었다"처럼 읽힌다. 막대는 0을
  // 바닥으로 읽히기 때문이다. 꺾은선은 그 약속이 없어 잘린 축에 맞는 형태다.
  const range = max - min
  const top = range === 0 ? max + 1 : max + range * 0.15
  const bottom = range === 0 ? max - 1 : min - range * 0.15
  const toY = (value: number) => ((top - value) / (top - bottom)) * 100
  const toX = (index: number) => ((index + 0.5) / points.length) * 100

  return (
    <section className="body-card" aria-labelledby="body-trend-title">
      <h2 id="body-trend-title">체중 추이</h2>
      {points.length === 1 ? (
        <p className="body-hint">
          {points[0].measuredOn} · {formatMetricValue(points[0].weightKg)}{weightUnit} — 비교할 이전 기록이 없어 추이를 표시할 수 없어요.
        </p>
      ) : (
        <>
          <p className="body-hint">최저 {formatMetricValue(min)}{weightUnit} · 최고 {formatMetricValue(max)}{weightUnit}</p>
          <div className="weight-trend-chart">
            <svg
              className="weight-trend-line"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              role="img"
              aria-label={`체중 추이 꺾은선. ${points.length}개 측정, ${formatMetricValue(points[0].weightKg)}${weightUnit}에서 ${formatMetricValue(points[points.length - 1].weightKg)}${weightUnit}로 변화.`}
            >
              <polyline
                points={points.map((point, index) => `${toX(index)},${toY(point.weightKg)}`).join(' ')}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <ul className="weight-trend-labels" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
              {points.map((point) => (
                <li key={point.measuredOn} role="img" aria-label={`${point.measuredOn} 체중 ${formatMetricValue(point.weightKg)}${weightUnit}`}>
                  <strong aria-hidden="true">{formatMetricValue(point.weightKg)}</strong>
                  <span aria-hidden="true">{point.measuredOn.slice(5)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
