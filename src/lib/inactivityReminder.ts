import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useSyncExternalStore } from 'react'
import { readPersistentValue, writePersistentValue } from './persistentStorage'

export const inactivityReminderKey = 'trainlog:inactivity-reminder:v1'
export const inactivityReminderNotificationId = 73_002

export interface InactivityReminderSettings {
  enabled: boolean
  days: 3 | 5 | 7
  anchoredAt: string | null
}

const fallbackSettings: InactivityReminderSettings = { enabled: false, days: 3, anchoredAt: null }
let cachedRaw: string | null | undefined
let cachedSettings = fallbackSettings
let syncQueue = Promise.resolve()
const listeners = new Set<() => void>()

export function readInactivityReminderSettings() {
  const raw = readPersistentValue(inactivityReminderKey)
  if (raw === cachedRaw) return cachedSettings
  cachedRaw = raw
  cachedSettings = parseSettings(raw)
  return cachedSettings
}

export function updateInactivityReminderSettings(changes: Partial<InactivityReminderSettings>) {
  const current = readInactivityReminderSettings()
  const next: InactivityReminderSettings = {
    ...current,
    ...changes,
    anchoredAt: changes.enabled === true && !current.anchoredAt
      ? new Date().toISOString()
      : changes.anchoredAt === undefined ? current.anchoredAt : changes.anchoredAt,
  }
  writePersistentValue(inactivityReminderKey, JSON.stringify(next))
  cachedRaw = undefined
  listeners.forEach((listener) => listener())
  return next
}

export function useInactivityReminderSettings() {
  return useSyncExternalStore(subscribe, readInactivityReminderSettings, () => fallbackSettings)
}

export async function requestInactivityReminderPermission() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const current = await LocalNotifications.checkPermissions()
    const permission = current.display === 'prompt' || current.display === 'prompt-with-rationale'
      ? await LocalNotifications.requestPermissions()
      : current
    return permission.display === 'granted'
  } catch {
    return false
  }
}

export function syncInactivityReminder(
  lastCompletedAt: string | null,
  settings: InactivityReminderSettings,
  now = Date.now(),
) {
  if (!Capacitor.isNativePlatform()) return Promise.resolve()

  syncQueue = syncQueue
    .catch(() => undefined)
    .then(async () => {
      await LocalNotifications.cancel({ notifications: [{ id: inactivityReminderNotificationId }] })
      if (!settings.enabled) return

      const permission = await LocalNotifications.checkPermissions()
      if (permission.display !== 'granted') return
      const anchoredAt = lastCompletedAt ?? settings.anchoredAt
      if (!anchoredAt) return

      await LocalNotifications.schedule({
        notifications: [{
          id: inactivityReminderNotificationId,
          title: '다음 운동을 이어갈까요?',
          body: `${settings.days}일 동안 운동 기록이 없어요. 가볍게라도 시작해 보세요.`,
          schedule: { at: getInactivityReminderAt(anchoredAt, settings.days, now), allowWhileIdle: true },
          sound: 'default',
          foreground: true,
          autoCancel: true,
          extra: { path: '/' },
        }],
      })
    })

  return syncQueue
}

export function getInactivityReminderAt(anchorIso: string, days: number, now: number) {
  const anchor = new Date(anchorIso)
  if (Number.isNaN(anchor.getTime())) return nextMorning(now)
  const target = new Date(anchor)
  target.setDate(target.getDate() + days)
  return target.getTime() > now ? target : nextMorning(now)
}

function nextMorning(now: number) {
  const target = new Date(now)
  target.setHours(9, 0, 0, 0)
  if (target.getTime() <= now) target.setDate(target.getDate() + 1)
  return target
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function parseSettings(raw: string | null): InactivityReminderSettings {
  if (!raw) return fallbackSettings
  try {
    const value = JSON.parse(raw) as Partial<InactivityReminderSettings>
    const days = value.days === 5 || value.days === 7 ? value.days : 3
    return {
      enabled: value.enabled === true,
      days,
      anchoredAt: typeof value.anchoredAt === 'string' ? value.anchoredAt : null,
    }
  } catch {
    return fallbackSettings
  }
}
