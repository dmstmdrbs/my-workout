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
 * `--brand-accent`(없으면 `--color-brand`). 항상 어두운 공유 카드처럼 테마를
 * 따르면 안 되는 표면은 이 두 값을 CSS에서 덮어쓴다.
 */

export type BrandLogoProps = {
  variant?: 'wordmark' | 'symbol'
  className?: string
  /** 주면 로고가 그 이름을 가진 이미지가 된다. 없으면 장식으로 숨는다. */
  title?: string
}

const ACCENT = 'var(--brand-accent, var(--color-brand))'

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
