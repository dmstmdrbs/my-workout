import { useRef, type PropsWithChildren } from 'react'
import { unstable_HistoryRouter } from 'react-router-dom'
import { createGuardedBrowserHistory } from './model/guardedBrowserHistory'

const HistoryRouter = unstable_HistoryRouter

export default function GuardedHistoryRouter({ children }: PropsWithChildren) {
  const historyRef = useRef<ReturnType<typeof createGuardedBrowserHistory> | null>(null)
  if (!historyRef.current) historyRef.current = createGuardedBrowserHistory()

  return (
    <HistoryRouter history={historyRef.current} useTransitions={false}>
      {children}
    </HistoryRouter>
  )
}
