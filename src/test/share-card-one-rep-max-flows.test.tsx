import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import { estimateOneRepMax } from '../lib/oneRepMax'

// UF-08 share-card scope, but its own file/store: this project's convention
// is that a new scenario group gets its own renderApp/storeKey copies and
// beforeAll, since the mock's module-level `inMemoryStore` isn't reset by
// `localStorage.clear()` -- isolation instead comes from Vitest's per-file
// module graph.
const toPngMock = vi.hoisted(() => vi.fn(async (_node: HTMLElement, _options?: Record<string, unknown>) => 'data:image/png;base64,dGVzdA=='))
vi.mock('html-to-image', () => ({ toPng: toPngMock }))

function renderApp(initialPath = '/') {
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

/** Mirrors the display formatting of `formatWeight` in Records.tsx, which isn't exported. */
function formatWeightForAssertion(weight: number) {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(1)
}

/** Scopes to the visible share panel's card, not the hidden PNG export-target duplicate that renders alongside it. */
function shareCardExerciseBlock(exerciseName: string) {
  const panel = document.querySelector('.share-panel')
  expect(panel).toBeTruthy()
  const nameEl = within(panel as HTMLElement).getByText(exerciseName, { selector: 'strong' })
  return nameEl.closest('.share-card-exercise') as HTMLElement
}

describe.sequential('공유 카드 예상 1RM', () => {
  const progressiveOverloadExerciseName = '테스트 프레스'
  const bodyweightExerciseName = '테스트 맨몸 운동'
  const highRepExerciseName = '테스트 고반복 운동'
  const partialMixExerciseName = '테스트 혼합 운동'
  let sessionId = ''

  beforeAll(async () => {
    localStorage.clear()
    const repo = createLocalStorageServices().workoutRepository
    const saved = await repo.saveSession({
      routineId: null,
      routineName: '예상 1RM 테스트',
      status: 'completed',
      startedAt: '2026-08-15T09:00:00.000+09:00',
      completedAt: '2026-08-15T09:45:00.000+09:00',
      notes: null,
      exercises: [
        {
          id: 'test-progressive-overload',
          exerciseId: 'test-progressive-overload-exercise',
          exerciseName: progressiveOverloadExerciseName,
          primaryMuscle: 'chest',
          exerciseOrder: 1,
          notes: null,
          // The heaviest set (100kg x 1) has its own e1RM of 100kg, but a
          // lighter set at more reps (90kg x 5) estimates higher (101.3kg) --
          // "best" must pick that, not the heaviest set.
          sets: [
            [100, 1, 0], [90, 5, 1], [90, 3, 2],
          ].map(([weightKg, reps, actualRir], index) => ({
            id: `test-progressive-overload-${index + 1}`, setOrder: index + 1, setType: 'working' as const,
            weightKg, reps, targetRir: 2, actualRir, restSeconds: 90, isCompleted: true,
            completedAt: `2026-08-15T09:${10 + index * 4}:00.000+09:00`, notes: null,
          })),
        },
        {
          id: 'test-bodyweight',
          exerciseId: 'test-bodyweight-exercise',
          exerciseName: bodyweightExerciseName,
          primaryMuscle: 'core',
          exerciseOrder: 2,
          notes: null,
          // Bodyweight exercises record no weight, so nothing can be estimated.
          sets: [12, 10, 8].map((reps, index) => ({
            id: `test-bodyweight-${index + 1}`, setOrder: index + 1, setType: 'working' as const,
            weightKg: null, reps, targetRir: 2, actualRir: 1, restSeconds: 60, isCompleted: true,
            completedAt: `2026-08-15T09:${25 + index * 3}:00.000+09:00`, notes: null,
          })),
        },
        {
          id: 'test-high-rep',
          exerciseId: 'test-high-rep-exercise',
          exerciseName: highRepExerciseName,
          primaryMuscle: 'quadriceps',
          exerciseOrder: 3,
          notes: null,
          // Every completed set is above the rep ceiling (12), so every set's
          // estimate is `null` by design and the exercise shows no estimate.
          sets: [15, 16, 18].map((reps, index) => ({
            id: `test-high-rep-${index + 1}`, setOrder: index + 1, setType: 'working' as const,
            weightKg: 50, reps, targetRir: 2, actualRir: 1, restSeconds: 60, isCompleted: true,
            completedAt: `2026-08-15T09:${36 + index * 3}:00.000+09:00`, notes: null,
          })),
        },
        {
          id: 'test-partial-mix',
          exerciseId: 'test-partial-mix-exercise',
          exerciseName: partialMixExerciseName,
          primaryMuscle: 'back',
          exerciseOrder: 4,
          notes: null,
          // A mixed block, unlike the other fixtures which are each uniformly
          // estimable/bodyweight/high-rep: one set missing a weight, one
          // ordinary estimable set, one set over the rep ceiling. Only the
          // middle set (60kg x 8 -> e1RM 74.5kg) can contribute -- this
          // exercises the per-set filter on a block where estimable and
          // non-estimable sets sit side by side, not just uniform fixtures.
          sets: [[null, 10], [60, 8], [50, 15]].map(([weightKg, reps], index) => ({
            id: `test-partial-mix-${index + 1}`, setOrder: index + 1, setType: 'working' as const,
            weightKg, reps, targetRir: 2, actualRir: 1, restSeconds: 60, isCompleted: true,
            completedAt: `2026-08-15T09:${45 + index * 3}:00.000+09:00`, notes: null,
          })),
        },
      ],
    })
    sessionId = saved.id
  })

  test('가장 무거운 세트가 아니라, 완료 세트 중 e1RM이 가장 높은 세트 기준으로 예상 1RM을 표시한다', async () => {
    renderApp(`/records/${sessionId}`)
    await screen.findByRole('heading', { name: '운동 기록' })

    const bestEstimate = Math.max(
      estimateOneRepMax(100, 1) as number,
      estimateOneRepMax(90, 5) as number,
      estimateOneRepMax(90, 3) as number,
    )
    // The heaviest set alone would read 100kg -- confirm the best-of-session
    // figure is the higher, lighter-but-more-reps estimate instead.
    expect(bestEstimate).toBeGreaterThan(estimateOneRepMax(100, 1) as number)

    const block = shareCardExerciseBlock(progressiveOverloadExerciseName)
    expect(within(block).getByText(`예상 1RM ${formatWeightForAssertion(bestEstimate)}kg`)).toBeTruthy()
  })

  test('체중 운동은 예상 1RM을 표시하지 않는다', async () => {
    renderApp(`/records/${sessionId}`)
    await screen.findByRole('heading', { name: '운동 기록' })

    const block = shareCardExerciseBlock(bodyweightExerciseName)
    expect(block.querySelector('.share-card-e1rm')).toBeNull()
  })

  test('완료 세트가 모두 반복 상한을 넘으면 예상 1RM을 표시하지 않는다', async () => {
    renderApp(`/records/${sessionId}`)
    await screen.findByRole('heading', { name: '운동 기록' })

    const block = shareCardExerciseBlock(highRepExerciseName)
    expect(block.querySelector('.share-card-e1rm')).toBeNull()
  })

  test('추정 불가한 세트와 가능한 세트가 섞여 있으면, 추정 가능한 세트만으로 예상 1RM을 계산한다', async () => {
    renderApp(`/records/${sessionId}`)
    await screen.findByRole('heading', { name: '운동 기록' })

    const onlyEstimableEstimate = estimateOneRepMax(60, 8) as number
    // The other two sets (missing weight, over the rep ceiling) must not
    // contribute -- if they leaked in as 0 or NaN the result would differ
    // from the single estimable set's own e1RM.
    const block = shareCardExerciseBlock(partialMixExerciseName)
    expect(within(block).getByText(`예상 1RM ${formatWeightForAssertion(onlyEstimableEstimate)}kg`)).toBeTruthy()
  })

  test('예상 1RM 줄이 추가되어 카드가 길어져도 고정 폭 PNG 저장은 그대로 동작한다', async () => {
    const user = userEvent.setup()
    renderApp(`/records/${sessionId}`)
    await screen.findByRole('heading', { name: '운동 기록' })

    await user.click(screen.getByRole('button', { name: 'PNG 저장' }))
    await screen.findByText('PNG 이미지를 저장했어요.')
    expect(toPngMock).toHaveBeenCalled()
    expect(toPngMock.mock.calls.at(-1)?.[1]).toMatchObject({ width: 540, skipAutoScale: true })
  })
})
