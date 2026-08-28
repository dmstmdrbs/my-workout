import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import type { WorkoutRepository } from '../services'

/**
 * UF-08 기록 탭: 달력에서 날짜를 고르고 그 날의 기록을 연다.
 *
 * 시드는 하루에 한 번씩만 운동한 날들이라, 하루에 두 번 운동한 날을 이 파일이
 * 직접 심는다. 달력이 그 날의 **모든** 세션을 리스트로 내놓는지가 이 파일의
 * 핵심이다 -- 예전에는 그 날의 첫 세션 하나만 열 수 있었다.
 */
declare const process: { env: Record<string, string | undefined> }

// 시드와 이 파일의 고정 날짜가 로컬 달력일 기준으로 같은 칸에 들어가야 하므로
// 타임존을 고정한다(`records-calendar-flows.test.tsx`와 같은 이유).
process.env.TZ = 'Asia/Seoul'

const twiceTrainedDay = '2026-07-15'
const morningName = '아침 상체'
const eveningName = '저녁 하체'

function renderApp(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={createLocalStorageServices()}>
        <MemoryRouter initialEntries={[initialPath]}>
          <App />
        </MemoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>,
  )
}

async function seedSession(repo: WorkoutRepository, name: string, startedAt: string, completedAt: string) {
  const saved = await repo.saveSession({
    routineId: null,
    routineName: name,
    status: 'completed',
    startedAt,
    completedAt,
    notes: null,
    exercises: [{
      id: `${name}-exercise`,
      exerciseId: 'barbell-bench-press',
      exerciseName: '바벨 벤치프레스',
      primaryMuscle: 'chest',
      exerciseOrder: 1,
      notes: null,
      sets: [{
        id: `${name}-set-1`,
        setOrder: 1,
        setType: 'working',
        weightKg: 60,
        reps: 10,
        durationSeconds: null,
        distanceKm: null,
        targetRir: 2,
        actualRir: 2,
        restSeconds: 120,
        isCompleted: true,
        completedAt,
        notes: null,
      }],
    }],
  })
  return saved.id
}

function dayPanel() {
  return screen.getByRole('region', { name: '선택한 날의 운동' })
}

describe.sequential('UF-08: 기록 탭 달력과 날짜별 기록', () => {
  beforeAll(async () => {
    localStorage.clear()
    const repo = createLocalStorageServices().workoutRepository
    await seedSession(repo, morningName, `${twiceTrainedDay}T08:00:00.000+09:00`, `${twiceTrainedDay}T09:00:00.000+09:00`)
    await seedSession(repo, eveningName, `${twiceTrainedDay}T19:00:00.000+09:00`, `${twiceTrainedDay}T20:10:00.000+09:00`)
  })

  test('하루에 두 번 운동한 날은 두 기록이 모두 리스트에 나온다', async () => {
    renderApp(`/records?d=${twiceTrainedDay}`)
    await screen.findByRole('heading', { name: '운동 기록' })

    const panel = await waitFor(() => dayPanel())
    expect(await within(panel).findByText(morningName)).toBeTruthy()
    expect(within(panel).getByText(eveningName)).toBeTruthy()
  })

  test('리스트 항목을 누르면 그 기록의 상세 페이지로 이동한다', async () => {
    const user = userEvent.setup()
    renderApp(`/records?d=${twiceTrainedDay}`)
    await screen.findByRole('heading', { name: '운동 기록' })

    const panel = await waitFor(() => dayPanel())
    await user.click(await within(panel).findByRole('button', { name: new RegExp(eveningName) }))

    // 상세는 전용 페이지다. 목록 화면의 제목은 더 이상 없다.
    await screen.findByRole('heading', { name: eveningName, level: 1 })
    expect(screen.queryByRole('heading', { name: '운동 기록' })).toBeNull()
    expect(screen.getByRole('button', { name: '수정' })).toBeTruthy()
  })

  test('상세에서 돌아가면 보고 있던 날짜가 그대로 선택돼 있다', async () => {
    const user = userEvent.setup()
    renderApp(`/records?d=${twiceTrainedDay}`)
    await screen.findByRole('heading', { name: '운동 기록' })

    const panel = await waitFor(() => dayPanel())
    await user.click(await within(panel).findByRole('button', { name: new RegExp(morningName) }))
    await screen.findByRole('heading', { name: morningName, level: 1 })

    await user.click(screen.getByRole('button', { name: '기록 목록으로 돌아가기' }))

    await screen.findByRole('heading', { name: '운동 기록' })
    const backPanel = await waitFor(() => dayPanel())
    // 날짜가 초기화되면 "가장 최근 운동일"로 떨어져 이 두 기록이 사라진다.
    expect(await within(backPanel).findByText(morningName)).toBeTruthy()
    expect(within(backPanel).getByText(eveningName)).toBeTruthy()
  })

  test('날짜 없이 들어오면 가장 최근에 운동한 날이 열린다', async () => {
    renderApp('/records')
    await screen.findByRole('heading', { name: '운동 기록' })

    const panel = await waitFor(() => dayPanel())
    // 이 파일이 심은 7월 세션보다 시드의 2026-08-14 세션이 최신이다.
    expect(await within(panel).findByText('Pull Day')).toBeTruthy()
  })
})
