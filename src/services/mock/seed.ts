import type { Exercise, Routine, UserProfile, UserSettings, WorkoutSession } from '../../types/domain'

export const mockUser: UserProfile = {
  id: 'local-user',
  email: 'me@trainlog.local',
  displayName: '나의 트레이닝',
  avatarUrl: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

export const mockSettings: UserSettings = {
  userId: mockUser.id,
  weightUnit: 'kg',
  theme: 'system',
  weekStartsOn: 1,
  timezone: 'Asia/Seoul',
  defaultRestSeconds: 120,
  defaultRir: 2,
  rirInputEnabled: true,
  shareRirByDefault: true,
  keepScreenAwake: true,
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const exerciseSeeds: Array<[string, string, Exercise['primaryMuscle'], Exercise['secondaryMuscles'], Exercise['equipment']]> = [
  ['barbell-bench-press', '바벨 벤치프레스', 'chest', ['triceps', 'shoulders'], 'barbell'],
  ['seated-cable-row', '체스트 서포티드 시티드 로우', 'back', ['biceps'], 'cable'],
  ['lat-pulldown', '와이드 그립 랫 풀다운', 'back', ['biceps'], 'cable'],
  ['one-arm-dumbbell-row', '원 암 덤벨 로우', 'back', ['biceps'], 'dumbbell'],
  ['machine-shoulder-press', '머신 숄더 프레스', 'shoulders', ['triceps'], 'machine'],
  ['dumbbell-curl', '이지바 컬', 'biceps', [], 'barbell'],
  ['leg-press', '레그 프레스', 'quadriceps', ['glutes'], 'machine'],
]

export const mockExercises: Exercise[] = exerciseSeeds.map(([id, name, primaryMuscle, secondaryMuscles, equipment]) => ({
  id,
  userId: null,
  name,
  primaryMuscle,
  secondaryMuscles,
  equipment,
  defaultRestSeconds: 120,
  isArchived: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}))

const threeWorkingSets = (prefix: string, weight: number, min: number, max: number, rir: number) =>
  [1, 2, 3].map((setOrder) => ({
    id: `${prefix}-${setOrder}`,
    setOrder,
    setType: 'working' as const,
    targetWeightKg: weight,
    targetRepsMin: min,
    targetRepsMax: max,
    targetRir: rir,
    restSeconds: 120,
  }))

export const mockRoutines: Routine[] = [
  {
    id: 'pull-day', userId: mockUser.id, name: 'Pull Day', description: '등과 이두 중심', color: '#3b82f6',
    exercises: [
      { id: 'pull-row', exerciseId: 'seated-cable-row', exerciseName: '체스트 서포티드 시티드 로우', exerciseOrder: 1, notes: null, sets: threeWorkingSets('pull-row-set', 60, 8, 10, 2) },
      { id: 'pull-lat', exerciseId: 'lat-pulldown', exerciseName: '와이드 그립 랫 풀다운', exerciseOrder: 2, notes: '가슴을 들어 올리고 팔꿈치를 아래로', sets: threeWorkingSets('pull-lat-set', 70, 8, 10, 1) },
      { id: 'pull-curl', exerciseId: 'dumbbell-curl', exerciseName: '이지바 컬', exerciseOrder: 3, notes: null, sets: threeWorkingSets('pull-curl-set', 30, 10, 12, 1) },
    ],
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
  },
  {
    id: 'push-day', userId: mockUser.id, name: 'Push Day', description: '가슴과 어깨 중심', color: '#14b8a6',
    exercises: [
      { id: 'push-bench', exerciseId: 'barbell-bench-press', exerciseName: '바벨 벤치프레스', exerciseOrder: 1, notes: null, sets: threeWorkingSets('push-bench-set', 80, 6, 8, 2) },
      { id: 'push-press', exerciseId: 'machine-shoulder-press', exerciseName: '머신 숄더 프레스', exerciseOrder: 2, notes: null, sets: threeWorkingSets('push-press-set', 45, 8, 10, 2) },
    ],
    createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z',
  },
]

export const mockSessions: WorkoutSession[] = [
  {
    id: 'session-2026-08-14', userId: mockUser.id, routineId: 'pull-day', routineName: 'Pull Day', status: 'completed',
    startedAt: '2026-08-14T10:05:00.000+09:00', completedAt: '2026-08-14T11:12:00.000+09:00', notes: '랫 풀다운 마지막 세트 집중',
    exercises: [
      {
        id: 'session-row', exerciseId: 'seated-cable-row', exerciseName: '체스트 서포티드 시티드 로우', primaryMuscle: 'back', exerciseOrder: 1, notes: null,
        sets: [
          [60, 10, 2], [60, 10, 2], [60, 10, 1],
        ].map(([weightKg, reps, actualRir], index) => ({ id: `session-row-${index + 1}`, setOrder: index + 1, setType: 'working', weightKg, reps, targetRir: 2, actualRir, restSeconds: 120, isCompleted: true, completedAt: `2026-08-14T10:${15 + index * 4}:00.000+09:00`, notes: null })),
      },
      {
        id: 'session-lat', exerciseId: 'lat-pulldown', exerciseName: '와이드 그립 랫 풀다운', primaryMuscle: 'back', exerciseOrder: 2, notes: null,
        sets: [
          [70, 9, 1], [70, 9, 1], [70, 8, 0],
        ].map(([weightKg, reps, actualRir], index) => ({ id: `session-lat-${index + 1}`, setOrder: index + 1, setType: 'working', weightKg, reps, targetRir: 1, actualRir, restSeconds: 120, isCompleted: true, completedAt: `2026-08-14T10:${32 + index * 4}:00.000+09:00`, notes: null })),
      },
    ],
    createdAt: '2026-08-14T10:05:00.000+09:00', updatedAt: '2026-08-14T11:12:00.000+09:00',
  },
]
