import { beforeEach, describe, expect, test, vi } from 'vitest'

describe('친구 기능 로컬 저장소 계약', () => {
  let createLocalStorageServices: typeof import('../services')['createLocalStorageServices']

  beforeEach(async () => {
    localStorage.clear()
    // The local adapter intentionally keeps a module-level memory fallback.
    // Reloading the module gives each contract test a fresh copy of the real seed
    // while still exercising the same public factory used by the app.
    vi.resetModules()
    ;({ createLocalStorageServices } = await import('../services'))
  })

  test('seed 관계와 초대·요청·차단 상태 전이를 보장한다', async () => {
    const repository = createLocalStorageServices().socialRepository

    const seeded = await repository.getFriendOverview()
    expect(seeded.friends.some((friend) => friend.profile.userId === 'local-friend-accepted')).toBe(true)
    expect(seeded.incomingRequests.some((request) => request.profile.userId === 'local-friend-incoming')).toBe(true)
    expect(seeded.outgoingRequests.some((request) => request.profile.userId === 'local-friend-outgoing')).toBe(true)

    const previousInvite = seeded.activeInvite?.token
    const rotatedInvite = await repository.createOrRotateInvite()
    expect(rotatedInvite.token).not.toBe(previousInvite)
    expect((await repository.getFriendOverview()).activeInvite?.token).toBe(rotatedInvite.token)

    const resolved = await repository.resolveInvite('mock-invite-local-owner')
    expect(resolved.state).toBe('available')
    expect(resolved.profile?.userId).toBe('local-invite-owner')
    const request = await repository.sendFriendRequest('mock-invite-local-owner')
    expect(request.direction).toBe('outgoing')
    expect((await repository.getFriendOverview()).outgoingRequests.some((item) => item.friendshipId === request.friendshipId)).toBe(true)

    const incomingRequest = seeded.incomingRequests.find((item) => item.profile.userId === 'local-friend-incoming')
    expect(incomingRequest).toBeDefined()
    await repository.acceptRequest(incomingRequest!.friendshipId)
    const afterAccept = await repository.getFriendOverview()
    expect(afterAccept.incomingRequests.some((item) => item.friendshipId === incomingRequest!.friendshipId)).toBe(false)
    expect(afterAccept.friends.some((item) => item.profile.userId === 'local-friend-incoming')).toBe(true)

    const outgoingRequest = seeded.outgoingRequests.find((item) => item.profile.userId === 'local-friend-outgoing')
    expect(outgoingRequest).toBeDefined()
    await repository.cancelRequest(outgoingRequest!.friendshipId)
    expect((await repository.getFriendOverview()).outgoingRequests.some((item) => item.friendshipId === outgoingRequest!.friendshipId)).toBe(false)

    const acceptedFriend = seeded.friends.find((item) => item.profile.userId === 'local-friend-accepted')
    expect(acceptedFriend).toBeDefined()
    await repository.removeFriend(acceptedFriend!.friendshipId)
    expect((await repository.getFriendOverview()).friends.some((item) => item.friendshipId === acceptedFriend!.friendshipId)).toBe(false)

    await repository.blockUser('local-invite-owner')
    const afterBlock = await repository.getFriendOverview()
    expect(afterBlock.outgoingRequests.some((item) => item.profile.userId === 'local-invite-owner')).toBe(false)
    expect((await repository.listBlockedUsers()).some((item) => item.profile.userId === 'local-invite-owner')).toBe(true)

    await repository.unblockUser('local-invite-owner')
    expect((await repository.listBlockedUsers()).some((item) => item.profile.userId === 'local-invite-owner')).toBe(false)
  })
})
