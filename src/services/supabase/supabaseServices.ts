import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import type {
  BodyMeasurement,
  Equipment,
  Exercise,
  Id,
  MuscleGroup,
  Rir,
  Routine,
  RoutineExercise,
  RoutineSetPrescription,
  SetType,
  SessionStatus,
  Theme,
  UserProfile,
  UserSettings,
  WeightUnit,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSetRecord,
} from '../../types/domain'
import type { AppServices, AuthAdapter, AuthSession, AuthStateListener, WorkoutRepository } from '../contracts'

type Row = Record<string, unknown>

const defaultSettings = (userId: string): Omit<UserSettings, 'updatedAt'> => ({
  userId,
  weightUnit: 'kg',
  theme: 'system',
  weekStartsOn: 1,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
  defaultRestSeconds: 90,
  defaultRir: 2,
  rirInputEnabled: true,
  shareRirByDefault: true,
  keepScreenAwake: false,
})

function toError(error: { message: string } | null, fallback: string): Error {
  return new Error(error?.message || fallback)
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === 'object') : []
}

function asRow(value: unknown): Row | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null
}

function stringValue(row: Row, key: string, fallback = ''): string {
  return typeof row[key] === 'string' ? row[key] : fallback
}

function nullableString(row: Row, key: string): string | null {
  return typeof row[key] === 'string' ? row[key] : null
}

function nullableNumber(row: Row, key: string): number | null {
  return typeof row[key] === 'number' ? row[key] : null
}

function numberValue(row: Row, key: string, fallback = 0): number {
  return typeof row[key] === 'number' ? row[key] : fallback
}

function booleanValue(row: Row, key: string, fallback = false): boolean {
  return typeof row[key] === 'boolean' ? row[key] : fallback
}

function arrayValue<T extends string>(row: Row, key: string): T[] {
  return Array.isArray(row[key]) ? row[key].filter((item): item is T => typeof item === 'string') : []
}

function mapUser(user: User): UserProfile {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>
  const displayName = typeof metadata.full_name === 'string'
    ? metadata.full_name
    : typeof metadata.name === 'string'
      ? metadata.name
      : user.email?.split('@')[0] || '트레이너'
  const avatarUrl = typeof metadata.avatar_url === 'string'
    ? metadata.avatar_url
    : typeof metadata.picture === 'string'
      ? metadata.picture
      : null
  const timestamp = new Date().toISOString()

  return {
    id: user.id,
    email: user.email ?? '',
    displayName,
    avatarUrl,
    createdAt: user.created_at ?? timestamp,
    updatedAt: user.updated_at ?? timestamp,
  }
}

function mapProfile(row: Row): UserProfile {
  return {
    id: stringValue(row, 'id'),
    email: stringValue(row, 'email'),
    displayName: stringValue(row, 'display_name', '트레이너'),
    avatarUrl: nullableString(row, 'avatar_url'),
    createdAt: stringValue(row, 'created_at'),
    updatedAt: stringValue(row, 'updated_at'),
  }
}

function mapSettings(row: Row): UserSettings {
  return {
    userId: stringValue(row, 'user_id'),
    weightUnit: stringValue(row, 'weight_unit', 'kg') as WeightUnit,
    theme: stringValue(row, 'theme', 'system') as Theme,
    weekStartsOn: numberValue(row, 'week_starts_on', 1) as 0 | 1,
    timezone: stringValue(row, 'timezone', 'Asia/Seoul'),
    defaultRestSeconds: numberValue(row, 'default_rest_seconds', 90),
    defaultRir: nullableNumber(row, 'default_rir') as Rir,
    rirInputEnabled: booleanValue(row, 'rir_input_enabled', true),
    shareRirByDefault: booleanValue(row, 'share_rir_by_default', true),
    keepScreenAwake: booleanValue(row, 'keep_screen_awake'),
    updatedAt: stringValue(row, 'updated_at'),
  }
}

