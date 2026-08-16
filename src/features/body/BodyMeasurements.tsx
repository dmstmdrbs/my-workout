import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Scale } from 'lucide-react'
import { useAppServices } from '../../services'
import type { BodyMeasurement } from '../../types/domain'
import './BodyMeasurements.css'

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
      void queryClient.invalidateQueries({ queryKey: bodyMeasurementsQueryKey })
    },
    onError: () => setError('측정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'),
  })

  const submit = () => {
    const weightKg = toNullableNumber(form.weightKg)
    const skeletalMuscleMassKg = toNullableNumber(form.skeletalMuscleMassKg)
    const bodyFatPercentage = toNullableNumber(form.bodyFatPercentage)

    if (weightKg === null && skeletalMuscleMassKg === null && bodyFatPercentage === null) {
      setError('체중·골격근량·체지방률 중 하나는 입력해 주세요.')
      return
    }

    // Same-day entries update the existing row instead of stacking duplicates.
    const existing = measurementsQuery.data?.find((item) => item.measuredOn === form.measuredOn)
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

  return (
    <main className="body-page" aria-labelledby="body-title">
      <section className="body-heading">
        <p className="eyebrow">BODY LOG</p>
        <h1 id="body-title">신체 기록</h1>
        <p>체중과 체성분을 기록해 두면 훈련 변화와 함께 볼 수 있어요.</p>
      </section>

      {error && <p className="body-error" role="alert">{error}</p>}

      <section className="body-card" aria-labelledby="body-form-title">
        <h2 id="body-form-title">측정 추가</h2>
        <div className="body-form-grid">
          <label className="body-field">
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
        <button className="primary-button body-save-button" type="button" onClick={submit} disabled={saveMutation.isPending}>
          <Plus size={17} aria-hidden="true" /> {saveMutation.isPending ? '저장 중…' : '저장'}
        </button>
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
    </main>
  )
}
