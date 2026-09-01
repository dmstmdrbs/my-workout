import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState, type ReactElement } from 'react'
import { Overlay } from '../shared/ui'

function renderInAppRoot(ui: ReactElement) {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
  return { ...render(ui, { container: root }), root }
}

afterEach(() => {
  document.body.style.overflow = ''
  document.querySelectorAll('#root').forEach((root) => root.remove())
})

describe('design system overlay', () => {
  it('locks body scroll and isolates the app root while open, then restores both exactly', () => {
    document.body.style.overflow = 'clip'
    const { root } = renderInAppRoot(<OverlayHarness />)

    expect(root.hasAttribute('inert')).toBe(false)
    expect(root.hasAttribute('aria-hidden')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '외부 열기' }))

    expect(document.body.style.overflow).toBe('hidden')
    expect(root.hasAttribute('inert')).toBe(true)
    expect(root.getAttribute('aria-hidden')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: '외부 닫기' }))

    expect(document.body.style.overflow).toBe('clip')
    expect(root.hasAttribute('inert')).toBe(false)
    expect(root.hasAttribute('aria-hidden')).toBe(false)
  })

  it('focuses the requested initial target and traps Tab in both directions', async () => {
    const user = userEvent.setup()
    renderInAppRoot(
      <>
        <button>트리거</button>
        <Overlay isOpen onClose={() => undefined} presentation="dialog" labelledBy="title">
          <h2 id="title">대화상자</h2>
          <button data-overlay-initial-focus>첫 번째</button>
          <button>두 번째</button>
        </Overlay>
      </>,
    )

    expect(document.activeElement).toBe(screen.getByRole('button', { name: '첫 번째' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '두 번째' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '첫 번째' }))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '두 번째' }))
  })

  it('handles Escape, backdrop close, and restores the trigger focus', () => {
    const onClose = vi.fn()
    renderInAppRoot(<ControlledOverlay onClose={onClose} />)

    const trigger = screen.getByRole('button', { name: '트리거' })
    trigger.focus()
    fireEvent.click(trigger)

    const backdrop = document.querySelector('.overlay-backdrop')!
    fireEvent.mouseDown(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps a nested overlay topmost for Escape and restores the outer overlay focus', async () => {
    const user = userEvent.setup()
    renderInAppRoot(<OverlayHarness />)

    fireEvent.click(screen.getByRole('button', { name: '외부 열기' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '내부 열기' }))
    const outerBackdrop = document.querySelector<HTMLElement>('.overlay-backdrop')!
    outerBackdrop.setAttribute('inert', 'existing')
    outerBackdrop.setAttribute('aria-hidden', 'false')
    fireEvent.click(screen.getByRole('button', { name: '내부 열기' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '내부 닫기' }))
    const backdrops = document.querySelectorAll<HTMLElement>('.overlay-backdrop')
    expect(backdrops).toHaveLength(2)
    expect(outerBackdrop.hasAttribute('inert')).toBe(true)
    expect(outerBackdrop.getAttribute('aria-hidden')).toBe('true')
    expect(backdrops[1].hasAttribute('inert')).toBe(false)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: '내부 닫기' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '내부 열기' }))
    expect(outerBackdrop.getAttribute('inert')).toBe('existing')
    expect(outerBackdrop.getAttribute('aria-hidden')).toBe('false')
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: '외부 닫기' })).toBeNull()
    expect(document.body.style.overflow).toBe('')
    await user.tab()
  })

  it('keeps the panel focused when there are no focusable children', () => {
    renderInAppRoot(
      <Overlay isOpen onClose={() => undefined} presentation="dialog" labelledBy="title">
        <h2 id="title">빈 대화상자</h2>
      </Overlay>,
    )

    const panel = document.querySelector('.overlay-panel')!
    expect(document.activeElement).toBe(panel)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(panel)
  })

  it('restores pre-existing inert and aria-hidden values after the final nested overlay closes', () => {
    document.body.style.overflow = 'scroll'
    const { root } = renderInAppRoot(<OverlayHarness />)
    root.setAttribute('inert', 'existing')
    root.setAttribute('aria-hidden', 'false')

    fireEvent.click(screen.getByRole('button', { name: '외부 열기' }))
    fireEvent.click(screen.getByRole('button', { name: '내부 열기' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(document.body.style.overflow).toBe('scroll')
    expect(root.getAttribute('inert')).toBe('existing')
    expect(root.getAttribute('aria-hidden')).toBe('false')
  })

  it('keeps the remaining top overlay active when a covered overlay unmounts out of order', () => {
    renderInAppRoot(<NonSequentialOverlayHarness />)

    fireEvent.click(screen.getByRole('button', { name: '외부 열기' }))
    fireEvent.click(screen.getByRole('button', { name: '중간 열기' }))
    fireEvent.click(screen.getByRole('button', { name: '내부 열기' }))
    const [outerBackdrop, middleBackdrop, innerBackdrop] = Array.from(document.querySelectorAll<HTMLElement>('.overlay-backdrop'))
    expect(outerBackdrop.hasAttribute('inert')).toBe(true)
    expect(middleBackdrop.hasAttribute('inert')).toBe(true)
    expect(innerBackdrop.hasAttribute('inert')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '중간 닫기', hidden: true }))
    expect(screen.queryByRole('button', { name: '중간 닫기' })).toBeNull()
    expect(screen.getByRole('button', { name: '내부 닫기' })).toBeTruthy()
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps a single focusable child focused when Tab is pressed either way', () => {
    renderInAppRoot(
      <Overlay isOpen onClose={() => undefined} presentation="dialog" labelledBy="title">
        <h2 id="title">하나의 컨트롤</h2>
        <button>확인</button>
      </Overlay>,
    )

    const button = screen.getByRole('button', { name: '확인' })
    expect(document.activeElement).toBe(button)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(button)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(button)
  })
})

