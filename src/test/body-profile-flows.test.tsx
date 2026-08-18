import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import type { AppServices } from '../services'

/**
 * mock 어댑터의 모듈 스코프 `inMemoryStore`는 `localStorage.clear()`로 지워지지
 * 않으므로(파일 단위 격리만 보장된다), 측정 데이터는 파일당 한 번만 심고 모든
 * 테스트가 같은 데이터를 읽는다. 체중 기록이 하나뿐일 때의 분기는 이 데이터와
 * 공존할 수 없어 별도 파일(`body-trend-single-point.test.tsx`)에 있다.
 */
async function seedMeasurements(
  services: AppServices,
  rows: { measuredOn: string; weightKg?: number; skeletalMuscleMassKg?: number; bodyFatPercentage?: number }[],
) {
  for (const row of rows) {
    await services.workoutRepository.saveBodyMeasurement({
      measuredOn: row.measuredOn,
      weightKg: row.weightKg ?? null,
      skeletalMuscleMassKg: row.skeletalMuscleMassKg ?? null,
      bodyFatPercentage: row.bodyFatPercentage ?? null,
      notes: null,
    })
  }
}

function renderApp(initialPath = '/body') {
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

describe.sequential('UF-20: 신체 프로필 요약과 추이', () => {
  beforeAll(async () => {
    localStorage.clear()
    // 가장 최근 측정(03-15)에는 체중만 있다. 체지방률은 그보다 앞선 날짜에만
    // 있으므로, "최신 행 하나"만 읽는 구현이라면 여기서 '기록 없음'이 된다.
    await seedMeasurements(createLocalStorageServices(), [
      { measuredOn: '2025-03-01', weightKg: 70, bodyFatPercentage: 20 },
      { measuredOn: '2025-03-08', bodyFatPercentage: 18 },
      { measuredOn: '2025-03-15', weightKg: 71 },
    ])
  })

  test('요약 카드는 지표마다 그 지표가 기록된 가장 최근 값을 보여준다', async () => {
    renderApp()
    const summary = await screen.findByRole('region', { name: '최근 체성분' })

    // "직전 대비"는 카드마다 반복하지 않고 카드 제목 아래에서 한 번만 밝힌다.
    expect(summary.textContent).toContain('직전 측정 대비')

    const weight = within(summary).getByText('체중').closest('li')!
    expect(weight.textContent).toContain('71')
    expect(weight.textContent).toContain('+1kg')
    expect(weight.textContent).toContain('2025-03-15')

    const bodyFat = within(summary).getByText('체지방률').closest('li')!
    expect(bodyFat.textContent).toContain('18')
    expect(bodyFat.textContent).toContain('−2%')
    expect(bodyFat.textContent).toContain('2025-03-08')

    // 한 번도 기록하지 않은 지표만 '기록 없음'이 된다.
    const muscle = within(summary).getByText('골격근량').closest('li')!
    expect(muscle.textContent).toContain('기록 없음')
  })

  test('체중 추이는 체중이 기록된 측정만 오래된 순으로 그린다', async () => {
    renderApp()
    const trend = await screen.findByRole('region', { name: '체중 추이' })
    // 꺾은선 자체와 각 측정점 라벨이 모두 이름을 갖는다. 첫 항목이 그래프다.
    const labels = within(trend).getAllByRole('img').map((point) => point.getAttribute('aria-label'))

    // 03-08은 체중이 없어 빠지고, 저장소의 최신순이 시간순으로 뒤집힌다.
    expect(labels.slice(1)).toEqual(['2025-03-01 체중 70kg', '2025-03-15 체중 71kg'])
    expect(labels[0]).toContain('꺾은선')
  })

  test('1RM 계산기는 입력한 세트로 예상 1RM과 반복 수별 중량을 보여준다', async () => {
    const user = userEvent.setup()
    renderApp()

    const calculator = await screen.findByRole('region', { name: '1RM 계산기' })
    await user.type(within(calculator).getByRole('spinbutton', { name: '계산할 중량 (kg)' }), '100')
    await user.type(within(calculator).getByRole('spinbutton', { name: '계산할 반복 수' }), '5')

    // Brzycki: 100 / (1.0278 - 0.0278 * 5) = 112.5
    const result = await within(calculator).findByText(/예상 1RM/)
    expect(result.textContent).toContain('112.5kg')
    // 역산이 같은 계수를 쓰므로 5회 칸은 입력한 100kg으로 돌아와야 한다.
    expect(within(calculator).getByText('5회').closest('li')!.textContent).toContain('100kg')
  })

  test('반복 수가 추정 한계를 넘으면 계산하지 않고 이유를 알려준다', async () => {
    const user = userEvent.setup()
    renderApp()

    const calculator = await screen.findByRole('region', { name: '1RM 계산기' })
    await user.type(within(calculator).getByRole('spinbutton', { name: '계산할 중량 (kg)' }), '60')
    await user.type(within(calculator).getByRole('spinbutton', { name: '계산할 반복 수' }), '15')

    expect(await within(calculator).findByText(/12회를 넘는 세트는/)).toBeTruthy()
    expect(within(calculator).queryByText(/예상 1RM/)).toBeNull()
  })
})
