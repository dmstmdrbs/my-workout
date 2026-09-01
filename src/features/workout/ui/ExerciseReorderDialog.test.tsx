import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import type { WorkoutExercise } from '../../../types/domain'
import { ExerciseReorderDialog } from './ExerciseReorderDialog'

const exercises: WorkoutExercise[] = [
  { id: 'one', exerciseId: 'one', exerciseName: '첫 번째 운동', primaryMuscle: 'full_body', exerciseOrder: 1, notes: null, sets: [] },
  { id: 'two', exerciseId: 'two', exerciseName: '두 번째 운동', primaryMuscle: 'full_body', exerciseOrder: 2, notes: null, sets: [] },
]

function Harness() {
  const [isOpen, setIsOpen] = useState(true)
  return <>
    <button type="button" autoFocus>바깥 버튼</button>
    {isOpen && <ExerciseReorderDialog
      exercises={exercises}
      draggingExerciseId={null}
      onClose={() => setIsOpen(false)}
      onMove={vi.fn()}
      onPointerDown={vi.fn()}
      onPointerUp={vi.fn()}
      onPointerCancel={vi.fn()}
    />}
  </>
}

describe('ExerciseReorderDialog overlay contract', () => {
  test('첫 포커스, Tab 순환, Escape 닫기와 포커스 복원을 공통 Overlay에 위임한다', () => {
    render(<Harness />)
    const outsideButton = screen.getByRole('button', { name: '바깥 버튼' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '순서 변경 닫기' }))

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '완료' }))
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '순서 변경 닫기' }))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '운동 순서 변경' })).toBeNull()
    expect(document.activeElement).toBe(outsideButton)
  })
})
