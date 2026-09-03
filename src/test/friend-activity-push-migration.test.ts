import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  path.resolve('supabase/migrations/20260903100000_add_friend_activity_push.sql'),
  'utf8',
)

describe('친구 운동 시작 push migration', () => {
  it('토큰과 outbox를 publishable client에서 직접 읽을 수 없게 한다', () => {
    expect(migration).toContain('alter table public.push_device_tokens enable row level security')
    expect(migration).toContain('alter table public.push_notification_outbox enable row level security')
    expect(migration).toContain('from public, anon, authenticated')
  })

  it('친구·차단·토큰 여부를 확인해 outbox를 만든다', () => {
    expect(migration).toContain("f.status = 'accepted'")
    expect(migration).toContain('from public.user_blocks b')
    expect(migration).toContain('from public.push_device_tokens t')
    expect(migration).toContain("'/friends'")
  })

  it('반복 시작 알림을 30분 동안 제한한다', () => {
    expect(migration).toContain("e.created_at >= now() - interval '30 minutes'")
  })
})
