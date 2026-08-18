import type {
  BodyMeasurement,
  Exercise,
  Id,
  Routine,
  UserProfile,
  UserSettings,
  WorkoutSession,
} from '../../types/domain'
import type { AppServices, AuthAdapter, AuthSession, AuthStateListener, ExerciseProgressEntry, WorkoutRepository } from '../contracts'
import { mockExercises, mockRoutines, mockSessions, mockSettings, mockUser } from './seed'

interface LocalStore {
  version: 1
  signedIn: boolean
  profile: UserProfile
  settings: UserSettings
  exercises: Exercise[]
  routines: Routine[]
  sessions: WorkoutSession[]
  measurements: BodyMeasurement[]
}

const storageKey = 'trainlog:mock-store:v1'
let inMemoryStore: LocalStore | null = null
const clone = <T,>(value: T): T => structuredClone(value)
const now = () => new Date().toISOString()
const newId = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`

function createStore(): LocalStore {
  return {
    version: 1,
    signedIn: true,
    profile: clone(mockUser),
    settings: clone(mockSettings),
    exercises: clone(mockExercises),
    routines: clone(mockRoutines),
    sessions: clone(mockSessions),
    measurements: [],
  }
}

function readStore(): LocalStore {
  if (inMemoryStore) return inMemoryStore
  try {
    const raw = globalThis.localStorage?.getItem(storageKey)
    if (raw) {
      inMemoryStore = JSON.parse(raw) as LocalStore
      return inMemoryStore
    }
  } catch { /* localStorage can be disabled; memory fallback remains usable. */ }
  inMemoryStore = createStore()
  return inMemoryStore
}

function writeStore(store: LocalStore) {
  inMemoryStore = store
  try { globalThis.localStorage?.setItem(storageKey, JSON.stringify(store)) } catch { /* memory fallback */ }
}

function updateStore(mutator: (store: LocalStore) => void) {
  const store = readStore()
  mutator(store)
  writeStore(store)
}

class LocalStorageAuthAdapter implements AuthAdapter {
  private readonly listeners = new Set<AuthStateListener>()

  async getSession(): Promise<AuthSession | null> {
    const store = readStore()
    return store.signedIn ? { user: clone(store.profile), accessToken: null } : null
  }

  async signInWithGoogle(): Promise<AuthSession> {
    updateStore((store) => { store.signedIn = true })
    const session = await this.getSession()
    if (!session) throw new Error('Mock sign-in could not create a session.')
    this.notify(session)
    return session
  }

  async signOut(): Promise<void> {
    updateStore((store) => { store.signedIn = false })
    this.notify(null)
  }

  onAuthStateChange(listener: AuthStateListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(session: AuthSession | null) { this.listeners.forEach((listener) => listener(session)) }
}

class LocalStorageWorkoutRepository implements WorkoutRepository {
  private requireStore() {
    const store = readStore()
    if (!store.signedIn) throw new Error('An authenticated user is required.')
    return store
  }

  async getProfile() { return clone(this.requireStore().profile) }
  async updateProfile(changes: Pick<UserProfile, 'displayName' | 'avatarUrl'>) {
    let profile!: UserProfile
    updateStore((store) => { profile = { ...store.profile, ...changes, updatedAt: now() }; store.profile = profile })
    return clone(profile)
  }
  async getSettings() { return clone(this.requireStore().settings) }
  async updateSettings(changes: Partial<Omit<UserSettings, 'userId' | 'updatedAt'>>) {
    let settings!: UserSettings
    updateStore((store) => { settings = { ...store.settings, ...changes, updatedAt: now() }; store.settings = settings })
    return clone(settings)
  }

  async listExercises(options: { includeArchived?: boolean } = {}) {
    const exercises = this.requireStore().exercises.filter((item) => options.includeArchived || !item.isArchived)
    return clone(exercises)
  }
  async getExercise(id: Id) { return clone(this.requireStore().exercises.find((item) => item.id === id) ?? null) }
  async saveExercise(input: Omit<Exercise, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }) {
    const store = this.requireStore(); const existing = input.id ? store.exercises.find((item) => item.id === input.id) : undefined; const timestamp = now()
    const saved: Exercise = { ...input, id: input.id ?? newId(), userId: existing?.userId ?? store.profile.id, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp }
    updateStore((next) => { const index = next.exercises.findIndex((item) => item.id === saved.id); if (index >= 0) next.exercises[index] = saved; else next.exercises.push(saved) })
    return clone(saved)
  }
  async archiveExercise(id: Id) { updateStore((store) => { const item = store.exercises.find((exercise) => exercise.id === id); if (item) { item.isArchived = true; item.updatedAt = now() } }) }

  async listRoutines() { return clone(this.requireStore().routines.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) }
  async getRoutine(id: Id) { return clone(this.requireStore().routines.find((item) => item.id === id) ?? null) }
  async saveRoutine(input: Omit<Routine, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }) {
    const store = this.requireStore(); const existing = input.id ? store.routines.find((item) => item.id === input.id) : undefined; const timestamp = now()
    const saved: Routine = { ...input, id: input.id ?? newId(), userId: store.profile.id, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp }
    updateStore((next) => { const index = next.routines.findIndex((item) => item.id === saved.id); if (index >= 0) next.routines[index] = saved; else next.routines.push(saved) })
    return clone(saved)
  }
  async deleteRoutine(id: Id) { updateStore((store) => { store.routines = store.routines.filter((item) => item.id !== id) }) }

  async listSessions(options: { status?: WorkoutSession['status']; limit?: number; startedBefore?: string; startedAfter?: string } = {}) {
    const at = (value: string) => new Date(value).getTime()
    let sessions = clone(this.requireStore().sessions)
      .sort((a, b) => at(b.startedAt) - at(a.startedAt))
    if (options.status) sessions = sessions.filter((session) => session.status === options.status)
    if (options.startedBefore) sessions = sessions.filter((session) => at(session.startedAt) < at(options.startedBefore!))
    if (options.startedAfter) sessions = sessions.filter((session) => at(session.startedAt) >= at(options.startedAfter!))
    if (options.limit !== undefined) sessions = sessions.slice(0, options.limit)
    return sessions
  }
  async getSession(id: Id) { return clone(this.requireStore().sessions.find((item) => item.id === id) ?? null) }
  async getLastCompletedSetForExercise(exerciseId: Id) {
    const at = (value: string) => new Date(value).getTime()
    const sessions = clone(this.requireStore().sessions)
      .filter((session) => session.status === 'completed')
      .sort((a, b) => at(b.startedAt) - at(a.startedAt))
    for (const session of sessions) {
      const exercise = session.exercises.find((item) => item.exerciseId === exerciseId)
      const set = exercise?.sets.filter((item) => item.isCompleted).at(-1)
      if (set) return set
    }
    return null
  }
  async listExerciseProgress(exerciseId: Id, options: { completedAfter: string }): Promise<ExerciseProgressEntry[]> {
    const at = (value: string) => new Date(value).getTime()
    const threshold = at(options.completedAfter)
    const sessions = clone(this.requireStore().sessions)
      .filter((session) => session.status === 'completed' && at(session.startedAt) >= threshold)
      .sort((a, b) => at(a.startedAt) - at(b.startedAt))

    const entries: ExerciseProgressEntry[] = []
    for (const session of sessions) {
      const exercise = session.exercises.find((item) => item.exerciseId === exerciseId)
      if (!exercise) continue
      const sets = exercise.sets.filter((set) => set.isCompleted)
      if (sets.length === 0) continue
      entries.push({ sessionId: session.id, startedAt: session.startedAt, sets })
    }
    return entries
  }
  async saveSession(input: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'pausedSeconds'> & { id?: Id; pausedSeconds?: number }) {
    const store = this.requireStore(); const existing = input.id ? store.sessions.find((item) => item.id === input.id) : undefined; const timestamp = now()
    const saved: WorkoutSession = { ...input, id: input.id ?? newId(), userId: store.profile.id, pausedSeconds: input.pausedSeconds ?? 0, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp }
    updateStore((next) => { const index = next.sessions.findIndex((item) => item.id === saved.id); if (index >= 0) next.sessions[index] = saved; else next.sessions.push(saved) })
    return clone(saved)
  }
  async deleteSession(id: Id) { updateStore((store) => { store.sessions = store.sessions.filter((item) => item.id !== id) }) }

  async listBodyMeasurements() { return clone(this.requireStore().measurements.sort((a, b) => b.measuredOn.localeCompare(a.measuredOn))) }
  async saveBodyMeasurement(input: Omit<BodyMeasurement, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }) {
    const store = this.requireStore(); const existing = input.id ? store.measurements.find((item) => item.id === input.id) : undefined; const timestamp = now()
    const saved: BodyMeasurement = { ...input, id: input.id ?? newId(), userId: store.profile.id, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp }
    updateStore((next) => { const index = next.measurements.findIndex((item) => item.id === saved.id); if (index >= 0) next.measurements[index] = saved; else next.measurements.push(saved) })
    return clone(saved)
  }
}

/** Default development services. Swap this factory for Supabase implementations at app composition only. */
export function createLocalStorageServices(): AppServices {
  return { auth: new LocalStorageAuthAdapter(), workoutRepository: new LocalStorageWorkoutRepository() }
}
