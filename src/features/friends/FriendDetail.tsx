import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, UserMinus } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { ProfileAvatar } from '../../entities/profile'
import { blockedUsersQueryKey, friendOverviewQueryKey, incomingCountQueryKey, socialProfileQueryKey } from '../../entities/social'
import { useAppServices } from '../../services'
import { confirmAction } from '../../lib/dialog'
import './FriendDetail.css'

export function FriendDetail() {
  const { friendshipId } = useParams<{ friendshipId: string }>()
  const { socialRepository } = useAppServices()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const friendQuery = useQuery({ queryKey: ['friend-detail', friendshipId], queryFn: () => socialRepository.getFriend(friendshipId ?? ''), enabled: Boolean(friendshipId) })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: friendOverviewQueryKey })
    void queryClient.invalidateQueries({ queryKey: socialProfileQueryKey })
    void queryClient.invalidateQueries({ queryKey: blockedUsersQueryKey })
    void queryClient.invalidateQueries({ queryKey: incomingCountQueryKey })
  }
  const removeMutation = useMutation({ mutationFn: () => socialRepository.removeFriend(friendshipId ?? ''), onSuccess: () => { invalidate(); navigate('/friends') }, onError: () => setError('친구를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.') })
  const blockMutation = useMutation({ mutationFn: () => socialRepository.blockUser(friendQuery.data?.profile.userId ?? ''), onSuccess: () => { invalidate(); navigate('/friends') }, onError: () => setError('사용자를 차단하지 못했어요. 잠시 후 다시 시도해 주세요.') })

  if (friendQuery.isPending) return <main className="friend-detail-page" aria-label="친구 정보를 불러오는 중" aria-busy="true"><div className="friend-detail-skeleton" /></main>
  if (friendQuery.isError || !friendQuery.data) return <FriendNotFound onBack={() => navigate('/friends')} />
  const friend = friendQuery.data
  const busy = removeMutation.isPending || blockMutation.isPending
  const removeFriend = async () => {
    const confirmed = await confirmAction({
      title: '친구 삭제',
      message: `${friend.profile.displayName}님을 친구 목록에서 삭제할까요?`,
      okButtonTitle: '삭제',
    })
    if (confirmed) removeMutation.mutate()
  }
  const blockFriend = async () => {
    const confirmed = await confirmAction({
      title: '사용자 차단',
      message: `${friend.profile.displayName}님을 차단할까요? 친구 관계도 함께 삭제됩니다.`,
      okButtonTitle: '차단',
    })
    if (confirmed) blockMutation.mutate()
  }

  return <main className="friend-detail-page" aria-labelledby="friend-detail-title">
    <button type="button" className="friend-back-button" onClick={() => navigate('/friends')}><ArrowLeft size={17} aria-hidden="true" /> 친구 목록</button>
    <section className="friend-detail-card">
      <ProfileAvatar displayName={friend.profile.displayName} avatarUrl={friend.profile.avatarUrl} size="large" />
      <p className="eyebrow">FRIEND PROFILE</p>
      <h1 id="friend-detail-title">{friend.profile.displayName}</h1>
      <p className="friend-detail-date">{formatDate(friend.friendsSince)}부터 친구</p>
      {error && <p className="friend-detail-error" role="alert">{error}</p>}
      <div className="friend-detail-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void removeFriend()}><UserMinus size={17} aria-hidden="true" /> 친구 삭제</button>
        <button type="button" className="danger-button" disabled={busy} onClick={() => void blockFriend()}><Ban size={17} aria-hidden="true" /> 차단</button>
      </div>
    </section>
  </main>
}

function FriendNotFound({ onBack }: { onBack: () => void }) { return <main className="friend-detail-page friend-detail-message"><h1>친구 정보를 찾을 수 없어요.</h1><p role="alert">친구 관계가 삭제되었거나 접근할 수 없습니다.</p><button type="button" className="primary-button" onClick={onBack}>친구 목록으로</button></main> }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '날짜 미상' : new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(date) }
