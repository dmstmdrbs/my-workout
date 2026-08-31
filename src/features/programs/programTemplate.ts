import { addCalendarDays, daysBetween } from '../../lib/localDate'
import type {
  ProgramExercisePrescription,
  ProgramRoutineSnapshot,
  ProgramSetPrescription,
  StartProgramDayInput,
  StartProgramRunInput,
} from '../../types/domain'

export const plateauBreakProgramKey = 'two-split-running-plateau-break'
export const plateauBreakProgramName = '8주 2분할 + 러닝 정체기 돌파'
export const plateauBreakTemplateVersion = 4
export const plateauBreakDurationWeeks = 8
export const officeUpperFourDayProgramKey = 'office-upper-three-lower-cardio-four-day'
export const officeUpperFourDayProgramName = '8주 직장인 상체 3일 + 하체·유산소'

export interface TrainingProgramDefinition {
  key: string
  name: string
  eyebrow: string
  summary: string
  focus: string
  durationWeeks: number
  sessionsPerWeek: number
  tags: string[]
  color: string
  build: (startDate: string) => StartProgramRunInput
}

const programEventDate = '2026-10-10'

function sets(count: number, prescription: Omit<ProgramSetPrescription, 'setOrder' | 'notes'> & { notes?: string | null }) {
  return Array.from({ length: count }, (_, index): ProgramSetPrescription => ({
    ...prescription,
    setOrder: index + 1,
    notes: prescription.notes ?? null,
  }))
}

function exercise(
  exerciseName: string,
  exerciseOrder: number,
  exerciseSets: ProgramSetPrescription[],
  notes: string | null = null,
  oneRepMaxExerciseName: string | null = null,
): ProgramExercisePrescription {
  return { exerciseName, exerciseOrder, sets: exerciseSets, notes, oneRepMaxExerciseName }
}

const upperStrength: ProgramRoutineSnapshot = {
  description: '벤치프레스 진행과 등·어깨 보완을 함께 가져가는 상체 강도일',
  exercises: [
    exercise('바벨 벤치프레스', 1, [
      ...sets(1, { setType: 'topset', targetWeightKg: null, targetOneRepMaxPercent: 80, targetRepsMin: 6, targetRepsMax: 8, targetRir: 1, restSeconds: 180, notes: '탑 세트' }),
      ...sets(2, { setType: 'backoff', targetWeightKg: null, targetOneRepMaxPercent: 72.5, targetRepsMin: 8, targetRepsMax: 10, targetRir: 2, restSeconds: 180, notes: '백오프' }).map((set, index) => ({ ...set, setOrder: index + 2 })),
    ], '탑 세트가 8회 RIR 1-2면 다음 노출에서 2.5kg 증량'),
    exercise('체스트 서포티드 시티드 로우', 2, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 }), '넓게 잡고 상부 등까지 채우기'),
    exercise('바벨 오버헤드 프레스', 3, sets(3, { setType: 'working', targetWeightKg: null, targetOneRepMaxPercent: 75, targetRepsMin: 5, targetRepsMax: 8, targetRir: 2, restSeconds: 150 }), '오른쪽 어깨가 불편하면 뉴트럴 그립 머신/덤벨로 교체'),
    exercise('와이드 그립 랫 풀다운', 4, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 90 })),
    exercise('케이블 레터럴 레이즈', 5, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 20, targetRir: 1, restSeconds: 75 })),
    exercise('케이블 오버헤드 트라이셉스 익스텐션', 6, sets(4, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 }), '팔 약점 우선 종목. 모든 세트가 15회 RIR 1이면 최소 단위로 증량'),
    exercise('케이블 컬', 7, sets(4, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 }), '팔 약점 우선 종목. 모든 세트가 15회 RIR 1이면 최소 단위로 증량'),
  ],
}

