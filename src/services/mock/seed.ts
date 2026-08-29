import type { Exercise, Routine, SocialProfile, UserProfile, UserSettings, WorkoutSession } from '../../types/domain'

export const mockUser: UserProfile = {
  id: 'local-user',
  email: 'me@trainlog.local',
  displayName: '나의 트레이닝',
  avatarUrl: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

/** Social-only seed data deliberately contains no email or other account fields. */
export const mockSocialProfiles: SocialProfile[] = [
  { userId: mockUser.id, displayName: mockUser.displayName, avatarUrl: null },
  { userId: 'local-friend-accepted', displayName: '김서준', avatarUrl: null },
  { userId: 'local-friend-incoming', displayName: '박지우', avatarUrl: null },
  { userId: 'local-friend-outgoing', displayName: '이도윤', avatarUrl: null },
  { userId: 'local-invite-owner', displayName: '최하린', avatarUrl: null },
]

export const mockFriendInvites = [
  {
    token: 'mock-invite-local-owner',
    inviterId: 'local-invite-owner',
    createdAt: '2026-08-20T00:00:00.000Z',
    expiresAt: '2026-09-19T00:00:00.000Z',
    revokedAt: null,
  },
]

export const mockFriendships = [
  {
    id: 'local-friendship-accepted',
    requesterId: mockUser.id,
    addresseeId: 'local-friend-accepted',
    status: 'accepted' as const,
    requestedAt: '2026-08-10T09:00:00.000Z',
    respondedAt: '2026-08-10T09:05:00.000Z',
  },
  {
    id: 'local-friendship-incoming',
    requesterId: 'local-friend-incoming',
    addresseeId: mockUser.id,
    status: 'pending' as const,
    requestedAt: '2026-08-28T09:00:00.000Z',
    respondedAt: null,
  },
  {
    id: 'local-friendship-outgoing',
    requesterId: mockUser.id,
    addresseeId: 'local-friend-outgoing',
    status: 'pending' as const,
    requestedAt: '2026-08-27T09:00:00.000Z',
    respondedAt: null,
  },
]

export const mockBlocks: Array<{ blockerId: string; blockedId: string; blockedAt: string }> = []

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

const exerciseSeeds: Array<[string, string, Exercise['primaryMuscle'], Exercise['secondaryMuscles'], Exercise['equipment'], Exercise['brand']]> = [
  ['barbell-bench-press', '바벨 벤치프레스', 'chest', ['triceps', 'shoulders'], 'barbell', null],
  ['seated-cable-row', '체스트 서포티드 시티드 로우', 'back', ['biceps'], 'cable', 'hammer_strength'],
  ['lat-pulldown', '와이드 그립 랫 풀다운', 'back', ['biceps'], 'cable', 'nautilus'],
  ['one-arm-dumbbell-row', '원 암 덤벨 로우', 'back', ['biceps'], 'dumbbell', null],
  ['machine-shoulder-press', '머신 숄더 프레스', 'shoulders', ['triceps'], 'machine', 'nutec'],
  ['dumbbell-curl', '이지바 컬', 'biceps', [], 'barbell', null],
  ['leg-press', '레그 프레스', 'quadriceps', ['glutes'], 'machine', null],
  ['barbell-overhead-press', '바벨 오버헤드 프레스', 'shoulders', ['triceps'], 'barbell', null],
  ['cable-lateral-raise', '케이블 레터럴 레이즈', 'shoulders', [], 'cable', null],
  ['cable-overhead-triceps', '케이블 오버헤드 트라이셉스 익스텐션', 'triceps', [], 'cable', null],
  ['cable-curl', '케이블 컬', 'biceps', [], 'cable', null],
  ['back-squat', '스쿼트', 'quadriceps', ['glutes', 'hamstrings'], 'barbell', null],
  ['romanian-deadlift', '루마니안 데드리프트', 'hamstrings', ['glutes', 'back'], 'barbell', null],
  ['leg-curl', '레그 컬', 'hamstrings', [], 'machine', null],
  ['standing-calf-raise', '스탠딩 카프 레이즈', 'calves', [], 'machine', null],
  ['cable-crunch', '케이블 크런치', 'core', [], 'cable', null],
  ['flat-chest-press-machine', '플랫 체스트 프레스 머신', 'chest', ['triceps', 'shoulders'], 'machine', null],
  ['incline-dumbbell-press', '인클라인 덤벨 프레스', 'chest', ['triceps', 'shoulders'], 'dumbbell', null],
  ['one-arm-cable-lat-pulldown', '원 암 케이블 랫 풀다운', 'back', ['biceps'], 'cable', null],
  ['reverse-pec-deck', '리버스 펙 덱 플라이', 'shoulders', ['back'], 'machine', null],
  ['cable-triceps-pushdown', '케이블 트라이셉스 푸시다운', 'triceps', [], 'cable', null],
  ['incline-dumbbell-curl', '인클라인 덤벨 컬', 'biceps', [], 'dumbbell', null],
  ['high-to-low-cable-fly', '하이 투 로우 케이블 플라이', 'chest', [], 'cable', null],
  ['paused-squat', '일시정지 스쿼트', 'quadriceps', ['glutes', 'hamstrings'], 'barbell', null],
  ['leg-extension', '레그 익스텐션', 'quadriceps', [], 'machine', null],
  ['running', '러닝', 'cardio', [], 'cardio', null],
]

export const mockExercises: Exercise[] = exerciseSeeds.map(([id, name, primaryMuscle, secondaryMuscles, equipment, brand]) => ({
  id,
  userId: null,
  name,
  primaryMuscle,
  secondaryMuscles,
  equipment,
  brand,
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
    targetDurationSeconds: null,
    targetDistanceKm: null,
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
    startedAt: '2026-08-14T10:05:00.000+09:00', completedAt: '2026-08-14T11:12:00.000+09:00', pausedSeconds: 0, editedAt: null, notes: '랫 풀다운 마지막 세트 집중',
    exercises: [
      {
        id: 'session-row', exerciseId: 'seated-cable-row', exerciseName: '체스트 서포티드 시티드 로우', primaryMuscle: 'back', exerciseOrder: 1, notes: null,
        sets: [
          [60, 10, 2], [60, 10, 2], [60, 10, 1],
        ].map(([weightKg, reps, actualRir], index) => ({ id: `session-row-${index + 1}`, setOrder: index + 1, setType: 'working', weightKg, reps, durationSeconds: null, distanceKm: null, targetRir: 2, actualRir, restSeconds: 120, isCompleted: true, completedAt: `2026-08-14T10:${15 + index * 4}:00.000+09:00`, notes: null })),
      },
      {
        id: 'session-lat', exerciseId: 'lat-pulldown', exerciseName: '와이드 그립 랫 풀다운', primaryMuscle: 'back', exerciseOrder: 2, notes: null,
        sets: [
          [70, 9, 1], [70, 9, 1], [70, 8, 0],
        ].map(([weightKg, reps, actualRir], index) => ({ id: `session-lat-${index + 1}`, setOrder: index + 1, setType: 'working', weightKg, reps, durationSeconds: null, distanceKm: null, targetRir: 1, actualRir, restSeconds: 120, isCompleted: true, completedAt: `2026-08-14T10:${32 + index * 4}:00.000+09:00`, notes: null })),
      },
    ],
    createdAt: '2026-08-14T10:05:00.000+09:00', updatedAt: '2026-08-14T11:12:00.000+09:00',
  },
  {
    id: 'session-2026-08-12', userId: mockUser.id, routineId: 'push-day', routineName: 'Push Day', status: 'completed',
    startedAt: '2026-08-12T14:30:00.000+09:00', completedAt: '2026-08-12T15:20:00.000+09:00', pausedSeconds: 0, editedAt: null, notes: null,
    exercises: [
      {
        id: 'session2-bench', exerciseId: 'barbell-bench-press', exerciseName: '바벨 벤치프레스', primaryMuscle: 'chest', exerciseOrder: 1, notes: null,
        sets: [
          [80, 7, 2], [80, 7, 2], [80, 6, 1],
        ].map(([weightKg, reps, actualRir], index) => ({ id: `session2-bench-${index + 1}`, setOrder: index + 1, setType: 'working', weightKg, reps, durationSeconds: null, distanceKm: null, targetRir: 2, actualRir, restSeconds: 120, isCompleted: true, completedAt: `2026-08-12T14:${40 + index * 4}:00.000+09:00`, notes: null })),
      },
    ],
    createdAt: '2026-08-12T14:30:00.000+09:00', updatedAt: '2026-08-12T15:20:00.000+09:00',
  },
  {
    id: 'session-2026-08-11', userId: mockUser.id, routineId: 'pull-day', routineName: 'Pull Day', status: 'completed',
    startedAt: '2026-08-11T18:00:00.000+09:00', completedAt: '2026-08-11T19:00:00.000+09:00', pausedSeconds: 0, editedAt: null, notes: null,
    exercises: [
      {
        id: 'session3-row', exerciseId: 'seated-cable-row', exerciseName: '체스트 서포티드 시티드 로우', primaryMuscle: 'back', exerciseOrder: 1, notes: null,
        sets: [
          [65, 10, 2], [65, 10, 2], [65, 9, 1],
        ].map(([weightKg, reps, actualRir], index) => ({ id: `session3-row-${index + 1}`, setOrder: index + 1, setType: 'working', weightKg, reps, durationSeconds: null, distanceKm: null, targetRir: 2, actualRir, restSeconds: 120, isCompleted: true, completedAt: `2026-08-11T18:${15 + index * 4}:00.000+09:00`, notes: null })),
      },
    ],
    createdAt: '2026-08-11T18:00:00.000+09:00', updatedAt: '2026-08-11T19:00:00.000+09:00',
  },
]
