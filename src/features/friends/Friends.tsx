import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clipboard, Link2, LoaderCircle, UserPlus, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppServices } from '../../services'
import type { FriendInvite, FriendRequest, FriendSummary } from '../../types/domain'
import { FriendAvatar } from './FriendAvatar'
import { blockedUsersQueryKey, friendOverviewQueryKey, incomingCountQueryKey, socialProfileQueryKey } from './friendQueryKeys'
import { getFriendInviteUrl, shareFriendInvite } from './shareFriendInvite'
import './Friends.css'

export function Friends() {
  const { socialRepository } = useAppServices()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const profileQuery = useQuery({ queryKey: socialProfileQueryKey, queryFn: () => socialRepository.getMySocialProfile() })
  const overviewQuery = useQuery({ queryKey: friendOverviewQueryKey, queryFn: () => socialRepository.getFriendOverview() })
  const blockedQuery = useQuery({ queryKey: blockedUsersQueryKey, queryFn: () => socialRepository.listBlockedUsers() })

  const invalidateSocial = () => {
    void queryClient.invalidateQueries({ queryKey: friendOverviewQueryKey })
    void queryClient.invalidateQueries({ queryKey: socialProfileQueryKey })
    void queryClient.invalidateQueries({ queryKey: blockedUsersQueryKey })
    void queryClient.invalidateQueries({ queryKey: incomingCountQueryKey })
  }

  const actionMutation = useMutation({
    mutationFn: async ({ action, friendshipId, userId }: { action: 'accept' | 'decline' | 'cancel' | 'remove' | 'unblock'; friendshipId?: string; userId?: string }) => {
      if (action === 'accept') return socialRepository.acceptRequest(friendshipId as string)
      if (action === 'decline') return socialRepository.declineRequest(friendshipId as string)
      if (action === 'cancel') return socialRepository.cancelRequest(friendshipId as string)
      if (action === 'remove') return socialRepository.removeFriend(friendshipId as string)
      return socialRepository.unblockUser(userId as string)
    },
    onMutate: () => { setError(null); setNotice(null) },
    onSuccess: (_data, variables) => {
      invalidateSocial()
      setNotice(variables.action === 'accept' ? '친구 요청을 수락했어요.' : variables.action === 'unblock' ? '차단을 해제했어요.' : '변경사항을 저장했어요.')
    },
    onError: () => setError('요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'),
  })

  const inviteMutation = useMutation({
    mutationFn: () => socialRepository.createOrRotateInvite(),
    onMutate: () => { setError(null); setNotice(null) },
    onSuccess: async (invite) => {
      invalidateSocial()
      await shareInvite(invite)
    },
    onError: () => setError('초대 링크를 만들지 못했어요. 잠시 후 다시 시도해 주세요.'),
  })

  const shareInvite = async (invite: FriendInvite) => {
    try {
      const result = await shareFriendInvite(invite)
      if (result === 'shared') setNotice('친구 초대 링크를 공유했어요.')
      if (result === 'copied') setNotice('초대 링크를 클립보드에 복사했어요.')
    } catch {
      setError(`링크를 복사하지 못했어요. 직접 복사해 주세요: ${getFriendInviteUrl(invite)}`)
    }
  }

  if (profileQuery.isPending || overviewQuery.isPending) return <FriendsLoading />
  if (profileQuery.isError || !profileQuery.data || overviewQuery.isError || !overviewQuery.data) {
    return <FriendsError onRetry={() => { void profileQuery.refetch(); void overviewQuery.refetch() }} />
  }

  const overview = overviewQuery.data
  return (
    <main className="friends-page" aria-labelledby="friends-title">
      <header className="friends-heading">
        <div>
          <p className="eyebrow">YOUR CIRCLE</p>
          <h1 id="friends-title">친구</h1>
          <p>친구와 연결하고 운동을 꾸준히 이어가 보세요.</p>
        </div>
        <button type="button" className="friends-profile-link" onClick={() => navigate('/profile')}>
          <FriendAvatar profile={profileQuery.data} size="medium" />
          <span className="friends-profile-label">내 프로필</span>
        </button>
      </header>

      {(error || notice) && <p className={error ? 'friends-feedback is-error' : 'friends-feedback'} role={error ? 'alert' : 'status'}>{error ?? notice}</p>}

      <section className="friends-invite-card" aria-labelledby="friends-invite-title">
        <div className="friends-card-icon"><UserPlus size={19} aria-hidden="true" /></div>
        <div className="friends-invite-copy">
          <h2 id="friends-invite-title">친구 초대</h2>
          <p>링크를 보내면 상대가 친구 요청을 보낼 수 있어요. 링크는 30일 동안 유효합니다.</p>
          <div className="friends-invite-actions">
            <button type="button" className="primary-button" disabled={inviteMutation.isPending} onClick={() => overview.activeInvite ? void shareInvite(overview.activeInvite) : inviteMutation.mutate()}>
              {inviteMutation.isPending ? <LoaderCircle className="friends-spin" size={16} aria-hidden="true" /> : overview.activeInvite ? <Clipboard size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
              {overview.activeInvite ? '초대 링크 공유' : '초대 링크 만들기'}
            </button>
            {overview.activeInvite && <button type="button" className="secondary-button" disabled={inviteMutation.isPending} onClick={() => inviteMutation.mutate()}>새 링크 만들기</button>}
          </div>
        </div>
      </section>

      <div className="friends-grid">
        <section className="friends-card" aria-labelledby="friend-list-title">
          <div className="friends-section-heading"><div><p className="card-kicker">CONNECTED</p><h2 id="friend-list-title">친구 {overview.friends.length > 0 && <span>{overview.friends.length}</span>}</h2></div><Users size={19} aria-hidden="true" /></div>
          {overview.friends.length ? <ul className="friend-list">{overview.friends.map((friend) => <FriendRow key={friend.friendshipId} friend={friend} onOpen={() => navigate(`/friends/${friend.friendshipId}`)} />)}</ul> : <FriendsEmpty text="아직 친구가 없어요. 초대 링크를 보내 연결해 보세요." />}
        </section>

        <div className="friends-request-column">
          <RequestSection id="incoming-requests" title="받은 요청" requests={overview.incomingRequests} actionLabel="수락" disabled={actionMutation.isPending} onAction={(id) => actionMutation.mutate({ action: 'accept', friendshipId: id })} secondaryLabel="거절" onSecondary={(id) => actionMutation.mutate({ action: 'decline', friendshipId: id })} />
          <RequestSection id="outgoing-requests" title="보낸 요청" requests={overview.outgoingRequests} actionLabel="취소" disabled={actionMutation.isPending} onAction={(id) => actionMutation.mutate({ action: 'cancel', friendshipId: id })} />
        </div>
      </div>

      {blockedQuery.data && blockedQuery.data.length > 0 && <section className="friends-card blocked-card" aria-labelledby="blocked-title">
        <div className="friends-section-heading"><div><p className="card-kicker">PRIVACY</p><h2 id="blocked-title">차단한 사용자</h2></div></div>
        <ul className="friend-list">{blockedQuery.data.map((blocked) => <li className="friend-row" key={blocked.profile.userId}><FriendAvatar profile={blocked.profile} /><span className="friend-row-copy"><strong>{blocked.profile.displayName}</strong><small>차단됨</small></span><button type="button" className="small-secondary-button" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ action: 'unblock', userId: blocked.profile.userId })}>해제</button></li>)}</ul>
      </section>}
    </main>
  )
}

