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

  listBodyMeasurements(): Promise<BodyMeasurement[]>
  saveBodyMeasurement(measurement: Omit<BodyMeasurement, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }): Promise<BodyMeasurement>
}

export interface AppServices {
  auth: AuthAdapter
  workoutRepository: WorkoutRepository
}
