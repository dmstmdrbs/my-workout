import type { ReactNode } from 'react'
import './WorkoutExercisePanel.css'

export interface WorkoutExercisePanelProps {
  /** The id used by the section's `aria-labelledby` relationship. */
  titleId: string
  exerciseName: string
  primaryMuscleLabel: string
  notes?: string | null
  /** Optional feature-owned controls rendered to the right of the heading. */
  actions?: ReactNode
  children: ReactNode
}

/**
 * Shared shell for editing an exercise's sets.
 *
 * Workout progress and completed-record editing intentionally own different
 * controls and state, but their exercise heading/card layout is the same.
 * Keeping that shell here makes the layout (including its mobile rules)
 * available whenever either feature is mounted.
 */
export function WorkoutExercisePanel({ titleId, exerciseName, primaryMuscleLabel, notes, actions, children }: WorkoutExercisePanelProps) {
  return (
    <section className="exercise-workspace" aria-labelledby={titleId}>
      <div className="exercise-workspace-heading">
        <div>
          <p className="eyebrow">{primaryMuscleLabel}</p>
          <h2 id={titleId}>{exerciseName}</h2>
          {notes && <p className="exercise-note">{notes}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