const lowerStrength: ProgramRoutineSnapshot = {
  description: '스쿼트 기술과 중량 진행을 우선하는 하체 강도일',
  exercises: [
    exercise('스쿼트', 1, [
      ...sets(1, { setType: 'topset', targetWeightKg: null, targetOneRepMaxPercent: 80, targetRepsMin: 4, targetRepsMax: 6, targetRir: 2, restSeconds: 180, notes: '탑 세트' }),
      ...sets(2, { setType: 'backoff', targetWeightKg: null, targetOneRepMaxPercent: 72.5, targetRepsMin: 6, targetRepsMax: 8, targetRir: 2, restSeconds: 180, notes: '백오프' }).map((set, index) => ({ ...set, setOrder: index + 2 })),
    ], '무릎 자신감이나 동작 품질이 떨어지면 증량하지 않고 반복'),
    exercise('루마니안 데드리프트', 2, sets(2, { setType: 'working', targetWeightKg: null, targetOneRepMaxPercent: 70, targetRepsMin: 6, targetRepsMax: 8, targetRir: 2, restSeconds: 150 })),
    exercise('레그 프레스', 3, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 120 })),
    exercise('레그 컬', 4, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 90 })),
    exercise('스탠딩 카프 레이즈', 5, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
    exercise('케이블 크런치', 6, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
  ],
}

const upperHypertrophy: ProgramRoutineSnapshot = {
  description: '가슴·등을 채우면서 어깨와 팔에 직접 볼륨을 배분하는 상체 볼륨일',
  exercises: [
    exercise('플랫 체스트 프레스 머신', 1, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('인클라인 덤벨 프레스', 2, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('체스트 서포티드 시티드 로우', 3, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 }), '뉴트럴 또는 좁은 그립'),
    exercise('원 암 케이블 랫 풀다운', 4, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 90 })),
    exercise('케이블 레터럴 레이즈', 5, sets(4, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 20, targetRir: 1, restSeconds: 75 })),
    exercise('리버스 펙 덱 플라이', 6, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 20, targetRir: 1, restSeconds: 75 })),
    exercise('하이 투 로우 케이블 플라이', 7, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 15, targetRir: 2, restSeconds: 75 }), '90분 안에 끝나고 어깨가 편할 때만 수행'),
  ],
}

const lowerHypertrophy: ProgramRoutineSnapshot = {
  description: '다음 날 러닝을 방해하지 않도록 하체 피로를 제한하고 팔 약점을 보완하는 날',
  exercises: [
    exercise('일시정지 스쿼트', 1, sets(2, { setType: 'working', targetWeightKg: null, targetOneRepMaxPercent: 65, targetRepsMin: 5, targetRepsMax: 5, targetRir: 3, restSeconds: 150 }), '바닥에서 1초 정지, 기술과 자신감 우선', '스쿼트'),
    exercise('레그 프레스', 2, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('레그 컬', 3, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 90 })),
    exercise('스탠딩 카프 레이즈', 4, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
    exercise('케이블 오버헤드 트라이셉스 익스텐션', 5, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 }), '인클라인 덤벨 컬과 번갈아 수행'),
    exercise('인클라인 덤벨 컬', 6, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 }), '삼두 운동과 번갈아 수행'),
    exercise('케이블 트라이셉스 푸시다운', 7, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 20, targetRir: 1, restSeconds: 75 }), '케이블 컬과 번갈아 수행'),
    exercise('케이블 컬', 8, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 20, targetRir: 1, restSeconds: 75 }), '삼두 운동과 번갈아 수행'),
  ],
}

const upperPump: ProgramRoutineSnapshot = {
  description: '어깨와 팔을 우선하면서 가슴·등의 주간 자극을 보충하는 짧은 상체일',
  exercises: [
    exercise('플랫 체스트 프레스 머신', 1, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 90 })),
    exercise('원 암 케이블 랫 풀다운', 2, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 90 })),
    exercise('케이블 레터럴 레이즈', 3, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 15, targetRepsMax: 25, targetRir: 1, restSeconds: 75 })),
    exercise('리버스 펙 덱 플라이', 4, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 15, targetRepsMax: 20, targetRir: 1, restSeconds: 75 })),
    exercise('케이블 트라이셉스 푸시다운', 5, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
    exercise('케이블 컬', 6, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
  ],
}

