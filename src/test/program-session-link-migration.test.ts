import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const migrationPath = path.resolve('supabase/migrations/20260901100000_preserve_program_day_session_link.sql')

describe('프로그램 Day 완료 세션 RPC migration', () => {
  test('완료 기록을 편집해도 program_run_day_id 연결을 보존한다', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain("v_program_run_day_id := nullif(payload ->> 'programRunDayId', '')::uuid;")
    expect(migration).toContain('program_run_day_id = v_program_run_day_id,')
    expect(migration.match(/program_run_day_id/g)?.length).toBeGreaterThanOrEqual(4)
    expect(migration).toContain("and d.day_type in ('strength', 'cardio')")
    expect(migration).toContain("edited_at = case when v_existing_status = 'completed' then now() else edited_at end")
  })
})
