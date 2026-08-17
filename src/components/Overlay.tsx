import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './Overlay.css'

/**
 * Shared overlay primitive for anything that needs to float above the page
 * through a portal: a bottom sheet on mobile, a centered dialog elsewhere.
 *
 * Existing hand-rolled dialogs (`ExerciseReorderDialog` in WorkoutRunner.tsx
 * at z-index 40, `DiscardChangesDialog` in RoutineManager.tsx at z-index 50)
 * are intentionally left alone -- they are tested and only ever appear one at
 * a time. This primitive exists because the exercise picker sheet needs to
 * host a second overlay (the create-exercise dialog) on top of itself, which
 * neither of those hand-rolled backdrops supports.
 *
 * Stacking: the base z-index (60) sits above every fixed UI element in the
 * app (rest-timer dock 12, bottom nav 15, active-workout toast 20, top-bar
 * popover 30) and above both existing hand-rolled dialogs (40, 50), so an
 * Overlay always wins over anything else on screen. Each Overlay that is
 * open gets a monotonically increasing "layer" number assigned the first
 * time it opens (a module-level counter that only ever goes up), so an
 * overlay opened later always renders above one opened earlier, however many
 * are nested.
 *
 * Escape handling: every open Overlay tracks its id in a shared stack, in
 * open order. Only the instance at the top of the stack -- the most recently
 * opened, topmost one -- closes itself on Escape. Closing it pops it off the
 * stack, so a second Escape press reaches the next one down.
 */

const OVERLAY_BASE_Z = 60
const OVERLAY_LAYER_STEP = 10

let nextOverlayLayer = 0
let openOverlayIds: string[] = []

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export type OverlayPresentation = 'sheet' | 'dialog'

export interface OverlayProps {
  isOpen: boolean
  onClose: () => void
  presentation: OverlayPresentation
  labelledBy: string
  describedBy?: string
  className?: string
  children: ReactNode
}

export function Overlay({ isOpen, onClose, presentation, labelledBy, describedBy, className, children }: OverlayProps) {
  const id = useId()
  const layerRef = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  if (isOpen && layerRef.current === null) layerRef.current = nextOverlayLayer++
  if (!isOpen) layerRef.current = null

  useEffect(() => {
    if (!isOpen) return

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    openOverlayIds = [...openOverlayIds, id]

    const panel = panelRef.current
    const initialFocusTarget = panel?.querySelector<HTMLElement>('[data-overlay-initial-focus]') ?? panel
    initialFocusTarget?.focus()

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (openOverlayIds.at(-1) !== id) return
        onClose()
        return
      }
      if (event.key === 'Tab') trapTabFocus(event, panelRef.current)
    }

    document.addEventListener('keydown', handleKeydown)
    return () => {
      document.removeEventListener('keydown', handleKeydown)
      openOverlayIds = openOverlayIds.filter((entry) => entry !== id)
      previouslyFocusedRef.current?.focus()
    }
  }, [isOpen, id, onClose])

  if (!isOpen) return null

  const zIndex = OVERLAY_BASE_Z + (layerRef.current ?? 0) * OVERLAY_LAYER_STEP

  return createPortal(
    <div
      className={`overlay-backdrop overlay-backdrop--${presentation}`}
      style={{ zIndex }}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        className={`overlay-panel overlay-panel--${presentation} ${className ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        ref={panelRef}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

function trapTabFocus(event: KeyboardEvent, panel: HTMLElement | null) {
  if (!panel) return
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  if (focusable.length === 0) { event.preventDefault(); return }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (event.shiftKey) {
    if (active === first || !panel.contains(active)) { event.preventDefault(); last.focus() }
  } else if (active === last || !panel.contains(active)) {
    event.preventDefault()
    first.focus()
  }
}
