import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock3, Link2, UserPlus, Users, X } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppServices } from '../../services'
import type { InviteResolution } from '../../types/domain'
import { FriendAvatar } from './FriendAvatar'
import { friendOverviewQueryKey, incomingCountQueryKey } from './friendQueryKeys'
import './InviteLanding.css'

export function InviteLanding() {
  const { token } = useParams<{ token: string }>()
  const { socialRepository } = useAppServices()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const inviteQuery = useQuery({
    queryKey: ['friend-invite', token],
    queryFn: () => socialRepository.resolveInvite(token ?? ''),
    enabled: Boolean(token),
  })

  const sendMutation = useMutation({
    mutationFn: () => socialRepository.sendFriendRequest(token ?? ''),
    onMutate: () => setError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: friendOverviewQueryKey })
      void queryClient.invalidateQueries({ queryKey: incomingCountQueryKey })
      void inviteQuery.refetch()
    },
    onError: () => setError('친구 요청을 보내지 못했어요. 초대 링크가 만료됐을 수 있어요.'),
  })

  const acceptMutation = useMutation({
    mutationFn: (friendshipId: string) => socialRepository.acceptRequest(friendshipId),
    onMutate: () => setError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: friendOverviewQueryKey })
      void queryClient.invalidateQueries({ queryKey: incomingCountQueryKey })
      void inviteQuery.refetch()
    },
    onError: () => setError('친구 요청을 수락하지 못했어요. 잠시 후 다시 시도해 주세요.'),
  })

  if (!token) return <InviteUnavailable />
  if (inviteQuery.isPending) return <InviteMessage title="초대 링크를 확인하고 있어요" text="잠시만 기다려 주세요." />
  if (inviteQuery.isError || !inviteQuery.data) return <InviteUnavailable />

  const resolution = inviteQuery.data
  return <InviteContent resolution={resolution} error={error} isPending={sendMutation.isPending || acceptMutation.isPending} onSend={() => sendMutation.mutate()} onAccept={(id) => acceptMutation.mutate(id)} onOpenFriend={(id) => navigate(`/friends/${id}`)} />
}

function InviteContent({ resolution, error, isPending, onSend, onAccept, onOpenFriend }: { resolution: InviteResolution; error: string | null; isPending: boolean; onSend: () => void; onAccept: (id: string) => void; onOpenFriend: (id: string) => void }) {
  const profile = resolution.profile
  const titleByState = { self: '내가 만든 초대 링크예요', available: '친구 초대가 도착했어요', outgoing_pending: '친구 요청을 보냈어요', incoming_pending: '친구 요청이 도착했어요', friends: '이미 친구예요', unavailable: '사용할 수 없는 초대 링크예요' } as const
  const title = titleByState[resolution.state]
  const description = resolution.state === 'self' ? '친구에게 이 링크를 보내 연결해 보세요.' : resolution.state === 'available' ? `${profile?.displayName ?? '이 사용자'}님과 Trainlog에서 친구가 되어 보세요.` : resolution.state === 'outgoing_pending' ? '상대가 요청을 수락하면 친구가 됩니다.' : resolution.state === 'incoming_pending' ? `${profile?.displayName ?? '상대방'}님의 요청을 수락할까요?` : resolution.state === 'friends' ? '친구 화면에서 연결 상태를 확인할 수 있어요.' : '링크가 만료되었거나 더 이상 사용할 수 없습니다.'
  return (
    <main className="invite-page" aria-labelledby="invite-title">
      <section className="invite-card">
        <div className={`invite-state-icon invite-state-${resolution.state}`} aria-hidden="true"><StateIcon state={resolution.state} /></div>
        {profile && <FriendAvatar profile={profile} size="large" />}
        <p className="eyebrow">TRAINLOG FRIENDS</p>
        <h1 id="invite-title">{title}</h1>
        <p className="invite-description">{description}</p>
        {error && <p className="invite-error" role="alert">{error}</p>}
        <div className="invite-controls">
          {resolution.state === 'available' && <button type="button" className="primary-button" disabled={isPending} onClick={onSend}><UserPlus size={17} aria-hidden="true" /> 친구 요청 보내기</button>}
          {resolution.state === 'incoming_pending' && resolution.friendshipId && <button type="button" className="primary-button" disabled={isPending} onClick={() => onAccept(resolution.friendshipId as string)}><Check size={17} aria-hidden="true" /> 친구 요청 수락</button>}
          {resolution.state === 'friends' && resolution.friendshipId && <button type="button" className="primary-button" onClick={() => onOpenFriend(resolution.friendshipId as string)}><Users size={17} aria-hidden="true" /> 친구 화면 보기</button>}
          {resolution.state === 'self' && <p className="invite-hint"><Link2 size={16} aria-hidden="true" /> 친구 화면에서 초대 링크를 다시 공유할 수 있어요.</p>}
          {resolution.state === 'outgoing_pending' && <p className="invite-hint"><Clock3 size={16} aria-hidden="true" /> 상대의 수락을 기다리고 있어요.</p>}
          {resolution.state === 'unavailable' && <p className="invite-hint"><X size={16} aria-hidden="true" /> 링크를 만든 사람에게 새 링크를 요청해 주세요.</p>}
        </div>
      </section>
    </main>
  )
}

function StateIcon({ state }: { state: InviteResolution['state'] }) {
  if (state === 'friends') return <Users size={22} />
  if (state === 'unavailable') return <X size={22} />
  if (state === 'outgoing_pending') return <Clock3 size={22} />
  if (state === 'incoming_pending') return <Check size={22} />
  return <UserPlus size={22} />
}

function InviteUnavailable() { return <InviteMessage title="사용할 수 없는 초대 링크예요" text="링크가 만료되었거나 더 이상 사용할 수 없습니다." error /> }
function InviteMessage({ title, text, error = false }: { title: string; text: string; error?: boolean }) { return <main className="invite-page"><section className="invite-card invite-message"><div className="invite-state-icon" aria-hidden="true"><Link2 size={22} /></div><h1>{title}</h1><p className={error ? 'invite-error' : 'invite-description'} role={error ? 'alert' : 'status'}>{text}</p></section></main> }
