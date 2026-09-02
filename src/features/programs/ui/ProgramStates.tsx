import { RefreshCw } from 'lucide-react'

export function ProgramsLoading() {
  return <main className="programs-page" aria-label="프로그램 불러오는 중"><div className="programs-loading" /><div className="programs-loading large" /></main>
}

export function ProgramsError({ onRetry }: { onRetry: () => void }) {
  return <main className="programs-page programs-error"><RefreshCw size={24} /><h1>프로그램을 불러오지 못했어요.</h1><button className="primary-button" type="button" onClick={onRetry}><RefreshCw size={16} /> 다시 시도</button></main>
}
