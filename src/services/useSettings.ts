import { useQuery } from '@tanstack/react-query'
import { useAppServices } from './useAppServices'

/**
 * Settings feed every screen (weight-unit labels, default rest, default RIR).
 * A single query key keeps them in sync: saving settings invalidates one key
 * instead of every screen's composite key.
 */
export const userSettingsQueryKey = ['user-settings'] as const

export function useSettings() {
  const { workoutRepository } = useAppServices()
  return useQuery({
    queryKey: userSettingsQueryKey,
    queryFn: () => workoutRepository.getSettings(),
  })
}
