# Trainlog 브랜드 아이덴티티 설계

작성일: 2026-08-30

## 배경

Trainlog의 브랜드 자산은 `public/trainlog-icon.png` 한 장이 전부다. 그 한 장으로
헤더·로그인 화면·공유 카드를 모두 처리하다 보니 다음 문제가 쌓였다.

- **라이트 테마에서 이물감.** PNG는 다크 라운드 타일이 배경에 구워져 있다. 흰
  사이드바 위에 검은 사각형이 떠 있는 모양이 된다.
- **PWA 아이콘 부재.** `vite.config.ts`의 manifest에 `icons` 배열이 없다. 홈 화면에
  추가하면 아이콘이 나오지 않는다. `apple-touch-icon`도 없다.
- **미사용 잔재.** `public/favicon.svg`는 보라색(#863bff) 번개 아이콘으로 Trainlog와
  무관하고, `index.html`이 favicon으로 PNG를 가리키므로 어디에서도 쓰이지 않는다.
- **헤더 불일치.** 데스크톱 `.brand-mark`는 아이콘+텍스트, 모바일 `.mobile-brand`는
  텍스트만이다. 모바일에서 심볼이 사라진다.
- **워드마크가 기기마다 다름.** `font-family: Inter, Pretendard, ...`로 선언돼 있으나
  두 폰트 모두 로드되지 않는다(`@font-face`·CDN 링크·패키지 전부 없음). "trainlog"는
  실제로는 macOS에서 SF Pro, Windows에서 Segoe UI, Android에서 Roboto로 렌더링된다.
- **무게.** 199KB PNG를 favicon 자리에서도 받는다.

## 목표

1. 하나의 SVG 소스에서 나온 브랜드 자산이 헤더·favicon/PWA·로그인 화면·공유 카드
   네 면에 일관되게 적용된다.
2. 앱 안의 로고는 테마를 따른다. 앱 아이콘(favicon/PWA)은 다크 타일을 유지한다.
3. PWA 설치 아이콘이 실제로 나온다.
4. 워드마크가 기기·브라우저와 무관하게 동일하게 보인다.

## 비목표

- 웹폰트 번들링과 앱 전체 타이포그래피 개편. `font-family` 선언과 현실의 불일치는
  이 작업에서 **로고에 한해서만** 해소한다(아웃라인화). 본문 폰트는 그대로 둔다.
- 앱 이름·컬러 팔레트 변경. `--accent: #2563eb` 계열을 그대로 쓴다.
- 스플래시 스크린, 오픈그래프 이미지. 필요해지면 같은 파이프라인에 추가한다.

## 브랜드 개념

기존 컨셉을 유지한다: **덤벨(운동) + 체크(완료된 기록)**. Trainlog가 하는 일이
"운동을 하고, 그것을 기록으로 남긴다"이므로 두 요소의 결합이 곧 제품 설명이다.
이미 사용자에게 노출된 아이콘이기도 하다.

바꾸는 것은 조형이다. 현재 PNG는 체크와 덤벨 바가 같은 높이에서 겹쳐 16px에서
형태가 엉킨다. 새 심볼은 두 요소를 수직으로 분리한다.

## 심볼 기하

`viewBox="0 0 24 24"`, 모노라인. 모든 획은 `stroke-width: 2.2`,
`stroke-linecap: round`, `stroke-linejoin: round`.

```
 0    6         18   24
 ┌──────────────────────┐ 0
 │              ╱       │
 │  ╲          ╱        │    체크: 상단, y 4.3 → 12.8
 │   ╲       ╱          │
 │    ╲    ╱            │
 │     ╲ ╱              │
 │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │ ← 빈 띠 (2 단위)
 │  ▮ ▮━━━━━━━━━━▮ ▮    │    덤벨: 하단, y 17 → 22.5
 └──────────────────────┘ 24
```

- 체크: `(6.5, 9.3) → (10, 12.8) → (17.5, 4.3)`
- 덤벨 바: `y = 19.5`, `x = 7 → 17`
- 안쪽 플레이트: `x = 7`과 `x = 17`, 각각 `y = 17 → 22`
- 바깥 플레이트: `x = 3.8`과 `x = 20.2`, 각각 `y = 18.25 → 20.75`

획 굵기를 감안한 실제 잉크 경계는 체크가 `y = 13.9`에서 끝나고 덤벨이
`y = 15.9`에서 시작한다. **빈 띠 2.0 단위** — 16px로 축소해도 1.3px의 흰 틈이
남아 두 요소가 붙어 보이지 않는다. 이 틈이 현재 PNG가 16px에서 뭉개지는 원인을
직접 겨냥한 수치다.

위 좌표는 설계 의도를 고정하기 위한 것이고, 구현 중 광학 보정(optical
correction)으로 ±0.5 단위 조정할 수 있다. 조정해도 "체크는 위, 덤벨은 아래, 둘
사이에 눈에 보이는 틈"이라는 구조는 유지한다.

## 워드마크 기하

"trainlog"를 **모노라인 지오메트릭 소문자**로 아웃라인화한다. 획 굵기를 심볼과
같은 값으로 맞춰 심볼과 워드마크가 한 몸으로 읽히게 하는 것이 이 선택의 이유다.

- x-height 12 단위, 획 굵기 2.2(심볼과 동일), 원형 자소의 지름 12 단위
- 자소 구성: `t`(스템+크로스바), `r`(스템+짧은 아치), `a`(원+스템), `i`(스템+점),
  `n`(스템+아치), `l`(스템), `o`(원), `g`(원+디센더)
- 자간은 패스 좌표에 직접 반영한다. 현재 CSS의 `letter-spacing: -0.06em`은 사라진다.
- 그리드: 베이스라인 y=18, x-하이트 상단 y=6, 어센더 상단 y=2.5, 디센더 하단
  y=21.4, 볼 중심 y=12. 심볼과 같은 단위계이고, 심볼이 승인 과정에서 1단위
  위로 옮겨진 것을 반영한 값이다.
- `viewBox`는 잉크의 실제 경계에 맞춘다: `27.7 1.4 97.4 21.1`. 가로세로비가
  약 4.6:1이라 헤더에서는 높이가 아니라 **폭**이 배치를 지배한다.

색 분할: `train`은 본문색, `log`는 accent. "기록"이 제품의 핵심이라는 것을 색으로
집는다.

## 색 역할

심볼과 워드마크는 두 개의 CSS 변수만 참조한다. 표면이 그 변수를 덮어써서 맥락에
맞춘다.

| 부위 | 값 |
| --- | --- |
| 덤벨, `train` | `currentColor` |
| 체크, `log` | `var(--brand-accent, var(--accent))` |

- **헤더·로그인 화면**: 아무것도 덮어쓰지 않는다. 라이트에서 잉크색+#2563eb,
  다크에서 밝은 회색+#60a5fa로 자동으로 따라간다.
- **공유 카드**: 항상 다크 배경이므로 `color: #f8fafc`와
  `--brand-accent: #3b82f6`을 명시한다.
- **앱 아이콘(favicon/PWA)**: 테마가 없다. 다크 타일 `#171717`(manifest의
  `theme_color`와 동일) 위에 흰 덤벨 + `#3b82f6` 체크로 굽는다. `#2563eb`는 다크
  타일 위에서 탁해서 쓰지 않는다.

## 컴포넌트

`src/components/BrandLogo.tsx` 하나가 단일 진실 원천이다.

```tsx
type BrandLogoProps = {
  variant?: 'wordmark' | 'symbol'  // 기본 'wordmark'
  className?: string
  title?: string                   // 없으면 aria-hidden="true"
}
```

- `wordmark` — 글자만. 헤더, 로그인 화면, 공유 카드에서 쓴다.
- `symbol` — 심볼만. favicon·PWA 아이콘과, 글자가 들어갈 수 없는 좁은 자리에서 쓴다.

### 심볼과 워드마크를 나란히 두지 않는 이유

원안은 "심볼 + 워드마크" 록업 하나로 세 표면을 덮으려 했다. 구현 중 실제로
렌더해 보고 폐기했다. 심볼은 체크가 위, 덤벨이 아래로 **쌓인** 구조라, 록업
높이를 글자에 맞추면 두 요소가 각각 글자 하나보다 작아진다. 헤더 실제 크기인
31px에서 덤벨은 얼룩으로, 체크는 짧은 틱으로 뭉개졌다. 심볼을 1.35배 키워도
덤벨이 아래로 밀려 바닥에 붙을 뿐 읽히지 않았다 — 세로로 쌓인 마크를 가로
록업에 넣는 구조적 한계다.

그래서 둘을 분리한다. 심볼은 자기가 제일 잘 작동하는 정사각 타일(앱 아이콘)에
두고, 가로로 긴 헤더에는 가로로 긴 워드마크를 둔다. 각자 맞는 그릇에 담는
편이, 하나의 록업으로 양쪽을 어중간하게 만족시키는 것보다 낫다.
- 크기는 CSS가 정한다. SVG는 `height: 1em`·`width: auto`를 기본으로 두고 호출부가
  `font-size`나 `className`으로 조절한다.
- 인라인 SVG여야 하는 이유: (1) 외부 CSS가 닿아야 테마 대응이 되고, (2)
  `html-to-image`가 공유 카드를 캡처할 때 외부 리소스 로딩을 기다리지 않는다.
  `<img src>`나 스프라이트 `<use>`는 둘 중 하나를 포기해야 한다.

## 자산 파이프라인

정적 파일은 `scripts/build-brand-assets.mjs`가 같은 패스 데이터에서 생성하고,
결과물을 `public/`에 **커밋한다**.

```
심볼 패스 (스크립트 내 상수)
   ├── public/favicon.svg              32px 기준 다크 타일
   ├── public/apple-touch-icon.png     180×180
   ├── public/icon-192.png             192×192
   ├── public/icon-512.png             512×512
   └── public/icon-maskable-512.png    512×512, 콘텐츠를 80% 안전 영역에 배치
```

- 래스터화는 로컬의 `rsvg-convert`(homebrew `librsvg`)를 쓴다. 스크립트는 수동
  실행 전용이고 `npm run build`에는 들어가지 않는다. **Vercel 빌드에 새 의존성이
  생기지 않는다.**
- `rsvg-convert`가 없으면 스크립트는 설치 안내와 함께 실패한다. 조용히 넘어가지
  않는다.
- maskable 아이콘은 Android가 가장자리를 잘라내므로 심볼을 캔버스의 80% 안에 두고
  나머지는 타일 색으로 채운다.

## 표면별 변경

| 표면 | 파일 | 변경 |
| --- | --- | --- |
| 데스크톱 헤더 | `src/App.tsx`, `src/App.css` | `BrandIcon()` 제거, `.brand-mark`가 워드마크 `<BrandLogo />` 하나만 담는다. `<span>trainlog</span>` 삭제 |
| 모바일 헤더 | 〃 | `.mobile-brand`의 평문을 워드마크 `<BrandLogo />`로 교체. 기기별로 달랐던 글자꼴이 고정된다 |
| 로그인·로딩 | 〃 | `.auth-gate-card`의 `<BrandIcon />`를 워드마크 `<BrandLogo />`로 교체 |
| 공유 카드 | `src/features/records/WorkoutShareCard.tsx`, `Records.css` | `<img>`+`<span>TRAINLOG</span>`를 `<BrandLogo />`로 교체. `--brand-accent` 지정 |
| favicon | `index.html` | `href="/trainlog-icon.png"` → `/favicon.svg`, `apple-touch-icon` 링크 추가 |
| PWA | `vite.config.ts` | manifest에 `icons` 배열 추가(192/512/maskable) |
| 정리 | `public/` | `trainlog-icon.png`·`icons.svg` 삭제, 보라색 `favicon.svg` 교체 |

`public/icons.svg`도 코드 어디에서도 참조되지 않는 죽은 파일이다(확인 완료).
`trainlog-icon.png`와 함께 삭제한다. `public/`에 남는 것은 이 작업이 생성한
브랜드 자산과 `notification-click.js`뿐이 된다.

## 접근성

- 헤더 워드마크는 `title="Trainlog"`를 받아 `<title>` 엘리먼트를 갖는다. 현재
  `.brand-mark`의 `aria-label="Trainlog 홈"`는 클릭 불가 요소에 붙어 있어
  의미가 약했다 — 로고 자체가 이름을 갖게 한다.
- 장식으로만 쓰이는 자리(공유 카드 등)는 `title` 없이 `aria-hidden="true"`.
- 색만으로 정보를 전달하지 않는다. `train`/`log` 색 분할은 순수 장식이다.

## 검증

- `BrandLogo`가 두 variant에서 렌더되고 `title` 유무에 따라 접근성 속성이 바뀌는지
  단위 테스트(`src/test/brand-logo.test.tsx`, 신규).
- 기존 테스트 중 브랜드 자산을 참조하는 것은 없다(확인 완료). 회귀 위험은 낮으나
  전체 스위트를 돌린다.
- `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`.
- 눈으로 확인: 라이트/다크 헤더, 390px 모바일 헤더, 로그인 화면, 공유 카드 PNG
  내보내기 결과, 브라우저 탭 favicon.
- `npm run build` 후 `dist/manifest.webmanifest`에 `icons`가 들어갔는지 확인한다.

## 되돌리기

모든 변경이 한 브랜치에 모여 있고 DB migration이 없다. 문제가 생기면 PR revert
하나로 끝난다. 삭제하는 `trainlog-icon.png`도 git 이력에 남는다.
