import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import type {
  BodyMeasurement,
  BlockedUser,
  Equipment,
  Exercise,
  ExerciseOneRepMax,
  ExerciseBrand,
  FriendInvite,
  FriendOverview,
  FriendRequest,
  FriendSummary,
  Id,
  InviteResolution,
  MuscleGroup,
  ProgramCardioTarget,
  ProgramDaySessionSummary,
  ProgramDayType,
  ProgramRoutineSnapshot,
  ProgramRun,
  ProgramRunDay,
  ProgramRunStatus,
  Rir,
  Routine,
  RoutineExercise,
  RoutineSetPrescription,
  SocialProfile,
  SessionStatus,
  SetType,
  StartProgramRunInput,
  Theme,
  UserProfile,
  UserSettings,
  WeightUnit,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSetRecord,
} from '../../types/domain'
import type { AppServices, AuthAdapter, AuthSession, AuthStateListener, ExerciseProgressEntry, SocialRepository, WorkoutRepository } from '../contracts'

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

function objectValue<T>(row: Row, key: string): T | null {
  const value = asRow(row[key])
  return value ? value as T : null
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
    brand: (nullableString(row, 'brand') as ExerciseBrand | null) ?? null,
    defaultRestSeconds: numberValue(row, 'default_rest_seconds', 90),
    isArchived: booleanValue(row, 'is_archived'),
    createdAt: stringValue(row, 'created_at'),
    updatedAt: stringValue(row, 'updated_at'),
  }
}

function mapExerciseOneRepMax(row: Row): ExerciseOneRepMax {
  return {
    userId: stringValue(row, 'user_id'),
    exerciseId: stringValue(row, 'exercise_id'),
    oneRepMaxKg: numberValue(row, 'one_rep_max_kg'),
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
    targetDurationSeconds: nullableNumber(row, 'target_duration_seconds'),
    targetDistanceKm: nullableNumber(row, 'target_distance_km'),
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
    durationSeconds: nullableNumber(row, 'duration_seconds'),
    distanceKm: nullableNumber(row, 'distance_km'),
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
    programRunDayId: nullableString(row, 'program_run_day_id'),
    status: stringValue(row, 'status') as SessionStatus,
    startedAt: stringValue(row, 'started_at'),
    completedAt: nullableString(row, 'completed_at'),
    pausedSeconds: numberValue(row, 'paused_seconds'),
    // 마이그레이션(20260827090000)이 아직 적용되지 않은 DB에서는 이 컬럼이
    // 없다. select('*')이라 키 자체가 없고 nullableString이 null을 주므로,
    // 프론트를 먼저 배포해도 "수정됨" 표시만 뜨지 않고 나머지는 그대로 돈다.
    editedAt: nullableString(row, 'edited_at'),
    notes: nullableString(row, 'notes'),
    exercises,
    createdAt: stringValue(row, 'created_at'),
    updatedAt: stringValue(row, 'updated_at'),
  }
}

function mapProgramDay(row: Row): ProgramRunDay {
  const completedSession = asRows(row.workout_sessions)
    .filter((session) => stringValue(session, 'status') === 'completed')
    .sort((a, b) => (nullableString(b, 'completed_at') ?? stringValue(b, 'started_at')).localeCompare(nullableString(a, 'completed_at') ?? stringValue(a, 'started_at')))[0]
  const workoutSession: ProgramDaySessionSummary | null = completedSession ? {
    id: stringValue(completedSession, 'id'),
    routineName: nullableString(completedSession, 'routine_name'),
    startedAt: stringValue(completedSession, 'started_at'),
    completedAt: nullableString(completedSession, 'completed_at'),
  } : null

  return {
    id: stringValue(row, 'id'),
    userId: stringValue(row, 'user_id'),
    programRunId: stringValue(row, 'program_run_id'),
    dayNumber: numberValue(row, 'day_number'),
    weekNumber: numberValue(row, 'week_number'),
    dayOfWeek: numberValue(row, 'day_of_week'),
    scheduledOn: stringValue(row, 'scheduled_on'),
    dayType: stringValue(row, 'day_type') as ProgramDayType,
    title: stringValue(row, 'title'),
    instructions: nullableString(row, 'instructions'),
    routineSnapshot: objectValue<ProgramRoutineSnapshot>(row, 'routine_snapshot'),
    cardioTarget: objectValue<ProgramCardioTarget>(row, 'cardio_target'),
    isOptional: booleanValue(row, 'is_optional'),
    completedAt: nullableString(row, 'completed_at'),
    workoutSession,
    createdAt: stringValue(row, 'created_at'),
    updatedAt: stringValue(row, 'updated_at'),
  }
}