const fullBodyA: ProgramRoutineSnapshot = {
  description: '스쿼트와 벤치프레스를 중심으로 전신의 기본 패턴을 수행하는 날',
  exercises: [
    exercise('스쿼트', 1, sets(3, { setType: 'working', targetWeightKg: null, targetOneRepMaxPercent: 72.5, targetRepsMin: 5, targetRepsMax: 8, targetRir: 2, restSeconds: 180 })),
    exercise('바벨 벤치프레스', 2, sets(3, { setType: 'working', targetWeightKg: null, targetOneRepMaxPercent: 72.5, targetRepsMin: 6, targetRepsMax: 10, targetRir: 2, restSeconds: 150 })),
    exercise('체스트 서포티드 시티드 로우', 3, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('케이블 레터럴 레이즈', 4, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 20, targetRir: 1, restSeconds: 75 })),
    exercise('케이블 크런치', 5, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
    exercise('케이블 트라이셉스 푸시다운', 6, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
    exercise('스탠딩 카프 레이즈', 7, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
  ],
}

const fullBodyB: ProgramRoutineSnapshot = {
  description: '힌지와 수직 밀기·당기기를 중심으로 전신을 훈련하는 날',
  exercises: [
    exercise('루마니안 데드리프트', 1, sets(3, { setType: 'working', targetWeightKg: null, targetOneRepMaxPercent: 70, targetRepsMin: 6, targetRepsMax: 10, targetRir: 2, restSeconds: 150 })),
    exercise('바벨 오버헤드 프레스', 2, sets(3, { setType: 'working', targetWeightKg: null, targetOneRepMaxPercent: 70, targetRepsMin: 6, targetRepsMax: 10, targetRir: 2, restSeconds: 150 })),
    exercise('플랫 체스트 프레스 머신', 3, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('와이드 그립 랫 풀다운', 4, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 90 })),
    exercise('레그 컬', 5, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
    exercise('케이블 오버헤드 트라이셉스 익스텐션', 6, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
    exercise('케이블 컬', 7, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
  ],
}

const fullBodyC: ProgramRoutineSnapshot = {
  description: '프레스와 등·하체 볼륨을 고르게 채우는 전신 보완일',
  exercises: [
    exercise('레그 프레스', 1, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('인클라인 덤벨 프레스', 2, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('원 암 덤벨 로우', 3, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 90 })),
    exercise('리버스 펙 덱 플라이', 4, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 20, targetRir: 1, restSeconds: 75 })),
    exercise('인클라인 덤벨 컬', 5, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
    exercise('레그 익스텐션', 6, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
    exercise('레그 컬', 7, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
    exercise('스탠딩 카프 레이즈', 8, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 1, restSeconds: 75 })),
  ],
}

const officeUpperA: ProgramRoutineSnapshot = {
  description: '가슴과 등을 같은 비중으로 훈련하는 기본 상체일',
  exercises: [
    exercise('바벨 벤치프레스', 1, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 6, targetRepsMax: 8, targetRir: 2, restSeconds: 180 })),
    exercise('와이드 그립 랫 풀다운', 2, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('인클라인 덤벨 프레스', 3, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('체스트 서포티드 시티드 로우', 4, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('케이블 레터럴 레이즈', 5, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 20, targetRir: 2, restSeconds: 75 })),
    exercise('케이블 트라이셉스 푸시다운', 6, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 })),
    exercise('이지바 컬', 7, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 })),
  ],
}

const officeUpperB: ProgramRoutineSnapshot = {
  description: '어깨와 등을 우선하면서 가슴과 팔을 고르게 보완하는 상체일',
  exercises: [
    exercise('머신 숄더 프레스', 1, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 6, targetRepsMax: 10, targetRir: 2, restSeconds: 150 })),
    exercise('와이드 그립 랫 풀다운', 2, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 }), '뉴트럴 그립 사용 가능'),
    exercise('플랫 체스트 프레스 머신', 3, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('체스트 서포티드 시티드 로우', 4, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('리버스 펙 덱 플라이', 5, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 20, targetRir: 2, restSeconds: 75 })),
    exercise('케이블 레터럴 레이즈', 6, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 20, targetRir: 2, restSeconds: 75 })),
    exercise('케이블 컬', 7, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 })),
    exercise('케이블 오버헤드 트라이셉스 익스텐션', 8, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 })),
  ],
}

