import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  path.resolve('supabase/migrations/20260905130000_harden_friend_push_delivery.sql'),
  'utf8',
)

describe('친구 push 보강 migration', () => {
  it('같은 소유자의 token id를 유지하고 사용자당 5개로 제한한다', () => {
    expect(migration).toContain('v_existing_user_id = v_actor')
    expect(migration).toContain('where id = v_existing_id')
    expect(migration).toContain('offset 5')
  })

  it('운동 시작 중복 확인과 insert를 사용자별로 직렬화한다', () => {
    expect(migration).toContain("'push-announce:' || v_actor::text")
    expect(migration).toContain('pg_advisory_xact_lock')
  })

  it('발송 직전 친구·차단 관계를 다시 확인한다', () => {
    expect(migration).toContain('eligible as materialized')
    expect(migration).toContain('from candidates c')
    expect(migration).toContain("f.status = 'accepted'")
    expect(migration).toContain('from public.user_blocks b')
    expect(migration).toContain('friend relationship no longer permits delivery')
  })

  it('플랫폼 필터와 같은 순서로 claim index를 구성한다', () => {
    expect(migration).toContain('(platform, next_attempt_at, created_at)')
  })
})
