/**
 * Shared, provider-neutral domain model.  Database and UI code should depend
 * on these types rather than a particular authentication or storage vendor.
 */
export type Id = string
export type IsoDateTime = string
export type Rir = number | null
export type WeightUnit = 'kg' | 'lb'
export type Theme = 'system' | 'light' | 'dark'
export type SetType = 'warmup' | 'working' | 'topset' | 'backoff' | 'dropset'
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned'
export type ProgramRunStatus = 'active' | 'completed' | 'withdrawn'
export type ProgramDayType = 'strength' | 'cardio' | 'rest'
export type FriendshipStatus = 'pending' | 'accepted'
export type InviteResolutionState = 'self' | 'available' | 'outgoing_pending' | 'incoming_pending' | 'friends' | 'unavailable'
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'cardio' | 'other'

/**
 * 기구 제조사. 같은 "체스트 프레스"라도 제조사가 다르면 같은 중량이 같은
 * 무게가 아니라, 브랜드가 다르면 별개의 종목으로 둔다. 목록을 고정한 이유는
 * 자유 입력이 오타로 같은 브랜드를 갈라놓기 때문이다 -- 갈라지면 브랜드로
 * 묶어 보는 의미가 사라진다. 목록에 없는 제조사는 종목 이름에 적는다.
 */
export type ExerciseBrand =
  | 'hammer_strength'
  | 'nautilus'
  | 'nutec'
  | 'cybex'
  | 'life_fitness'
  | 'technogym'
  | 'matrix'
  | 'precor'
  | 'panatta'
  | 'watson'
  | 'star_trac'
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quadriceps'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'cardio'
  | 'full_body'