function mapExercise(row: Row): Exercise {
  return {
    id: stringValue(row, 'id'),
    userId: nullableString(row, 'user_id'),
    name: stringValue(row, 'name'),
    primaryMuscle: stringValue(row, 'primary_muscle') as MuscleGroup,
    secondaryMuscles: arrayValue<MuscleGroup>(row, 'secondary_muscles'),
    equipment: stringValue(row, 'equipment') as Equipment,
    defaultRestSeconds: numberValue(row, 'default_rest_seconds', 90),
    isArchived: booleanValue(row, 'is_archived'),
    createdAt: stringValue(row, 'created_at'),
    updatedAt: stringValue(row, 'updated_at'),
  }
}

function mapRoutineSet(row: Row): RoutineSetPrescription {
  return {
    id: stringValue(row, 'id'),
    setOrder: numberValue(row, 'set_order'),
    setType: stringValue(row, 'set_type', 'working') as SetType,
    targetWeightKg: nullableNumber(row, 'target_weight_kg'),
    targetRepsMin: nullableNumber(row, 'target_reps_min'),
    targetRepsMax: nullableNumber(row, 'target_reps_max'),
    targetRir: nullableNumber(row, 'target_rir') as Rir,
    restSeconds: nullableNumber(row, 'rest_seconds'),
  }
}

function mapRoutine(row: Row): Routine {
  const routineExercises = asRows(row.routine_exercises).map((routineExercise) => {
    const exercise = asRow(routineExercise.exercises)
    return {
      id: stringValue(routineExercise, 'id'),
      exerciseId: stringValue(routineExercise, 'exercise_id'),
      exerciseName: stringValue(exercise ?? {}, 'name'),
      exerciseOrder: numberValue(routineExercise, 'exercise_order'),
      notes: nullableString(routineExercise, 'notes'),
      sets: asRows(routineExercise.routine_set_prescriptions)
        .map(mapRoutineSet)
        .sort((a, b) => a.setOrder - b.setOrder),
    } satisfies RoutineExercise
  }).sort((a, b) => a.exerciseOrder - b.exerciseOrder)

  return {
    id: stringValue(row, 'id'),
    userId: stringValue(row, 'user_id'),
    name: stringValue(row, 'name'),
    description: nullableString(row, 'description'),
    color: nullableString(row, 'color'),
    exercises: routineExercises,
    createdAt: stringValue(row, 'created_at'),
    updatedAt: stringValue(row, 'updated_at'),
  }
}

function mapWorkoutSet(row: Row): WorkoutSetRecord {
  return {
    id: stringValue(row, 'id'),
    setOrder: numberValue(row, 'set_order'),
    setType: stringValue(row, 'set_type', 'working') as SetType,
    weightKg: nullableNumber(row, 'weight_kg'),
    reps: nullableNumber(row, 'reps'),
    targetRir: nullableNumber(row, 'target_rir') as Rir,
    actualRir: nullableNumber(row, 'actual_rir') as Rir,
    restSeconds: nullableNumber(row, 'rest_seconds'),
    isCompleted: booleanValue(row, 'is_completed'),
    completedAt: nullableString(row, 'completed_at'),
    notes: nullableString(row, 'notes'),
  }
}

function mapWorkoutSession(row: Row): WorkoutSession {
  const exercises = asRows(row.workout_exercises).map((workoutExercise) => {
    const exercise = asRow(workoutExercise.exercises)
    return {
      id: stringValue(workoutExercise, 'id'),
      exerciseId: stringValue(workoutExercise, 'exercise_id'),
      // Workout history retains these snapshots so a renamed or removed exercise
      // cannot alter a record that was already completed.
      exerciseName: stringValue(exercise ?? {}, 'name', stringValue(workoutExercise, 'exercise_name')),
      primaryMuscle: stringValue(exercise ?? {}, 'primary_muscle', stringValue(workoutExercise, 'primary_muscle', 'full_body')) as MuscleGroup,
      exerciseOrder: numberValue(workoutExercise, 'exercise_order'),
      notes: nullableString(workoutExercise, 'notes'),
      sets: asRows(workoutExercise.workout_set_records)
        .map(mapWorkoutSet)
        .sort((a, b) => a.setOrder - b.setOrder),
    } satisfies WorkoutExercise
  }).sort((a, b) => a.exerciseOrder - b.exerciseOrder)

  return {
    id: stringValue(row, 'id'),
    userId: stringValue(row, 'user_id'),
    routineId: nullableString(row, 'routine_id'),
    routineName: nullableString(row, 'routine_name'),
    status: stringValue(row, 'status') as SessionStatus,
    startedAt: stringValue(row, 'started_at'),
    completedAt: nullableString(row, 'completed_at'),
    notes: nullableString(row, 'notes'),
    exercises,
    createdAt: stringValue(row, 'created_at'),
    updatedAt: stringValue(row, 'updated_at'),
  }
}

