import { Bell, BellOff, Clock3, TimerReset } from 'lucide-react'
import { formatRestTimer } from '../lib/formatWorkout'

interface RestTimerProps {
  remaining: number
  isRunning: boolean
  alertsEnabled: boolean
  onAdjust: (seconds: number) => void
  onToggleAlerts: () => void
  onRestart: () => void
  onStop: () => void
  compact?: boolean
}

export function RestTimer({ remaining, isRunning, alertsEnabled, onAdjust, onToggleAlerts, onRestart, onStop, compact = false }: RestTimerProps) {
  return <article className={`rest-timer ${compact ? 'is-compact' : ''}`} aria-label="휴식 타이머">
    <div className="rest-timer-copy"><span><Clock3 size={16} /> 휴식 타이머</span><strong>{formatRestTimer(remaining)}</strong></div>
    <div className="rest-timer-actions">
      <button className="timer-adjust" type="button" onClick={() => onAdjust(-10)} aria-label="휴식 시간 10초 줄이기">-10</button>
      <button className="timer-adjust" type="button" onClick={() => onAdjust(10)} aria-label="휴식 시간 10초 늘리기">+10</button>
      <button className={`timer-control ${alertsEnabled ? 'is-enabled' : ''}`} type="button" onClick={onToggleAlerts} aria-label={alertsEnabled ? '휴식 종료 알림 끄기' : '휴식 종료 알림 켜기'} aria-pressed={alertsEnabled}>{alertsEnabled ? <Bell size={16} /> : <BellOff size={16} />}</button>
      <button className="timer-control" type="button" onClick={onRestart} aria-label="휴식 타이머 다시 시작"><TimerReset size={16} /></button>
      {isRunning && <button className="timer-stop" type="button" onClick={onStop}>건너뛰기</button>}
    </div>
  </article>
}
