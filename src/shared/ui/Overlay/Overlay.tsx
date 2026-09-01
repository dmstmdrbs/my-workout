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

interface ElementIsolationSnapshot {
  element: HTMLElement
  supportsInertProperty: boolean
  hadOwnInertProperty: boolean
  inert: boolean
  hadInertAttribute: boolean
  inertAttributeValue: string | null
  hadAriaHiddenAttribute: boolean
  ariaHiddenValue: string | null
}

interface OverlayIsolationSnapshot {
  bodyOverflow: string
  appRoot: ElementIsolationSnapshot | null
}

interface OverlayRegistration {
  id: string
  backdrop: HTMLElement | null
  coveredSnapshot: ElementIsolationSnapshot | null
}

let isolationSnapshot: OverlayIsolationSnapshot | null = null
let openOverlays: OverlayRegistration[] = []

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export type OverlayPresentation = 'sheet' | 'dialog' | 'fullscreen'

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
  const backdropRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  // `onClose` is passed as a fresh inline arrow by every caller, and the
  // consuming screen can re-render on its own timers (e.g. WorkoutRunner's
  // once-a-second elapsed-time clock) while an overlay sits open. Reading it
  // through a ref -- updated by its own effect, never in the main effect's
  // dependency array -- keeps the mount/focus/keydown-listener effect below
  // from tearing down and re-running on every such re-render. Without this,
  // focus (and the "previously focused" capture used to restore it) resets
  // once a second for as long as the overlay stays open.
  const onCloseRef = useRef(onClose)

  if (isOpen && layerRef.current === null) layerRef.current = nextOverlayLayer++
  if (!isOpen) layerRef.current = null

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const unregisterOverlay = registerOverlay(id, backdropRef.current)

    const panel = panelRef.current
    const initialFocusTarget = panel?.querySelector<HTMLElement>('[data-overlay-initial-focus]')
      ?? panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ?? panel
    initialFocusTarget?.focus()

    const handleKeydown = (event: KeyboardEvent) => {
      if (openOverlays.at(-1)?.id !== id) return
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key === 'Tab') trapTabFocus(event, panelRef.current)
    }

    document.addEventListener('keydown', handleKeydown)
    return () => {
      document.removeEventListener('keydown', handleKeydown)
      const wasTopmost = openOverlays.at(-1)?.id === id
      unregisterOverlay()
      if (wasTopmost) previouslyFocusedRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onClose is read through onCloseRef intentionally; see comment above.
  }, [isOpen, id])

  if (!isOpen) return null

  const zIndex = OVERLAY_BASE_Z + (layerRef.current ?? 0) * OVERLAY_LAYER_STEP

  return createPortal(
    <div
      className={`overlay-backdrop overlay-backdrop--${presentation}`}
      style={{ zIndex }}
      role="presentation"
      ref={backdropRef}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && openOverlays.at(-1)?.id === id) onCloseRef.current()
      }}
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

function registerOverlay(id: string, backdrop: HTMLElement | null) {
  if (openOverlays.length === 0) lockBackground()
  const registration: OverlayRegistration = { id, backdrop, coveredSnapshot: null }
  openOverlays = [...openOverlays, registration]
  syncOverlayLayers()
  let isRegistered = true

  return () => {
    if (!isRegistered) return
    isRegistered = false
    if (registration.coveredSnapshot) restoreElementIsolation(registration.coveredSnapshot)
    openOverlays = openOverlays.filter((entry) => entry !== registration)
    if (openOverlays.length === 0) {
      restoreBackground()
      return
    }
    syncOverlayLayers()
  }
}

function lockBackground() {
  const appRoot = document.getElementById('root')
  isolationSnapshot = {
    bodyOverflow: document.body.style.overflow,
    appRoot: appRoot ? captureElementIsolation(appRoot) : null,
  }

  document.body.style.overflow = 'hidden'
  if (appRoot) isolateElement(appRoot)
}

function restoreBackground() {
  const snapshot = isolationSnapshot
  isolationSnapshot = null
  if (!snapshot) return

  document.body.style.overflow = snapshot.bodyOverflow
  if (snapshot.appRoot) restoreElementIsolation(snapshot.appRoot)
}

function syncOverlayLayers() {
  const topIndex = openOverlays.length - 1
  openOverlays.forEach((registration, index) => {
    if (!registration.backdrop) return
    if (index === topIndex) {
      if (registration.coveredSnapshot) {
        restoreElementIsolation(registration.coveredSnapshot)
        registration.coveredSnapshot = null
      }
      return
    }
    if (!registration.coveredSnapshot) registration.coveredSnapshot = captureElementIsolation(registration.backdrop)
    isolateElement(registration.backdrop)
  })
}

function captureElementIsolation(element: HTMLElement): ElementIsolationSnapshot {
  const inertElement = element as (HTMLElement & { inert?: boolean })
  return {
    element,
    supportsInertProperty: 'inert' in element,
    hadOwnInertProperty: Object.prototype.hasOwnProperty.call(element, 'inert'),
    inert: inertElement.inert ?? element.hasAttribute('inert'),
    hadInertAttribute: element.hasAttribute('inert'),
    inertAttributeValue: element.getAttribute('inert'),
    hadAriaHiddenAttribute: element.hasAttribute('aria-hidden'),
    ariaHiddenValue: element.getAttribute('aria-hidden'),
  }
}

function isolateElement(element: HTMLElement) {
  const inertElement = element as (HTMLElement & { inert?: boolean })
  inertElement.inert = true
  element.setAttribute('inert', '')
  element.setAttribute('aria-hidden', 'true')
}

function restoreElementIsolation(snapshot: ElementIsolationSnapshot) {
  const { element } = snapshot
  const inertElement = element as (HTMLElement & { inert?: boolean })
  if (snapshot.supportsInertProperty || snapshot.hadOwnInertProperty) {
    inertElement.inert = snapshot.inert
  } else {
    Reflect.deleteProperty(inertElement, 'inert')
  }
  if (snapshot.hadInertAttribute) {
    element.setAttribute('inert', snapshot.inertAttributeValue ?? '')
  } else {
    element.removeAttribute('inert')
  }
  if (snapshot.hadAriaHiddenAttribute) {
    element.setAttribute('aria-hidden', snapshot.ariaHiddenValue ?? '')
  } else {
    element.removeAttribute('aria-hidden')
  }
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
