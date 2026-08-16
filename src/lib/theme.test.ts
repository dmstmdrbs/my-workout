import { beforeEach, describe, expect, test } from 'vitest'
import { applyTheme, readMirroredTheme, themeStorageKey } from './theme'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
  })

  test('system 테마는 data-theme 속성을 제거하고 두 스킴을 모두 허용한다', () => {
    applyTheme('dark')
    applyTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light dark')
  })

  test('dark 테마는 data-theme과 color-scheme을 설정한다', () => {
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  test('light 테마는 OS가 다크여도 라이트를 강제한다', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  test('적용한 테마를 localStorage에 미러링한다', () => {
    applyTheme('dark')
    expect(localStorage.getItem(themeStorageKey)).toBe('dark')
    expect(readMirroredTheme()).toBe('dark')
  })

  test('미러 값이 없으면 system을 반환한다', () => {
    expect(readMirroredTheme()).toBe('system')
  })

  test('미러 값이 손상되면 system으로 되돌린다', () => {
    localStorage.setItem(themeStorageKey, 'chartreuse')
    expect(readMirroredTheme()).toBe('system')
  })
})
