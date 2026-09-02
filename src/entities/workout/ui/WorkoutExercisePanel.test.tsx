import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { WorkoutExercisePanel } from './WorkoutExercisePanel'

describe('WorkoutExercisePanel', () => {
  test('renders the shared heading, notes, actions, and set content through explicit slots', () => {
    render(
      <WorkoutExercisePanel
        titleId="exercise-title-1"
        exerciseName="바벨 벤치프레스"
        primaryMuscleLabel="가슴"
        notes="어깨를 고정해요"
        actions={<button type="button">종목 교체</button>}
      >
        <div role="region" aria-label="바벨 벤치프레스 세트 기록">세트 입력</div>
      </WorkoutExercisePanel>,
    )

    const panel = screen.getByRole('region', { name: '바벨 벤치프레스 세트 기록' }).closest('section')
    expect(panel?.getAttribute('aria-labelledby')).toBe('exercise-title-1')
    expect(screen.getByRole('heading', { name: '바벨 벤치프레스' }).getAttribute('id')).toBe('exercise-title-1')
    expect(screen.getByText('가슴')).not.toBeNull()
    expect(screen.getByText('어깨를 고정해요')).not.toBeNull()
    expect(screen.getByRole('button', { name: '종목 교체' })).not.toBeNull()
    expect(screen.getByText('세트 입력')).not.toBeNull()
  })

  test('does not add an empty note element when notes are absent', () => {
    const { container } = render(
      <WorkoutExercisePanel titleId="exercise-title-2" exerciseName="스쿼트" primaryMuscleLabel="하체">
        <div>세트</div>
      </WorkoutExercisePanel>,
    )

    expect(container.querySelector('.exercise-note')).toBeNull()
  })
})
