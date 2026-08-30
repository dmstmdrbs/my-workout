/**
 * 브랜드 심볼과 워드마크의 기하. 앱 안의 `BrandLogo`와 정적 자산을 굽는
 * `scripts/build-brand-assets.mjs`가 **같은 이 파일을** 읽는다. 로고가 두 벌로
 * 갈라지는 것을 막는 것이 이 파일이 따로 있는 이유다.
 *
 * `.mjs` 스크립트가 이 `.ts`를 직접 import 할 수 있는 것은 Node 22의 네이티브
 * 타입 스트리핑 덕분이다(`process.features.typescript === 'strip'`). 그래서
 * 여기에는 **지울 수 있는 문법만** 쓴다 -- enum, namespace, 파라미터 프로퍼티는
 * 넣지 않는다. 넣으면 스크립트가 런타임에 깨진다.
 *
 * 기하 설계 근거는 docs/superpowers/specs/2026-08-30-brand-identity-design.md.
 * 핵심은 체크의 잉크가 y=12.9에서 끝나고 덤벨이 y=14.9에서 시작한다는 것이다.
 * 이 2단위 빈 띠가 16px favicon에서 두 요소가 한 덩어리로 뭉개지지 않게 한다.
 */

export const STROKE_WIDTH = 2.2

export const SYMBOL_VIEWBOX = '0 0 24 24'

/** 체크: 상단. 꼭짓점 (6.5,8.3) → (10,11.8) → (17.5,3.3). */
export const CHECK_PATH = 'M6.5 8.3 L10 11.8 L17.5 3.3'

/** 덤벨: 하단. 바 + 안쪽 플레이트 2 + 바깥 플레이트 2. */
export const DUMBBELL_PATHS: readonly string[] = [
  'M7 18.5 H17',
  'M7 16 V21',
  'M17 16 V21',
  'M3.8 17.25 V19.75',
  'M20.2 17.25 V19.75',
]

/**
 * 앱 아이콘(favicon/PWA)의 고정 색. 테마가 없는 표면이라 굽는 수밖에 없다.
 * 체크는 `--accent`(#2563eb)가 아니라 #3b82f6을 쓴다 -- #2563eb는 #171717
 * 타일 위에서 명도차가 모자라 탁하게 보인다.
 */
export const ICON_COLORS = { tile: '#171717', ink: '#ffffff', accent: '#3b82f6' } as const
