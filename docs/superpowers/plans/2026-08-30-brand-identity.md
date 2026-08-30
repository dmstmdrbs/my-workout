# 브랜드 아이덴티티 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PNG 한 장에 의존하던 Trainlog 브랜드 자산을 단일 SVG 소스로 바꾸고, 헤더·favicon/PWA·로그인 화면·공유 카드 네 면에 일관되게 적용한다.

**Architecture:** 심볼과 워드마크의 SVG 패스 데이터를 `src/components/brandArt.ts` 한 곳에 상수로 둔다. 앱은 `BrandLogo.tsx`가 그 상수로 인라인 SVG를 그려 테마를 따라가게 하고, 정적 파일(favicon, PWA 아이콘)은 `scripts/build-brand-assets.mjs`가 같은 상수를 import해 생성한다. Node 22의 네이티브 타입 스트리핑 덕분에 `.mjs`가 `.ts`를 직접 import하므로, 단일 소스를 유지하면서 새 의존성이 하나도 늘지 않는다.

**Tech Stack:** React 19 + TypeScript, Vite 8, vite-plugin-pwa 1.3, Vitest + Testing Library, `rsvg-convert`(로컬 전용 래스터화)

**Spec:** `docs/superpowers/specs/2026-08-30-brand-identity-design.md`

## Global Constraints

- 새 npm 의존성을 추가하지 않는다. `package.json`·`package-lock.json`을 수정하지 않는다(worktree의 `node_modules`가 메인 체크아웃과 공유되는 심볼릭 링크라 lock 변경은 링크를 거짓으로 만든다).
- `scripts/build-brand-assets.mjs`는 **수동 실행 전용**이다. `npm run build`나 Vercel 빌드 경로에 넣지 않는다.
- 색은 두 값만 참조한다: `currentColor`, `var(--brand-accent, var(--accent))`. 컴포넌트 안에 하드코딩된 색을 두지 않는다.
- 앱 아이콘(favicon/PWA)의 고정 색: 타일 `#171717`, 덤벨 `#ffffff`, 체크 `#3b82f6`. `#2563eb`는 다크 타일 위에서 탁하므로 쓰지 않는다.
- 심볼 `viewBox="0 0 24 24"`, 워드마크 `viewBox="27.7 1.4 97.4 21.1"`. 획은 전부 `stroke-width="2.2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- **심볼과 워드마크를 한 그림에 같이 넣지 않는다.** Task 2 이후 확정된 결정이다(스펙의 "심볼과 워드마크를 나란히 두지 않는 이유" 절). Task 2의 본문에 남아 있는 "록업" 표현은 그 결정 이전에 쓰인 기록이다.
- 커밋 메시지는 conventional commits + 한글 제목. 각 Task 끝에서 커밋한다.
- `brand-preview.local/`은 `.gitignore`의 `*.local` 패턴에 걸리는 시각 검증용 스크래치 디렉터리다. 커밋하지 않는다.

---

### Task 1: 심볼 패스 데이터와 시각 확정

심볼 조형을 먼저 확정한다. 좌표만 보고는 로고를 판단할 수 없으므로, 이 Task의 산출물은 코드가 아니라 **승인된 조형**이다.

**Files:**
- Create: `src/components/brandArt.ts`
- Scratch (커밋 안 함): `brand-preview.local/symbol-check.svg`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `export const SYMBOL_VIEWBOX = '0 0 24 24'`
  - `export const CHECK_PATH: string`
  - `export const DUMBBELL_PATHS: readonly string[]`
  - `export const STROKE_WIDTH = 2.2`
  - `export const ICON_COLORS = { tile: '#171717', ink: '#ffffff', accent: '#3b82f6' } as const`

- [ ] **Step 1: 패스 데이터 파일 생성**

```ts
// src/components/brandArt.ts

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
 * 핵심은 체크의 잉크가 y=13.9에서 끝나고 덤벨이 y=15.9에서 시작한다는 것이다.
 * 이 2단위 빈 띠가 16px favicon에서 두 요소가 한 덩어리로 뭉개지지 않게 한다.
 */

export const STROKE_WIDTH = 2.2

export const SYMBOL_VIEWBOX = '0 0 24 24'

/** 체크: 상단. 꼭짓점 (6.5,9.3) → (10,12.8) → (17.5,4.3). */
export const CHECK_PATH = 'M6.5 9.3 L10 12.8 L17.5 4.3'

/** 덤벨: 하단. 바 + 안쪽 플레이트 2 + 바깥 플레이트 2. */
export const DUMBBELL_PATHS: readonly string[] = [
  'M7 19.5 H17',
  'M7 17 V22',
  'M17 17 V22',
  'M3.8 18.25 V20.75',
  'M20.2 18.25 V20.75',
]

/**
 * 앱 아이콘(favicon/PWA)의 고정 색. 테마가 없는 표면이라 굽는 수밖에 없다.
 * 체크는 `--accent`(#2563eb)가 아니라 #3b82f6을 쓴다 -- #2563eb는 #171717
 * 타일 위에서 명도차가 모자라 탁하게 보인다.
 */
