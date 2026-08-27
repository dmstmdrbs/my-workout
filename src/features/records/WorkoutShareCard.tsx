import { forwardRef } from 'react'
import { bestEstimatedOneRepMax } from '../../lib/oneRepMax'
import { completedSetCount, getSessionVolume } from '../../lib/volume'
import type { WorkoutSession } from '../../types/domain'
import { muscleLabel } from '../workout/exerciseLabels'
import { formatWeight, formatWorkoutDuration, formatWorkoutNumber, formatWorkoutRir, formatWorkoutSet } from './workoutShareFormat'

export const WorkoutShareCard = forwardRef<HTMLElement, { session: WorkoutSession; weightUnit: string; includeRir: boolean }>(function WorkoutShareCard({ session, weightUnit, includeRir }, cardRef) {
  const completedExercises = session.exercises.flatMap((exercise) => {
    const completedSets = exercise.sets.filter((set) => set.isCompleted)
    return completedSets.length ? [{ exercise, completedSets }] : []
  })

  return <article className="workout-share-card" ref={cardRef} aria-label={`${session.routineName ?? '자유 운동'} 공유 카드`}>
    <header className="share-card-header">
      <div className="share-card-brand-lockup"><img src="/trainlog-icon.png" alt="" /><span>TRAINLOG</span></div>
      <div className="share-card-date"><strong>{formatCardDate(session.startedAt)}</strong><span>{formatWorkoutDuration(session)}</span></div>
    </header>
    <div className="share-card-title"><span>WORKOUT COMPLETE</span><h3>{session.routineName ?? '자유 운동'}</h3></div>
    <div className={`share-card-summary ${includeRir ? '' : 'without-rir'}`}>
      <div><strong>{completedExercises.length}</strong><span>완료 종목</span></div>
      <div className="is-volume"><strong>{formatWorkoutNumber(getSessionVolume(session))}</strong><span>총 볼륨 {weightUnit}</span></div>
      <div><strong>{includeRir ? formatAverageRir(session) : completedSetCount(session)}</strong><span>{includeRir ? '평균 실제 RIR' : '완료 세트'}</span></div>
    </div>
    <div className="share-card-exercises">
      {completedExercises.map(({ exercise, completedSets }, index) => {
        const bestEstimate = bestEstimatedOneRepMax(completedSets)
        return <section className="share-card-exercise" key={exercise.id} aria-label={`${exercise.exerciseName} 완료 세트`}>
          <span className="share-card-exercise-index">{String(index + 1).padStart(2, '0')}</span>
          <div className="share-card-exercise-name">
            <small>{muscleLabel(exercise.primaryMuscle)} · {completedSets.length} SETS</small>
            <strong>{exercise.exerciseName}</strong>
            {bestEstimate !== null && <span className="share-card-e1rm">예상 1RM {formatWeight(bestEstimate)}{weightUnit}</span>}
          </div>
          <ol className="share-card-exercise-sets">
            {completedSets.map((set) => <li className="share-card-set-row" key={set.id}>
              <span>S{set.setOrder}</span>
              <strong>{formatWorkoutSet(set, weightUnit)}</strong>
              {includeRir && <em>RIR {set.actualRir === null ? '–' : formatWorkoutRir(set.actualRir)}</em>}
            </li>)}
          </ol>
        </section>
      })}
    </div>
    <footer><span>TRAIN WITH INTENTION</span><strong>TRAINLOG</strong></footer>
  </article>
})

function getActualRirs(session: WorkoutSession) { return session.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.isCompleted && set.actualRir !== null).map((set) => set.actualRir as number) }
function formatAverageRir(session: WorkoutSession) { const rirs = getActualRirs(session); if (!rirs.length) return '–'; const average = rirs.reduce((sum, value) => sum + value, 0) / rirs.length; return average >= 5 ? '5+' : average.toFixed(1) }
function formatCardDate(date: string) { return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date)).replace(/\.$/, '') }
