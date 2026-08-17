/**
 * Shared, provider-neutral domain model.  Database and UI code should depend
 * on these types rather than a particular authentication or storage vendor.
 */
export type Id = string
export type IsoDateTime = string
export type Rir = number | null
export type WeightUnit = 'kg' | 'lb'
export type Theme = 'system' | 'light' | 'dark'
export type SetType = 'warmup' | 'working' | 'dropset'
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned'
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'cardio' | 'other'
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
  defaultRestSeconds: number
  isArchived: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface RoutineSetPrescription {
  id: Id
  setOrder: number
  setType: SetType
  targetWeightKg: number | null
  targetRepsMin: number | null
  targetRepsMax: number | null
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
  status: SessionStatus
  startedAt: IsoDateTime
  completedAt: IsoDateTime | null
  /** 운동을 일시정지한 누적 시간(초). 경과/소요 시간 계산에서 항상 제외한다. */
  pausedSeconds: number
  notes: string | null
  exercises: WorkoutExercise[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
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
