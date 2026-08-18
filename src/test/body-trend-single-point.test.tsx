import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'

/**
 * 체중 기록이 정확히 하나일 때의 분기만 확인한다. mock 어댑터의 모듈 스코프
 * 저장소는 파일 단위로만 격리되므로, 측정이 여러 개인
 * `body-profile-flows.test.tsx`와 같은 파일에 둘 수 없어 파일을 나눴다.
 */
beforeAll(async () => {
  localStorage.clear()
  await createLocalStorageServices().workoutRepository.saveBodyMeasurement({
    measuredOn: '2025-05-01',
    weightKg: 68,
    skeletalMuscleMassKg: null,
    bodyFatPercentage: null,
    notes: null,
  })
})

test('체중 기록이 하나뿐이면 그래프 대신 안내를 보여준다', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={createLocalStorageServices()}>
        <MemoryRouter initialEntries={['/body']}>
          <App />
        </MemoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>,
  )

  const trend = await screen.findByRole('region', { name: '체중 추이' })
  expect(within(trend).queryByRole('group', { name: '체중 추이' })).toBeNull()
  expect(trend.textContent).toContain('비교할 이전 기록이 없어')
  expect(trend.textContent).toContain('68kg')
})