function FriendRow({ friend, onOpen }: { friend: FriendSummary; onOpen: () => void }) {
  return <li><button type="button" className="friend-row friend-row-button" onClick={onOpen}><FriendAvatar profile={friend.profile} /><span className="friend-row-copy"><strong>{friend.profile.displayName}</strong><small>친구가 된 날 · {formatDate(friend.friendsSince)}</small></span><span className="friend-row-arrow" aria-hidden="true">›</span></button></li>
}

function RequestSection({ id, title, requests, actionLabel, secondaryLabel, disabled, onAction, onSecondary }: { id: string; title: string; requests: FriendRequest[]; actionLabel: string; secondaryLabel?: string; disabled: boolean; onAction: (id: string) => void; onSecondary?: (id: string) => void }) {
  return <section className="friends-card request-card" aria-labelledby={id}><div className="friends-section-heading"><h2 id={id}>{title} {requests.length > 0 && <span>{requests.length}</span>}</h2></div>{requests.length ? <ul className="request-list">{requests.map((request) => <li className="request-row" key={request.friendshipId}><FriendAvatar profile={request.profile} size="small" /><span className="friend-row-copy"><strong>{request.profile.displayName}</strong><small>{formatDate(request.requestedAt)}</small></span><span className="request-actions"><button type="button" className="small-primary-button" disabled={disabled} onClick={() => onAction(request.friendshipId)}>{actionLabel}</button>{secondaryLabel && onSecondary && <button type="button" className="small-secondary-button" disabled={disabled} onClick={() => onSecondary(request.friendshipId)}>{secondaryLabel}</button>}</span></li>)}</ul> : <p className="request-empty">새로운 요청이 없습니다.</p>}</section>
}

function FriendsEmpty({ text }: { text: string }) { return <div className="friends-empty"><Users size={21} aria-hidden="true" /><p>{text}</p></div> }
function FriendsLoading() { return <main className="friends-page" aria-label="친구를 불러오는 중" aria-busy="true"><div className="friends-skeleton heading" /><div className="friends-skeleton invite" /><div className="friends-skeleton content" /></main> }
function FriendsError({ onRetry }: { onRetry: () => void }) { return <main className="friends-page friends-message"><h1>친구 정보를 불러오지 못했어요.</h1><p role="alert">잠시 후 다시 시도해 주세요.</p><button className="primary-button" type="button" onClick={onRetry}>다시 시도</button></main> }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '날짜 미상' : new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }).format(date) }
