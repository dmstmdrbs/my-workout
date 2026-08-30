import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import { AppServicesProvider } from './services'
import { applyTheme, readMirroredTheme } from './lib/theme'
import { normalizeAnalyticsUrl } from './lib/analytics'

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
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppServicesProvider>
    </QueryClientProvider>
    <Analytics
      beforeSend={(event) => {
        const url = normalizeAnalyticsUrl(event.url)
        return url === null ? null : { ...event, url }
      }}
    />
  </StrictMode>,
)
