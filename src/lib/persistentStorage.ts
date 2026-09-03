import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

let nativeWriteQueue = Promise.resolve()

export function readPersistentValue(key: string) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writePersistentValue(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // 네이티브 Preferences 저장은 localStorage 사용 가능 여부와 독립적이다.
  }
  enqueueNativeWrite(() => Preferences.set({ key, value }))
}

export function removePersistentValue(key: string) {
  try {
    globalThis.localStorage?.removeItem(key)
  } catch {
    // 네이티브 Preferences 삭제는 계속 시도한다.
  }
  enqueueNativeWrite(() => Preferences.remove({ key }))
}

/**
 * React가 동기 snapshot을 읽기 전에 네이티브 영속값을 localStorage 미러로
 * 복원한다. 업그레이드 직후 Preferences가 비어 있으면 기존 localStorage 값을
 * 반대로 옮겨 사용자의 진행 중 운동을 보존한다.
 */
export async function hydratePersistentStorage(keys: readonly string[]) {
  if (!Capacitor.isNativePlatform()) return

  await Promise.all(keys.map(async (key) => {
    try {
      const { value } = await Preferences.get({ key })
      const localValue = readPersistentValue(key)
      if (value !== null) {
        try {
          globalThis.localStorage?.setItem(key, value)
        } catch {
          // localStorage가 막혀도 Preferences 값 자체는 보존되어 있다.
        }
      } else if (localValue !== null) {
        await Preferences.set({ key, value: localValue })
      }
    } catch {
      // 플러그인 초기화 실패 시 기존 localStorage로 앱을 계속 시작한다.
    }
  }))
}

export function flushPersistentStorageWrites() {
  return nativeWriteQueue
}

function enqueueNativeWrite(operation: () => Promise<unknown>) {
  if (!Capacitor.isNativePlatform()) return
  nativeWriteQueue = nativeWriteQueue
    .catch(() => undefined)
    .then(operation)
    .then(() => undefined)
    .catch(() => undefined)
}
