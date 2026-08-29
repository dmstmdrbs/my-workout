import type {
  BodyMeasurement,
  Exercise,
  ExerciseOneRepMax,
  Id,
  ProgramRun,
  ProgramRunDay,
  Routine,
  StartProgramRunInput,
  UserProfile,
  UserSettings,
  WorkoutSession,
  WorkoutSetRecord,
} from '../../types/domain'
import { addCalendarDays } from '../../lib/localDate'
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
  programRuns: ProgramRun[]
  exerciseOneRepMaxes: ExerciseOneRepMax[]
}

const storageKey = 'trainlog:mock-store:v1'
let inMemoryStore: LocalStore | null = null
const clone = <T,>(value: T): T => structuredClone(value)
const now = () => new Date().toISOString()
const newId = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`

/**
 * A session can log the same exercise twice (e.g. a deliberate second round
 * late in the workout, added via `WorkoutRunner`'s "종목 추가" -- nothing
 * stops that). `session.exercises.find(...)` would silently keep only the
 * first matching instance and drop a second instance's sets entirely, which
 * would make the mock adapter disagree with the Supabase adapter (which
 * queries set rows directly and naturally picks up every instance). This
 * collects completed sets across *all* matching instances, ordered by
 * `exerciseOrder` so sets stay in the same chronological sequence they'd
 * have if the two instances' sets were recorded back to back.
 */
function completedSetsForExerciseInSession(session: WorkoutSession, exerciseId: Id): WorkoutSetRecord[] {
  return session.exercises
    .filter((exercise) => exercise.exerciseId === exerciseId)
    .sort((a, b) => a.exerciseOrder - b.exerciseOrder)
    .flatMap((exercise) => exercise.sets)
    .filter((set) => set.isCompleted)
}

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
    programRuns: [],
    exerciseOneRepMaxes: [],
  }
}

function readStore(): LocalStore {
  if (inMemoryStore) return inMemoryStore
  try {
    const raw = globalThis.localStorage?.getItem(storageKey)
    if (raw) {
      inMemoryStore = JSON.parse(raw) as LocalStore
      inMemoryStore.programRuns ??= []
      inMemoryStore.exerciseOneRepMaxes ??= []
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
  async listExerciseOneRepMaxes() { return clone(this.requireStore().exerciseOneRepMaxes) }
  async saveExerciseOneRepMax(exerciseId: Id, oneRepMaxKg: number) {
    const store = this.requireStore()
    if (!store.exercises.some((exercise) => exercise.id === exerciseId)) throw new Error('운동을 찾지 못했어요.')
    const saved: ExerciseOneRepMax = { userId: store.profile.id, exerciseId, oneRepMaxKg, updatedAt: now() }
    updateStore((next) => {
      const index = next.exerciseOneRepMaxes.findIndex((item) => item.exerciseId === exerciseId)
      if (index >= 0) next.exerciseOneRepMaxes[index] = saved
      else next.exerciseOneRepMaxes.push(saved)
    })
    return clone(saved)
  }

  async listRoutines() { return clone(this.requireStore().routines.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) }
  async getRoutine(id: Id) { return clone(this.requireStore().routines.find((item) => item.id === id) ?? null) }
  async saveRoutine(input: Omit<Routine, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }) {
    const store = this.requireStore(); const existing = input.id ? store.routines.find((item) => item.id === input.id) : undefined; const timestamp = now()
    const saved: Routine = { ...input, id: input.id ?? newId(), userId: store.profile.id, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp }
    updateStore((next) => { const index = next.routines.findIndex((item) => item.id === saved.id); if (index >= 0) next.routines[index] = saved; else next.routines.push(saved) })
    return clone(saved)
  }
  async deleteRoutine(id: Id) { updateStore((store) => { store.routines = store.routines.filter((item) => item.id !== id) }) }

  async listProgramRuns() {
    const store = this.requireStore()
    return clone(store.programRuns
      .map((run) => attachProgramSessions(run, store.sessions))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  }
  async getActiveProgramRun() {
    const store = this.requireStore()
    const run = store.programRuns.find((item) => item.status === 'active')
    return clone(run ? attachProgramSessions(run, store.sessions) : null)
  }
  async getProgramRunDay(id: Id) {
    const store = this.requireStore()
    for (const run of store.programRuns.filter((item) => item.status === 'active')) {
      const day = run.days.find((item) => item.id === id)
      if (day) return clone(attachProgramDaySession(day, store.sessions))
    }
    return null
  }
  async startProgramRun(input: StartProgramRunInput) {
    const store = this.requireStore()
    if (store.programRuns.some((item) => item.status === 'active')) throw new Error('진행 중인 프로그램을 먼저 종료해 주세요.')
    const timestamp = now()
    const runId = newId()
    const days: ProgramRunDay[] = input.days.map((day) => ({
      id: newId(),
      userId: store.profile.id,
      programRunId: runId,
      dayNumber: day.dayNumber,
      weekNumber: Math.floor((day.dayNumber - 1) / 7) + 1,
      dayOfWeek: ((day.dayNumber - 1) % 7) + 1,
      scheduledOn: addCalendarDays(input.startDate, day.dayNumber - 1),
      dayType: day.dayType,
      title: day.title,
      instructions: day.instructions,
      routineSnapshot: day.routineSnapshot,
      cardioTarget: day.cardioTarget,
      isOptional: day.isOptional,
      completedAt: null,
      workoutSession: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
    const run: ProgramRun = {
      id: runId,
      userId: store.profile.id,
      programKey: input.programKey,
      programName: input.programName,
      templateVersion: input.templateVersion,
      durationWeeks: input.durationWeeks,
      startDate: input.startDate,
      status: 'active',
      endedAt: null,
      endReason: null,
      days,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    updateStore((next) => { next.programRuns.push(run) })
    return clone(run)
  }
  async refreshProgramRun(id: Id, preserveBeforeDate: string, input: StartProgramRunInput) {
    const timestamp = now()
    let refreshedRun: ProgramRun | null = null
    updateStore((store) => {
      const run = store.programRuns.find((item) => item.id === id && item.status === 'active')
      if (!run || run.programKey !== input.programKey || run.startDate !== input.startDate || run.durationWeeks !== input.durationWeeks) return
      if (input.templateVersion <= run.templateVersion) {
        refreshedRun = attachProgramSessions(run, store.sessions)
        return
      }

      const latestDayByNumber = new Map(input.days.map((day) => [day.dayNumber, day]))
      run.days = run.days.map((day) => {
        const latest = latestDayByNumber.get(day.dayNumber)
        const hasLinkedSession = store.sessions.some((session) => session.programRunDayId === day.id)
        if (!latest || day.scheduledOn < preserveBeforeDate || day.completedAt || hasLinkedSession) return day
        return {
          ...day,
          dayType: latest.dayType,
          title: latest.title,
          instructions: latest.instructions,
          routineSnapshot: clone(latest.routineSnapshot),
          cardioTarget: clone(latest.cardioTarget),
          isOptional: latest.isOptional,
          updatedAt: timestamp,
        }
      })
      run.programName = input.programName
      run.templateVersion = input.templateVersion
      run.updatedAt = timestamp
      refreshedRun = attachProgramSessions(run, store.sessions)
    })
    if (!refreshedRun) throw new Error('업데이트할 수 있는 활성 프로그램 회차를 찾지 못했어요.')
    return clone(refreshedRun)
  }
  async completeProgramRunDay(id: Id) {
    const timestamp = now()
    let found = false
    updateStore((store) => {
      const run = store.programRuns.find((item) => item.status === 'active' && item.days.some((day) => day.id === id))
      const day = run?.days.find((item) => item.id === id)
      if (!day || day.dayType !== 'rest') return
      day.completedAt ??= timestamp
      day.updatedAt = timestamp
      if (run) run.updatedAt = timestamp
      found = true
    })
    if (!found) throw new Error('완료할 수 있는 활성 프로그램 휴식일을 찾지 못했어요.')
  }
  async endProgramRun(id: Id, outcome: 'completed' | 'withdrawn', reason: string | null = null) {
    const timestamp = now()
    let found = false
    updateStore((store) => {
      const run = store.programRuns.find((item) => item.id === id && item.status === 'active')
      if (!run) return
      run.status = outcome
      run.endedAt = timestamp
      run.endReason = reason
      run.updatedAt = timestamp
      found = true
    })
    if (!found) throw new Error('진행 중인 프로그램을 찾지 못했어요.')
  }

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
      const set = completedSetsForExerciseInSession(session, exerciseId).at(-1)
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
      const sets = completedSetsForExerciseInSession(session, exerciseId)
      if (sets.length === 0) continue
      entries.push({ sessionId: session.id, startedAt: session.startedAt, sets })
    }
    return entries
  }
  async saveSession(input: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'pausedSeconds'> & { id?: Id; pausedSeconds?: number }) {
    const store = this.requireStore(); const existing = input.id ? store.sessions.find((item) => item.id === input.id) : undefined; const timestamp = now()
    // 이미 완료로 저장돼 있던 세션을 다시 저장하는 것은 "완료된 기록을 손으로
    // 고쳤다"는 뜻이므로 editedAt을 찍는다. 운동을 끝내며 처음 저장하는 경우
    // (existing이 없거나 아직 in_progress였던 경우)는 편집이 아니다. Supabase
    // 쪽 save_workout_session도 같은 규칙을 쓴다.
    const isEditOfCompleted = existing?.status === 'completed'
    const saved: WorkoutSession = { ...input, id: input.id ?? newId(), userId: store.profile.id, pausedSeconds: input.pausedSeconds ?? 0, editedAt: isEditOfCompleted ? timestamp : existing?.editedAt ?? null, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp }
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

function attachProgramSessions(run: ProgramRun, sessions: WorkoutSession[]): ProgramRun {
  return { ...run, days: run.days.map((day) => attachProgramDaySession(day, sessions)) }
}

function attachProgramDaySession(day: ProgramRunDay, sessions: WorkoutSession[]): ProgramRunDay {
  const session = sessions
    .filter((item) => item.programRunDayId === day.id && item.status === 'completed')
    .sort((a, b) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt))[0]
  return {
    ...day,
    workoutSession: session ? {
      id: session.id,
      routineName: session.routineName,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    } : null,
  }
}
