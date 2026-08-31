import type { QueryClient } from '@tanstack/react-query'

/**
 * 완료된 기록 하나가 바뀌면 같이 낡는 쿼리들.
 *
 * 삭제(`Records`)와 편집(`RecordEditor`)이 같은 목록을 무효화해야 한다. 한쪽에만
 * 키를 더하면 다른 쪽에서만 화면이 낡은 값을 계속 보여주는데, 그건 눈에 띄지
 * 않아서 오래 남는 종류의 버그다.
 *
 * 접두사 일치(`exact: true`를 쓰지 않음)라 `['previous-exercise-session', <id>]`처럼
 * 뒤에 식별자가 붙는 키도 모두 덮인다.
 */
const recordDependentQueryKeys = [
  ['completed-workout-records'],
  ['records-calendar-month'],
  ['records-calendar-streak'],
  ['dashboard-overview'],
  ['weekly-stats'],
  ['exercise-progress'],
  ['last-completed-set'],
  ['previous-exercise-session'],
]

export function invalidateRecordQueries(queryClient: QueryClient) {
  return Promise.all(recordDependentQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}
