import type { Equipment, MuscleGroup } from '../../types/domain'

export const muscleGroups: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'cardio',
  'full_body',
]

export const equipmentTypes: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'cardio', 'other']

const muscleLabels: Record<MuscleGroup, string> = {
  chest: '가슴',
  back: '등',
  shoulders: '어깨',
  biceps: '이두',
  triceps: '삼두',
  quadriceps: '대퇴사두',
  hamstrings: '햄스트링',
  glutes: '둔근',
  calves: '종아리',
  core: '코어',
  cardio: '유산소',
  full_body: '전신',
}

const equipmentLabels: Record<Equipment, string> = {
  barbell: '바벨',
  dumbbell: '덤벨',
  machine: '머신',
  cable: '케이블',
  bodyweight: '맨몸',
  cardio: '유산소 기구',
  other: '기타',
}

export function muscleLabel(muscle: MuscleGroup) { return muscleLabels[muscle] }
export function equipmentLabel(equipment: Equipment) { return equipmentLabels[equipment] }
