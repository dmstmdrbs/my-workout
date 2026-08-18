/**
 * 휴식이 끝났을 때의 알림.
 *
 * **화면이 켜져 있을 때만 동작한다.** 웹에는 "90초 뒤에 알림을 띄워 달라"고
 * 예약할 수 있는 신뢰할 만한 API가 없다(Notification Triggers는 실험으로
 * 끝났고, 서버 푸시는 백엔드가 필요하다). 그래서 이 앱은 반대로 접근한다 --
 * 운동 중에는 화면을 켜 두게 만들고(`wakeLock.ts`), 알림은 앞에 떠 있는
 * 화면에서만 울린다.
 *
 * 소리와 진동을 함께 쓴다. 진동은 안드로이드에만 있고(iOS Safari는 Vibration
 * API 자체가 없다), 소리는 iOS 무음 스위치에 막힌다. 둘 중 하나는 대개
 * 통과한다.
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
  vibrate()
  beep()
}

function vibrate() {
  // iOS Safari에는 이 API가 없다. 있는 기기에서만 울린다.
  if (typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate([180, 90, 180])
  } catch {
    // 사용자 설정이나 정책으로 막힐 수 있다. 소리 쪽이 남아 있다.
  }
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
