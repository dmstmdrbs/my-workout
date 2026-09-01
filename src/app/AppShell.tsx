import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { applyTheme } from '../lib/theme'
import { useIncomingFriendRequestCount } from '../features/friends'
import { useActiveWorkoutDraft } from '../features/workout'
import { useSettings } from '../services'
import { AppRoutes } from './AppRoutes'
import { getActivePage, pagePaths, type PageId } from './model/navigation'
import { useAuthSession } from './model/useAuthSession'
import { useNavigationGuard } from './model/useNavigationGuard'
import { ActiveWorkoutToast } from './ui/ActiveWorkoutToast'
import { AuthLoading, SignInGate } from './ui/AuthGate'
import { BottomNavigation, SideNavigation, TopBar } from './ui/AppNavigation'
import { useNavigationMenu } from './ui/useNavigationMenu'
import './AppShell.css'

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const auth = useAuthSession()
  const navigationMenu = useNavigationMenu()
  const { closeMenus } = navigationMenu
  const activeWorkout = useActiveWorkoutDraft(location.pathname !== pagePaths.workout)
  const [hasUnsavedRecordEdit, setHasUnsavedRecordEdit] = useState(false)

  const activePage = getActivePage(location.pathname)
  // The database remains the theme source of truth. The local mirror is only
  // used by main.tsx to avoid a flash before this authenticated query resolves.
  const settingsQuery = useSettings({ enabled: Boolean(auth.session) })
  useEffect(() => {
    if (settingsQuery.data) applyTheme(settingsQuery.data.theme)
  }, [settingsQuery.data])

  const incomingFriendRequestCount = useIncomingFriendRequestCount(Boolean(auth.session))

  const confirmNavigation = useCallback((to?: string) => {
    if (activePage === 'workout' && to !== pagePaths.workout && activeWorkout.draft) {
      const shouldLeave = window.confirm(
        '진행 중인 운동이 있습니다. 초안은 이 기기에 임시 저장되며, 다시 운동 시작 메뉴에서 이어서 할 수 있습니다. 나갈까요?',
      )
      if (!shouldLeave) return false
    }
    if (hasUnsavedRecordEdit) {
      const shouldLeave = window.confirm(
        '고친 기록을 저장하지 않았습니다. 나가면 수정한 내용이 사라집니다. 나갈까요?',
      )
      if (!shouldLeave) return false
      setHasUnsavedRecordEdit(false)
    }
    return true
  }, [activePage, activeWorkout.draft, hasUnsavedRecordEdit])

  useNavigationGuard({
    when: (activePage === 'workout' && Boolean(activeWorkout.draft)) || hasUnsavedRecordEdit,
    onConfirm: () => confirmNavigation(),
  })

  const navigateTo = useCallback((to: string) => {
    if (!confirmNavigation(to)) return
    navigate(to)
    closeMenus()
  }, [closeMenus, confirmNavigation, navigate])

  const selectPage = useCallback((page: PageId) => {
    navigateTo(pagePaths[page])
  }, [navigateTo])

  if (auth.isLoading) return <AuthLoading />
  if (!auth.session) {
    return <SignInGate error={auth.error} onSignIn={() => void auth.startGoogleSignIn()} />
  }

  const navigationProps = {
    activePage,
    incomingFriendRequestCount,
    onSelectPage: selectPage,
  }

  return (
    <div className="app-shell">
      <SideNavigation {...navigationProps} isOpen={navigationMenu.isMobileMenuOpen} />

      <div className="app-content">
        <TopBar
          {...navigationProps}
          isMobileMenuOpen={navigationMenu.isMobileMenuOpen}
          isMoreMenuOpen={navigationMenu.isMoreMenuOpen}
          moreMenuRef={navigationMenu.moreMenuRef}
          moreMenuButtonRef={navigationMenu.moreMenuButtonRef}
          onToggleMobileMenu={navigationMenu.toggleMobileMenu}
          onToggleMoreMenu={navigationMenu.toggleMoreMenu}
          onMoveMoreMenuFocus={navigationMenu.moveMoreMenuFocus}
        />

        <AppRoutes
          onNavigate={navigateTo}
          onWorkoutDraftChange={activeWorkout.updateDraft}
          onWorkoutEnd={activeWorkout.clearDraft}
          onRecordDirtyChange={setHasUnsavedRecordEdit}
        />
      </div>

      {activeWorkout.draft && location.pathname !== '/workout' && (
        <ActiveWorkoutToast
          draft={activeWorkout.draft}
          clock={activeWorkout.clock}
          onResume={() => navigateTo('/workout')}
        />
      )}

      <BottomNavigation
        {...navigationProps}
        isMoreMenuOpen={navigationMenu.isMoreMenuOpen}
        moreMenuButtonRef={navigationMenu.moreMenuBottomButtonRef}
        onToggleMoreMenu={navigationMenu.toggleMoreMenu}
      />
    </div>
  )
}
