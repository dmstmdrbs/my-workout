import { signalRestFinished } from './haptics'

/**
 * 휴식이 끝났을 때의 알림.
 *
 * **화면이 켜져 있을 때의 보조 신호다.** 네이티브 백그라운드 종료 알림은
 * Local Notifications가 담당하고, 웹은 예약 API가 없어 이 포그라운드 신호와
 * Screen Wake Lock을 함께 사용한다.
 *
 * 소리와 햅틱을 함께 쓴다. 네이티브 앱은 Capacitor Haptics, 웹은 지원되는
 * 브라우저의 Vibration API를 사용한다. 소리는 iOS 무음 스위치에 막힐 수 있다.
 */

/** 삑 소리의 길이·음정. 헬스장 소음 위로 들리되 거슬리지 않을 정도. */
const BEEP_DURATION_SECONDS = 0.18
const BEEP_FREQUENCY_HZ = 880
const BEEP_GAP_SECONDS = 0.22
const BEEP_COUNT = 2

type AudioContextConstructor = typeof AudioContext
type WebkitWindow = Window & { webkitAudioContext?: AudioContextConstructor }

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
  if (!Ctor) return null
  audioContext ??= new Ctor()
  return audioContext
}

/**
 * 오디오를 사용자 제스처 안에서 미리 깨워 둔다.
 *
 * 브라우저 자동재생 정책은 탭·클릭 없이 시작된 소리를 막는다. 휴식 타이머가
 * 끝나는 순간은 제스처가 아니라 타이머 콜백이라, 그때 처음 소리를 만들면
 * 막힌다. 세트 완료를 누르는 시점(=휴식이 시작되는 시점)에 이걸 불러 두면
 * 그 뒤의 재생이 허용된다.
 */
export function primeRestAlert(): void {
  const context = getAudioContext()
  if (!context) return
  if (context.state === 'suspended') void context.resume().catch(() => {})
}

/** 휴식 종료를 알린다. 지원하지 않는 기능은 조용히 건너뛴다. */
export function playRestFinishedAlert(): void {
  signalRestFinished()
  beep()
}

function beep() {
  const context = getAudioContext()
  if (!context) return
  if (context.state === 'suspended') void context.resume().catch(() => {})

  try {
    for (let index = 0; index < BEEP_COUNT; index += 1) {
      const startAt = context.currentTime + index * (BEEP_DURATION_SECONDS + BEEP_GAP_SECONDS)
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.frequency.value = BEEP_FREQUENCY_HZ
      oscillator.type = 'sine'
      // 딸깍 소리가 나지 않도록 시작과 끝의 음량을 완만하게 만든다.
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + BEEP_DURATION_SECONDS)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(startAt)
      oscillator.stop(startAt + BEEP_DURATION_SECONDS + 0.02)
    }
  } catch {
    // 오디오 컨텍스트가 잠겨 있으면 진동만 남는다.
  }
}
