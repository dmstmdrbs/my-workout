import { fireEvent, render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ProfileAvatar } from './ProfileAvatar'

describe('ProfileAvatar', () => {
  test('실패한 URL은 이니셜로 대체하고 같은 URL을 유지한다', () => {
    const { container, rerender } = render(<ProfileAvatar displayName="김서준" avatarUrl="https://example.com/broken.png" size="large" />)
    const avatar = container.firstElementChild

    expect(avatar?.className).toContain('friend-avatar-large')
    expect(avatar?.getAttribute('aria-hidden')).toBe('true')
    expect(avatar?.querySelector('img')).not.toBeNull()

    fireEvent.error(avatar?.querySelector('img') as HTMLImageElement)

    expect(avatar?.querySelector('img')).toBeNull()
    expect(avatar?.textContent).toBe('김')

    rerender(<ProfileAvatar displayName="김서준" avatarUrl="https://example.com/broken.png" size="large" />)

    expect(container.firstElementChild?.querySelector('img')).toBeNull()
    expect(container.firstElementChild?.textContent).toBe('김')
  })

  test('새 URL로 바뀌면 실패한 이전 URL 대신 이미지를 다시 표시하고 늦은 오류를 무시한다', () => {
    const { container, rerender } = render(<ProfileAvatar displayName="김서준" avatarUrl="https://example.com/broken.png" />)
    const firstImage = container.querySelector('img')

    rerender(<ProfileAvatar displayName="김서준" avatarUrl="https://example.com/recovered.png" />)
    const secondImage = container.querySelector('img')

    fireEvent.error(firstImage as HTMLImageElement)

    expect(container.querySelector('img')).toBe(secondImage)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/recovered.png')

    fireEvent.error(secondImage as HTMLImageElement)

    expect(container.querySelector('img')).toBeNull()
    expect(container.firstElementChild?.textContent).toBe('김')
  })

  test('URL이 없으면 이미지 없이 fallback 이니셜을 표시한다', () => {
    const { container } = render(<ProfileAvatar displayName="" avatarUrl={null} />)

    expect(container.querySelector('img')).toBeNull()
    expect(container.firstElementChild?.textContent).toBe('?')
  })
})
