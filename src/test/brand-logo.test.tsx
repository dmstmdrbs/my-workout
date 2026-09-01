import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { BrandLogo } from '../shared/ui'

describe('BrandLogo', () => {
  test('title을 주면 이름을 가진 이미지로 노출된다', () => {
    render(<BrandLogo title="Trainlog" />)
    expect(screen.getByRole('img', { name: 'Trainlog' })).toBeTruthy()
  })

  test('title이 없으면 장식으로 취급돼 접근성 트리에서 빠진다', () => {
    const { container } = render(<BrandLogo />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  test('기본 variant는 워드마크다', () => {
    const { container } = render(<BrandLogo />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('27.7 1.4 97.4 21.1')
    expect(svg?.querySelector('circle')).not.toBeNull() // i의 점 = 워드마크가 있다
  })

  test('symbol variant는 정사각 심볼만 그린다', () => {
    const { container } = render(<BrandLogo variant="symbol" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg?.querySelector('circle')).toBeNull() // i의 점이 없다 = 워드마크가 없다
  })

  test('두 variant는 서로 다른 패스를 그린다', () => {
    const wordmark = render(<BrandLogo />).container.querySelectorAll('path').length
    const symbol = render(<BrandLogo variant="symbol" />).container.querySelectorAll('path').length
    expect(wordmark).toBe(12) // ink 8 + accent 4
    expect(symbol).toBe(6)    // check 1 + dumbbell 5
  })

  test('className을 주면 기본 클래스와 함께 붙는다', () => {
    const { container } = render(<BrandLogo className="share-card-logo" />)
    const className = container.querySelector('svg')?.getAttribute('class')
    expect(className).toContain('brand-logo')
    expect(className).toContain('share-card-logo')
  })
})
