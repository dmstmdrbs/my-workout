import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test } from 'vitest'
import App from '../App'
import { AppServicesProvider, createLocalStorageServices } from '../services'
import type { AppServices } from '../services'

const storeKey = 'trainlog:mock-store:v1'

function renderAppWithServices(services: AppServices, initialPath = '/body') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={services}>
        <MemoryRouter initialEntries={[initialPath]}>
          <App />
        </MemoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>,
  )
}

function renderApp(initialPath = '/body') {
  return renderAppWithServices(createLocalStorageServices(), initialPath)
}

function readMeasurements() {
  return JSON.parse(localStorage.getItem(storeKey) ?? '{}').measurements ?? []
}

describe('신체 측정: 오래된 목록 캐시로 인한 필드 유실 방지', () => {
  beforeAll(() => {
    localStorage.clear()
  })

  test('다른 기기가 같은 날짜를 먼저 저장한 뒤에도, 저장 시점에 목록을 다시 불러와 병합하므로 재입력하지 않은 필드가 지워지지 않는다', async () => {
    const user = userEvent.setup()
    renderApp('/body')

    await screen.findByRole('heading', { name: '신체 기록' })
    await waitFor(() => expect(screen.queryByText('불러오는 중…')).toBeNull())

    // Read the date the form defaults to (local date) so this test doesn't
    // depend on timezone assumptions -- same pattern as body-flows.test.tsx.
    const dateInput = screen.getByLabelText('측정일') as HTMLInputElement
    const today = dateInput.value

    // A second device/tab saves today's full measurement directly at the
    // repository layer -- bypassing this tab's react-query cache entirely.
    // This is the repository-layer equivalent of another device (or an idle
    // tab, given refetchOnWindowFocus: false in src/main.tsx) writing a row
    // this tab doesn't yet know about.
    const otherDeviceRepo = createLocalStorageServices().workoutRepository
    const otherDeviceSaved = await otherDeviceRepo.saveBodyMeasurement({
      measuredOn: today,
      weightKg: 70,
      skeletalMuscleMassKg: 32.5,
      bodyFatPercentage: 15.5,
      notes: '다른 기기에서 기록',
    })

    // This tab's measurementsQuery cache was fetched before the write above
    // and was never told to refetch -- it still believes there is no row
    // for today. Only weight is retyped here.
    await user.clear(screen.getByRole('spinbutton', { name: '체중 (kg)' }))
    await user.type(screen.getByRole('spinbutton', { name: '체중 (kg)' }), '71')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const rowsForToday = readMeasurements().filter((item: { measuredOn: string }) => item.measuredOn === today)
      expect(rowsForToday).toHaveLength(1)
    })

    const [row] = readMeasurements().filter((item: { measuredOn: string }) => item.measuredOn === today)
    // Must update the other device's row (same id), not create a duplicate,
    // and must preserve the fields this tab never retyped.
    expect(row).toMatchObject({
      id: otherDeviceSaved.id,
      weightKg: 71,
      skeletalMuscleMassKg: 32.5,
      bodyFatPercentage: 15.5,
      notes: '다른 기기에서 기록',
    })
  })
})
