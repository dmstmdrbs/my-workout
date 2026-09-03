import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.tsx'
import { AppServicesProvider } from './services'
import { applyTheme, readMirroredTheme } from './lib/theme'
import { scrubAnalyticsEvent } from './lib/analytics'
import { configureNativeOnlineManager } from './lib/nativeOnlineManager'
import GuardedHistoryRouter from './app/GuardedHistoryRouter'

configureNativeOnlineManager()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

// Paint the user's theme before React renders; the database value replaces
// this once settings load.
applyTheme(readMirroredTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider>
        <GuardedHistoryRouter>
          <App />
        </GuardedHistoryRouter>
      </AppServicesProvider>
    </QueryClientProvider>
    <Analytics beforeSend={scrubAnalyticsEvent} />
    <SpeedInsights beforeSend={scrubAnalyticsEvent} />
  </StrictMode>,
)
