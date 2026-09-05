import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

let nativeWriteQueue = Promise.resolve()
let lastRevision = 0

interface PersistentMetadata {
  revision: number
  deleted: boolean
}

const metadataPrefix = 'trainlog:persistent-meta:v1:'

export function getPersistentMetadataKey(key: string) {
  return `${metadataPrefix}${key}`
}

export function readPersistentValue(key: string) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writePersistentValue(key: string, value: string) {
  const metadata = createMetadata(false)
  try {
    globalThis.localStorage?.setItem(key, value)
    globalThis.localStorage?.setItem(getPersistentMetadataKey(key), JSON.stringify(metadata))
  } catch {
    // 네이티브 Preferences 저장은 localStorage 사용 가능 여부와 독립적이다.
  }
  enqueueNativeWrite(async () => {
    await Preferences.set({ key, value })
    await Preferences.set({ key: getPersistentMetadataKey(key), value: JSON.stringify(metadata) })
  })
}

export function removePersistentValue(key: string) {
  const metadata = createMetadata(true)
  try {
    globalThis.localStorage?.removeItem(key)
    globalThis.localStorage?.setItem(getPersistentMetadataKey(key), JSON.stringify(metadata))
  } catch {
    // 네이티브 Preferences 삭제는 계속 시도한다.
  }
  enqueueNativeWrite(async () => {
    await Preferences.remove({ key })
    await Preferences.set({ key: getPersistentMetadataKey(key), value: JSON.stringify(metadata) })
  })
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
      const metadataKey = getPersistentMetadataKey(key)
      const [{ value }, { value: nativeMetadataRaw }] = await Promise.all([
        Preferences.get({ key }),
        Preferences.get({ key: metadataKey }),
      ])
      const localValue = readPersistentValue(key)
      const localMetadataRaw = readPersistentValue(metadataKey)
      const localMetadata = parseMetadata(localMetadataRaw)
      const nativeMetadata = parseMetadata(nativeMetadataRaw)

      if (localMetadata && (!nativeMetadata || localMetadata.revision > nativeMetadata.revision)) {
        await mirrorLocalToNative(key, localValue, localMetadata)
        return
      }
      if (nativeMetadata && (!localMetadata || nativeMetadata.revision > localMetadata.revision)) {
        mirrorNativeToLocal(key, value, nativeMetadata)
        return
      }
      if (localMetadata && nativeMetadata) {
        // 같은 revision은 한 쓰기의 mirror다. localStorage를 동기 snapshot으로 유지한다.
        return
      }

      // 업그레이드 전 값에는 metadata가 없다. 기존 정책대로 Preferences를
      // 우선하되, 한 번 mirror한 후부터는 revision으로 충돌을 해결한다.
      if (value !== null) {
        const metadata = createMetadata(false)
        mirrorNativeToLocal(key, value, metadata)
        await Preferences.set({ key: metadataKey, value: JSON.stringify(metadata) })
      } else if (localValue !== null) {
        const metadata = createMetadata(false)
        try {
          globalThis.localStorage?.setItem(metadataKey, JSON.stringify(metadata))
        } catch {
          // localStorage metadata가 막혀도 기존 값은 유지한다.
        }
        await mirrorLocalToNative(key, localValue, metadata)
      }
    } catch {
      // 플러그인 초기화 실패 시 기존 localStorage로 앱을 계속 시작한다.
    }
  }))
}

function createMetadata(deleted: boolean): PersistentMetadata {
  lastRevision = Math.max(Date.now(), lastRevision + 1)
  return { revision: lastRevision, deleted }
}

function parseMetadata(raw: string | null): PersistentMetadata | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<PersistentMetadata>
    if (!Number.isSafeInteger(value.revision) || (value.revision ?? 0) <= 0 || typeof value.deleted !== 'boolean') {
      return null
    }
    lastRevision = Math.max(lastRevision, value.revision!)
    return { revision: value.revision!, deleted: value.deleted }
  } catch {
    return null
  }
}

async function mirrorLocalToNative(key: string, value: string | null, metadata: PersistentMetadata) {
  if (metadata.deleted || value === null) await Preferences.remove({ key })
  else await Preferences.set({ key, value })
  await Preferences.set({ key: getPersistentMetadataKey(key), value: JSON.stringify(metadata) })
}

function mirrorNativeToLocal(key: string, value: string | null, metadata: PersistentMetadata) {
  try {
    if (metadata.deleted || value === null) globalThis.localStorage?.removeItem(key)
    else globalThis.localStorage?.setItem(key, value)
    globalThis.localStorage?.setItem(getPersistentMetadataKey(key), JSON.stringify(metadata))
  } catch {
    // localStorage가 막혀도 Preferences 값 자체는 보존되어 있다.
  }
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