function mapProgramRun(row: Row): ProgramRun {
  return {
    id: stringValue(row, 'id'),
    userId: stringValue(row, 'user_id'),
    programKey: stringValue(row, 'program_key'),
    programName: stringValue(row, 'program_name'),
    templateVersion: numberValue(row, 'template_version', 1),
    durationWeeks: numberValue(row, 'duration_weeks', 8),
    startDate: stringValue(row, 'start_date'),
    status: stringValue(row, 'status') as ProgramRunStatus,
    endedAt: nullableString(row, 'ended_at'),
    endReason: nullableString(row, 'end_reason'),
    days: asRows(row.program_run_days).map(mapProgramDay).sort((a, b) => a.dayNumber - b.dayNumber),
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

function mapSocialProfile(row: Row): SocialProfile {
  return {
    userId: stringValue(row, 'user_id'),
    displayName: stringValue(row, 'display_name', '트레이너'),
    avatarUrl: nullableString(row, 'avatar_url'),
  }
}

function relatedProfile(row: Row, key: 'requester' | 'addressee'): SocialProfile | null {
  const value = row[key]
  const related = Array.isArray(value) ? asRow(value[0]) : asRow(value)
  return related ? mapSocialProfile(related) : null
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
    let query = this.client.from('exercises').select('*').eq('user_id', user.id).order('name')
    if (!options.includeArchived) query = query.eq('is_archived', false)
    const { data, error } = await query
    if (error) throw toError(error, '운동 목록을 불러오지 못했어요.')
    return asRows(data).map(mapExercise)
  }

  async getExercise(id: Id) {
    const user = await this.requireUser()
    const { data, error } = await this.client.from('exercises').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
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
      brand: input.brand,
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

  async listExerciseOneRepMaxes() {
    await this.requireUser()
    const { data, error } = await this.client.from('exercise_one_rep_maxes').select('*').order('updated_at', { ascending: false })
    if (error) throw toError(error, '1RM 설정을 불러오지 못했어요.')
    return asRows(data).map(mapExerciseOneRepMax)
  }

  async saveExerciseOneRepMax(exerciseId: Id, oneRepMaxKg: number) {
    const user = await this.requireUser()
    const { data, error } = await this.client.from('exercise_one_rep_maxes').upsert({
      user_id: user.id,
      exercise_id: exerciseId,
      one_rep_max_kg: oneRepMaxKg,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,exercise_id' }).select('*').single()
    if (error) throw toError(error, '1RM 설정을 저장하지 못했어요.')
    return mapExerciseOneRepMax(data as Row)
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
    await this.requireUser()
    const { data, error } = await this.client.rpc('save_routine', { payload: input })
    if (error) throw toError(error, '루틴을 저장하지 못했어요.')
    const routineId = typeof data === 'string' ? data : ''
    if (!routineId) throw new Error('루틴을 저장하지 못했어요.')
    const routine = await this.getRoutine(routineId)
    if (!routine) throw new Error('저장한 루틴을 다시 불러오지 못했어요.')
    return routine
  }

  async deleteRoutine(id: Id) {
    await this.requireUser()
    const { error } = await this.client.from('routines').delete().eq('id', id)
    if (error) throw toError(error, '루틴을 삭제하지 못했어요.')
  }

  private async getProgramRun(id: Id) {
    await this.requireUser()
    const { data, error } = await this.client
      .from('program_runs')
      .select('*, program_run_days(*, workout_sessions(id, routine_name, status, started_at, completed_at))')
      .eq('id', id)
      .maybeSingle()
    if (error) throw toError(error, '프로그램 회차를 불러오지 못했어요.')
    return data ? mapProgramRun(data as Row) : null
  }

  async listProgramRuns() {
    await this.requireUser()
    const { data, error } = await this.client
      .from('program_runs')
      .select('*, program_run_days(*, workout_sessions(id, routine_name, status, started_at, completed_at))')
      .order('created_at', { ascending: false })
    if (error) throw toError(error, '프로그램 기록을 불러오지 못했어요.')
    return asRows(data).map(mapProgramRun)
  }

  async getActiveProgramRun() {
    await this.requireUser()
    const { data, error } = await this.client
      .from('program_runs')
      .select('*, program_run_days(*, workout_sessions(id, routine_name, status, started_at, completed_at))')
      .eq('status', 'active')
      .maybeSingle()
    if (error) throw toError(error, '진행 중인 프로그램을 불러오지 못했어요.')
    return data ? mapProgramRun(data as Row) : null
  }

  async getProgramRunDay(id: Id) {
    await this.requireUser()
    const { data, error } = await this.client
      .from('program_run_days')
      .select('*, workout_sessions(id, routine_name, status, started_at, completed_at), program_runs!inner(status)')
      .eq('id', id)
      .eq('program_runs.status', 'active')
      .maybeSingle()
    if (error) throw toError(error, '프로그램 Day를 불러오지 못했어요.')
    return data ? mapProgramDay(data as Row) : null
  }

  async startProgramRun(input: StartProgramRunInput) {
    await this.ensureProfile()
    const { data, error } = await this.client.rpc('start_program_run', { payload: input })
    if (error) throw toError(error, '프로그램을 시작하지 못했어요.')
    const runId = typeof data === 'string' ? data : ''
    if (!runId) throw new Error('프로그램 회차를 만들지 못했어요.')
    const run = await this.getProgramRun(runId)
    if (!run) throw new Error('시작한 프로그램을 다시 불러오지 못했어요.')
    return run
  }

  async refreshProgramRun(id: Id, preserveBeforeDate: string, input: StartProgramRunInput) {
    await this.requireUser()
    const { error } = await this.client.rpc('refresh_active_program_run', {
      target_run_id: id,
      preserve_before_date: preserveBeforeDate,
      payload: input,
    })
    if (error) throw toError(error, '최신 프로그램 처방을 적용하지 못했어요.')
    const run = await this.getProgramRun(id)
    if (!run) throw new Error('업데이트한 프로그램 회차를 다시 불러오지 못했어요.')
    return run
  }

  async completeProgramRunDay(id: Id) {
    await this.requireUser()
    const { error } = await this.client.rpc('complete_program_rest_day', { target_day_id: id })
    if (error) throw toError(error, '휴식일을 완료하지 못했어요.')
  }

  async endProgramRun(id: Id, outcome: 'completed' | 'withdrawn', reason: string | null = null) {
    await this.requireUser()
    const { error } = await this.client.rpc('end_program_run', {
      target_run_id: id,
      outcome,
      reason,
    })
    if (error) throw toError(error, '프로그램을 종료하지 못했어요.')
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

  async listExerciseProgress(exerciseId: Id, options: { completedAfter: string }): Promise<ExerciseProgressEntry[]> {
    await this.requireUser()
    const { data, error } = await this.client
      .from('workout_set_records')
      .select('*, workout_exercises!inner(exercise_id, session_id, workout_sessions!inner(started_at, status))')
      .eq('workout_exercises.exercise_id', exerciseId)
      .eq('workout_exercises.workout_sessions.status', 'completed')
      .gte('workout_exercises.workout_sessions.started_at', options.completedAfter)
      .eq('is_completed', true)
      .order('completed_at', { ascending: true, nullsFirst: false })
    if (error) throw toError(error, '중량 추이를 불러오지 못했어요.')

    // Rows arrive one-per-set; group them back into one entry per session so
    // callers get the same shape the mock adapter returns.
    const bySession = new Map<string, { startedAt: string; sets: WorkoutSetRecord[] }>()
    for (const row of asRows(data)) {
      const workoutExercise = asRow(row.workout_exercises)
      const session = workoutExercise ? asRow(workoutExercise.workout_sessions) : null
      const sessionId = workoutExercise ? stringValue(workoutExercise, 'session_id') : ''
      if (!sessionId || !session) continue
      const entry = bySession.get(sessionId) ?? { startedAt: stringValue(session, 'started_at'), sets: [] }
      entry.sets.push(mapWorkoutSet(row))
      bySession.set(sessionId, entry)
    }

    return [...bySession.entries()]
      .map(([sessionId, entry]) => ({ sessionId, startedAt: entry.startedAt, sets: entry.sets }))
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
  }

  async getSession(id: Id) {
    await this.requireUser()
    const { data, error } = await this.client.from('workout_sessions').select('*, workout_exercises(*, exercises(name, primary_muscle), workout_set_records(*))').eq('id', id).maybeSingle()
    if (error) throw toError(error, '운동 기록을 불러오지 못했어요.')
    return data ? mapWorkoutSession(data as Row) : null
  }

  async saveSession(input: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'pausedSeconds'> & { id?: Id; pausedSeconds?: number }) {
    await this.requireUser()
    const { data, error } = await this.client.rpc('save_workout_session', { payload: input })
    if (error) throw toError(error, '운동 기록을 저장하지 못했어요.')
    const sessionId = typeof data === 'string' ? data : ''
    if (!sessionId) throw new Error('운동 기록을 저장하지 못했어요.')
    const session = await this.getSession(sessionId)
    if (!session) throw new Error('저장한 운동 기록을 다시 불러오지 못했어요.')
    return session
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
      : await this.client.from('body_measurements').upsert(values, { onConflict: 'user_id,measured_on' }).select('*').single()
    if (error) throw toError(error, '신체 측정을 저장하지 못했어요.')
    return mapMeasurement(data as Row)
  }
}

class SupabaseSocialRepository implements SocialRepository {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  private async requireUser(): Promise<User> {
    const { data, error } = await this.client.auth.getUser()
    if (error || !data.user) throw toError(error, '로그인이 필요해요.')
    return data.user
  }

  private async ensureSocialProfile(): Promise<SocialProfile> {
    const user = await this.requireUser()
    const { data: existing, error: lookupError } = await this.client
      .from('social_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (lookupError) throw toError(lookupError, '친구 프로필을 불러오지 못했어요.')
    if (existing) return mapSocialProfile(existing as Row)

    // A direct invite URL can be the first screen opened after OAuth. Ensure
    // the private profile exists so its projection trigger can create the
    // social profile before any friendship RPC runs.
    const profile = mapUser(user)
    const { error } = await this.client.from('profiles').upsert({
      id: profile.id,
      email: profile.email,
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    if (error) throw toError(error, '친구 프로필을 준비하지 못했어요.')

    const { data, error: profileError } = await this.client
      .from('social_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()
    if (profileError) throw toError(profileError, '친구 프로필을 준비하지 못했어요.')
    return mapSocialProfile(data as Row)
  }

  async getMySocialProfile() {
    return this.ensureSocialProfile()
  }

  async getFriendOverview(): Promise<FriendOverview> {
    const user = await this.requireUser()
    const [friendshipsResult, inviteResult] = await Promise.all([
      this.client
        .from('friendships')
        .select('*, requester:social_profiles!friendships_requester_id_fkey(*), addressee:social_profiles!friendships_addressee_id_fkey(*)')
        .order('updated_at', { ascending: false }),
      this.client
        .from('friend_invites')
        .select('*')
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (friendshipsResult.error) throw toError(friendshipsResult.error, '친구 목록을 불러오지 못했어요.')
    if (inviteResult.error) throw toError(inviteResult.error, '초대 링크를 불러오지 못했어요.')

    const friends: FriendSummary[] = []
    const incomingRequests: FriendRequest[] = []
    const outgoingRequests: FriendRequest[] = []
    for (const row of asRows(friendshipsResult.data)) {
      const outgoing = stringValue(row, 'requester_id') === user.id
      const profile = relatedProfile(row, outgoing ? 'addressee' : 'requester')
      if (!profile) continue
      const friendshipId = stringValue(row, 'id')
      if (stringValue(row, 'status') === 'accepted') {
        friends.push({
          friendshipId,
          profile,
          friendsSince: stringValue(row, 'accepted_at', stringValue(row, 'updated_at')),
        })
      } else {
        const request: FriendRequest = {
          friendshipId,
          direction: outgoing ? 'outgoing' : 'incoming',
          profile,
          requestedAt: stringValue(row, 'created_at'),
        }
        if (outgoing) outgoingRequests.push(request)
        else incomingRequests.push(request)
      }
    }

    const inviteRow = inviteResult.data ? inviteResult.data as Row : null
    const activeInvite: FriendInvite | null = inviteRow ? {
      token: stringValue(inviteRow, 'token'),
      createdAt: stringValue(inviteRow, 'created_at'),
      expiresAt: stringValue(inviteRow, 'expires_at'),
    } : null
    return { friends, incomingRequests, outgoingRequests, activeInvite }
  }

  async getFriend(friendshipId: Id): Promise<FriendSummary | null> {
    const user = await this.requireUser()
    const { data, error } = await this.client
      .from('friendships')
      .select('*, requester:social_profiles!friendships_requester_id_fkey(*), addressee:social_profiles!friendships_addressee_id_fkey(*)')
      .eq('id', friendshipId)
      .eq('status', 'accepted')
      .maybeSingle()
    if (error) throw toError(error, '친구 정보를 불러오지 못했어요.')
    if (!data) return null
    const row = data as Row
    const profile = relatedProfile(row, stringValue(row, 'requester_id') === user.id ? 'addressee' : 'requester')
    return profile ? {
      friendshipId: stringValue(row, 'id'),
      profile,
      friendsSince: stringValue(row, 'accepted_at', stringValue(row, 'updated_at')),
    } : null
  }

  async createOrRotateInvite(): Promise<FriendInvite> {
    await this.ensureSocialProfile()
    const { data, error } = await this.client.rpc('create_or_rotate_friend_invite')
    if (error) throw toError(error, '초대 링크를 만들지 못했어요.')
    const row = asRows(data)[0]
    if (!row) throw new Error('초대 링크를 만들지 못했어요.')
    return {
      token: stringValue(row, 'token'),
      createdAt: stringValue(row, 'created_at'),
      expiresAt: stringValue(row, 'expires_at'),
    }
  }

  async resolveInvite(token: string): Promise<InviteResolution> {
    await this.ensureSocialProfile()
    const { data, error } = await this.client.rpc('resolve_friend_invite', { p_token: token })
    if (error) throw toError(error, '초대 정보를 확인하지 못했어요.')
    const row = asRows(data)[0]
    if (!row) return { state: 'unavailable', profile: null, friendshipId: null }
    const userId = nullableString(row, 'user_id')
    return {
      state: stringValue(row, 'resolution_state', 'unavailable') as InviteResolution['state'],
      profile: userId ? mapSocialProfile(row) : null,
      friendshipId: nullableString(row, 'friendship_id'),
    }
  }

  async sendFriendRequest(token: string): Promise<FriendRequest> {
    await this.ensureSocialProfile()
    const { data, error } = await this.client.rpc('send_friend_request', { p_token: token })
    if (error) throw toError(error, '친구 요청을 보내지 못했어요.')
    const row = asRows(data)[0]
    if (!row) throw new Error('친구 요청을 보내지 못했어요.')
    return {
      friendshipId: stringValue(row, 'friendship_id'),
      direction: 'outgoing',
      profile: {
        userId: stringValue(row, 'target_user_id'),
        displayName: stringValue(row, 'target_display_name', '트레이너'),
        avatarUrl: nullableString(row, 'target_avatar_url'),
      },
      requestedAt: stringValue(row, 'requested_at'),
    }
  }

  private async friendshipMutation(functionName: string, friendshipId: Id, fallback: string): Promise<void> {
    await this.requireUser()
    const { error } = await this.client.rpc(functionName, { p_friendship_id: friendshipId })
    if (error) throw toError(error, fallback)
  }

  acceptRequest(friendshipId: Id) {
    return this.friendshipMutation('accept_friend_request', friendshipId, '친구 요청을 수락하지 못했어요.')
  }

  declineRequest(friendshipId: Id) {
    return this.friendshipMutation('decline_friend_request', friendshipId, '친구 요청을 거절하지 못했어요.')
  }

  cancelRequest(friendshipId: Id) {
    return this.friendshipMutation('cancel_friend_request', friendshipId, '친구 요청을 취소하지 못했어요.')
  }

  removeFriend(friendshipId: Id) {
    return this.friendshipMutation('remove_friend', friendshipId, '친구를 삭제하지 못했어요.')
  }

  async listBlockedUsers(): Promise<BlockedUser[]> {
    await this.requireUser()
    const { data, error } = await this.client
      .from('user_blocks')
      .select('*, blocked:social_profiles!user_blocks_blocked_id_fkey(*)')
      .order('created_at', { ascending: false })
    if (error) throw toError(error, '차단 목록을 불러오지 못했어요.')
    return asRows(data).flatMap((row) => {
      const value = row.blocked
      const profileRow = Array.isArray(value) ? asRow(value[0]) : asRow(value)
      return profileRow ? [{ profile: mapSocialProfile(profileRow), blockedAt: stringValue(row, 'created_at') }] : []
    })
  }

  private async userMutation(functionName: string, userId: Id, fallback: string): Promise<void> {
    await this.requireUser()
    const { error } = await this.client.rpc(functionName, { p_user_id: userId })
    if (error) throw toError(error, fallback)
  }

  blockUser(userId: Id) {
    return this.userMutation('block_user', userId, '사용자를 차단하지 못했어요.')
  }

  unblockUser(userId: Id) {
    return this.userMutation('unblock_user', userId, '차단을 해제하지 못했어요.')
  }

  async getIncomingRequestCount(): Promise<number> {
    const user = await this.requireUser()
    const { count, error } = await this.client
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('addressee_id', user.id)
      .eq('status', 'pending')
    if (error) throw toError(error, '친구 요청 수를 확인하지 못했어요.')
    return count ?? 0
  }
}

/** Browser-only services: publishable key + RLS protect every request. */
export function createSupabaseServices(client: SupabaseClient): AppServices {
  return {
    auth: new SupabaseAuthAdapter(client),
    workoutRepository: new SupabaseWorkoutRepository(client),
    socialRepository: new SupabaseSocialRepository(client),
  }
}
