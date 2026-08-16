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
})
