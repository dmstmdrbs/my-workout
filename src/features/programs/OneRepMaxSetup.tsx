import { useEffect, useState } from 'react'
import { Gauge, Save, X } from 'lucide-react'
import { Overlay } from '../../shared/ui'
import type { Exercise, ExerciseOneRepMax } from '../../types/domain'
import './OneRepMaxSetup.css'

export interface OneRepMaxValue {
  exerciseId: string
  oneRepMaxKg: number
}

export function OneRepMaxSetupSheet({ isOpen, exercises, maxes, isSaving, error, onClose, onSave }: {
  isOpen: boolean
  exercises: Exercise[]
  maxes: ExerciseOneRepMax[]
  isSaving: boolean
  error: string | null
  onClose: () => void
  onSave: (values: OneRepMaxValue[]) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOpen) return
    const maxByExerciseId = new Map(maxes.map((max) => [max.exerciseId, max.oneRepMaxKg]))
    setDrafts(Object.fromEntries(exercises.map((exercise) => [exercise.id, maxByExerciseId.get(exercise.id)?.toString() ?? ''])))
  }, [exercises, isOpen, maxes])

  const values = exercises.map((exercise) => ({ exerciseId: exercise.id, oneRepMaxKg: Number(drafts[exercise.id]) }))
  const canSave = values.length > 0 && values.every((value) => Number.isFinite(value.oneRepMaxKg) && value.oneRepMaxKg > 0 && value.oneRepMaxKg <= 1000) && !isSaving

  return <Overlay isOpen={isOpen} onClose={onClose} presentation="sheet" labelledBy="one-rep-max-title" className="one-rep-max-sheet">
    <header className="one-rep-max-header">
      <div><p className="eyebrow">PERSONAL LOAD</p><h2 id="one-rep-max-title">프로그램 기준 1RM</h2></div>
      <button className="icon-button" type="button" onClick={onClose} aria-label="1RM 입력 닫기"><X size={19} /></button>
    </header>
    <div className="one-rep-max-intro"><Gauge size={20} /><p><strong>필요한 값만 한 번 입력해 주세요.</strong><span>실제 최대 시도 대신 최근 5-10회 세트로 추정한 값도 괜찮아요. 목표 중량은 2.5kg 단위로 계산됩니다.</span></p></div>
    <div className="one-rep-max-fields">
      {exercises.map((exercise, index) => <label key={exercise.id}>
        <span><em>{String(index + 1).padStart(2, '0')}</em><strong>{exercise.name}</strong></span>
        <span className="one-rep-max-input"><input data-overlay-initial-focus={index === 0 || undefined} aria-label={`${exercise.name} 1RM`} type="number" inputMode="decimal" min="1" max="1000" step="2.5" placeholder="0" value={drafts[exercise.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [exercise.id]: event.target.value }))} /><small>kg</small></span>
      </label>)}
    </div>
    <p className="one-rep-max-note">덤벨 종목은 앱에 기록하는 한 손 중량을 기준으로 입력합니다.</p>
    {error && <p className="one-rep-max-error" role="alert">{error}</p>}
    <footer className="one-rep-max-actions">
      <button className="secondary-button" type="button" onClick={onClose}>나중에</button>
      <button className="primary-button" type="button" disabled={!canSave} onClick={() => onSave(values)}><Save size={16} /> {isSaving ? '저장 중…' : '저장하고 프로그램 시작'}</button>
    </footer>
  </Overlay>
}
