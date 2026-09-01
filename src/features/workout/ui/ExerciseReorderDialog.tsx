import type { PointerEvent as ReactPointerEvent } from 'react'
import { GripVertical, X } from 'lucide-react'
import type { WorkoutExercise } from '../../../types/domain'

interface ExerciseReorderDialogProps {
  exercises: WorkoutExercise[]
  draggingExerciseId: string | null
  onClose: () => void
  onMove: (exerciseId: string, direction: -1 | 1) => void
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, exerciseId: string) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel: () => void
}

export function ExerciseReorderDialog({ exercises, draggingExerciseId, onClose, onMove, onPointerDown, onPointerUp, onPointerCancel }: ExerciseReorderDialogProps) {
  return <div className="exercise-reorder-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="exercise-reorder-dialog" role="dialog" aria-modal="true" aria-labelledby="exercise-reorder-title">
      <header><div><p className="eyebrow">EXERCISE ORDER</p><h2 id="exercise-reorder-title">운동 순서 변경</h2><p>핸들을 길게 눌러 끌어 놓거나, 화살표로 순서를 바꿀 수 있어요.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="순서 변경 닫기"><X size={18} /></button></header>
      <ol className="exercise-reorder-list">
        {exercises.map((exercise, index) => <li data-reorder-exercise-id={exercise.id} className={draggingExerciseId === exercise.id ? 'is-dragging' : ''} key={exercise.id}>
          <span className="exercise-reorder-index">{index + 1}</span>
          <strong>{exercise.exerciseName}</strong>
          <div className="exercise-reorder-actions">
            <button type="button" className="reorder-move-button" disabled={index === 0} onClick={() => onMove(exercise.id, -1)} aria-label={`${exercise.exerciseName} 위로`}>&uarr;</button>
            <button type="button" className="reorder-move-button" disabled={index === exercises.length - 1} onClick={() => onMove(exercise.id, 1)} aria-label={`${exercise.exerciseName} 아래로`}>&darr;</button>
            <button className="reorder-drag-handle" type="button" aria-label={`${exercise.exerciseName} 순서 변경, 끌어 놓기`} onPointerDown={(event) => onPointerDown(event, exercise.id)} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}><GripVertical size={18} /></button>
          </div>
        </li>)}
      </ol>
      <footer><button className="secondary-button" type="button" onClick={onClose}>완료</button></footer>
    </section>
  </div>
}
