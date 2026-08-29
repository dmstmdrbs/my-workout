import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppServices } from '../../services'
import { FriendAvatar } from '../friends/FriendAvatar'
import { blockedUsersQueryKey, friendOverviewQueryKey, incomingCountQueryKey, socialProfileQueryKey } from '../friends/friendQueryKeys'
import './Profile.css'

const MIN_DISPLAY_NAME_LENGTH = 1
const MAX_DISPLAY_NAME_LENGTH = 24

export function Profile() {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const profileQuery = useQuery({ queryKey: ['user-profile'], queryFn: () => workoutRepository.getProfile() })
  const [draft, setDraft] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => { if (profileQuery.data) setDraft(profileQuery.data.displayName) }, [profileQuery.data])

  const saveMutation = useMutation({
    mutationFn: (displayName: string) => workoutRepository.updateProfile({ displayName, avatarUrl: profileQuery.data?.avatarUrl ?? null }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['user-profile'], saved)
      void queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      void queryClient.invalidateQueries({ queryKey: socialProfileQueryKey })
      void queryClient.invalidateQueries({ queryKey: friendOverviewQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      void queryClient.invalidateQueries({ queryKey: blockedUsersQueryKey })
      void queryClient.invalidateQueries({ queryKey: incomingCountQueryKey })
      setValidationError(null)
    },
    onError: () => setValidationError('이름을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'),
  })

  if (profileQuery.isPending) return <main className="profile-page" aria-label="프로필을 불러오는 중" aria-busy="true"><div className="profile-skeleton" /></main>
  if (profileQuery.isError || !profileQuery.data) return <main className="profile-page profile-message"><h1>프로필을 불러오지 못했어요.</h1><p role="alert">잠시 후 다시 시도해 주세요.</p><button type="button" className="primary-button" onClick={() => void profileQuery.refetch()}>다시 시도</button></main>

  const profile = profileQuery.data
  const commit = () => {
    const name = draft.trim()
    if (name.length < MIN_DISPLAY_NAME_LENGTH || name.length > MAX_DISPLAY_NAME_LENGTH) {
      setValidationError(`표시 이름은 ${MIN_DISPLAY_NAME_LENGTH}~${MAX_DISPLAY_NAME_LENGTH}자로 입력해 주세요.`)
      return
    }
    if (name === profile.displayName) { setDraft(name); setValidationError(null); return }
    saveMutation.mutate(name)
  }

  return <main className="profile-page" aria-labelledby="profile-title">
    <button type="button" className="profile-back-button" onClick={() => navigate('/friends')}><ArrowLeft size={17} aria-hidden="true" /> 친구 화면</button>
    <section className="profile-card">
      <div className="profile-card-icon"><UserRound size={19} aria-hidden="true" /></div>
      <p className="eyebrow">YOUR PROFILE</p>
      <h1 id="profile-title">프로필</h1>
      <p className="profile-intro">친구에게 표시되는 정보를 관리합니다.</p>
      <FriendAvatar profile={profile} size="large" />
      <div className="profile-form">
        <label className="profile-field"><span>표시 이름</span><input aria-label="표시 이름" type="text" maxLength={MAX_DISPLAY_NAME_LENGTH} value={draft} disabled={saveMutation.isPending} onChange={(event) => { setDraft(event.target.value); if (validationError) setValidationError(null) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit() } }} /><small>{draft.trim().length}/{MAX_DISPLAY_NAME_LENGTH}</small></label>
        {validationError && <p className="profile-error" role="alert">{validationError}</p>}
        {saveMutation.isSuccess && !validationError && <p className="profile-saved" role="status"><Check size={15} aria-hidden="true" /> 저장했어요.</p>}
        <button type="button" className="primary-button profile-save-button" disabled={saveMutation.isPending} onClick={commit}>{saveMutation.isPending ? '저장 중…' : '변경사항 저장'}</button>
      </div>
    </section>
  </main>
}