function mapMeasurement(row: Row): BodyMeasurement {
  return {
    id: stringValue(row, 'id'),
    userId: stringValue(row, 'user_id'),
    measuredOn: stringValue(row, 'measured_on'),
    weightKg: nullableNumber(row, 'weight_kg'),
    skeletalMuscleMassKg: nullableNumber(row, 'skeletal_muscle_mass_kg'),
    bodyFatPercentage: nullableNumber(row, 'body_fat_percentage'),
    notes: nullableString(row, 'notes'),
    createdAt: stringValue(row, 'created_at'),
    updatedAt: stringValue(row, 'updated_at'),
  }
}

class SupabaseAuthAdapter implements AuthAdapter {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await this.client.auth.getSession()
    if (error) throw toError(error, '로그인 세션을 확인하지 못했어요.')
    return data.session ? { user: mapUser(data.session.user), accessToken: data.session.access_token } : null
  }

  async signInWithGoogle(options?: { redirectTo?: string }): Promise<AuthSession | null> {
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: options?.redirectTo ?? window.location.origin },
    })
    if (error) throw toError(error, 'Google 로그인을 시작하지 못했어요.')
    // OAuth navigates away in a normal browser. A session is available only after its return redirect.
    return this.getSession()
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut()
    if (error) throw toError(error, '로그아웃하지 못했어요.')
  }

  onAuthStateChange(listener: AuthStateListener): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session: Session | null) => {
      listener(session ? { user: mapUser(session.user), accessToken: session.access_token } : null)
    })
    return () => data.subscription.unsubscribe()
  }
}

class SupabaseWorkoutRepository implements WorkoutRepository {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  private async requireUser(): Promise<User> {
    const { data, error } = await this.client.auth.getUser()
    if (error || !data.user) throw toError(error, '로그인이 필요해요.')
    return data.user
  }

  private async ensureProfile(): Promise<UserProfile> {
    const user = await this.requireUser()
    const { data: existing, error: lookupError } = await this.client.from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (lookupError) throw toError(lookupError, '프로필을 불러오지 못했어요.')
    if (existing) return mapProfile(existing as Row)

    const profile = mapUser(user)
    const { data, error } = await this.client.from('profiles').insert({
      id: profile.id,
      email: profile.email,
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
    }).select('*').single()
    if (error) throw toError(error, '프로필을 만들지 못했어요.')
    return mapProfile(data as Row)
  }

  private async ensureSettings(userId: Id): Promise<UserSettings> {
    const { data: existing, error: lookupError } = await this.client.from('user_settings').select('*').eq('user_id', userId).maybeSingle()
    if (lookupError) throw toError(lookupError, '설정을 불러오지 못했어요.')
    if (existing) return mapSettings(existing as Row)

    const settings = defaultSettings(userId)
    const { data, error } = await this.client.from('user_settings').insert({
      user_id: settings.userId,
      weight_unit: settings.weightUnit,
      theme: settings.theme,
      week_starts_on: settings.weekStartsOn,
      timezone: settings.timezone,
      default_rest_seconds: settings.defaultRestSeconds,
      default_rir: settings.defaultRir,
      rir_input_enabled: settings.rirInputEnabled,
      share_rir_by_default: settings.shareRirByDefault,
      keep_screen_awake: settings.keepScreenAwake,
    }).select('*').single()
    if (error) throw toError(error, '기본 설정을 만들지 못했어요.')
    return mapSettings(data as Row)
  }

  async getProfile() { return this.ensureProfile() }

  async updateProfile(changes: Pick<UserProfile, 'displayName' | 'avatarUrl'>) {
    const profile = await this.ensureProfile()
    const { data, error } = await this.client.from('profiles').update({
      display_name: changes.displayName,
      avatar_url: changes.avatarUrl,
      updated_at: new Date().toISOString(),
    }).eq('id', profile.id).select('*').single()
    if (error) throw toError(error, '프로필을 저장하지 못했어요.')
    return mapProfile(data as Row)
  }

