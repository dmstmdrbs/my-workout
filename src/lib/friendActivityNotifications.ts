import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { useSyncExternalStore } from 'react'
import type { SocialRepository } from '../services/contracts'
import {
  readPersistentValue,
  removePersistentValue,
  writePersistentValue,
} from './persistentStorage'

export const friendActivityNotificationsKey = 'trainlog:friend-activity-notifications:v1'
export const registeredPushTokenKey = 'trainlog:registered-push-token:v1'

let cachedRaw: string | null | undefined
let cachedEnabled = false
const listeners = new Set<() => void>()

export function readFriendActivityNotificationsEnabled() {
  const raw = readPersistentValue(friendActivityNotificationsKey)
  if (raw === cachedRaw) return cachedEnabled
  cachedRaw = raw
  cachedEnabled = raw === 'true'
  return cachedEnabled
}

export function setFriendActivityNotificationsEnabled(enabled: boolean) {
  if (enabled) writePersistentValue(friendActivityNotificationsKey, 'true')
  else removePersistentValue(friendActivityNotificationsKey)
  cachedRaw = undefined
  listeners.forEach((listener) => listener())
}

export function useFriendActivityNotificationsEnabled() {
  return useSyncExternalStore(subscribe, readFriendActivityNotificationsEnabled, () => false)
}

export async function requestFriendActivityNotificationPermission() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const current = await PushNotifications.checkPermissions()
    const permission = current.receive === 'prompt'
      ? await PushNotifications.requestPermissions()
      : current
    return permission.receive === 'granted'
  } catch {
    return false
  }
}

export function readRegisteredPushToken() {
  return readPersistentValue(registeredPushTokenKey)
}

export function saveRegisteredPushToken(token: string) {
  writePersistentValue(registeredPushTokenKey, token)
}

export function clearRegisteredPushToken() {
  removePersistentValue(registeredPushTokenKey)
}

export async function unregisterCurrentPushDevice(
  socialRepository?: Pick<SocialRepository, 'unregisterPushDevice'>,
) {
  const token = readRegisteredPushToken()
  if (token && socialRepository) {
    await socialRepository.unregisterPushDevice(token).catch(() => undefined)
  }
  if (Capacitor.isNativePlatform()) {
    await PushNotifications.unregister().catch(() => undefined)
  }
  clearRegisteredPushToken()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
