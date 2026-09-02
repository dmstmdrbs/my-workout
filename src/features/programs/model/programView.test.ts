import { describe, expect, test } from 'vitest'
import type { ProgramRunDay } from '../../../types/domain'
import { trainingProgramCatalog } from '../programTemplate'
import { filterPrograms, isProgramDayCompleted } from './programView'

describe('program view helpers', () => {
  test('프로그램 검색어와 주간 횟수 필터를 함께 적용한다', () => {
    expect(filterPrograms('', null)).toHaveLength(trainingProgramCatalog.length)
    expect(filterPrograms('바쁜', null).map((program) => program.key)).toEqual(['busy-full-body-three-day'])
    expect(filterPrograms('', 3).every((program) => program.sessionsPerWeek === 3)).toBe(true)
  })

  test('완료 시각 또는 연결된 기록이 있는 Day를 완료로 판단한다', () => {
    const base = { completedAt: null, workoutSession: null } as ProgramRunDay
    expect(isProgramDayCompleted(base)).toBe(false)
    expect(isProgramDayCompleted({ ...base, completedAt: '2026-09-02T09:00:00.000Z' })).toBe(true)
    expect(isProgramDayCompleted({ ...base, workoutSession: { id: 'session-1' } as ProgramRunDay['workoutSession'] })).toBe(true)
  })
})
