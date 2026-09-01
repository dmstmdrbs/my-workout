/**
 * favicon과 PWA 아이콘을 `src/shared/ui/BrandLogo/brandArt.ts`의 심볼 패스에서 굽는다.
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
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  CHECK_PATH,
  DUMBBELL_PATHS,
  ICON_COLORS,
  STROKE_WIDTH,
  SYMBOL_VIEWBOX,
} from '../src/shared/ui/BrandLogo/brandArt.ts'

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
export function symbolSvg({ inset = 0, radius = 0 } = {}) {
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

function writePng(publicDir, svg, size, name) {
  const dir = mkdtempSync(path.join(tmpdir(), 'trainlog-brand-'))
  const svgPath = path.join(dir, 'icon.svg')
  writeFileSync(svgPath, svg)
  execFileSync('rsvg-convert', [svgPath, '-w', String(size), '-h', String(size), '-o', path.join(publicDir, name)])
  rmSync(dir, { recursive: true, force: true })
  console.log(`  ${name} (${size}x${size})`)
}

// `symbolSvg`를 테스트(brand-asset-drift.test.ts)가 import 해서 쓸 수 있도록,
// 실제 생성 작업(rsvg-convert 호출·파일 쓰기, publicDir 경로 계산 포함)은
// 모듈 최상단이 아니라 이 아래 `main()` 안에 두고, 이 파일이 CLI로 직접
// 실행됐을 때만 호출한다. 그래야 import만 해도 부수효과가 도는 것을 막는다.
function main() {
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url))

  requireRsvg()
  console.log('브랜드 자산 생성:')

  // favicon 은 브라우저 탭에서 각진 사각형으로 보이므로 모서리를 둥글린다.
  writeFileSync(path.join(publicDir, 'favicon.svg'), symbolSvg({ radius: 5 }))
  console.log('  favicon.svg')

  writePng(publicDir, symbolSvg({ radius: 5 }), 180, 'apple-touch-icon.png')
  writePng(publicDir, symbolSvg({ radius: 5 }), 192, 'icon-192.png')
  writePng(publicDir, symbolSvg({ radius: 5 }), 512, 'icon-512.png')
  // maskable 은 OS 가 자기 모양으로 자른다. 모서리를 둥글리지 않고 꽉 채우되,
  // 심볼은 안전 영역(80%) 안으로 넣는다.
  writePng(publicDir, symbolSvg({ inset: 0.1, radius: 0 }), 512, 'icon-maskable-512.png')

  console.log('완료. 산출물을 커밋하세요.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
