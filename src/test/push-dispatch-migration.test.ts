import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  path.resolve('supabase/migrations/20260905100000_add_push_outbox_dispatch.sql'),
  'utf8',
)

describe('push outbox dispatcher migration', () => {
  it('outbox를 기기별 작업으로 분리한다', () => {
    expect(migration).toContain('device_token_id uuid')
    expect(migration).toContain('push_notification_outbox_event_device_unique_idx')
    expect(migration).toContain('on delete cascade')
  })

  it('lease와 skip locked로 동시 발송 중복을 막는다', () => {
    expect(migration).toContain('claim_id uuid')
    expect(migration).toContain("claimed_at < now() - interval '5 minutes'")
    expect(migration).toContain('for update of o skip locked')
  })

  it('재시도 횟수를 제한하고 만료 token을 삭제한다', () => {
    expect(migration).toContain('o.attempt_count < 5')
    expect(migration).toContain('dispatcher lease expired after final attempt')
    expect(migration).toContain("p_outcome = 'invalid_token'")
    expect(migration).toContain('delete from public.push_device_tokens')
  })

  it('dispatcher RPC는 service role에만 허용한다', () => {
    expect(migration).toContain('to service_role')
    expect(migration).toContain('from public, anon, authenticated')
  })
})
