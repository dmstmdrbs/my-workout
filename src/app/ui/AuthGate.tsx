import { BrandLogo, Button } from '../../shared/ui'

export function AuthLoading() {
  return (
    <main className="auth-gate" aria-label="로그인 상태를 확인하는 중">
      <div className="auth-gate-card">
        <BrandLogo title="Trainlog" />
        <p>안전하게 운동 기록을 불러오는 중…</p>
      </div>
    </main>
  )
}

interface SignInGateProps {
  error: string | null
  onSignIn: () => void
}

export function SignInGate({ error, onSignIn }: SignInGateProps) {
  return (
    <main className="auth-gate" aria-labelledby="sign-in-title">
      <section className="auth-gate-card">
        <BrandLogo title="Trainlog" />
        <h1 id="sign-in-title">나의 트레이닝을 이어가세요.</h1>
        <p>Google 계정으로 로그인하면 운동 기록과 RIR 설정을 모든 기기에서 안전하게 관리할 수 있어요.</p>
        {error && <p className="auth-gate-error" role="alert">{error}</p>}
        <Button className="auth-google-button" onClick={onSignIn}>Google로 계속하기</Button>
        <small>개인 운동 기록만 본인 계정에서 볼 수 있습니다.</small>
      </section>
    </main>
  )
}
