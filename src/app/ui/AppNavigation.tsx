import { Menu, MoreHorizontal, Settings2 } from 'lucide-react'
import type { KeyboardEvent, RefObject } from 'react'
import { BrandLogo } from '../../shared/ui'
import type { PageId } from '../model/navigation'
import {
  bottomNavPages,
  formatRequestCount,
  getNavigationItem,
  moreMenuPages,
  sideNavPages,
} from './navigationItems'

interface NavigationProps {
  activePage: PageId | null
  incomingFriendRequestCount: number
  onSelectPage: (page: PageId) => void
}

interface SideNavigationProps extends NavigationProps {
  isOpen: boolean
}

export function SideNavigation({
  activePage,
  incomingFriendRequestCount,
  isOpen,
  onSelectPage,
}: SideNavigationProps) {
  return (
    <aside className={`side-nav ${isOpen ? 'is-open' : ''}`} aria-label="주 메뉴">
      <div className="brand-mark">
        <BrandLogo title="Trainlog" />
      </div>
      <nav className="side-nav-links">
        {sideNavPages.map((id) => {
          const item = getNavigationItem(id)
          const Icon = item.icon
          return (
            <button
              className={`nav-link ${activePage === item.id ? 'is-active' : ''}`}
              key={item.id}
              onClick={() => onSelectPage(item.id)}
              type="button"
            >
              <Icon size={19} aria-hidden="true" />
              <span>{item.label}</span>
              {item.id === 'friends' && (
                <RequestBadge count={incomingFriendRequestCount} />
              )}
            </button>
          )
        })}
      </nav>
      <div className="side-nav-footer">
        <button
          className={`nav-link ${activePage === 'settings' ? 'is-active' : ''}`}
          onClick={() => onSelectPage('settings')}
          type="button"
        >
          <Settings2 size={19} aria-hidden="true" />
          <span>설정</span>
        </button>
      </div>
    </aside>
  )
}

interface TopBarProps extends NavigationProps {
  isMobileMenuOpen: boolean
  isMoreMenuOpen: boolean
  moreMenuRef: RefObject<HTMLDivElement | null>
  moreMenuButtonRef: RefObject<HTMLButtonElement | null>
  onToggleMobileMenu: () => void
  onToggleMoreMenu: () => void
  onMoveMoreMenuFocus: (event: KeyboardEvent<HTMLDivElement>) => void
}

export function TopBar({
  incomingFriendRequestCount,
  isMobileMenuOpen,
  isMoreMenuOpen,
  moreMenuRef,
  moreMenuButtonRef,
  onSelectPage,
  onToggleMobileMenu,
  onToggleMoreMenu,
  onMoveMoreMenuFocus,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <button
        className="icon-button mobile-menu-button"
        onClick={onToggleMobileMenu}
        type="button"
        aria-label="메뉴 열기"
        aria-expanded={isMobileMenuOpen}
      >
        <Menu size={21} aria-hidden="true" />
      </button>
      <div className="mobile-brand"><BrandLogo title="Trainlog" /></div>
      <div className="top-bar-actions">
        <span className="sync-indicator" title="기기에 안전하게 저장됨">
          <span aria-hidden="true" /> 저장됨
        </span>
        <div className="top-bar-menu" ref={moreMenuRef}>
          <button
            className="icon-button"
            type="button"
            aria-label="더보기 메뉴"
            aria-haspopup="menu"
            aria-expanded={isMoreMenuOpen}
            onClick={onToggleMoreMenu}
            ref={moreMenuButtonRef}
          >
            <MoreHorizontal size={20} aria-hidden="true" />
          </button>
          {isMoreMenuOpen && (
            <div
              className="top-bar-popover"
              role="menu"
              aria-label="더보기"
              onKeyDown={onMoveMoreMenuFocus}
            >
              {moreMenuPages.map((id) => {
                const item = getNavigationItem(id)
                const Icon = item.icon
                return (
                  <button type="button" role="menuitem" key={id} onClick={() => onSelectPage(id)}>
                    <Icon size={17} aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.id === 'friends' && (
                      <RequestBadge count={incomingFriendRequestCount} />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

interface BottomNavigationProps extends NavigationProps {
  isMoreMenuOpen: boolean
  moreMenuButtonRef: RefObject<HTMLButtonElement | null>
  onToggleMoreMenu: () => void
}

export function BottomNavigation({
  activePage,
  isMoreMenuOpen,
  moreMenuButtonRef,
  onSelectPage,
  onToggleMoreMenu,
}: BottomNavigationProps) {
  return (
    <nav className="bottom-nav" aria-label="모바일 주 메뉴">
      {bottomNavPages.map((id) => {
        const item = getNavigationItem(id)
        const Icon = item.icon
        return (
          <button
            className={activePage === item.id ? 'is-active' : ''}
            key={item.id}
            onClick={() => onSelectPage(item.id)}
            type="button"
            aria-current={activePage === item.id ? 'page' : undefined}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{item.label === '대시보드' ? '홈' : item.label}</span>
          </button>
        )
      })}
      <button
        className={activePage !== null && moreMenuPages.includes(activePage) ? 'is-active' : ''}
        onClick={onToggleMoreMenu}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isMoreMenuOpen}
        ref={moreMenuButtonRef}
      >
        <MoreHorizontal size={21} aria-hidden="true" />
        <span>더보기</span>
      </button>
    </nav>
  )
}

function RequestBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="nav-badge" aria-label={`${count}개의 새 친구 요청`}>
      {formatRequestCount(count)}
    </span>
  )
}
