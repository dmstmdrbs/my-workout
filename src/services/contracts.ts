import type {
  BodyMeasurement,
  Exercise,
  Id,
  Routine,
  UserProfile,
  UserSettings,
  WorkoutSession,
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

  listSessions(options?: { limit?: number; status?: WorkoutSession['status'] }): Promise<WorkoutSession[]>
  getSession(id: Id): Promise<WorkoutSession | null>
  saveSession(session: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }): Promise<WorkoutSession>
  deleteSession(id: Id): Promise<void>

  listBodyMeasurements(): Promise<BodyMeasurement[]>
  saveBodyMeasurement(measurement: Omit<BodyMeasurement, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }): Promise<BodyMeasurement>
}

export interface AppServices {
  auth: AuthAdapter
  workoutRepository: WorkoutRepository
}
