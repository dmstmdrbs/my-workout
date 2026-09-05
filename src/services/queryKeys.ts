import type { QueryClient } from '@tanstack/react-query'

/** 모든 종목 카탈로그 소비자 캐시의 공통 prefix. */
export const exerciseCatalogQueryKey = ['exercise-catalog'] as const

/** 프로그램 기준 1RM 개인화 query. */
export const programPersonalizationQueryKey = [...exerciseCatalogQueryKey, 'program-personalization'] as const

/** 완료 세션 상세 조회 키. */
export const workoutRecordQueryKey = {
  all: ['workout-record'] as const,
  byId: (sessionId: string) => ['workout-record', sessionId] as const,
}

/** 기록 탭의 날짜 선택 및 최신 기록 조회 키. */
export const recordsQueryKey = {
  latestSession: ['records-latest-session'] as const,
  day: (dateKey: string | null) => ['records-day', dateKey] as const,
  dayAll: ['records-day'] as const,
}

/** 기록 달력의 월별 세션 및 연속 기록 집계 키. */
export const recordsCalendarQueryKey = {
  month: (monthStart: string) => ['records-calendar-month', monthStart] as const,
  monthAll: ['records-calendar-month'] as const,
  streak: (windowStart: string) => ['records-calendar-streak', windowStart] as const,
  streakAll: ['records-calendar-streak'] as const,
}

export const dashboardOverviewQueryKey = ['dashboard-overview'] as const
export const weeklyStatsQueryKey = (weekStart: string) => ['weekly-stats', weekStart] as const
export const weeklyStatsQueryKeyAll = ['weekly-stats'] as const
export const exerciseProgressQueryKey = (exerciseId: string | null, periodStart: string) => ['exercise-progress', exerciseId, periodStart] as const
export const exerciseProgressQueryKeyAll = ['exercise-progress'] as const
export const previousExerciseSessionQueryKey = (exerciseId: string) => ['previous-exercise-session', exerciseId] as const
export const previousExerciseSessionQueryKeyAll = ['previous-exercise-session'] as const
export const routineLastPerformedQueryKey = ['routine-last-performed'] as const
export const inactivityReminderLatestSessionQueryKey = ['inactivity-reminder-latest-session'] as const

/** 프로그램 회차 목록. active-program-run은 production consumer가 없는 legacy key다. */
export const programRunsQueryKey = ['program-runs'] as const

/** 종목 카탈로그 아래에 놓이는 합성 planning query 키. */
export const routineManagerQueryKey = [...exerciseCatalogQueryKey, 'routine-manager'] as const
export const workoutSetupQueryKey = {
  all: [...exerciseCatalogQueryKey, 'workout-setup'] as const,
  byProgramDay: (programDayId: string | null) => [...exerciseCatalogQueryKey, 'workout-setup', programDayId] as const,
}

/** 종목 카탈로그를 소비하는 화면별 query 키. */
export const statsExerciseCatalogQueryKey = [...exerciseCatalogQueryKey, 'stats'] as const
export const recordEditExerciseQueryKey = [...exerciseCatalogQueryKey, 'record-edit'] as const

const workoutSessionDependentQueryKeys = [
  workoutRecordQueryKey.all,
  recordsQueryKey.latestSession,
  recordsQueryKey.dayAll,
  recordsCalendarQueryKey.monthAll,
  recordsCalendarQueryKey.streakAll,
  dashboardOverviewQueryKey,
  weeklyStatsQueryKeyAll,
  exerciseProgressQueryKeyAll,
  previousExerciseSessionQueryKeyAll,
  routineLastPerformedQueryKey,
  inactivityReminderLatestSessionQueryKey,
  programRunsQueryKey,
  routineManagerQueryKey,
  workoutSetupQueryKey.all,
] as const

/** 완료 세션이 추가·편집·삭제될 때 함께 낡는 모든 실제 consumer를 갱신한다. */
export function invalidateWorkoutSessionQueries(queryClient: QueryClient) {
  return Promise.all(workoutSessionDependentQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}

const programRunDependentQueryKeys = [
  programRunsQueryKey,
  dashboardOverviewQueryKey,
  routineManagerQueryKey,
  workoutSetupQueryKey.all,
] as const

/** 프로그램 회차 변경 후 회차·대시보드·planning 합성 query를 갱신한다. */
export function invalidateProgramRunQueries(queryClient: QueryClient) {
  return Promise.all(programRunDependentQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}
