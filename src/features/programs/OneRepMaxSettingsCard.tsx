import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gauge, Save } from 'lucide-react'
import { useAppServices } from '../../services'
import { trainingProgramCatalog } from './programTemplate'
import { getProgramOneRepMaxRequirements } from './programPersonalization'
import './OneRepMaxSetup.css'

export function OneRepMaxSettingsCard() {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['program-personalization'],
    queryFn: async () => {
      const [exercises, maxes] = await Promise.all([
        workoutRepository.listExercises(),
        workoutRepository.listExerciseOneRepMaxes(),
      ])
      return { exercises, maxes }
    },
  })
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const requiredExercises = useMemo(() => {
    if (!query.data) return []
    const unique = new Map<string, (typeof query.data.exercises)[number]>()
    for (const program of trainingProgramCatalog) {
      for (const requirement of getProgramOneRepMaxRequirements(program.build('2026-01-01'), query.data.exercises)) {
        unique.set(requirement.exercise.id, requirement.exercise)
      }
    }
    return [...unique.values()]
  }, [query.data])

  useEffect(() => {
    if (!query.data) return
    const maxByExerciseId = new Map(query.data.maxes.map((max) => [max.exerciseId, max.oneRepMaxKg]))
    setDrafts(Object.fromEntries(requiredExercises.map((exercise) => [exercise.id, maxByExerciseId.get(exercise.id)?.toString() ?? ''])))
  }, [query.data, requiredExercises])

  const values = requiredExercises.flatMap((exercise) => {
    const draft = drafts[exercise.id]?.trim()
    return draft ? [{ exerciseId: exercise.id, oneRepMaxKg: Number(draft) }] : []
  })
  const hasInvalidValue = values.some((value) => !Number.isFinite(value.oneRepMaxKg) || value.oneRepMaxKg <= 0 || value.oneRepMaxKg > 1000)
  const hasChanges = values.some((value) => query.data?.maxes.find((max) => max.exerciseId === value.exerciseId)?.oneRepMaxKg !== value.oneRepMaxKg)

  const mutation = useMutation({
    mutationFn: () => Promise.all(values.map((value) => workoutRepository.saveExerciseOneRepMax(value.exerciseId, value.oneRepMaxKg))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['program-personalization'] })
    },
  })

  return <section className="settings-card one-rep-max-settings" aria-labelledby="settings-one-rep-max-title">
    <div className="settings-card-heading">
      <span className="settings-icon"><Gauge size={18} aria-hidden="true" /></span>
      <div><h2 id="settings-one-rep-max-title">프로그램 기준 1RM</h2><p>프로그램의 퍼센트 처방을 내 중량으로 계산합니다.</p></div>
    </div>

    {query.isPending && <p className="one-rep-max-settings-status">종목을 불러오는 중…</p>}
    {query.isError && <button className="secondary-button" type="button" onClick={() => void query.refetch()}>다시 불러오기</button>}
    {query.data && <>
      <div className="one-rep-max-settings-grid">
        {requiredExercises.map((exercise) => <label className="settings-field" key={exercise.id}>
          <span>{exercise.name}</span>
          <span className="one-rep-max-settings-input"><input aria-label={`${exercise.name} 1RM`} type="number" inputMode="decimal" min="1" max="1000" step="2.5" placeholder="미입력" value={drafts[exercise.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [exercise.id]: event.target.value }))} /><small>kg</small></span>
        </label>)}
      </div>
      <div className="one-rep-max-settings-footer">
        <p>최근 5-10회 수행으로 추정한 1RM도 사용할 수 있어요. 시작된 회차의 중량은 바뀌지 않습니다.</p>
        <button className="secondary-button" type="button" disabled={!hasChanges || hasInvalidValue || mutation.isPending} onClick={() => mutation.mutate()}><Save size={16} /> {mutation.isPending ? '저장 중…' : '1RM 저장'}</button>
      </div>
      {mutation.isError && <p className="one-rep-max-error" role="alert">1RM을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.</p>}
    </>}
  </section>
}
