/**
 * 운동 중 화면이 꺼지지 않게 붙잡는다.
 *
 * 두 가지가 중요하다.
 *
 * 1. **탭이 가려지면 브라우저가 잠금을 강제로 푼다.** 알림을 확인하거나 다른
 *    앱에 다녀오면 돌아와도 화면이 다시 꺼진다. 그래서 `visibilitychange`에서
 *    다시 요청해야 하고, 이걸 빼먹으면 "잠깐 다른 앱 봤다 오니 안 되는" 버그가
 *    된다.
 * 2. **지원하지 않는 브라우저가 있다.** `navigator.wakeLock`이 없으면 조용히
 *    아무 일도 하지 않는다 -- 화면이 꺼지는 건 불편이지 오류가 아니라서,
 *    사용자에게 실패를 알릴 이유가 없다.
 */

type WakeLockLike = { released: boolean; release: () => Promise<void>; addEventListener: (type: 'release', listener: () => void) => void }
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockLike> } }

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

/**
 * 잠금을 걸고, 해제 함수를 돌려준다. 해제 함수는 재요청 리스너까지 정리한다.
 * 지원하지 않거나 요청이 거부되면(배터리 절약 모드 등) 아무것도 하지 않는
 * 해제 함수를 돌려준다.
 */
export function requestScreenWakeLock(): () => void {
  const wakeLockNavigator = navigator as WakeLockNavigator
  const api = wakeLockNavigator.wakeLock
  if (!api) return () => {}

  let sentinel: WakeLockLike | null = null
  let cancelled = false
  let requestInFlight = false

  const acquire = async () => {
    if (cancelled || document.visibilityState !== 'visible') return
    // 이미 살아 있는 잠금이 있으면 다시 요청하지 않는다. 중복 요청은 앞선
    // 잠금을 놓아주지 않아 해제 시점을 잃는다.
    if ((sentinel && !sentinel.released) || requestInFlight) return
    requestInFlight = true
    try {
      const nextSentinel = await api.request('screen')
      if (cancelled) {
        // cleanup이 request()의 await 중에 먼저 실행될 수 있다. 이 sentinel은
        // 이후 재사용할 수 없으므로 도착 즉시 반납해 화면 잠금이 새지 않게 한다.
        await nextSentinel.release().catch(() => {})
        return
      }
      sentinel = nextSentinel
    } catch {
      // 배터리 절약 모드나 사용자 설정으로 거부될 수 있다. 화면이 꺼질 뿐이다.
      sentinel = null
    } finally {
      requestInFlight = false
    }
  }

  const handleVisibilityChange = () => { void acquire() }

  void acquire()
  document.addEventListener('visibilitychange', handleVisibilityChange)

  return () => {
    cancelled = true
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    void sentinel?.release().catch(() => {})
    sentinel = null
  }
}