function OverlayHarness() {
  const [outerOpen, setOuterOpen] = useState(false)
  const [innerOpen, setInnerOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOuterOpen(true)}>외부 열기</button>
      <Overlay isOpen={outerOpen} onClose={() => setOuterOpen(false)} presentation="dialog" labelledBy="outer-title">
        <h2 id="outer-title">외부</h2>
        <button onClick={() => setInnerOpen(true)}>내부 열기</button>
        <button onClick={() => setOuterOpen(false)}>외부 닫기</button>
      </Overlay>
      <Overlay isOpen={innerOpen} onClose={() => setInnerOpen(false)} presentation="dialog" labelledBy="inner-title">
        <h2 id="inner-title">내부</h2>
        <button>내부 닫기</button>
      </Overlay>
    </>
  )
}

function ControlledOverlay({ onClose }: { onClose: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const close = () => {
    setIsOpen(false)
    onClose()
  }

  return (
    <>
      <button onClick={() => setIsOpen(true)}>트리거</button>
      <Overlay isOpen={isOpen} onClose={close} presentation="dialog" labelledBy="controlled-title">
        <h2 id="controlled-title">대화상자</h2>
        <button>확인</button>
      </Overlay>
    </>
  )
}

function NonSequentialOverlayHarness() {
  const [outerOpen, setOuterOpen] = useState(false)
  const [middleOpen, setMiddleOpen] = useState(false)
  const [innerOpen, setInnerOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOuterOpen(true)}>외부 열기</button>
      <Overlay isOpen={outerOpen} onClose={() => setOuterOpen(false)} presentation="dialog" labelledBy="non-sequential-outer-title">
        <h2 id="non-sequential-outer-title">외부</h2>
        <button onClick={() => setMiddleOpen(true)}>중간 열기</button>
      </Overlay>
      <Overlay isOpen={middleOpen} onClose={() => setMiddleOpen(false)} presentation="dialog" labelledBy="non-sequential-middle-title">
        <h2 id="non-sequential-middle-title">중간</h2>
        <button onClick={() => setInnerOpen(true)}>내부 열기</button>
        <button onClick={() => setMiddleOpen(false)}>중간 닫기</button>
      </Overlay>
      <Overlay isOpen={innerOpen} onClose={() => setInnerOpen(false)} presentation="dialog" labelledBy="non-sequential-inner-title">
        <h2 id="non-sequential-inner-title">내부</h2>
        <button>내부 닫기</button>
      </Overlay>
    </>
  )
}
