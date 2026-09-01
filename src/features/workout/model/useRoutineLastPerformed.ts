import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppServices } from '../../../services'
import type { Id, IsoDateTime } from '../../../types/domain'
import { routineLastPerformedQueryKey } from './queryKeys'

/**
 * 마지막 수행일을 채우기 위해 훑는 완료 세션 수. 전부 조회하면 이 화면
 * 하나 때문에 전 기간 세션·세트를 받게 되므로 최근 것만 본다. 이 범위 밖의
 * 루틴은 날짜를 표시하지 않을 뿐이며, 조회가 실패해도 카드는 그대로 그려진다.
 */
const LAST_PERFORMED_SESSION_SCAN = 40

export function useRoutineLastPerformed(): Map<Id, IsoDateTime> {
  const { workoutRepository } = useAppServices()
  const query = useQuery({
    queryKey: routineLastPerformedQueryKey,
    queryFn: () => workoutRepository.listSessions({ status: 'completed', limit: LAST_PERFORMED_SESSION_SCAN }),
  })

  return useMemo(() => {
    const latest = new Map<Id, IsoDateTime>()
    for (const session of query.data ?? []) {
      if (!session.routineId) continue
      const seen = latest.get(session.routineId)
      if (!seen || new Date(session.startedAt).getTime() > new Date(seen).getTime()) {
        latest.set(session.routineId, session.startedAt)
      }
    }
    return latest
  }, [query.data])
}