function officeLowerCardio(cardioMinutes: string, useSquatVariation: boolean): ProgramRoutineSnapshot {
  return {
    description: `머신 중심 하체를 30-40분 안에 끝내고 Zone 2 유산소 ${cardioMinutes}분을 수행하는 날`,
    exercises: [
      exercise(useSquatVariation ? '스쿼트' : '레그 프레스', 1, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 3, restSeconds: 150 }), useSquatVariation ? '스미스 스쿼트 또는 핵스쿼트로 대체 가능' : '핵스쿼트로 대체 가능'),
      exercise('루마니안 데드리프트', 2, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 3, restSeconds: 150 }), '엉덩이를 뒤로 보내 햄스트링의 긴 가동범위를 확보합니다. 덤벨 또는 스미스 머신 사용 가능'),
      exercise('레그 컬', 3, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 3, restSeconds: 90 })),
      exercise('레그 익스텐션', 4, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 15, targetRir: 3, restSeconds: 75 })),
      exercise('스탠딩 카프 레이즈', 5, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 3, restSeconds: 75 }), '바닥에서 충분히 늘어난 뒤 반동 없이 수행'),
      exercise('러닝', 6, sets(1, { setType: 'working', targetWeightKg: null, targetRepsMin: null, targetRepsMax: null, targetRir: null, restSeconds: null, notes: `Zone 2 ${cardioMinutes}분` }), '경사 트레드밀·사이클·스텝밀·일립티컬 중 편한 종목으로 수행'),
    ],
  }
}

const officeUpperC: ProgramRoutineSnapshot = {
  description: '중량 부담을 낮추고 상체 전체와 팔 펌핑을 즐기는 날',
  exercises: [
    exercise('인클라인 덤벨 프레스', 1, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('원 암 케이블 랫 풀다운', 2, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 90 })),
    exercise('하이 투 로우 케이블 플라이', 3, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 15, targetRir: 2, restSeconds: 75 })),
    exercise('체스트 서포티드 시티드 로우', 4, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 90 })),
    exercise('케이블 레터럴 레이즈', 5, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 15, targetRepsMax: 20, targetRir: 2, restSeconds: 75 })),
    exercise('케이블 컬', 6, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 }), '푸시다운과 슈퍼세트, 시간이 부족하면 2세트'),
    exercise('케이블 트라이셉스 푸시다운', 7, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 }), '컬과 슈퍼세트, 시간이 부족하면 2세트'),
  ],
}

const officeUpperA2: ProgramRoutineSnapshot = {
  description: '프레스와 로우 각도를 바꿔 익숙함을 유지하면서 자극을 변주한 상체일',
  exercises: [
    exercise('인클라인 덤벨 프레스', 1, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 6, targetRepsMax: 10, targetRir: 2, restSeconds: 150 })),
    exercise('와이드 그립 랫 풀다운', 2, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('플랫 체스트 프레스 머신', 3, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('체스트 서포티드 시티드 로우', 4, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 }), '머신 하이로우로 대체 가능'),
    exercise('케이블 레터럴 레이즈', 5, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 20, targetRir: 2, restSeconds: 75 })),
    exercise('케이블 트라이셉스 푸시다운', 6, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 })),
    exercise('이지바 컬', 7, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 })),
  ],
}

const officeUpperB2: ProgramRoutineSnapshot = {
  description: '덤벨 프레스와 한 팔 당기기로 좌우 움직임을 점검하는 상체일',
  exercises: [
    exercise('머신 숄더 프레스', 1, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 }), '덤벨 숄더 프레스로 대체 가능'),
    exercise('와이드 그립 랫 풀다운', 2, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('플랫 체스트 프레스 머신', 3, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('원 암 덤벨 로우', 4, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 90 })),
    exercise('리버스 펙 덱 플라이', 5, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 20, targetRir: 2, restSeconds: 75 })),
    exercise('케이블 레터럴 레이즈', 6, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 15, targetRepsMax: 20, targetRir: 2, restSeconds: 75 })),
    exercise('인클라인 덤벨 컬', 7, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 })),
    exercise('케이블 오버헤드 트라이셉스 익스텐션', 8, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 })),
  ],
}

