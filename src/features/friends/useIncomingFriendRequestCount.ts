import { useQuery } from '@tanstack/react-query'
import { useAppServices } from '../../services'
import { incomingCountQueryKey } from './friendQueryKeys'

export function useIncomingFriendRequestCount(enabled: boolean) {
  const { socialRepository } = useAppServices()
  const query = useQuery({
    queryKey: incomingCountQueryKey,
    queryFn: () => socialRepository.getIncomingRequestCount(),
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  return query.data ?? 0
}