  async getSettings() {
    const user = await this.requireUser()
    return this.ensureSettings(user.id)
  }

  async updateSettings(changes: Partial<Omit<UserSettings, 'userId' | 'updatedAt'>>) {
    const settings = await this.getSettings()
    const values: Row = { updated_at: new Date().toISOString() }
    if (changes.weightUnit !== undefined) values.weight_unit = changes.weightUnit
    if (changes.theme !== undefined) values.theme = changes.theme
    if (changes.weekStartsOn !== undefined) values.week_starts_on = changes.weekStartsOn
    if (changes.timezone !== undefined) values.timezone = changes.timezone
    if (changes.defaultRestSeconds !== undefined) values.default_rest_seconds = changes.defaultRestSeconds
    if (changes.defaultRir !== undefined) values.default_rir = changes.defaultRir
    if (changes.rirInputEnabled !== undefined) values.rir_input_enabled = changes.rirInputEnabled
    if (changes.shareRirByDefault !== undefined) values.share_rir_by_default = changes.shareRirByDefault
    if (changes.keepScreenAwake !== undefined) values.keep_screen_awake = changes.keepScreenAwake
    const { data, error } = await this.client.from('user_settings').update(values).eq('user_id', settings.userId).select('*').single()
    if (error) throw toError(error, '설정을 저장하지 못했어요.')
    return mapSettings(data as Row)
  }

  async listExercises(options: { includeArchived?: boolean } = {}) {
    const user = await this.requireUser()
    let query = this.client.from('exercises').select('*').or(`user_id.is.null,user_id.eq.${user.id}`).order('name')
    if (!options.includeArchived) query = query.eq('is_archived', false)
    const { data, error } = await query
    if (error) throw toError(error, '운동 목록을 불러오지 못했어요.')
    return asRows(data).map(mapExercise)
  }

  async getExercise(id: Id) {
    await this.requireUser()
    const { data, error } = await this.client.from('exercises').select('*').eq('id', id).maybeSingle()
    if (error) throw toError(error, '운동을 불러오지 못했어요.')
    return data ? mapExercise(data as Row) : null
  }