const officeUpperC2: ProgramRoutineSnapshot = {
  description: '덤벨과 케이블 중심으로 상체 전체를 가볍고 빠르게 채우는 펌핑일',
  exercises: [
    exercise('플랫 체스트 프레스 머신', 1, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 }), '덤벨 벤치프레스로 대체 가능'),
    exercise('원 암 덤벨 로우', 2, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetRir: 2, restSeconds: 120 })),
    exercise('하이 투 로우 케이블 플라이', 3, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 15, targetRir: 2, restSeconds: 75 })),
    exercise('원 암 케이블 랫 풀다운', 4, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 12, targetRepsMax: 15, targetRir: 2, restSeconds: 75 }), '스트레이트 암 풀다운으로 대체 가능'),
    exercise('케이블 레터럴 레이즈', 5, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 15, targetRepsMax: 20, targetRir: 2, restSeconds: 75 })),
    exercise('리버스 펙 덱 플라이', 6, sets(2, { setType: 'working', targetWeightKg: null, targetRepsMin: 15, targetRepsMax: 20, targetRir: 2, restSeconds: 75 })),
    exercise('케이블 컬', 7, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 }), '푸시다운과 슈퍼세트'),
    exercise('케이블 트라이셉스 푸시다운', 8, sets(3, { setType: 'working', targetWeightKg: null, targetRepsMin: 10, targetRepsMax: 15, targetRir: 2, restSeconds: 75 }), '컬과 슈퍼세트'),
  ],
}

function cloneSnapshot(snapshot: ProgramRoutineSnapshot) {
  return structuredClone(snapshot)
}

function deload(snapshot: ProgramRoutineSnapshot) {
  const next = cloneSnapshot(snapshot)
  next.description = `${next.description ?? ''} · 근비대 피로 관리 주차(세트 35-50% 감량, RIR 4)`
  next.exercises = next.exercises.map((item) => ({
    ...item,
    sets: item.sets
      .slice(0, Math.max(1, Math.floor(item.sets.length * 0.67)))
      .map((set, index) => ({ ...set, setOrder: index + 1, targetRir: set.targetRir === null ? null : 4 })),
  }))
  return next
}

const shortRunDurations = [20, 25, 30, 20, 30, 35, 20, 20]

function upperHypertrophyWithEasyRun(week: number) {
  const next = cloneSnapshot(upperHypertrophy)
  const durationMinutes = shortRunDurations[week - 1]
  const addStrides = [2, 3, 5, 6].includes(week)
  const runNote = `이지런 ${durationMinutes}분 · RPE 3-4${addStrides ? ' · 마지막에 20초 스트라이드 4회(각 60-90초 걷기·조깅)' : ''}`
  next.description = `${next.description ?? ''} · 상체 웨이트 후 ${runNote}`
  next.exercises.push(exercise(
    '러닝',
    next.exercises.length + 1,
    sets(1, {
      setType: 'working',
      targetWeightKg: null,
      targetRepsMin: null,
      targetRepsMax: null,
      targetDurationSeconds: durationMinutes * 60,
      targetDistanceKm: null,
      targetRir: null,
      restSeconds: null,
      notes: runNote,
    }),
    '상체 운동 후 실시합니다. 숨이 차지만 짧은 문장으로 대화 가능한 강도를 유지하세요.',
  ))
  return next
}

function lowerHypertrophyWithArmVolume(week: number) {
  const next = cloneSnapshot(lowerHypertrophy)
  const armSetsPerExercise = [3, 6].includes(week) ? 4 : 3
  if (armSetsPerExercise === 3) return next

  next.description = `${next.description ?? ''} · 팔 집중 볼륨 주차(이두·삼두 각 8세트)`
  next.exercises = next.exercises.map((item) => {
    if (!['케이블 오버헤드 트라이셉스 익스텐션', '인클라인 덤벨 컬', '케이블 트라이셉스 푸시다운', '케이블 컬'].includes(item.exerciseName)) return item
    const finalSet = item.sets.at(-1)!
    return { ...item, sets: [...item.sets, { ...finalSet, setOrder: 4 }] }
  })
  return next
}

