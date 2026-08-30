import { describe, expect, test } from 'vitest'
import { normalizeAnalyticsPath, normalizeAnalyticsUrl } from './analytics'

const TOKEN = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const SESSION_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'

describe('normalizeAnalyticsPath', () => {
  test('초대 토큰을 마스킹한다', () => {
    expect(normalizeAnalyticsPath(`/friends/invite/${TOKEN}`)).toBe('/friends/invite/[token]')
  })

  test('토큰이 UUID 형식이 아니어도 위치만으로 마스킹한다', () => {
    // 토큰 형식을 나중에 바꿔도 조용히 새지 않아야 한다.
    expect(normalizeAnalyticsPath('/friends/invite/abc123XYZ')).toBe('/friends/invite/[token]')
  })

  test('행 id를 자리표시자로 합친다', () => {
    expect(normalizeAnalyticsPath(`/records/${SESSION_ID}`)).toBe('/records/[id]')
    expect(normalizeAnalyticsPath(`/records/${SESSION_ID}/edit`)).toBe('/records/[id]/edit')
    expect(normalizeAnalyticsPath(`/workout/complete/${SESSION_ID}`)).toBe('/workout/complete/[id]')
  })

  test('id가 아닌 세그먼트는 그대로 둔다', () => {
    expect(normalizeAnalyticsPath('/routines/new')).toBe('/routines/new')
    expect(normalizeAnalyticsPath('/stats')).toBe('/stats')
    expect(normalizeAnalyticsPath('/')).toBe('/')
  })
})

describe('normalizeAnalyticsUrl', () => {
  test('쿼리 값은 지우고 키는 남긴다', () => {
    expect(normalizeAnalyticsUrl(`https://trainlog-psi.vercel.app/workout?programDay=${SESSION_ID}`))
      .toBe('https://trainlog-psi.vercel.app/workout?programDay=%5Bvalue%5D')
    expect(normalizeAnalyticsUrl('https://trainlog-psi.vercel.app/records?d=2026-08-30'))
      .toBe('https://trainlog-psi.vercel.app/records?d=%5Bvalue%5D')
  })

  test('경로의 토큰과 id도 함께 정규화한다', () => {
    expect(normalizeAnalyticsUrl(`https://trainlog-psi.vercel.app/friends/invite/${TOKEN}`))
      .toBe('https://trainlog-psi.vercel.app/friends/invite/[token]')
  })

  test('해시는 버린다', () => {
    expect(normalizeAnalyticsUrl('https://trainlog-psi.vercel.app/stats#weekly'))
      .toBe('https://trainlog-psi.vercel.app/stats')
  })

  test('파싱할 수 없으면 이벤트를 버린다', () => {
    // 원본을 그대로 흘려보내면 마스킹되지 않은 토큰이 나갈 수 있다.
    expect(normalizeAnalyticsUrl('not a url')).toBeNull()
  })
})
