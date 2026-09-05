import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { useQuery } from '@tanstack/react-query'
import { inactivityReminderLatestSessionQueryKey, useAppServices } from '../../services'
import {
  syncInactivityReminder,
  useInactivityReminderSettings,
} from '../../lib/inactivityReminder'

export function useInactivityReminder(authenticated: boolean) {
  const { workoutRepository } = useAppServices()
  const settings = useInactivityReminderSettings()
  const isNative = Capacitor.isNativePlatform()
  const latestSessionQuery = useQuery({
    queryKey: inactivityReminderLatestSessionQueryKey,
    queryFn: () => workoutRepository.listSessions({ status: 'completed', limit: 1 }),
    enabled: isNative && authenticated,
  })

  useEffect(() => {
    if (!isNative) return
    if (!authenticated) {
      void syncInactivityReminder(null, { ...settings, enabled: false }).catch(() => undefined)
      return
    }
    if (!latestSessionQuery.isSuccess) return
    const latest = latestSessionQuery.data[0]
    void syncInactivityReminder(latest?.completedAt ?? latest?.startedAt ?? null, settings).catch(() => undefined)
  }, [authenticated, isNative, latestSessionQuery.data, latestSessionQuery.isSuccess, settings])
}
