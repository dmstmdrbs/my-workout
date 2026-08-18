import type { Equipment, Exercise, ExerciseBrand, MuscleGroup } from '../../types/domain'

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

/** 선택할 수 있는 기구 제조사. 국내 헬스장에 흔한 순서로 둔다. */
export const exerciseBrands: ExerciseBrand[] = [
  'hammer_strength',
  'nautilus',
  'nutec',
  'cybex',
  'life_fitness',
  'technogym',
  'matrix',
  'precor',
  'panatta',
  'watson',
  'star_trac',
]

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

const brandLabels: Record<ExerciseBrand, string> = {
  hammer_strength: '해머스트렝스',
  nautilus: '노틸러스',
  nutec: '뉴텍',
  cybex: '사이벡스',
  life_fitness: '라이프피트니스',
  technogym: '테크노짐',
  matrix: '매트릭스',
  precor: '프리코',
  panatta: '파나타',
  watson: '왓슨',
  star_trac: '스타트랙',
}

export function brandLabel(brand: ExerciseBrand) { return brandLabels[brand] }

/**
 * 운동·루틴에 종목을 넣을 때 복사해 둘 이름. 기록은 "그때 그 이름으로 한
 * 운동"이라 `workout_exercises.exercise_name`에 문자열로 박히므로, 나중에
 * 종목의 브랜드를 고쳐도 이미 남은 기록은 그때 기구 그대로여야 한다.
 *
 * 카탈로그(피커·관리 화면)에는 쓰지 않는다 -- 그쪽은 브랜드를 배지로 따로
 * 그려서 무엇이 브랜드고 무엇이 종목인지 눈으로 구분되게 한다.
 */
export function snapshotExerciseName(exercise: Pick<Exercise, 'name' | 'brand'>): string {
  return exercise.brand ? `${brandLabels[exercise.brand]} ${exercise.name}` : exercise.name
}

export function muscleLabel(muscle: MuscleGroup) { return muscleLabels[muscle] }
export function equipmentLabel(equipment: Equipment) { return equipmentLabels[equipment] }
