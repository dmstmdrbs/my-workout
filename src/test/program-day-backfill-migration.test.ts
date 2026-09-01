import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const migrationPath = path.resolve('supabase/migrations/20260901114346_backfill_legacy_program_day_sessions.sql')

describe('과거 프로그램 Day 세션 연결 복구 migration', () => {
  test('유일하게 식별되는 완료 세션만 같은 회차의 Day에 연결한다', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain("s.status = 'completed'")
    expect(migration).toContain('s.program_run_day_id is null')
    expect(migration).toContain("regexp_match(s.routine_name, '^Day ([1-9][0-9]*) · (.+)$')")
    expect(migration).toContain('r.created_at <= s.started_at')
    expect(migration).toContain('r.ended_at is null or s.started_at <= r.ended_at')
    expect(migration).toContain('candidate_count = 1')
    expect(migration).toContain('s.program_run_day_id is null')
  })
})
