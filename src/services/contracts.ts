import type {
  BodyMeasurement,
  Exercise,
  Id,
  IsoDateTime,
  Routine,
  UserProfile,
  UserSettings,
  WorkoutSession,
  WorkoutSetRecord,
} from '../types/domain'

export interface AuthSession {
  user: UserProfile
  accessToken: string | null
}

export type AuthStateListener = (session: AuthSession | null) => void

/** OAuth implementations can honour a post-login redirect without exposing provider details to UI. */
export interface SignInOptions {
  redirectTo?: string
}

export interface AuthAdapter {
  getSession(): Promise<AuthSession | null>
  /** OAuth leaves the app before a session exists; callers should observe onAuthStateChange after the redirect. */
  signInWithGoogle(options?: SignInOptions): Promise<AuthSession | null>
  signOut(): Promise<void>
  onAuthStateChange(listener: AuthStateListener): () => void
}

/** 하나의 세션에서 어떤 종목이 낸 완료 세트 묶음. 진행 추이 차트의 단위. */
export interface ExerciseProgressEntry {
  sessionId: Id
  startedAt: IsoDateTime
  sets: WorkoutSetRecord[]
}

export interface WorkoutRepository {
  getProfile(): Promise<UserProfile>
  updateProfile(changes: Pick<UserProfile, 'displayName' | 'avatarUrl'>): Promise<UserProfile>
  getSettings(): Promise<UserSettings>
  updateSettings(changes: Partial<Omit<UserSettings, 'userId' | 'updatedAt'>>): Promise<UserSettings>

  listExercises(options?: { includeArchived?: boolean }): Promise<Exercise[]>
  getExercise(id: Id): Promise<Exercise | null>
  saveExercise(exercise: Omit<Exercise, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }): Promise<Exercise>
  archiveExercise(id: Id): Promise<void>

  listRoutines(): Promise<Routine[]>
  getRoutine(id: Id): Promise<Routine | null>
  saveRoutine(routine: Omit<Routine, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }): Promise<Routine>
  deleteRoutine(id: Id): Promise<void>

  listSessions(options?: {
    status?: WorkoutSession['status']
    limit?: number
    /** 이 시각보다 이전(`<`)에 시작한 세션만. 페이지네이션 커서로 쓴다. 경계값 자체는 제외된다. */
    startedBefore?: IsoDateTime
    /** 이 시각 이후(`>=`)에 시작한 세션만. 기간 집계에 쓴다. 경계값 자체도 포함된다. */
    startedAfter?: IsoDateTime
  }): Promise<WorkoutSession[]>
  getSession(id: Id): Promise<WorkoutSession | null>
  /**
   * `pausedSeconds`는 선택 입력이다. 이 필드가 생기기 전에 저장을 호출하던
   * 코드도 계속 컴파일되고, 어댑터가 누락 시 0으로 채운다.
   */
  saveSession(session: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'pausedSeconds'> & { id?: Id; pausedSeconds?: number }): Promise<WorkoutSession>
  deleteSession(id: Id): Promise<void>
  /** 지난 기록 표시용. 세션 목록 전체를 받지 않고 필요한 한 세트만 가져온다. */
  getLastCompletedSetForExercise(exerciseId: Id): Promise<WorkoutSetRecord | null>
  /**
   * 종목별 완료 세트의 시계열(통계 화면의 중량 추이 차트용). 위
   * `getLastCompletedSetForExercise`가 한 건만 주는 것과 달리 기간 전체가
   * 필요하지만, 11번 규칙과 같은 이유로 무제한 조회는 막는다.
   * `completedAfter`를 선택이 아닌 필수 인자로 둬 호출부가 실수로 전체
   * 기록을 요청할 수 없게 한다. 세션 목록 커서(`listSessions`)와 달리
   * 오래된 것부터 최신순으로 정렬해 돌려준다 -- 차트를 왼쪽에서 오른쪽으로
   * 시간순으로 그리기 위함이다.
   */
  listExerciseProgress(exerciseId: Id, options: { completedAfter: IsoDateTime }): Promise<ExerciseProgressEntry[]>

  listBodyMeasurements(): Promise<BodyMeasurement[]>
  saveBodyMeasurement(measurement: Omit<BodyMeasurement, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }): Promise<BodyMeasurement>
}

export interface AppServices {
  auth: AuthAdapter
  workoutRepository: WorkoutRepository
}