export const ICON_COLORS = { tile: '#171717', ink: '#ffffff', accent: '#3b82f6' } as const
```

- [ ] **Step 2: 검증용 SVG를 만들어 렌더**

`brand-preview.local/symbol-check.svg`를 손으로 쓰지 말고, 위 상수에서 생성한다. 스크래치 스크립트 `brand-preview.local/render.mjs`:

```js
import { writeFileSync } from 'node:fs'
import { CHECK_PATH, DUMBBELL_PATHS, ICON_COLORS, STROKE_WIDTH, SYMBOL_VIEWBOX } from '../src/components/brandArt.ts'

const strokes = DUMBBELL_PATHS.map((d) => `<path d="${d}" stroke="${ICON_COLORS.ink}"/>`).join('')
writeFileSync(
  new URL('./symbol-check.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SYMBOL_VIEWBOX}">`
    + `<rect width="24" height="24" fill="${ICON_COLORS.tile}"/>`
    + `<g fill="none" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">`
    + `<path d="${CHECK_PATH}" stroke="${ICON_COLORS.accent}"/>${strokes}</g></svg>`,
)
```

- [ ] **Step 3: 세 크기로 래스터화해 눈으로 확인**

```bash
node brand-preview.local/render.mjs
rsvg-convert brand-preview.local/symbol-check.svg -w 512 -h 512 -o brand-preview.local/s512.png
rsvg-convert brand-preview.local/symbol-check.svg -w 48 -h 48 -o brand-preview.local/s48.png
rsvg-convert brand-preview.local/symbol-check.svg -w 16 -h 16 -o brand-preview.local/s16.png
sips -Z 320 brand-preview.local/s16.png --out brand-preview.local/s16-zoom.png
```

확인 기준 — 셋 다 만족해야 다음 Task로 간다:
1. 16px에서 체크와 덤벨 사이에 **눈에 보이는 어두운 틈**이 남는다.
2. 16px에서 덤벨의 바깥 플레이트 2개가 사라지거나 안쪽 플레이트와 붙지 않는다.
3. 512px에서 광학 중심이 캔버스 중앙에 온다. 아래로 처져 보이면 전체를 위로 최대 1단위 옮긴다(모든 y좌표에서 동일한 값을 뺀다 — 요소별로 다르게 옮기면 2단위 빈 띠가 깨진다).

- [ ] **Step 4: 사용자에게 렌더 결과를 보여주고 조형 승인을 받는다**

512/48/16px 이미지를 사용자가 볼 수 있게 제시한다. **승인 없이 Task 2로 넘어가지 않는다.** 수정 요청이 오면 Step 1의 좌표를 고치고 Step 2~4를 반복한다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/brandArt.ts
git commit -m "feat: 브랜드 심볼 패스 데이터를 단일 소스로 둔다"
```

---

### Task 2: 워드마크 패스 데이터와 시각 확정

**Files:**
- Modify: `src/components/brandArt.ts`
- Scratch: `brand-preview.local/`

**Interfaces:**
- Consumes: Task 1의 `STROKE_WIDTH`, `CHECK_PATH`, `DUMBBELL_PATHS`
- Produces:
  - `export const LOCKUP_VIEWBOX = '0 0 126 24'`
  - `export const WORDMARK_INK_PATHS: readonly string[]` — `train` (본문색)
  - `export const WORDMARK_ACCENT_PATHS: readonly string[]` — `log` (accent색)
  - `export const WORDMARK_DOT = { cx: 67, cy: 3.6, r: 1.1 } as const` — `i`의 점(획이 아니라 채움)

- [ ] **Step 1: 워드마크 상수를 추가**

`src/components/brandArt.ts`에 이어서 붙인다.

```ts
/**
 * 워드마크 "trainlog": 모노라인 지오메트릭 소문자. 획 굵기를 심볼과 같은
 * 2.2로 맞춰 심볼과 워드마크가 한 몸으로 읽히게 하는 것이 이 형태를 고른
 * 이유다. 아웃라인으로 고정하는 이유는 앱이 Inter/Pretendard를 선언만 하고
 * 로드하지 않기 때문 -- 텍스트로 두면 워드마크가 기기마다 다른 폰트로 나온다.
 *
 * 그리드: 베이스라인 y=19, x-하이트 상단 y=7(높이 12), 어센더 상단 y=3.5,
 * 디센더 하단 y=22.4, 볼 반지름 6(중심 y=13). 심볼과 같은 단위계다.
 */
export const LOCKUP_VIEWBOX = '0 0 126 24'

/** t r a i n -- 본문색(currentColor). */
export const WORDMARK_INK_PATHS: readonly string[] = [
  'M32 3.5 V16.6 C32 18.1 33.1 19 34.6 19',   // t 스템 + 발
  'M28.8 7 H35.2',                             // t 크로스바
  'M40.4 19 V7',                               // r 스템
  'M40.4 10.8 C40.4 8.7 42.1 7 44.2 7',        // r 아치
  'M61.8 13 A6 6 0 0 1 49.8 13 A6 6 0 0 1 61.8 13', // a 볼
  'M61.8 7 V19',                               // a 스템
  'M67 19 V7',                                 // i 스템
  'M72.2 19 V12 A5 5 0 0 1 82.2 12 V19',       // n
]

/** l o g -- accent색. "기록"이 제품의 핵심이라는 것을 색으로 집는다. */
export const WORDMARK_ACCENT_PATHS: readonly string[] = [
  'M87.4 3.5 V16.6 C87.4 18.1 88.5 19 90 19',        // l
  'M106.8 13 A6 6 0 0 1 94.8 13 A6 6 0 0 1 106.8 13', // o
  'M124 13 A6 6 0 0 1 112 13 A6 6 0 0 1 124 13',      // g 볼
  'M124 7 V20 C124 21.6 122.7 22.4 121.2 22.4',       // g 디센더
]

/** i의 점. 유일하게 획이 아니라 채움으로 그리는 요소다. */
export const WORDMARK_DOT = { cx: 67, cy: 3.6, r: 1.1 } as const
```

주의: `l`은 accent 그룹의 첫 요소다. 색 분할이 `train` / `log`이므로 `l`부터 accent다.

- [ ] **Step 2: 록업 렌더 스크립트로 확인**

`brand-preview.local/render.mjs`를 확장해 록업 SVG도 생성한다. 라이트 배경(#ffffff, 잉크 #18181b, accent #2563eb)과 다크 배경(#18181b, 잉크 #fafafa, accent #60a5fa) 두 벌을 만든다.

```bash
node brand-preview.local/render.mjs
rsvg-convert brand-preview.local/lockup-light.svg -w 630 -o brand-preview.local/lockup-light.png
rsvg-convert brand-preview.local/lockup-dark.svg  -w 630 -o brand-preview.local/lockup-dark.png
rsvg-convert brand-preview.local/lockup-light.svg -w 189 -o brand-preview.local/lockup-small.png
```

확인 기준:
1. 글자가 서로 붙거나 벌어지지 않는다. 인접 글자의 잉크 간격이 눈에 띄게 들쭉날쭉하면 x좌표를 조정한다(스펙의 리듬은 잉크 사이 3단위).
2. `train`과 `log`의 색 경계가 `n`과 `l` 사이에 온다.
3. 189px 폭(헤더 실제 크기의 3배)에서 `a`, `o`, `g`의 볼 속이 막혀 보이지 않는다.
4. 심볼과 워드마크의 획 굵기가 같아 보인다. 워드마크가 가늘어 보이면 **심볼이 아니라 워드마크의** 굵기를 올리지 말고, 먼저 두 요소의 크기 비를 의심한다.

- [ ] **Step 3: 사용자에게 록업을 보여주고 승인을 받는다**

라이트/다크 록업과 작은 크기 렌더를 제시한다. **승인 없이 Task 3으로 넘어가지 않는다.**

- [ ] **Step 4: 커밋**

```bash
git add src/components/brandArt.ts
git commit -m "feat: 워드마크 패스 데이터를 추가한다"
```

---

### Task 3: `BrandLogo` 컴포넌트

**Files:**
- Create: `src/components/BrandLogo.tsx`
- Create: `src/components/BrandLogo.css`
- Test: `src/test/brand-logo.test.tsx`

**Interfaces:**
- Consumes: Task 1·2의 `brandArt.ts` 상수 전부
- Produces:
  - `export function BrandLogo(props: { variant?: 'wordmark' | 'symbol'; className?: string; title?: string }): JSX.Element`
  - `export const WORDMARK_VIEWBOX = '27.7 1.4 97.4 21.1'` (`brandArt.ts`에 추가)

> **Task 2 이후 바뀐 결정 — 록업은 만들지 않는다.** 원안은 심볼+워드마크를 한
> 록업으로 묶으려 했으나, 31px 헤더 크기로 렌더해 보니 세로로 쌓인 심볼이
> 뭉개져 폐기했다(스펙의 "심볼과 워드마크를 나란히 두지 않는 이유" 절 참조).
> 그래서 variant는 `'lockup'`이 아니라 `'wordmark'`이고, 기본값도 `'wordmark'`다.
> `LOCKUP_VIEWBOX`는 더 이상 쓰이지 않으므로 `brandArt.ts`에서 **삭제**하고,
> 잉크 경계에 맞춘 `WORDMARK_VIEWBOX`를 대신 넣는다.

- [ ] **Step 0: `brandArt.ts`의 viewBox를 록업에서 워드마크로 바꾼다**

`LOCKUP_VIEWBOX`를 지우고 그 자리에 아래를 넣는다. 값은 워드마크 잉크의 실제
경계다 — 왼쪽은 `t` 크로스바(28.8 − 1.1), 오른쪽은 `g` 볼(124 + 1.1), 위는
어센더(2.5 − 1.1), 아래는 디센더(21.4 + 1.1).

```ts
/**
 * 워드마크의 viewBox. 록업(심볼+글자)을 만들지 않기로 해서, 캔버스를 잉크의
 * 실제 경계에 맞춘다. 가로세로비가 약 4.6:1이라 헤더에서는 높이가 아니라
 * 폭이 배치를 지배한다.
 */
export const WORDMARK_VIEWBOX = '27.7 1.4 97.4 21.1'
```

그 위의 워드마크 doc 주석에서 록업을 전제한 문장이 있으면 함께 고친다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```tsx
// src/test/brand-logo.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { BrandLogo } from '../components/BrandLogo'

describe('BrandLogo', () => {
  test('title을 주면 이름을 가진 이미지로 노출된다', () => {
    render(<BrandLogo title="Trainlog" />)
    expect(screen.getByRole('img', { name: 'Trainlog' })).toBeTruthy()
  })

  test('title이 없으면 장식으로 취급돼 접근성 트리에서 빠진다', () => {
    const { container } = render(<BrandLogo />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  test('기본 variant는 워드마크다', () => {
    const { container } = render(<BrandLogo />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('27.7 1.4 97.4 21.1')
    expect(svg?.querySelector('circle')).not.toBeNull() // i의 점 = 워드마크가 있다
  })

  test('symbol variant는 정사각 심볼만 그린다', () => {
    const { container } = render(<BrandLogo variant="symbol" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg?.querySelector('circle')).toBeNull() // i의 점이 없다 = 워드마크가 없다
  })

  test('두 variant는 서로 다른 패스를 그린다', () => {
    const wordmark = render(<BrandLogo />).container.querySelectorAll('path').length
    const symbol = render(<BrandLogo variant="symbol" />).container.querySelectorAll('path').length
    expect(wordmark).toBe(12) // ink 8 + accent 4
    expect(symbol).toBe(6)    // check 1 + dumbbell 5
  })

  test('className을 주면 기본 클래스와 함께 붙는다', () => {
    const { container } = render(<BrandLogo className="share-card-logo" />)
    const className = container.querySelector('svg')?.getAttribute('class')
    expect(className).toContain('brand-logo')
    expect(className).toContain('share-card-logo')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test -- src/test/brand-logo.test.tsx --reporter=verbose`
Expected: FAIL — `Failed to resolve import "../components/BrandLogo"`

- [ ] **Step 3: 컴포넌트를 구현한다**

```tsx
// src/components/BrandLogo.tsx
import {
  CHECK_PATH,
  DUMBBELL_PATHS,
  STROKE_WIDTH,
  SYMBOL_VIEWBOX,
  WORDMARK_ACCENT_PATHS,
  WORDMARK_DOT,
  WORDMARK_INK_PATHS,
  WORDMARK_VIEWBOX,
} from './brandArt'
import './BrandLogo.css'

/**
 * 브랜드 로고. 앱 안에서 로고가 나오는 모든 자리가 이 컴포넌트를 쓴다.
 *
 * 심볼과 워드마크는 **한 그림에 같이 놓지 않는다**. 심볼은 체크가 위, 덤벨이
 * 아래로 쌓인 구조라, 가로 록업에 넣으면 두 요소가 각각 글자 하나보다 작아져
 * 헤더 크기(31px)에서 뭉개진다. 심볼은 정사각 앱 아이콘에서, 워드마크는 가로로
 * 긴 헤더에서 각자 제 몫을 한다.
 *
 * 인라인 SVG인 이유가 두 개 있다. (1) 외부 CSS가 닿아야 `currentColor`로
 * 테마를 따라간다 -- `<img src>` 안의 SVG에는 페이지 CSS가 닿지 않아 다크/
 * 라이트 두 벌을 따로 관리해야 한다. (2) 공유 카드가 `html-to-image`로
 * 캡처되는데, 인라인이면 외부 리소스 로딩을 기다릴 필요가 없다. 스프라이트
 * `<use>`는 html-to-image가 외부 문서 참조를 따라가지 못해 빈칸이 된다.
 *
 * 색은 두 값만 본다. 덤벨과 `train`은 `currentColor`, 체크와 `log`는
 * `--brand-accent`(없으면 `--accent`). 항상 어두운 공유 카드처럼 테마를
 * 따르면 안 되는 표면은 이 두 값을 CSS에서 덮어쓴다.
 */

type BrandLogoProps = {
  variant?: 'wordmark' | 'symbol'
  className?: string
  /** 주면 로고가 그 이름을 가진 이미지가 된다. 없으면 장식으로 숨는다. */
  title?: string
}

const ACCENT = 'var(--brand-accent, var(--accent))'

export function BrandLogo({ variant = 'wordmark', className, title }: BrandLogoProps) {
  const isSymbol = variant === 'symbol'
  return (
    <svg
      className={className ? `brand-logo ${className}` : 'brand-logo'}
      viewBox={isSymbol ? SYMBOL_VIEWBOX : WORDMARK_VIEWBOX}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      fill="none"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title ? <title>{title}</title> : null}
      {isSymbol ? (
        <>
          <path d={CHECK_PATH} stroke={ACCENT} />
          {DUMBBELL_PATHS.map((d) => <path d={d} key={d} stroke="currentColor" />)}
        </>
      ) : (
        <>
          {WORDMARK_INK_PATHS.map((d) => <path d={d} key={d} stroke="currentColor" />)}
          <circle cx={WORDMARK_DOT.cx} cy={WORDMARK_DOT.cy} r={WORDMARK_DOT.r} fill="currentColor" stroke="none" />
          {WORDMARK_ACCENT_PATHS.map((d) => <path d={d} key={d} stroke={ACCENT} />)}
        </>
      )}
    </svg>
  )
}
```

```css
/* src/components/BrandLogo.css */

/*
 * 크기는 호출부의 font-size가 정한다. height: 1em 이면 로고가 옆 텍스트의
 * 크기를 따라가고, 헤더에서 rem 값 하나만 만지면 심볼과 워드마크가 같은
 * 비율로 함께 움직인다.
 */
.brand-logo { display: block; width: auto; height: 1em; }
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npm test -- src/test/brand-logo.test.tsx --reporter=verbose`
Expected: PASS — 5개 테스트 전부

- [ ] **Step 5: 커밋**

```bash
git add src/components/BrandLogo.tsx src/components/BrandLogo.css src/test/brand-logo.test.tsx
git commit -m "feat: BrandLogo 컴포넌트를 추가한다"
```

---

### Task 4: 헤더 적용 (데스크톱 + 모바일)

**Files:**
- Modify: `src/App.tsx` — `.brand-mark`(268행 부근), `.mobile-brand`(317행 부근)
- Modify: `src/App.css` — 15행

**Interfaces:**
- Consumes: `BrandLogo` (Task 3)
- Produces: 없음 (표면 적용)

> **`BrandIcon`은 이 Task에서 지우지 않는다.** `AuthLoading`과 `SignInGate`가 아직
> 그것을 쓰고 있어서, 지우면 Task 5까지 컴파일이 깨진 채로 남는다. 삭제는 마지막
> 호출부가 사라지는 Task 5에서 한다. 같은 이유로 `.brand-symbol` CSS 규칙도 여기서
> 건드리지 않는다.

- [ ] **Step 1: `BrandLogo`를 import**

`src/App.tsx`의 import 목록에 추가한다.

```tsx
import { BrandLogo } from './components/BrandLogo'
```

- [ ] **Step 2: 데스크톱 사이드바 브랜드를 교체**

기존:

```tsx
<div className="brand-mark" aria-label="Trainlog 홈">
  <BrandIcon />
  <span>trainlog</span>
</div>
```

교체:

```tsx
<div className="brand-mark">
  <BrandLogo title="Trainlog" />
</div>
```

`aria-label`을 제거하는 이유: 클릭 불가한 `div`에 붙어 있어 의미가 약했다. 이제 로고 자체가 `<title>Trainlog</title>`로 이름을 갖는다.

- [ ] **Step 3: 모바일 상단바 브랜드를 교체**

기존:

```tsx
<div className="mobile-brand">trainlog</div>
```

교체:

```tsx
<div className="mobile-brand"><BrandLogo title="Trainlog" /></div>
```

- [ ] **Step 4: CSS를 정리**

`src/App.css` 15행을 아래로 교체한다. 16~17행의 `.brand-symbol` 규칙은 아직 `AuthLoading`·`SignInGate`가 쓰고 있으므로 **남겨둔다**(Task 5에서 지운다).

```css
.brand-mark, .mobile-brand { display: flex; align-items: center; color: var(--text); font-size: 1.18rem; }
```

`gap`·`font-weight`·`letter-spacing`은 텍스트 워드마크가 사라져 쓸 데가 없다. `font-size`는 남긴다 — `.brand-logo`의 `height: 1em`이 이 값을 크기 조절 레버로 쓴다.

- [ ] **Step 5: 기존 테스트가 깨지지 않는지 확인**

Run: `npm test -- --reporter=verbose`
Expected: PASS — 전부. 브랜드 자산을 참조하는 기존 테스트는 없음이 확인됐으므로 회귀가 나면 그것은 이 Task가 만든 것이다.

- [ ] **Step 6: dev 서버로 눈 검증**

```bash
npm run dev
```

확인: 데스크톱 사이드바 로고, 390px 모바일 상단바 로고, 라이트/다크 전환 시 `train`은 본문색·`log`는 accent로 따라오는지. 라이트에서 검은 사각형 타일이 더는 보이지 않아야 한다. 모바일 상단바에서 워드마크가 좌우로 넘치지 않는지도 본다 — 워드마크는 가로세로비 4.6:1이라 높이보다 폭이 문제가 된다.

- [ ] **Step 7: 커밋**

```bash
git add src/App.tsx src/App.css
git commit -m "feat: 헤더 브랜드를 BrandLogo로 통일한다"
```

---

### Task 5: 로그인·로딩 화면 적용

**Files:**
- Modify: `src/App.tsx` — `AuthLoading`(448행 부근), `SignInGate`(454행 부근), `BrandIcon` 정의(468행 부근) 삭제
- Modify: `src/App.css` — 16~17행 삭제, 51행, 58행

**Interfaces:**
- Consumes: `BrandLogo` (Task 3)
- Produces: 없음

- [ ] **Step 1: `AuthLoading`의 브랜드를 교체**

```tsx
function AuthLoading() {
  return <main className="auth-gate" aria-label="로그인 상태를 확인하는 중">
    <div className="auth-gate-card"><BrandLogo title="Trainlog" /><p>안전하게 운동 기록을 불러오는 중…</p></div>
  </main>
}
```

- [ ] **Step 2: `SignInGate`의 브랜드를 교체하고 중복 문구를 뺀다**

기존은 `<BrandIcon />` 바로 아래에 `<p className="eyebrow">TRAINLOG</p>`가 있다. 워드마크가 이미 이름을 담으므로 이 eyebrow는 같은 말을 두 번 하는 것이 된다. 함께 지운다.

```tsx
<section className="auth-gate-card">
  <BrandLogo title="Trainlog" />
  <h1 id="sign-in-title">나의 트레이닝을 이어가세요.</h1>
  ...
```

- [ ] **Step 3: `BrandIcon`을 삭제한다**

마지막 호출부가 사라졌으므로 `src/App.tsx`에서 아래 함수를 통째로 지운다.

```tsx
function BrandIcon() {
  return <span className="brand-symbol" aria-hidden="true"><img src="/trainlog-icon.png" alt="" /></span>
}
```

- [ ] **Step 4: CSS 선택자를 갱신**

`src/App.css` 16~17행의 `.brand-symbol` 두 규칙을 삭제한다(참조가 모두 사라졌다).

```css
.brand-symbol { display: grid; place-items: center; width: 31px; height: 31px; overflow: hidden; border-radius: 9px; }
.brand-symbol img { display: block; width: 100%; height: 100%; object-fit: cover; }
```

51행과 58행의 `.brand-symbol`을 `.brand-logo`로 바꾸고, 워드마크는 정사각 심볼보다 훨씬 가로로 기므로 높이를 명시한다(높이 26px이면 폭은 약 120px이 된다).

```css
.auth-gate-card > .brand-logo { height: 26px; margin-bottom: 28px; }
.auth-gate[aria-label] .auth-gate-card > .brand-logo { height: 22px; margin-bottom: 14px; }
```

- [ ] **Step 5: 테스트**

Run: `npm test -- src/test/signout-flows.test.tsx --reporter=verbose`
Expected: PASS. 로그인 게이트를 거치는 플로우가 이 파일에 있다. 실패하면 `TRAINLOG` eyebrow 텍스트를 찾던 단언이 있는지부터 본다.

- [ ] **Step 6: 눈 검증**

`npm run dev` 상태에서 로그아웃해 로그인 게이트를, 새로고침 순간에 로딩 화면을 확인한다. 로고가 카드 안에서 잘리지 않아야 한다.

- [ ] **Step 7: 커밋**

```bash
git add src/App.tsx src/App.css
git commit -m "feat: 로그인·로딩 화면에 BrandLogo를 적용한다"
```

---

### Task 6: 공유 카드 적용

**Files:**
- Modify: `src/features/records/WorkoutShareCard.tsx:16`
- Modify: `src/features/records/Records.css` — 56~58행, 89~91행

**Interfaces:**
- Consumes: `BrandLogo` (Task 3)
- Produces: 없음

- [ ] **Step 1: 록업을 교체**

`WorkoutShareCard.tsx`에 import를 추가하고,

```tsx
import { BrandLogo } from '../../components/BrandLogo'
```

16행을 바꾼다.

```tsx
<div className="share-card-brand-lockup"><BrandLogo /></div>
```

`title`을 주지 않는다 — 카드 전체가 이미 `aria-label`로 설명되고 있어 로고는 장식이다.

- [ ] **Step 2: 고정 색을 CSS에서 지정**

공유 카드는 테마와 무관하게 항상 어둡다. `currentColor`와 `--brand-accent`를 여기서 못박는다. `Records.css` 56~58행을 교체:

```css
.share-card-brand-lockup { display: flex; align-items: center; color: #f8fafc; --brand-accent: #3b82f6; }
.share-card-brand-lockup .brand-logo { height: 15px; }
```

89~91행(내보내기용 큰 카드)을 교체:

```css
.share-card-export-target .share-card-brand-lockup .brand-logo { height: 21px; }
```

- [ ] **Step 3: 공유 카드 테스트**

Run: `npm test -- src/test/share-card-one-rep-max-flows.test.tsx --reporter=verbose`
Expected: PASS

- [ ] **Step 4: 실제 PNG 내보내기 확인**

`npm run dev`에서 기록 상세 → 공유 → PNG 내보내기를 실행하고 저장된 이미지를 연다. 확인 기준: 로고가 **빈칸이 아니고**, 흰색 덤벨/`train` + 파란 체크/`log`로 나오며, 카드 헤더에서 잘리지 않는다. 빈칸이면 `html-to-image`가 인라인 SVG를 놓친 것이므로 즉시 보고한다.

- [ ] **Step 5: 커밋**

```bash
git add src/features/records/WorkoutShareCard.tsx src/features/records/Records.css
git commit -m "feat: 공유 카드 브랜드 록업을 BrandLogo로 바꾼다"
```

---

### Task 7: 정적 자산 생성 스크립트와 favicon·PWA 배선

**Files:**
- Create: `scripts/build-brand-assets.mjs`
- Create (스크립트 산출물, 커밋함): `public/favicon.svg`(교체), `public/apple-touch-icon.png`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`
- Delete: `public/trainlog-icon.png`, `public/icons.svg`
- Modify: `index.html:5`
- Modify: `vite.config.ts` — manifest
- Modify: `src/lib/restAlerts.ts:38-39` — 알림 아이콘을 새 자산으로
- Test: `src/test/rest-alert-flows.test.ts` — 아이콘 경로 회귀 테스트 추가

**Interfaces:**
- Consumes: `brandArt.ts`의 `CHECK_PATH`, `DUMBBELL_PATHS`, `ICON_COLORS`, `STROKE_WIDTH`, `SYMBOL_VIEWBOX`
- Produces: `public/`의 정적 브랜드 자산

- [ ] **Step 1: 생성 스크립트를 쓴다**

```js
// scripts/build-brand-assets.mjs
/**
 * favicon과 PWA 아이콘을 `src/components/brandArt.ts`의 심볼 패스에서 굽는다.
 *
 * **수동 실행 전용이다.** `npm run build`에 넣지 않는다 -- 그러면 Vercel 빌드가
 * librsvg에 의존하게 되고, 배포가 로컬에만 있는 도구 때문에 깨질 수 있다.
 * 산출물은 public/ 에 커밋해서 빌드가 파일만 복사하면 되게 둔다.
 *
 * 실행: node scripts/build-brand-assets.mjs
 * 필요: rsvg-convert (brew install librsvg)
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CHECK_PATH,
  DUMBBELL_PATHS,
  ICON_COLORS,
  STROKE_WIDTH,
  SYMBOL_VIEWBOX,
} from '../src/components/brandArt.ts'

const publicDir = fileURLToPath(new URL('../public/', import.meta.url))

function requireRsvg() {
  try {
    execFileSync('rsvg-convert', ['--version'], { stdio: 'ignore' })
  } catch {
    console.error('rsvg-convert 가 필요합니다. 설치: brew install librsvg')
    process.exit(1)
  }
}

/**
 * @param {object} options
 * @param {number} options.inset 심볼을 캔버스 안쪽으로 밀어넣는 비율.
 *   maskable 아이콘은 Android가 가장자리를 잘라내므로 0.1(=콘텐츠 80%)을 준다.
 * @param {number} options.radius 타일 모서리 반경(24 단위 기준). 0이면 각진 사각형.
 */
function symbolSvg({ inset = 0, radius = 0 } = {}) {
  const scale = 1 - inset * 2
  const offset = 24 * inset
  const strokes = DUMBBELL_PATHS.map((d) => `<path d="${d}" stroke="${ICON_COLORS.ink}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SYMBOL_VIEWBOX}">`
    + `<rect width="24" height="24" rx="${radius}" fill="${ICON_COLORS.tile}"/>`
    + `<g transform="translate(${offset} ${offset}) scale(${scale})"`
    + ` fill="none" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">`
    + `<path d="${CHECK_PATH}" stroke="${ICON_COLORS.accent}"/>${strokes}`
    + `</g></svg>`
}

function writePng(svg, size, name) {
  const dir = mkdtempSync(path.join(tmpdir(), 'trainlog-brand-'))
  const svgPath = path.join(dir, 'icon.svg')
  writeFileSync(svgPath, svg)
  execFileSync('rsvg-convert', [svgPath, '-w', String(size), '-h', String(size), '-o', path.join(publicDir, name)])
  rmSync(dir, { recursive: true, force: true })
  console.log(`  ${name} (${size}x${size})`)
}

requireRsvg()
console.log('브랜드 자산 생성:')

// favicon 은 브라우저 탭에서 각진 사각형으로 보이므로 모서리를 둥글린다.
writeFileSync(path.join(publicDir, 'favicon.svg'), symbolSvg({ radius: 5 }))
console.log('  favicon.svg')

writePng(symbolSvg({ radius: 5 }), 180, 'apple-touch-icon.png')
writePng(symbolSvg({ radius: 5 }), 192, 'icon-192.png')
writePng(symbolSvg({ radius: 5 }), 512, 'icon-512.png')
// maskable 은 OS 가 자기 모양으로 자른다. 모서리를 둥글리지 않고 꽉 채우되,
// 심볼은 안전 영역(80%) 안으로 넣는다.
writePng(symbolSvg({ inset: 0.1, radius: 0 }), 512, 'icon-maskable-512.png')

console.log('완료. 산출물을 커밋하세요.')
```

- [ ] **Step 2: 스크립트를 실행하고 산출물을 확인**

```bash
node scripts/build-brand-assets.mjs
ls -la public/
rsvg-convert public/favicon.svg -w 16 -h 16 -o brand-preview.local/fav16.png
sips -Z 320 brand-preview.local/fav16.png --out brand-preview.local/fav16-zoom.png
```

확인: 5개 파일이 생기고, 16px favicon이 Task 1에서 승인받은 모양과 같다. maskable은 심볼이 눈에 띄게 작고 여백이 넓어야 정상이다.

- [ ] **Step 3: `index.html`의 favicon 링크를 바꾼다**

5행을 교체한다.

```html
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

- [ ] **Step 4: PWA manifest에 아이콘을 넣는다**

`vite.config.ts`의 `manifest` 객체에서 `start_url: '/',` 다음에 추가한다.

```ts
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
```

- [ ] **Step 5: 휴식 알림의 아이콘을 새 자산으로 옮긴다**

`src/lib/restAlerts.ts:38-39`가 휴식 완료 알림의 `icon`과 `badge`로
`/trainlog-icon.png`를 쓴다. **이 파일을 지우기 전에 여기를 먼저 옮겨야 한다** —
안 옮기면 알림 아이콘이 조용히 깨진다. 예외도 나지 않고, 이를 잡는 테스트도 없다.

```ts
    icon: '/icon-192.png',
    badge: '/icon-192.png',
```

SVG가 아니라 PNG를 쓰는 이유: 브라우저 알림의 아이콘 SVG 지원이 고르지 않다.
`icon`과 `badge`를 같은 파일로 두던 기존 동작은 그대로 유지한다.

그리고 이 결합을 고정하는 회귀 테스트를 `src/test/rest-alert-flows.test.ts`에
추가한다. 지금은 아이콘 경로를 검증하는 테스트가 하나도 없어서, 자산 이름이
바뀌면 아무도 모르게 깨진다.

```ts
test('휴식 완료 알림은 public/ 에 실재하는 아이콘을 가리킨다', async () => {
  // 이 경로는 scripts/build-brand-assets.mjs 가 만드는 파일 이름과 묶여 있다.
  // 자산 이름을 바꾸면 여기도 함께 바꿔야 알림 아이콘이 살아 있다.
  const shown = vi.fn()
  // ... 기존 파일의 알림 목 설정 방식을 따른다 ...
  expect(shown.mock.calls[0][1]).toMatchObject({
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  })
})
```

기존 파일이 `Notification`과 `serviceWorker.getRegistration`을 어떻게 목킹하는지
먼저 읽고, 그 방식을 그대로 재사용한다. 새 목킹 패턴을 만들지 않는다.

- [ ] **Step 6: 참조가 사라졌는지 확인하고 죽은 파일을 지운다**

`index.html`, manifest, `restAlerts.ts`를 모두 새 자산으로 바꿨으므로, 이제 옛
파일을 가리키는 곳이 없어야 한다.

```bash
grep -rn "trainlog-icon\|icons.svg" --include="*.tsx" --include="*.ts" --include="*.css" --include="*.html" src index.html vite.config.ts
```

Expected: 결과 없음. 결과가 나오면 그 참조를 먼저 정리하고 다시 확인한다.

```bash
git rm public/trainlog-icon.png public/icons.svg
```

- [ ] **Step 7: 빌드 산출물에 아이콘이 들어갔는지 확인**

```bash
npm run build
cat dist/manifest.webmanifest
ls dist/icon-*.png dist/favicon.svg dist/apple-touch-icon.png
```

Expected: `manifest.webmanifest`의 `icons` 배열에 3개 항목이 있고, `dist/`에 파일이 복사돼 있다.

- [ ] **Step 8: 커밋**

```bash
git add scripts/build-brand-assets.mjs public index.html vite.config.ts src/lib/restAlerts.ts src/test/rest-alert-flows.test.ts
git commit -m "feat: favicon과 PWA 아이콘을 브랜드 심볼에서 생성한다"
```

---

### Task 8: 전체 검증

**Files:** 없음 (검증 전용)

**Interfaces:**
- Consumes: Task 1~7 전부
- Produces: 검증 결과 보고

- [ ] **Step 1: 정적 검사 4종을 모두 돌린다**

```bash
npm run lint
npx tsc -b
npm test -- --reporter=verbose
npm run build
```

넷 다 통과해야 한다. 하나라도 실패하면 그 자리에서 고치고 처음부터 다시 돌린다. **부분 통과를 "통과"라고 보고하지 않는다.**

- [ ] **Step 2: 참조가 남지 않았는지 확인**

```bash
grep -rn "trainlog-icon\|brand-symbol\|BrandIcon" --include="*.tsx" --include="*.ts" --include="*.css" --include="*.html" src index.html
```

Expected: 결과 없음.

- [ ] **Step 3: 네 표면을 눈으로 확인한다**

`npm run dev`로 띄우고 각각 확인한다. 모바일은 390px 폭 기준으로 본다.

| 표면 | 확인 |
| --- | --- |
| 데스크톱 사이드바 | 워드마크가 라이트/다크 모두에서 자연스럽고, 검은 타일이 뜨지 않는다 |
| 모바일 상단바 | 워드마크가 폭 390px에서 상단바 밖으로 넘치지 않는다 |
| 로그인 게이트 | 워드마크가 잘리지 않고, `TRAINLOG` eyebrow 중복이 사라졌다 |
| 공유 PNG | 내보낸 이미지에 로고가 빈칸 아닌 정상 상태로 들어간다 |
| 브라우저 탭 | favicon이 새 심볼이다(보라 번개가 아니다) |

- [ ] **Step 4: 스크래치 디렉터리를 지운다**

```bash
rm -rf brand-preview.local
git status --short
```

Expected: 커밋되지 않은 변경이 없다.

- [ ] **Step 5: 브랜치를 푸시한다**

```bash
git push -u origin feature/brand-identity
```

- [ ] **Step 6: 검증 결과를 사용자에게 보고한다**

실행한 명령과 실제 출력을 근거로 보고한다. 확인하지 못한 항목은 "확인 못 했다"고 명시한다. PR 생성은 사용자 지시가 있을 때만 한다.
