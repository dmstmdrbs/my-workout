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
