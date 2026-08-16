import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Moon, Palette, Sun, Timer, User2, MonitorSmartphone } from 'lucide-react'
import { useAppServices, useSettings, userSettingsQueryKey } from '../../services'
import { applyTheme } from '../../lib/theme'
import type { Theme, UserProfile, UserSettings } from '../../types/domain'
import './Settings.css'

const themeChoices: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'system', label: '시스템', icon: MonitorSmartphone },
  { value: 'light', label: '라이트', icon: Sun },
  { value: 'dark', label: '다크', icon: Moon },
]

const rirChoices = [
  { value: '', label: '없음' },
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5+' },
]

export function Settings() {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const settingsQuery = useSettings()
  // Profile is fetched once here, at the top level, and passed down to
  // ProfileSection as a prop rather than re-queried there. That keeps a
  // single source of truth for the query (no risk of the two declarations
  // drifting in `select`/`enabled`/`staleTime`), and it lets the whole screen
  // wait for both queries before painting — otherwise the display-name input
  // would mount empty and get its value replaced out from under the user
  // mid-keystroke once a second, independent query resolved a beat later.
  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => workoutRepository.getProfile(),
  })
  const [error, setError] = useState<string | null>(null)

  const settingsMutation = useMutation({
    mutationFn: (changes: Partial<Omit<UserSettings, 'userId' | 'updatedAt'>>) =>
      workoutRepository.updateSettings(changes),
    onMutate: () => setError(null),
    onSuccess: (saved) => {
      applyTheme(saved.theme)
      void queryClient.invalidateQueries({ queryKey: userSettingsQueryKey })
    },
    onError: () => setError('설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'),
  })

  if (settingsQuery.isPending || profileQuery.isPending) return <SettingsLoading />
  if (settingsQuery.isError || !settingsQuery.data || profileQuery.isError || !profileQuery.data) {
    return <SettingsError onRetry={() => { void settingsQuery.refetch(); void profileQuery.refetch() }} />
  }

  const settings = settingsQuery.data

  return (
    <main className="settings-page" aria-labelledby="settings-title">
      <section className="settings-heading">
        <p className="eyebrow">PREFERENCES</p>
        <h1 id="settings-title">설정</h1>
        <p>표시 방식과 운동 기본값을 정합니다. 변경하면 바로 저장됩니다.</p>
      </section>

      {error && <p className="settings-error" role="alert">{error}</p>}

      <ProfileSection profile={profileQuery.data} onError={setError} />

      <section className="settings-card" aria-labelledby="settings-theme-title">
        <div className="settings-card-heading">
          <span className="settings-icon"><Palette size={18} aria-hidden="true" /></span>
          <div><h2 id="settings-theme-title">테마</h2><p>시스템을 고르면 기기 설정을 따릅니다.</p></div>
        </div>
        <div className="theme-choice-row" role="radiogroup" aria-label="테마">
          {themeChoices.map((choice) => {
            const Icon = choice.icon
            return (
              <button
                type="button"
                role="radio"
                key={choice.value}
                aria-checked={settings.theme === choice.value}
                className={settings.theme === choice.value ? 'is-selected' : ''}
                onClick={() => settingsMutation.mutate({ theme: choice.value })}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{choice.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="settings-card" aria-labelledby="settings-workout-title">
        <div className="settings-card-heading">
          <span className="settings-icon"><Timer size={18} aria-hidden="true" /></span>
          <div><h2 id="settings-workout-title">운동 기본값</h2><p>새 종목을 추가할 때 쓰이는 초기값입니다.</p></div>
        </div>

        <RestSecondsField
          value={settings.defaultRestSeconds}
          onCommit={(seconds) => settingsMutation.mutate({ defaultRestSeconds: seconds })}
        />

        <label className="settings-field">
          <span>기본 목표 RIR</span>
          <select
            aria-label="기본 목표 RIR"
            value={settings.defaultRir === null ? '' : String(settings.defaultRir)}
            onChange={(event) => settingsMutation.mutate({ defaultRir: event.target.value === '' ? null : Number(event.target.value) })}
          >
            {rirChoices.map((choice) => <option key={choice.label} value={choice.value}>{choice.label}</option>)}
          </select>
        </label>
      </section>
    </main>
  )
}

/**
 * Rest seconds commit on blur rather than per keystroke: typing "75" would
 * otherwise save "7" first and briefly show a nonsense default.
 */
function RestSecondsField({ value, onCommit }: { value: number; onCommit: (seconds: number) => void }) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => { setDraft(String(value)) }, [value])

  const commit = () => {
    const parsed = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      setDraft(String(value))
      return
    }
    const seconds = Math.floor(parsed)
    if (seconds !== value) onCommit(seconds)
  }

  return (
    <label className="settings-field">
      <span>기본 휴식 시간 (초)</span>
      <input
        aria-label="기본 휴식 시간 (초)"
        type="number"
        inputMode="numeric"
        min="0"
        step="5"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
    </label>
  )
}

function ProfileSection({ profile, onError }: { profile: UserProfile | undefined; onError: (message: string | null) => void }) {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')

  useEffect(() => { if (profile) setDraft(profile.displayName) }, [profile])

  const profileMutation = useMutation({
    mutationFn: (displayName: string) =>
      workoutRepository.updateProfile({ displayName, avatarUrl: profile?.avatarUrl ?? null }),
    onMutate: () => onError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
    },
    onError: () => onError('이름을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'),
  })

  const commit = () => {
    const name = draft.trim()
    if (!name || name === profile?.displayName) {
      setDraft(profile?.displayName ?? '')
      return
    }
    profileMutation.mutate(name)
  }

  return (
    <section className="settings-card" aria-labelledby="settings-profile-title">
      <div className="settings-card-heading">
        <span className="settings-icon"><User2 size={18} aria-hidden="true" /></span>
        <div><h2 id="settings-profile-title">프로필</h2><p>대시보드 인사말에 쓰이는 이름입니다.</p></div>
      </div>
      <label className="settings-field">
        <span>표시 이름</span>
        <input
          aria-label="표시 이름"
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
        />
      </label>
    </section>
  )
}

function SettingsLoading() {
  return <main className="settings-page" aria-label="설정을 불러오는 중">
    <div className="skeleton-card" /><div className="skeleton-card" /><div className="skeleton-card" />
  </main>
}

function SettingsError({ onRetry }: { onRetry: () => void }) {
  return <main className="settings-page settings-message">
    <h1>설정을 불러오지 못했어요.</h1>
    <p>잠시 후 다시 시도해 주세요.</p>
    <button className="primary-button" type="button" onClick={onRetry}>다시 시도</button>
  </main>
}
