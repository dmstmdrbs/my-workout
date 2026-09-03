import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { WorkoutSession } from '../../types/domain'
import { workoutShareFileName } from './workoutShareFormat'
import { downloadWorkoutCard, workoutCardFile } from './workoutShareImage'

export type WorkoutCardDeliveryResult = 'shared' | 'downloaded' | 'canceled'

export async function shareWorkoutCard(
  dataUrl: string,
  session: WorkoutSession,
): Promise<WorkoutCardDeliveryResult> {
  if (Capacitor.isNativePlatform()) {
    return shareNativeWorkoutCard(dataUrl, session, '운동 기록 공유')
  }

  const file = await workoutCardFile(dataUrl, session)
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${session.routineName ?? '운동'} 운동 기록` })
      return 'shared'
    } catch (error) {
      if (isCanceledShare(error)) return 'canceled'
      downloadWorkoutCard(dataUrl, session)
      return 'downloaded'
    }
  }

  downloadWorkoutCard(dataUrl, session)
  return 'downloaded'
}

export async function saveWorkoutCard(
  dataUrl: string,
  session: WorkoutSession,
): Promise<WorkoutCardDeliveryResult> {
  if (Capacitor.isNativePlatform()) {
    return shareNativeWorkoutCard(dataUrl, session, 'PNG 이미지 저장')
  }

  downloadWorkoutCard(dataUrl, session)
  return 'downloaded'
}

async function shareNativeWorkoutCard(
  dataUrl: string,
  session: WorkoutSession,
  dialogTitle: string,
): Promise<WorkoutCardDeliveryResult> {
  const canShare = await Share.canShare()
  if (!canShare.value) throw new Error('native share unavailable')

  const fileName = workoutShareFileName(session)
  const path = `share/${Date.now()}-${fileName}`
  const data = pngBase64(dataUrl)
  const { uri } = await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Cache,
    recursive: true,
  })

  try {
    await Share.share({
      files: [uri],
      title: `${session.routineName ?? '운동'} 운동 기록`,
      dialogTitle,
    })
    return 'shared'
  } catch (error) {
    if (isCanceledShare(error)) return 'canceled'
    throw error
  } finally {
    void Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined)
  }
}

function pngBase64(dataUrl: string) {
  const prefix = 'data:image/png;base64,'
  if (!dataUrl.startsWith(prefix)) throw new Error('invalid PNG data URL')
  return dataUrl.slice(prefix.length)
}

function isCanceledShare(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (!(error instanceof Error)) return false
  return /cancel(?:ed|led)?|dismiss/i.test(error.message)
}