function officeWeekSnapshot(snapshot: ProgramRoutineSnapshot, week: number) {
  const blockWeek = ((week - 1) % 4) + 1
  const targetRir = blockWeek === 1 ? 3 : blockWeek === 2 ? 3 : blockWeek === 3 ? 2 : 4
  const next = cloneSnapshot(snapshot)
  next.description = `${next.description ?? ''} · ${blockWeek === 4 ? '피로 제거 주차' : `블록 ${blockWeek}주차`}`
  next.exercises = next.exercises.map((item) => ({
    ...item,
    sets: item.sets
      .slice(0, blockWeek === 4 ? Math.max(1, Math.floor(item.sets.length * 0.67)) : item.sets.length)
      .map((set, index) => ({ ...set, setOrder: index + 1, targetRir: set.targetRir === null ? null : targetRir })),
  }))
  return next
}

function strengthDay(dayNumber: number, title: string, snapshot: ProgramRoutineSnapshot, instructions: string): StartProgramDayInput {
  return { dayNumber, dayType: 'strength', title, instructions, routineSnapshot: snapshot, cardioTarget: null, isOptional: false }
}

function restDay(dayNumber: number, title = '휴식일', instructions = '계획된 웨이트와 러닝은 없습니다. 가벼운 걷기와 회복에 집중하세요.'): StartProgramDayInput {
  return { dayNumber, dayType: 'rest', title, instructions, routineSnapshot: null, cardioTarget: null, isOptional: false }
}

function runDay(dayNumber: number, distanceKm: number, title = '이지런', rpeMin = 3, rpeMax = 4): StartProgramDayInput {
  return {
    dayNumber,
    dayType: 'cardio',
    title,
    instructions: `${distanceKm}km를 대화 가능한 강도로 달립니다. 통증으로 보행이 달라지면 중단하세요.`,
    routineSnapshot: null,
    cardioTarget: { exerciseName: '러닝', distanceKm, durationMinutes: null, rpeMin, rpeMax },
    isOptional: false,
  }
}

export function buildPlateauBreakProgram(startDate: string): StartProgramRunInput {
  const runDistances = [5, 5, 6, 5, 8, 6, 5, 5]
  const days: StartProgramDayInput[] = []

  for (let week = 1; week <= plateauBreakDurationWeeks; week += 1) {
    const firstDay = (week - 1) * 7 + 1
    const isDeload = week === 4 || week === 8
    const upperVolumeAndRun = upperHypertrophyWithEasyRun(week)
    const lowerVolumeAndArms = lowerHypertrophyWithArmVolume(week)
    days.push(
      strengthDay(firstDay, '상체 강도', isDeload ? deload(upperStrength) : cloneSnapshot(upperStrength), '벤치프레스는 반복 수를 먼저 늘리고 목표 상단에 도달하면 2.5kg 올립니다.'),
      strengthDay(firstDay + 1, '하체 강도', isDeload ? deload(lowerStrength) : cloneSnapshot(lowerStrength), '스쿼트와 RDL은 RIR 2를 지키고 실패 반복을 만들지 않습니다.'),
      restDay(firstDay + 2),
      strengthDay(firstDay + 3, '상체 볼륨 + 이지런', isDeload ? deload(upperVolumeAndRun) : upperVolumeAndRun, '상체 운동 후 처방된 짧은 이지런을 수행합니다. 어깨 통증이 2/10을 넘으면 뉴트럴 그립 프레스로 바꾸고 플라이는 생략합니다.'),
      strengthDay(firstDay + 4, '하체·팔 집중', isDeload ? deload(lowerVolumeAndArms) : lowerVolumeAndArms, '다음 날 장거리 러닝을 위해 하체는 자세가 무너지기 전에 끝내고, 이두·삼두는 두 쌍의 길항 슈퍼세트로 마무리합니다. 8세트 주차에도 팔꿈치 통증이 2/10을 넘거나 반복 수가 2회 이상 급락하면 각 종목 마지막 세트를 생략합니다.'),
      runDay(firstDay + 5, runDistances[week - 1]),
      restDay(firstDay + 6),
    )
  }

  const eventOffset = daysBetween(startDate, programEventDate)
  if (eventOffset >= 0 && eventOffset < days.length) {
    const eventIndex = eventOffset
    days[eventIndex] = runDay(eventIndex + 1, 10, '10km 러닝 이벤트', 5, 7)
    if (eventIndex > 0) days[eventIndex - 1] = restDay(eventIndex, '대회 전 회복', '웨이트를 쉬고 수면·수분·탄수화물 섭취를 평소 수준으로 유지합니다.')
    if (eventIndex + 1 < days.length) days[eventIndex + 1] = restDay(eventIndex + 2, '대회 후 회복', '가벼운 걷기만 허용하고 다리 통증과 피로를 확인합니다.')
  }

  return {
    programKey: plateauBreakProgramKey,
    programName: plateauBreakProgramName,
    templateVersion: plateauBreakTemplateVersion,
    durationWeeks: plateauBreakDurationWeeks,
    startDate,
    days,
  }
}

