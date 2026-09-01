import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

export function useNavigationMenu() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const moreMenuButtonRef = useRef<HTMLButtonElement>(null)
  const moreMenuBottomButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isMoreMenuOpen) return

    moreMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node
      if (moreMenuRef.current?.contains(target)) return
      if (moreMenuBottomButtonRef.current?.contains(target)) return
      setIsMoreMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsMoreMenuOpen(false)
      const isMobileViewport = window.matchMedia
        ? window.matchMedia('(max-width: 899px)').matches
        : window.innerWidth <= 899
      const toggleRef = isMobileViewport ? moreMenuBottomButtonRef : moreMenuButtonRef
      toggleRef.current?.focus()
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isMoreMenuOpen])

  const moveMoreMenuFocus = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    if (!items.length) return
    event.preventDefault()
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowUp'
          ? (currentIndex - 1 + items.length) % items.length
          : (currentIndex + 1) % items.length
    items[nextIndex]?.focus()
  }, [])

  const closeMenus = useCallback(() => {
    setIsMobileMenuOpen(false)
    setIsMoreMenuOpen(false)
  }, [])

  const toggleMobileMenu = useCallback(() => setIsMobileMenuOpen((isOpen) => !isOpen), [])
  const toggleMoreMenu = useCallback(() => setIsMoreMenuOpen((isOpen) => !isOpen), [])

  return {
    isMobileMenuOpen,
    isMoreMenuOpen,
    moreMenuRef,
    moreMenuButtonRef,
    moreMenuBottomButtonRef,
    moveMoreMenuFocus,
    closeMenus,
    toggleMobileMenu,
    toggleMoreMenu,
  }
}
