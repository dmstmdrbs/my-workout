import type { Theme } from '../types/domain'
import { readPersistentValue, writePersistentValue } from './persistentStorage'

/**
 * Theme lives in the database, but that value arrives after the first paint.
 * Mirroring it here lets the app paint the chosen theme immediately; the
 * database stays the source of truth and overwrites this on load.
 */
export const themeStorageKey = 'trainlog:theme:v1'

const themes: Theme[] = ['system', 'light', 'dark']

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && themes.includes(value as Theme)
}

export function readMirroredTheme(): Theme {
  const stored = readPersistentValue(themeStorageKey)
  return isTheme(stored) ? stored : 'system'
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
    root.style.colorScheme = 'light dark'
  } else {
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = theme
  }
  writePersistentValue(themeStorageKey, theme)
}