export function buildUpperSpecializationProgram(startDate: string): StartProgramRunInput {
  const days: StartProgramDayInput[] = []
  for (let week = 1; week <= 8; week += 1) {
    const firstDay = (week - 1) * 7 + 1
    const isDeload = week === 4 || week === 8
    days.push(
      strengthDay(firstDay, '상체 강도', isDeload ? deload(upperStrength) : cloneSnapshot(upperStrength), '벤치프레스와 로우의 반복 수를 먼저 늘립니다.'),
      strengthDay(firstDay + 1, '하체 유지', isDeload ? deload(lowerStrength) : cloneSnapshot(lowerStrength), '하체 강점은 유지하되 실패 세트를 만들지 않습니다.'),
      restDay(firstDay + 2),
      strengthDay(firstDay + 3, '상체 볼륨', isDeload ? deload(upperHypertrophy) : cloneSnapshot(upperHypertrophy), '가슴·등의 긴 가동범위와 안정적인 견갑 움직임을 우선합니다.'),
      restDay(firstDay + 4),
      strengthDay(firstDay + 5, '어깨·팔 보완', isDeload ? deload(upperPump) : cloneSnapshot(upperPump), '짧은 휴식으로 진행하되 목표 RIR을 지킵니다.'),
      restDay(firstDay + 6),
    )
  }
  return { programKey: 'upper-specialization-four-day', programName: '8주 상체 특화 4일', templateVersion: 3, durationWeeks: 8, startDate, days }
}

export function buildBusyFullBodyProgram(startDate: string): StartProgramRunInput {
  const days: StartProgramDayInput[] = []
  for (let week = 1; week <= 8; week += 1) {
    const firstDay = (week - 1) * 7 + 1
    const isDeload = week === 4 || week === 8
    days.push(
      strengthDay(firstDay, '전신 A', isDeload ? deload(fullBodyA) : cloneSnapshot(fullBodyA), '스쿼트와 벤치프레스의 동작 품질을 우선합니다.'),
      restDay(firstDay + 1),
      strengthDay(firstDay + 2, '전신 B', isDeload ? deload(fullBodyB) : cloneSnapshot(fullBodyB), '힌지 피로가 허리에 몰리지 않도록 복압과 템포를 유지합니다.'),
      restDay(firstDay + 3),
      strengthDay(firstDay + 4, '전신 C', isDeload ? deload(fullBodyC) : cloneSnapshot(fullBodyC), '주말 일정 전에 전신 볼륨을 마무리합니다.'),
      restDay(firstDay + 5),
      restDay(firstDay + 6),
    )
  }
  return { programKey: 'busy-full-body-three-day', programName: '8주 바쁜 주간 전신 3일', templateVersion: 3, durationWeeks: 8, startDate, days }
}

