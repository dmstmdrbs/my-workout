import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { Programs } from '../features/programs/Programs'
import { buildPlateauBreakProgram } from '../features/programs/programTemplate'
import { addCalendarDays, getDateInTimeZone } from '../lib/localDate'
import { AppServicesProvider, createLocalStorageServices } from '../services'

describe('진행 중 프로그램 템플릿 갱신', () => {
  beforeEach(() => localStorage.clear())

  test('과거·완료·기록 연결 Day를 보존하고 이후 미완료 Day만 바꾼다', async () => {
    const services = createLocalStorageServices()
    const today = getDateInTimeZone('Asia/Seoul')
    const latest = buildPlateauBreakProgram(addCalendarDays(today, -1))
    const previous = {
      ...latest,
      templateVersion: latest.templateVersion - 1,
      days: latest.days.map((day) => ({ ...day, title: `이전 · ${day.title}` })),
    }
    const started = await services.workoutRepository.startProgramRun(previous)
    const linkedDay = started.days[1]
    const completedRestDay = started.days[2]
    await services.workoutRepository.saveSession({
      routineId: null,
      routineName: '기록 연결 확인',
      programRunDayId: linkedDay.id,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      completedAt: null,
      notes: null,
      exercises: [],
    })
    await services.workoutRepository.completeProgramRunDay(completedRestDay.id)

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><AppServicesProvider services={services}><Programs onStartDay={() => undefined} onSelectSession={() => undefined} /></AppServicesProvider></QueryClientProvider>)
    await userEvent.click(await screen.findByRole('button', { name: /최신 처방 적용/ }))

    await waitFor(async () => {
      const refreshed = await services.workoutRepository.getActiveProgramRun()
      expect(refreshed?.templateVersion).toBe(latest.templateVersion)
      expect(refreshed?.days[0].title).toMatch(/^이전 ·/)
      expect(refreshed?.days[1].title).toMatch(/^이전 ·/)
      expect(refreshed?.days[2].title).toMatch(/^이전 ·/)
      expect(refreshed?.days[2].completedAt).not.toBeNull()
      expect(refreshed?.days[3].title).toBe(latest.days[3].title)
    })
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('이전 날짜와 완료·기록된 Day는 그대로 유지'))
    expect(screen.queryByRole('button', { name: /최신 처방 적용/ })).toBeNull()
  })
})