export interface UserProfile {
  id: Id
  email: string
  displayName: string
  avatarUrl: string | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/** 친구 화면과 초대 미리보기에만 노출되는 이메일 없는 프로필. */
export interface SocialProfile {
  userId: Id
  displayName: string
  avatarUrl: string | null
}

export interface FriendSummary {
  friendshipId: Id
  profile: SocialProfile
  friendsSince: IsoDateTime
}

export interface FriendRequest {
  friendshipId: Id
  direction: 'incoming' | 'outgoing'
  profile: SocialProfile
  requestedAt: IsoDateTime
}

export interface FriendInvite {
  token: string
  createdAt: IsoDateTime
  expiresAt: IsoDateTime
}

export interface FriendOverview {
  friends: FriendSummary[]
  incomingRequests: FriendRequest[]
  outgoingRequests: FriendRequest[]
  activeInvite: FriendInvite | null
}

export interface InviteResolution {
  state: InviteResolutionState
  profile: SocialProfile | null
  friendshipId: Id | null
}

export interface BlockedUser {
  profile: SocialProfile
  blockedAt: IsoDateTime
}

export interface UserSettings {
  userId: Id
  weightUnit: WeightUnit
  theme: Theme
  weekStartsOn: 0 | 1
  timezone: string
  defaultRestSeconds: number
  defaultRir: number | null
  rirInputEnabled: boolean
  shareRirByDefault: boolean
  keepScreenAwake: boolean
  updatedAt: IsoDateTime
}

export interface Exercise {
  id: Id
  userId: Id | null
  name: string
  primaryMuscle: MuscleGroup
  secondaryMuscles: MuscleGroup[]
  equipment: Equipment
  /** 기구 제조사. 바벨·덤벨·맨몸처럼 제조사를 붙일 일이 없으면 null이다. */
  brand: ExerciseBrand | null
  defaultRestSeconds: number
  isArchived: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface ExerciseOneRepMax {
  userId: Id
  exerciseId: Id
  oneRepMaxKg: number
  updatedAt: IsoDateTime
}

export interface RoutineSetPrescription {
  id: Id
  setOrder: number
  setType: SetType
  targetWeightKg: number | null
  targetRepsMin: number | null
  targetRepsMax: number | null
  /**
   * 유산소 종목의 처방. 장비가 `cardio`인 종목만 이 둘을 쓰고, 그 종목은
   * 중량·반복 수 처방을 비워 둔다. 기록 쪽 `durationSeconds`/`distanceKm`와
   * 같은 단위다(초, km).
   */
  targetDurationSeconds: number | null
  targetDistanceKm: number | null
  targetRir: Rir
  restSeconds: number | null
}

export interface RoutineExercise {
  id: Id
  exerciseId: Id
  exerciseName: string
  exerciseOrder: number
  notes: string | null
  sets: RoutineSetPrescription[]
}

export interface Routine {
  id: Id
  userId: Id
  name: string
  description: string | null
  color: string | null
  exercises: RoutineExercise[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface WorkoutSetRecord {
  id: Id
  setOrder: number
  setType: SetType
  weightKg: number | null
  reps: number | null
  /**
   * 유산소 세트의 수행 시간(초)과 거리(km). 장비가 `cardio`인 종목만 이 둘을
   * 입력하고, 그 종목은 중량·횟수를 비워 둔다. 볼륨(중량 × 횟수) 합산에는
   * 들어가지 않는다 -- 시간과 거리는 kg에 더할 수 있는 값이 아니다.
   */
  durationSeconds: number | null
  distanceKm: number | null
  targetRir: Rir
  actualRir: Rir
  restSeconds: number | null
  isCompleted: boolean
  completedAt: IsoDateTime | null
  notes: string | null
}

export interface WorkoutExercise {
  id: Id
  exerciseId: Id
  exerciseName: string
  primaryMuscle: MuscleGroup
  exerciseOrder: number
  notes: string | null
  sets: WorkoutSetRecord[]
}

export interface WorkoutSession {
  id: Id
  userId: Id
  routineId: Id | null
  routineName: string | null
  /** Set only when this session was started from a fixed program Day. */
  programRunDayId?: Id | null
  status: SessionStatus
  startedAt: IsoDateTime
  completedAt: IsoDateTime | null
  /** 운동을 일시정지한 누적 시간(초). 경과/소요 시간 계산에서 항상 제외한다. */
  pausedSeconds: number
  /**
   * 이미 완료된 기록을 나중에 고친 시각. 한 번도 고치지 않았으면 null이다.
   * `updatedAt`과 다르다 -- `updatedAt`은 운동 진행 중 저장으로도 갱신되므로
   * "손으로 고쳤다"는 신호가 되지 못한다. 값은 저장소가 정한다(어댑터/RPC).
   */
  editedAt: IsoDateTime | null
  notes: string | null
  exercises: WorkoutExercise[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface ProgramSetPrescription {
  setOrder: number
  setType: SetType
  targetWeightKg: number | null
  /** 프로그램 시작 시 저장된 1RM을 기준으로 targetWeightKg를 계산한다. */
  targetOneRepMaxPercent?: number | null
  targetRepsMin: number | null
  targetRepsMax: number | null
  /** 웨이트 Day 안에 포함된 유산소 처방을 운동 초안에 미리 채운다. */
  targetDurationSeconds?: number | null
  targetDistanceKm?: number | null
  targetRir: Rir
  restSeconds: number | null
  notes: string | null
}

export interface ProgramExercisePrescription {
  exerciseName: string
  /** 변형 동작이 다른 종목의 1RM을 공유할 때 사용한다. 예: 일시정지 스쿼트 -> 스쿼트. */
  oneRepMaxExerciseName?: string | null
  exerciseOrder: number
  notes: string | null
  sets: ProgramSetPrescription[]
}

export interface ProgramRoutineSnapshot {
  description: string | null
  exercises: ProgramExercisePrescription[]
}

export interface ProgramCardioTarget {
  exerciseName: string
  distanceKm: number | null
  durationMinutes: number | null
  rpeMin: number | null
  rpeMax: number | null
}

export interface ProgramDaySessionSummary {
  id: Id
  routineName: string | null
  startedAt: IsoDateTime
  completedAt: IsoDateTime | null
}

export interface ProgramRunDay {
  id: Id
  userId: Id
  programRunId: Id
  dayNumber: number
  weekNumber: number
  dayOfWeek: number
  scheduledOn: string
  dayType: ProgramDayType
  title: string
  instructions: string | null
  routineSnapshot: ProgramRoutineSnapshot | null
  cardioTarget: ProgramCardioTarget | null
  isOptional: boolean
  completedAt: IsoDateTime | null
  workoutSession: ProgramDaySessionSummary | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface ProgramRun {
  id: Id
  userId: Id
  programKey: string
  programName: string
  templateVersion: number
  durationWeeks: number
  startDate: string
  status: ProgramRunStatus
  endedAt: IsoDateTime | null
  endReason: string | null
  days: ProgramRunDay[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface StartProgramDayInput {
  dayNumber: number
  dayType: ProgramDayType
  title: string
  instructions: string | null
  routineSnapshot: ProgramRoutineSnapshot | null
  cardioTarget: ProgramCardioTarget | null
  isOptional: boolean
}

export interface StartProgramRunInput {
  programKey: string
  programName: string
  templateVersion: number
  durationWeeks: number
  startDate: string
  days: StartProgramDayInput[]
}

export interface BodyMeasurement {
  id: Id
  userId: Id
  measuredOn: string
  weightKg: number | null
  skeletalMuscleMassKg: number | null
  bodyFatPercentage: number | null
  notes: string | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}
