import { toPng } from 'html-to-image'
import type { WorkoutSession } from '../../types/domain'
import { maxShareCardPixels, shareCardExportWidth, workoutShareFileName } from './workoutShareFormat'

export async function makeWorkoutCardPng(card: HTMLElement) {
  const height = Math.ceil(card.scrollHeight)
  const pixelRatio = Math.min(2, Math.max(1, Math.sqrt(maxShareCardPixels / (shareCardExportWidth * height))))
  return toPng(card, {
    cacheBust: true,
    backgroundColor: '#111214',
    width: shareCardExportWidth,
    height,
    pixelRatio,
    skipAutoScale: true,
  })
}

export function downloadWorkoutCard(dataUrl: string, session: WorkoutSession) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = workoutShareFileName(session)
  document.body.append(link)
  link.click()
  link.remove()
}

export async function workoutCardFile(dataUrl: string, session: WorkoutSession) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], workoutShareFileName(session), { type: 'image/png' })
}
