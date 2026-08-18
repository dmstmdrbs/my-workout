import { beforeAll, describe, expect, test } from 'vitest'
import { createLocalStorageServices } from '../services'
import type { WorkoutRepository } from '../services'

describe.sequential('저장소 조회 계약', () => {
  let repo: WorkoutRepository

  beforeAll(() => {
    localStorage.clear()
    repo = createLocalStorageServices().workoutRepository
  })

  test('limit은 최근 세션부터 그 개수만 돌려준다', async () => {
    const all = await repo.listSessions({ status: 'completed' })
    expect(all.length).toBeGreaterThan(1)

    const limited = await repo.listSessions({ status: 'completed', limit: 1 })
    expect(limited).toHaveLength(1)
    expect(limited[0].id).toBe(all[0].id)
  })

  test('결과는 startedAt 내림차순이다', async () => {
    const sessions = await repo.listSessions({ status: 'completed' })
    const times = sessions.map((session) => new Date(session.startedAt).getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  test('startedBefore는 커서로 동작해 그 시각 이전 세션만 준다', async () => {
    const all = await repo.listSessions({ status: 'completed' })
    const cursor = all[0].startedAt

    const page = await repo.listSessions({ status: 'completed', startedBefore: cursor })
    expect(page.every((session) => new Date(session.startedAt) < new Date(cursor))).toBe(true)
    expect(page.some((session) => session.id === all[0].id)).toBe(false)
  })

  test('startedAfter는 그 시각 이후 세션만 준다', async () => {
    const all = await repo.listSessions({ status: 'completed' })
    const cursor = all.at(-1)!.startedAt

    const page = await repo.listSessions({ status: 'completed', startedAfter: cursor })
    expect(page.every((session) => new Date(session.startedAt) >= new Date(cursor))).toBe(true)
  })

  test('커서로 페이지를 이어 붙이면 전체와 같아진다', async () => {
    const all = await repo.listSessions({ status: 'completed' })
    const collected = []
    let cursor: string | undefined

    for (let guard = 0; guard < 20; guard += 1) {
      const page = await repo.listSessions({ status: 'completed', limit: 1, startedBefore: cursor })
      if (!page.length) break
      collected.push(...page)
      cursor = page.at(-1)!.startedAt
    }

    expect(collected.map((session) => session.id)).toEqual(all.map((session) => session.id))
  })

  test('종목별 마지막 완료 세트를 돌려준다', async () => {
    const sessions = await repo.listSessions({ status: 'completed' })
    const exercise = sessions.flatMap((session) => session.exercises).find((item) => item.sets.some((set) => set.isCompleted))
    expect(exercise).toBeTruthy()

    const set = await repo.getLastCompletedSetForExercise(exercise!.exerciseId)
    expect(set).not.toBeNull()
    expect(set!.isCompleted).toBe(true)
  })

  test('기록이 없는 종목이면 null을 돌려준다', async () => {
    expect(await repo.getLastCompletedSetForExercise('없는-종목-id')).toBeNull()
  })

  test('종목별 진행 시계열은 그 종목이 나온 세션만 오래된 순으로 돌려준다', async () => {
    // Seed data: 'seated-cable-row' has completed sets in both
    // session-2026-08-11 and session-2026-08-14 (see src/services/mock/seed.ts).
    const entries = await repo.listExerciseProgress('seated-cable-row', { completedAfter: '2026-08-01T00:00:00.000+09:00' })
    expect(entries.map((entry) => entry.sessionId)).toEqual(['session-2026-08-11', 'session-2026-08-14'])
    entries.forEach((entry) => {
      expect(entry.sets.length).toBeGreaterThan(0)
      expect(entry.sets.every((set) => set.isCompleted)).toBe(true)
    })
  })

  test('종목별 진행 시계열은 completedAfter 이전 세션을 범위에서 제외한다', async () => {
    // Cutoff sits after session-2026-08-11 but before session-2026-08-14, so
    // only the later session should come back -- this is the query's bound.
    const cutoff = '2026-08-12T00:00:00.000+09:00'
    const entries = await repo.listExerciseProgress('seated-cable-row', { completedAfter: cutoff })
    expect(entries.map((entry) => entry.sessionId)).toEqual(['session-2026-08-14'])
  })

  test('종목별 진행 시계열은 기록이 없는 종목이면 빈 배열을 돌려준다', async () => {
    expect(await repo.listExerciseProgress('없는-종목-id', { completedAfter: '2020-01-01T00:00:00.000Z' })).toEqual([])
  })
})