  async saveExercise(input: Omit<Exercise, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }) {
    const user = await this.requireUser()
    const values = {
      ...(input.id ? { id: input.id } : {}),
      user_id: user.id,
      name: input.name,
      primary_muscle: input.primaryMuscle,
      secondary_muscles: input.secondaryMuscles,
      equipment: input.equipment,
      default_rest_seconds: input.defaultRestSeconds,
      is_archived: input.isArchived,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = input.id
      ? await this.client.from('exercises').update(values).eq('id', input.id).select('*').single()
      : await this.client.from('exercises').insert(values).select('*').single()
    if (error) throw toError(error, '운동을 저장하지 못했어요.')
    return mapExercise(data as Row)
  }

  async archiveExercise(id: Id) {
    await this.requireUser()
    const { error } = await this.client.from('exercises').update({ is_archived: true, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw toError(error, '운동을 보관하지 못했어요.')
  }

  async listRoutines() {
    await this.requireUser()
    const { data, error } = await this.client.from('routines').select('*, routine_exercises(*, exercises(name), routine_set_prescriptions(*))').order('updated_at', { ascending: false })
    if (error) throw toError(error, '루틴 목록을 불러오지 못했어요.')
    return asRows(data).map(mapRoutine)
  }

  async getRoutine(id: Id) {
    await this.requireUser()
    const { data, error } = await this.client.from('routines').select('*, routine_exercises(*, exercises(name), routine_set_prescriptions(*))').eq('id', id).maybeSingle()
    if (error) throw toError(error, '루틴을 불러오지 못했어요.')
    return data ? mapRoutine(data as Row) : null
  }

  async saveRoutine(input: Omit<Routine, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }) {
    const user = await this.requireUser()
    const now = new Date().toISOString()
    const values = { ...(input.id ? { id: input.id } : {}), user_id: user.id, name: input.name, description: input.description, color: input.color, updated_at: now }
    const { data: saved, error } = input.id
      ? await this.client.from('routines').update(values).eq('id', input.id).select('*').single()
      : await this.client.from('routines').insert(values).select('*').single()
    if (error) throw toError(error, '루틴을 저장하지 못했어요.')
    const savedRoutine = saved as Row
    const routineId = stringValue(savedRoutine, 'id')
    const { error: clearError } = await this.client.from('routine_exercises').delete().eq('routine_id', routineId).eq('user_id', user.id)
    if (clearError) throw toError(clearError, '기존 루틴 구성을 정리하지 못했어요.')
    await this.insertRoutineExercises(routineId, user.id, input.exercises)
    const routine = await this.getRoutine(routineId)
    if (!routine) throw new Error('저장한 루틴을 다시 불러오지 못했어요.')
    return routine
  }

  private async insertRoutineExercises(routineId: Id, userId: Id, exercises: RoutineExercise[]) {
    if (!exercises.length) return
    const { data: savedExercises, error } = await this.client.from('routine_exercises').insert(exercises.map((exercise) => ({
      routine_id: routineId,
      user_id: userId,
      exercise_id: exercise.exerciseId,
      exercise_order: exercise.exerciseOrder,
      notes: exercise.notes,
    }))).select('*')
    if (error) throw toError(error, '루틴 운동을 저장하지 못했어요.')
    const idByOrder = new Map(asRows(savedExercises).map((item) => [numberValue(item, 'exercise_order'), stringValue(item, 'id')]))
    const sets = exercises.flatMap((exercise) => exercise.sets.map((set) => ({
      routine_exercise_id: idByOrder.get(exercise.exerciseOrder),
      user_id: userId,
      set_order: set.setOrder,
      set_type: set.setType,
      target_weight_kg: set.targetWeightKg,
      target_reps_min: set.targetRepsMin,
      target_reps_max: set.targetRepsMax,
      target_rir: set.targetRir,
      rest_seconds: set.restSeconds,
    })))
    if (!sets.length) return
    const { error: setError } = await this.client.from('routine_set_prescriptions').insert(sets)
    if (setError) throw toError(setError, '루틴 세트를 저장하지 못했어요.')
  }

  async deleteRoutine(id: Id) {
    await this.requireUser()
    const { error } = await this.client.from('routines').delete().eq('id', id)
    if (error) throw toError(error, '루틴을 삭제하지 못했어요.')
  }

  async listSessions(options: { status?: WorkoutSession['status']; limit?: number; startedBefore?: string; startedAfter?: string } = {}) {
    await this.requireUser()
    let query = this.client.from('workout_sessions').select('*, workout_exercises(*, exercises(name, primary_muscle), workout_set_records(*))').order('started_at', { ascending: false })
    if (options.status) query = query.eq('status', options.status)
    if (options.startedBefore) query = query.lt('started_at', options.startedBefore)
    if (options.startedAfter) query = query.gte('started_at', options.startedAfter)
    if (options.limit !== undefined) query = query.limit(options.limit)
    const { data, error } = await query
    if (error) throw toError(error, '운동 기록을 불러오지 못했어요.')
    return asRows(data).map(mapWorkoutSession)
  }

  async getLastCompletedSetForExercise(exerciseId: Id) {
    await this.requireUser()
    const { data, error } = await this.client
      .from('workout_set_records')
      .select('*, workout_exercises!inner(exercise_id, session_id, workout_sessions!inner(started_at, status))')
      .eq('workout_exercises.exercise_id', exerciseId)
      .eq('workout_exercises.workout_sessions.status', 'completed')
      .eq('is_completed', true)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    if (error) throw toError(error, '지난 기록을 불러오지 못했어요.')
    return data ? mapWorkoutSet(data as Row) : null
  }

  async getSession(id: Id) {
    await this.requireUser()
    const { data, error } = await this.client.from('workout_sessions').select('*, workout_exercises(*, exercises(name, primary_muscle), workout_set_records(*))').eq('id', id).maybeSingle()
    if (error) throw toError(error, '운동 기록을 불러오지 못했어요.')
    return data ? mapWorkoutSession(data as Row) : null
  }

  async saveSession(input: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }) {
    const user = await this.requireUser()
    const values = {
      ...(input.id ? { id: input.id } : {}),
      user_id: user.id,
      routine_id: input.routineId,
      routine_name: input.routineName,
      status: input.status,
      started_at: input.startedAt,
      completed_at: input.completedAt,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    }
    const { data: saved, error } = input.id
      ? await this.client.from('workout_sessions').update(values).eq('id', input.id).select('*').single()
      : await this.client.from('workout_sessions').insert(values).select('*').single()
    if (error) throw toError(error, '운동 기록을 저장하지 못했어요.')
    const savedSession = saved as Row
    const sessionId = stringValue(savedSession, 'id')
    const { error: clearError } = await this.client.from('workout_exercises').delete().eq('session_id', sessionId).eq('user_id', user.id)
    if (clearError) throw toError(clearError, '기존 운동 세트를 정리하지 못했어요.')
    await this.insertWorkoutExercises(sessionId, user.id, input.exercises)
    const session = await this.getSession(sessionId)
    if (!session) throw new Error('저장한 운동 기록을 다시 불러오지 못했어요.')
    return session
  }

  private async insertWorkoutExercises(sessionId: Id, userId: Id, exercises: WorkoutExercise[]) {
    if (!exercises.length) return
    const { data: savedExercises, error } = await this.client.from('workout_exercises').insert(exercises.map((exercise) => ({
      session_id: sessionId,
      user_id: userId,
      exercise_id: exercise.exerciseId,
      exercise_name: exercise.exerciseName,
      primary_muscle: exercise.primaryMuscle,
      exercise_order: exercise.exerciseOrder,
      notes: exercise.notes,
    }))).select('*')
    if (error) throw toError(error, '운동 종목을 저장하지 못했어요.')
    const idByOrder = new Map(asRows(savedExercises).map((item) => [numberValue(item, 'exercise_order'), stringValue(item, 'id')]))
    const sets = exercises.flatMap((exercise) => exercise.sets.map((set) => ({
      workout_exercise_id: idByOrder.get(exercise.exerciseOrder),
      user_id: userId,
      set_order: set.setOrder,
      set_type: set.setType,
      weight_kg: set.weightKg,
      reps: set.reps,
      target_rir: set.targetRir,
      actual_rir: set.actualRir,
      rest_seconds: set.restSeconds,
      is_completed: set.isCompleted,
      completed_at: set.completedAt,
      notes: set.notes,
    })))
    if (!sets.length) return
    const { error: setError } = await this.client.from('workout_set_records').insert(sets)
    if (setError) throw toError(setError, '운동 세트를 저장하지 못했어요.')
  }

  async deleteSession(id: Id) {
    await this.requireUser()
    const { error } = await this.client.from('workout_sessions').delete().eq('id', id)
    if (error) throw toError(error, '운동 기록을 삭제하지 못했어요.')
  }

  async listBodyMeasurements() {
    await this.requireUser()
    const { data, error } = await this.client.from('body_measurements').select('*').order('measured_on', { ascending: false })
    if (error) throw toError(error, '신체 측정을 불러오지 못했어요.')
    return asRows(data).map(mapMeasurement)
  }

  async saveBodyMeasurement(input: Omit<BodyMeasurement, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: Id }) {
    const user = await this.requireUser()
    const values = {
      ...(input.id ? { id: input.id } : {}),
      user_id: user.id,
      measured_on: input.measuredOn,
      weight_kg: input.weightKg,
      skeletal_muscle_mass_kg: input.skeletalMuscleMassKg,
      body_fat_percentage: input.bodyFatPercentage,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = input.id
      ? await this.client.from('body_measurements').update(values).eq('id', input.id).select('*').single()
      : await this.client.from('body_measurements').insert(values).select('*').single()
    if (error) throw toError(error, '신체 측정을 저장하지 못했어요.')
    return mapMeasurement(data as Row)
  }
}

/** Browser-only services: publishable key + RLS protect every request. */
export function createSupabaseServices(client: SupabaseClient): AppServices {
  return {
    auth: new SupabaseAuthAdapter(client),
    workoutRepository: new SupabaseWorkoutRepository(client),
  }
}
