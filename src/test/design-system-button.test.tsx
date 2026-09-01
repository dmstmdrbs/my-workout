import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button, IconButton } from '../shared/ui'

describe('design system buttons', () => {
  it('uses a safe button type and the requested visual variant', () => {
    render(<Button variant="secondary">취소</Button>)

    const button = screen.getByRole('button', { name: '취소' })
    expect(button.getAttribute('type')).toBe('button')
    expect(button.classList.contains('ui-button')).toBe(true)
    expect(button.classList.contains('ui-button--secondary')).toBe(true)
    expect(button.classList.contains('secondary-button')).toBe(false)
  })

  it('disables interaction and exposes busy state while loading', () => {
    render(<Button isLoading>저장 중</Button>)

    const button = screen.getByRole('button', { name: '저장 중' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
  })

  it('requires an accessible name for icon-only controls', () => {
    render(<IconButton aria-label="닫기"><span aria-hidden="true">×</span></IconButton>)

    const button = screen.getByRole('button', { name: '닫기' })
    expect(button.getAttribute('type')).toBe('button')
    expect(button.classList.contains('icon-button')).toBe(false)
  })
})