export function buildOfficeUpperFourDayProgram(startDate: string): StartProgramRunInput {
  const days: StartProgramDayInput[] = []
  for (let week = 1; week <= 8; week += 1) {
    const firstDay = (week - 1) * 7 + 1
    const isSecondBlock = week >= 5
    const upperA = isSecondBlock ? officeUpperA2 : officeUpperA
    const upperB = isSecondBlock ? officeUpperB2 : officeUpperB
    const lowerCardio = officeLowerCardio(isSecondBlock ? '25-35' : '20-30', isSecondBlock)
    const upperC = isSecondBlock ? officeUpperC2 : officeUpperC
    const phaseInstruction = ((week - 1) % 4) === 3
      ? '전체 세트를 30-40% 줄이고 RIR 4로 피로를 제거합니다.'
      : '모든 세트가 반복 범위 상단에 도달하면 다음 노출에서 최소 단위로 증량합니다.'
    days.push(
      strengthDay(firstDay, isSecondBlock ? '상체 A2' : '상체 A', officeWeekSnapshot(upperA, week), phaseInstruction),
      strengthDay(firstDay + 1, isSecondBlock ? '상체 B2' : '상체 B', officeWeekSnapshot(upperB, week), phaseInstruction),
      restDay(firstDay + 2),
      strengthDay(firstDay + 3, isSecondBlock ? '하체 B + Zone 2' : '하체 + Zone 2', officeWeekSnapshot(lowerCardio, week), '하체는 30-40분 안에 끝내고 숨이 차지만 대화 가능한 Zone 2 유산소를 이어서 수행합니다.'),
      restDay(firstDay + 4),
      strengthDay(firstDay + 5, isSecondBlock ? '상체 C2' : '상체 C', officeWeekSnapshot(upperC, week), phaseInstruction),
      restDay(firstDay + 6),
    )
  }
  return { programKey: officeUpperFourDayProgramKey, programName: officeUpperFourDayProgramName, templateVersion: 2, durationWeeks: 8, startDate, days }
}

export const trainingProgramCatalog: TrainingProgramDefinition[] = [
  {
    key: plateauBreakProgramKey,
    name: plateauBreakProgramName,
    eyebrow: 'PLATEAU BREAK',
    summary: '상·하체 4회에 짧은 이지런과 장거리 러닝을 배치해 주 2회 달립니다.',
    focus: '벤치·스쿼트 정체기 돌파, 팔 약점 보완과 10km 러닝 병행',
    durationWeeks: 8,
    sessionsPerWeek: 5,
    tags: ['2분할', '러닝 주 2회', '팔 보완', '주 5일', '2026 근거 검토'],
    color: '#dc5f2b',
    build: buildPlateauBreakProgram,
  },
  {
    key: 'upper-specialization-four-day',
    name: '8주 상체 특화 4일',
    eyebrow: 'UPPER SPECIALIZATION',
    summary: '상체 3회와 하체 유지 1회로 어깨·팔·등·가슴의 주간 자극을 높입니다.',
    focus: '어깨·팔과 상체 두께 보완, 하체 강점 유지',
    durationWeeks: 8,
    sessionsPerWeek: 4,
    tags: ['상체 특화', '주 4회', '하체 유지', '2026 근거 검토'],
    color: '#2f6f67',
    build: buildUpperSpecializationProgram,
  },
  {
    key: 'busy-full-body-three-day',
    name: '8주 바쁜 주간 전신 3일',
    eyebrow: 'BUSY WEEK',
    summary: '회식과 약속이 많은 주에도 핵심 패턴을 놓치지 않는 전신 3일 구성입니다.',
    focus: '최소 빈도로 전신 근력과 근육량 유지·점진 향상',
    durationWeeks: 8,
    sessionsPerWeek: 3,
    tags: ['전신', '주 3회', '시간 효율', '2026 근거 검토'],
    color: '#b07a27',
    build: buildBusyFullBodyProgram,
  },
  {
    key: officeUpperFourDayProgramKey,
    name: officeUpperFourDayProgramName,
    eyebrow: 'SUSTAINABLE UPPER',
    summary: '상체 3일과 짧은 하체·Zone 2 1일을 두 개의 4주 블록으로 진행합니다.',
    focus: '직장인이 질리지 않고 이어가는 상체 중심 저피로 루틴',
    durationWeeks: 8,
    sessionsPerWeek: 4,
    tags: ['상체 3일', '하체·유산소', '주 4회', '2026 근거 검토'],
    color: '#526ca3',
    build: buildOfficeUpperFourDayProgram,
  },
]

export function getTrainingProgram(key: string) {
  return trainingProgramCatalog.find((program) => program.key === key) ?? trainingProgramCatalog[0]
}

export function programEndDate(startDate: string) {
  return addCalendarDays(startDate, plateauBreakDurationWeeks * 7 - 1)
}
