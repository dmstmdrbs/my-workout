import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { symbolSvg } from '../../scripts/build-brand-assets.mjs'

// 이 테스트가 지키는 것: 누군가 shared/ui/BrandLogo/brandArt.ts 의 심볼 좌표를 고쳐놓고
// scripts/build-brand-assets.mjs 를 다시 돌리는 것을 잊는 상황. 그러면 앱 안의
// 심볼과 커밋된 favicon.svg 가 조용히 서로 달라지는데, 다른 검사는 전부 초록으로
// 남는다. symbolSvg()(순수 문자열 생성, rsvg-convert 호출 없음)를 다시 실행해
// public/favicon.svg 와 바이트 단위로 비교해 그 드리프트를 잡는다.
describe('브랜드 자산 드리프트', () => {
  test('favicon.svg는 brandArt.ts 로 지금 다시 구우면 나오는 값과 같다', () => {
    // scripts/build-brand-assets.mjs 가 favicon 을 굽는 옵션과 정확히 맞춘다.
    const expected = symbolSvg({ radius: 5 })

    // 스크립트는 writeFileSync(path, expected) 로 그대로 쓰고 개행을 덧붙이지
    // 않는다. import.meta.url 을 변수에 먼저 담아 Vite의 `new URL(literal,
    // import.meta.url)` 정적 애셋 재작성을 피한다(그렇지 않으면 테스트
    // 환경에서 이 상대 경로가 엉뚱하게 해석된다 -- rest-alert-flows.test.ts 참고).
    const testFileUrl = import.meta.url
    const faviconPath = fileURLToPath(new URL('../../public/favicon.svg', testFileUrl))
    const actual = readFileSync(faviconPath, 'utf8')

    expect(actual).toBe(expected)
  })
})
