import { Clock3, Dumbbell } from 'lucide-react'
import { formatElapsedTime, getEffectivePausedSeconds } from '../../lib/duration'
import type { StoredWorkoutDraft } from '../../features/workout'

interface ActiveWorkoutToastProps {
  draft: StoredWorkoutDraft
  clock: number
  onResume: () => void
}

export function ActiveWorkoutToast({ draft, clock, onResume }: ActiveWorkoutToastProps) {
  const isPaused = draft.pausedAt !== null
  const effectivePausedSeconds = getEffectivePausedSeconds(
    draft.draft.pausedSeconds,
    draft.pausedAt,
    clock,
  )

  return (
    <button
      className={`active-workout-toast ${isPaused ? 'is-paused' : ''}`}
      type="button"
      onClick={onResume}
      aria-label="진행 중인 운동 이어서 기록하기"
    >
      <span className="active-workout-toast-icon">
        <Dumbbell size={18} aria-hidden="true" />
      </span>
      <span className="active-workout-toast-copy">
        <strong>{draft.draft.routineName ?? '자유 운동'} 진행 중{isPaused ? ' · 일시정지' : ''}</strong>
        <small>
          <Clock3 size={14} aria-hidden="true" />
          운동 시간 {formatElapsedTime(draft.draft.startedAt, clock, effectivePausedSeconds)}
        </small>
      </span>
      <span className="active-workout-toast-action">이어서 하기</span>
    </button>
  )
}
