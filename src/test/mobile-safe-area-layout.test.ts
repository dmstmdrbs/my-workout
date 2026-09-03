import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

function readSource(relativePath: string) {
  const testFileUrl = import.meta.url
  return readFileSync(fileURLToPath(new URL(relativePath, testFileUrl)), 'utf8')
}

describe('모바일 safe area 고정 UI', () => {
  test('대시보드 운동 시작 버튼은 하단 탭바 전체 높이 위에 배치된다', () => {
    const dashboardCss = readSource('../features/dashboard/Dashboard.css')

    expect(dashboardCss).toMatch(
      /\.mobile-start-fab\s*\{[^}]*bottom:\s*calc\(var\(--mobile-bottom-nav-height\)\s*\+\s*10px\)/s,
    )
  })
})
