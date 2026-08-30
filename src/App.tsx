import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MemoryRouter, Navigate, Route, Routes, useInRouterContext, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  CalendarRange,
  CalendarDays,
  Clock3,
  Dumbbell,
  Home,
  Layers3,
  Menu,
  MoreHorizontal,
  ListChecks,
  Scale,
  SearchX,
  Settings2,
  UserRound,
  Users,
} from 'lucide-react'
import { BrandLogo } from './components/BrandLogo'
import { BodyMeasurements } from './features/body/BodyMeasurements'
import { Dashboard } from './features/dashboard/Dashboard'
import { ExerciseCatalog } from './features/exercises/ExerciseCatalog'
import { Programs } from './features/programs/Programs'
import { Records } from './features/records/Records'
import { RecordDetail } from './features/records/RecordDetail'
import { RecordEditor } from './features/records/RecordEditor'
import { WorkoutComplete } from './features/records/WorkoutComplete'
import { RoutineManager } from './features/routines/RoutineManager'
import { Settings } from './features/settings/Settings'
import { Stats } from './features/stats/Stats'
import { WorkoutRunner } from './features/workout/WorkoutRunner'
import { FriendDetail } from './features/friends/FriendDetail'
import { Friends } from './features/friends/Friends'
import { InviteLanding } from './features/friends/InviteLanding'
import { Profile } from './features/profile/Profile'
import { readStoredWorkoutDraft, workoutDraftStorageKey, type StoredWorkoutDraft } from './features/workout/activeWorkoutDraft'
import { useAppServices, useSettings } from './services'
import type { AuthSession } from './services'
import { formatElapsedTime, getEffectivePausedSeconds } from './lib/duration'
import { applyTheme } from './lib/theme'
import './App.css'

type PageId = 'dashboard' | 'programs' | 'workout' | 'routines' | 'records' | 'stats' | 'body' | 'exercises' | 'friends' | 'profile' | 'settings'

const navigation: Array<{ id: PageId; label: string; icon: typeof Home }> = [
  { id: 'dashboard', label: '대시보드', icon: Home },
  { id: 'programs', label: '프로그램', icon: CalendarRange },
  { id: 'workout', label: '운동 시작', icon: Dumbbell },
  { id: 'routines', label: '루틴', icon: Layers3 },
  { id: 'records', label: '기록', icon: CalendarDays },
  { id: 'friends', label: '친구', icon: Users },
  { id: 'stats', label: '통계', icon: BarChart3 },
  { id: 'body', label: '신체 기록', icon: Scale },
  { id: 'exercises', label: '종목 관리', icon: ListChecks },
  { id: 'profile', label: '프로필', icon: UserRound },
  { id: 'settings', label: '설정', icon: Settings2 },
]

const pagePaths: Record<PageId, string> = {
  dashboard: '/',
  programs: '/programs',
  workout: '/workout',
  routines: '/routines',
  records: '/records',
  friends: '/friends',
  stats: '/stats',
  body: '/body',
  exercises: '/exercises',
  profile: '/profile',
  settings: '/settings',
}

// Explicit placement: slicing the navigation array silently reshuffles menus
// whenever an entry is inserted.
const sideNavPages: PageId[] = ['dashboard', 'programs', 'workout', 'routines', 'records', 'friends', 'stats', 'body', 'exercises']
const bottomNavPages: PageId[] = ['dashboard', 'programs', 'workout', 'records']
const moreMenuPages: PageId[] = ['friends', 'profile', 'routines', 'stats', 'body', 'exercises', 'settings']

function navItem(id: PageId) {
  const item = navigation.find((entry) => entry.id === id)
  if (!item) throw new Error(`Unknown navigation page: ${id}`)
  return item
}

function App() {
  const isInsideRouter = useInRouterContext()

  // App is also rendered directly by the component tests. The production entry
  // point supplies BrowserRouter, while this fallback keeps the component usable
  // in isolation without changing the test harness.
  return isInsideRouter ? <AppShell /> : <MemoryRouter><AppShell /></MemoryRouter>
}

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { auth, socialRepository } = useAppServices()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const [activeWorkoutDraft, setActiveWorkoutDraft] = useState<StoredWorkoutDraft | null>(() => readStoredWorkoutDraft())
  const [activeWorkoutClock, setActiveWorkoutClock] = useState(Date.now())
  // 편집 중 고친 내용이 남아 있는지. 기록 편집 화면이 알려 주고, 아래
  // navigateTo가 다른 화면으로 나가려는 조작을 막는 데 쓴다.
  const [hasUnsavedRecordEdit, setHasUnsavedRecordEdit] = useState(false)
  const [authState, setAuthState] = useState<{ isLoading: boolean; session: AuthSession | null; error: string | null }>({
    isLoading: true,
    session: null,
    error: null,
  })
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const moreMenuButtonRef = useRef<HTMLButtonElement>(null)
  const moreMenuBottomButtonRef = useRef<HTMLButtonElement>(null)

  const activePage = getActivePage(location.pathname)
  const requestedProgramDayId = new URLSearchParams(location.search).get('programDay')

  // Settings (and the theme they carry) are only meaningful once signed in;
  // `enabled` keeps this from firing failing requests against the mock/
  // Supabase repository while signed out.
  const settingsQuery = useSettings({ enabled: Boolean(authState.session) })
  const incomingFriendRequestQuery = useQuery({
    queryKey: ['friend-incoming-count'],
    queryFn: () => socialRepository.getIncomingRequestCount(),
    enabled: Boolean(authState.session),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const incomingFriendRequestCount = incomingFriendRequestQuery.data ?? 0

  // The database is the source of truth for theme (AGENTS rule 9). The
  // localStorage mirror only prevents a first-paint flash; this effect is
  // what actually reconciles the painted theme with the DB value once
  // settings load or change, on every device and every account.
  useEffect(() => {
    if (settingsQuery.data) applyTheme(settingsQuery.data.theme)
  }, [settingsQuery.data])

  useEffect(() => {
    let isMounted = true
    const applySession = (session: AuthSession | null) => {
      if (isMounted) setAuthState({ isLoading: false, session, error: null })
    }
    const unsubscribe = auth.onAuthStateChange(applySession)
    void auth.getSession().then(applySession).catch((error: unknown) => {
      if (isMounted) setAuthState({ isLoading: false, session: null, error: error instanceof Error ? error.message : '로그인 상태를 확인하지 못했어요.' })
    })
    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [auth])

  useEffect(() => {
    if (!isMoreMenuOpen) return

    moreMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node
      // The bottom-nav toggle button lives outside moreMenuRef (the popover
      // is anchored in the top bar). Without this exclusion, pressing it
      // while open fires pointerdown (closes) then click (reopens), so the
      // menu can never be closed from its own toggle button.
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

  useEffect(() => {
    if (!activeWorkoutDraft) return
    const protectDraftOnUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectDraftOnUnload)
    return () => window.removeEventListener('beforeunload', protectDraftOnUnload)
  }, [activeWorkoutDraft])

  useEffect(() => {
    const restoreExternalDraft = (event: StorageEvent) => {
      if (event.key === workoutDraftStorageKey) {
        setActiveWorkoutDraft(readStoredWorkoutDraft())
        setActiveWorkoutClock(Date.now())
      }
    }
    window.addEventListener('storage', restoreExternalDraft)
    return () => window.removeEventListener('storage', restoreExternalDraft)
  }, [])

  useEffect(() => {
    if (!activeWorkoutDraft || location.pathname === '/workout') return
    setActiveWorkoutClock(Date.now())
    const interval = window.setInterval(() => setActiveWorkoutClock(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [activeWorkoutDraft, location.pathname])

  const moveMoreMenuFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
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
  }

  const navigateTo = (to: string) => {
    if (activePage === 'workout' && to !== pagePaths.workout && activeWorkoutDraft) {
      const shouldLeave = window.confirm('진행 중인 운동이 있습니다. 초안은 이 기기에 임시 저장되며, 다시 운동 시작 메뉴에서 이어서 할 수 있습니다. 나갈까요?')
      if (!shouldLeave) return
    }
    if (hasUnsavedRecordEdit) {
      const shouldLeave = window.confirm('고친 기록을 저장하지 않았습니다. 나가면 수정한 내용이 사라집니다. 나갈까요?')
      if (!shouldLeave) return
      setHasUnsavedRecordEdit(false)
    }
    navigate(to)
    setIsMobileMenuOpen(false)
    setIsMoreMenuOpen(false)
  }

  const selectPage = (page: PageId) => navigateTo(pagePaths[page])

  const handleDraftStateChange = useCallback((draft: StoredWorkoutDraft | null) => {
    setActiveWorkoutDraft(draft)
    setActiveWorkoutClock(Date.now())
  }, [])

  const startGoogleSignIn = async () => {
    setAuthState((current) => ({ ...current, error: null }))
    try {
      await auth.signInWithGoogle({ redirectTo: window.location.href })
    } catch (error) {
      setAuthState((current) => ({ ...current, error: error instanceof Error ? error.message : 'Google 로그인을 시작하지 못했어요.' }))
    }
  }

  if (authState.isLoading) return <AuthLoading />
  if (!authState.session) return <SignInGate error={authState.error} onSignIn={() => void startGoogleSignIn()} />

  return (
    <div className="app-shell">
      <aside className={`side-nav ${isMobileMenuOpen ? 'is-open' : ''}`} aria-label="주 메뉴">
        <div className="brand-mark">
          <BrandLogo title="Trainlog" />
        </div>
        <nav className="side-nav-links">
          {sideNavPages.map((id) => {
            const item = navItem(id)
            const Icon = item.icon
            return (
              <button
                className={`nav-link ${activePage === item.id ? 'is-active' : ''}`}
                key={item.id}
                onClick={() => selectPage(item.id)}
                type="button"
              >
                <Icon size={19} aria-hidden="true" />
                <span>{item.label}</span>
                {item.id === 'friends' && incomingFriendRequestCount > 0 && (
                  <span className="nav-badge" aria-label={`${incomingFriendRequestCount}개의 새 친구 요청`}>
                    {formatRequestCount(incomingFriendRequestCount)}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
        <div className="side-nav-footer">
          <button
            className={`nav-link ${activePage === 'settings' ? 'is-active' : ''}`}
            onClick={() => selectPage('settings')}
            type="button"
          >
            <Settings2 size={19} aria-hidden="true" />
            <span>설정</span>
          </button>
        </div>
      </aside>

      <div className="app-content">
        <header className="top-bar">
          <button
            className="icon-button mobile-menu-button"
            onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
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
                onClick={() => setIsMoreMenuOpen((isOpen) => !isOpen)}
                ref={moreMenuButtonRef}
              >
                <MoreHorizontal size={20} aria-hidden="true" />
              </button>
              {isMoreMenuOpen && (
                <div className="top-bar-popover" role="menu" aria-label="더보기" onKeyDown={moveMoreMenuFocus}>
                  {moreMenuPages.map((id) => {
                    const item = navItem(id)
                    const Icon = item.icon
                    return (
                      <button type="button" role="menuitem" key={id} onClick={() => selectPage(id)}>
                        <Icon size={17} aria-hidden="true" /> <span>{item.label}</span>
                        {item.id === 'friends' && incomingFriendRequestCount > 0 && (
                          <span className="nav-badge" aria-label={`${incomingFriendRequestCount}개의 새 친구 요청`}>
                            {formatRequestCount(incomingFriendRequestCount)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<Dashboard
            onStartWorkout={() => navigateTo('/workout')}
            onViewRecords={() => navigateTo('/records')}
            onSelectSession={(sessionId) => navigateTo(`/records/${sessionId}`)}
            onManageRoutines={() => navigateTo('/routines')}
            onSelectRoutine={(routineId) => navigateTo(`/routines/${routineId}`)}
            onOpenPrograms={() => navigateTo('/programs')}
            onStartProgramDay={(dayId) => navigateTo(`/workout?programDay=${dayId}`)}
          />} />
          <Route path="/workout" element={<WorkoutRunner
            initialProgramRunDayId={requestedProgramDayId}
            onSelectProgramDay={(dayId) => navigate(`/workout?programDay=${dayId}`)}
            onFinish={(sessionId) => { setActiveWorkoutDraft(null); navigate(`/workout/complete/${sessionId}`) }}
            onCancel={() => { setActiveWorkoutDraft(null); navigate(requestedProgramDayId ? '/programs' : '/') }}
            onDraftStateChange={handleDraftStateChange}
          />} />
          <Route path="/workout/complete/:sessionId" element={<WorkoutCompleteRoute onViewRecord={(sessionId) => navigate(`/records/${sessionId}`)} onGoHome={() => navigate('/')} />} />
          <Route path="/programs" element={<Programs onStartDay={(dayId) => navigate(`/workout?programDay=${dayId}`)} onSelectSession={(sessionId) => navigate(`/records/${sessionId}`)} />} />
          <Route path="/routines/:routineId?" element={<RoutineRoute onRoutineChange={(routineId) => navigate(routineId === 'new' ? '/routines/new' : routineId ? `/routines/${routineId}` : '/routines')} onStartProgramDay={(dayId) => navigate(`/workout?programDay=${dayId}`)} />} />
          <Route path="/records" element={<RecordsRoute
            onSelectDay={(dateKey) => navigate(`/records?d=${dateKey}`, { replace: true })}
            onSelectSession={(sessionId) => navigate(`/records/${sessionId}`)}
          />} />
          <Route path="/records/:sessionId/edit" element={<RecordEditRoute
            onDone={(sessionId) => navigate(`/records/${sessionId}`, { replace: true })}
            onDirtyChange={setHasUnsavedRecordEdit}
          />} />
          <Route path="/records/:sessionId" element={<RecordDetailRoute
            onBack={(dateKey) => navigate(dateKey ? `/records?d=${dateKey}` : '/records')}
            onEdit={(sessionId) => navigate(`/records/${sessionId}/edit`)}
          />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/body" element={<BodyMeasurements />} />
          <Route path="/exercises" element={<ExerciseCatalog />} />
          <Route path="/friends/invite/:token" element={<InviteLanding />} />
          <Route path="/friends/:friendshipId" element={<FriendDetail />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<UnknownPageRoute onGoHome={() => navigateTo('/')} />} />
        </Routes>
      </div>

      {activeWorkoutDraft && location.pathname !== '/workout' && (() => {
        const isPaused = activeWorkoutDraft.pausedAt !== null
        const effectivePausedSeconds = getEffectivePausedSeconds(activeWorkoutDraft.draft.pausedSeconds, activeWorkoutDraft.pausedAt, activeWorkoutClock)
        return (
          <button className={`active-workout-toast ${isPaused ? 'is-paused' : ''}`} type="button" onClick={() => navigateTo('/workout')} aria-label="진행 중인 운동 이어서 기록하기">
            <span className="active-workout-toast-icon"><Dumbbell size={18} aria-hidden="true" /></span>
            <span className="active-workout-toast-copy">
              <strong>{activeWorkoutDraft.draft.routineName ?? '자유 운동'} 진행 중{isPaused ? ' · 일시정지' : ''}</strong>
              <small><Clock3 size={14} aria-hidden="true" /> 운동 시간 {formatElapsedTime(activeWorkoutDraft.draft.startedAt, activeWorkoutClock, effectivePausedSeconds)}</small>
            </span>
            <span className="active-workout-toast-action">이어서 하기</span>
          </button>
        )
      })()}

      <nav className="bottom-nav" aria-label="모바일 주 메뉴">
        {bottomNavPages.map((id) => {
          const item = navItem(id)
          const Icon = item.icon
          return (
            <button
              className={activePage === item.id ? 'is-active' : ''}
              key={item.id}
              onClick={() => selectPage(item.id)}
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
          onClick={() => setIsMoreMenuOpen((isOpen) => !isOpen)}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isMoreMenuOpen}
          ref={moreMenuBottomButtonRef}
        >
          <MoreHorizontal size={21} aria-hidden="true" />
          <span>더보기</span>
        </button>
      </nav>
    </div>
  )
}

function AuthLoading() {
  return <main className="auth-gate" aria-label="로그인 상태를 확인하는 중">
    <div className="auth-gate-card"><BrandIcon /><p>안전하게 운동 기록을 불러오는 중…</p></div>
  </main>
}

function SignInGate({ error, onSignIn }: { error: string | null; onSignIn: () => void }) {
  return <main className="auth-gate" aria-labelledby="sign-in-title">
    <section className="auth-gate-card">
      <BrandIcon />
      <p className="eyebrow">TRAINLOG</p>
      <h1 id="sign-in-title">나의 트레이닝을 이어가세요.</h1>
      <p>Google 계정으로 로그인하면 운동 기록과 RIR 설정을 모든 기기에서 안전하게 관리할 수 있어요.</p>
      {error && <p className="auth-gate-error" role="alert">{error}</p>}
      <button className="primary-button auth-google-button" type="button" onClick={onSignIn}>Google로 계속하기</button>
      <small>개인 운동 기록만 본인 계정에서 볼 수 있습니다.</small>
    </section>
  </main>
}

function BrandIcon() {
  return <span className="brand-symbol" aria-hidden="true"><img src="/trainlog-icon.png" alt="" /></span>
}

/**
 * 보고 있는 날짜는 경로가 아니라 쿼리(`?d=YYYY-MM-DD`)에 둔다. 새 화면이 아니라
 * 같은 화면의 선택이고, 상세에서 뒤로 돌아왔을 때 보던 날이 그대로 열려야
 * 하는데 컴포넌트 상태로만 두면 리마운트에서 초기화된다.
 */
function RecordsRoute({ onSelectDay, onSelectSession }: { onSelectDay: (dateKey: string) => void; onSelectSession: (sessionId: string) => void }) {
  const [searchParams] = useSearchParams()
  const dateKey = searchParams.get('d')
  return <Records
    selectedDateKey={dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null}
    onSelectDay={onSelectDay}
    onSelectSession={onSelectSession}
  />
}

function RecordDetailRoute({ onBack, onEdit }: { onBack: (dateKey: string | null) => void; onEdit: (sessionId: string) => void }) {
  const { sessionId } = useParams()
  if (!sessionId) return <Navigate replace to="/records" />
  return <RecordDetail sessionId={sessionId} onBack={onBack} onEdit={onEdit} />
}

function RecordEditRoute({ onDone, onDirtyChange }: { onDone: (sessionId: string) => void; onDirtyChange: (isDirty: boolean) => void }) {
  const { sessionId } = useParams()
  if (!sessionId) return <Navigate replace to="/records" />
  return <RecordEditor sessionId={sessionId} onDone={() => onDone(sessionId)} onDirtyChange={onDirtyChange} />
}

function WorkoutCompleteRoute({ onViewRecord, onGoHome }: { onViewRecord: (sessionId: string) => void; onGoHome: () => void }) {
  const { sessionId } = useParams()
  if (!sessionId) return <UnknownPageRoute onGoHome={onGoHome} />
  return <WorkoutComplete sessionId={sessionId} onViewRecord={() => onViewRecord(sessionId)} onGoHome={onGoHome} />
}

function RoutineRoute({ onRoutineChange, onStartProgramDay }: { onRoutineChange: (routineId: string | 'new' | null) => void; onStartProgramDay: (dayId: string) => void }) {
  const { routineId } = useParams()
  return <RoutineManager initialSelectedRoutineId={routineId && routineId !== 'new' ? routineId : null} initialCreate={routineId === 'new'} onRoutineChange={onRoutineChange} onStartProgramDay={onStartProgramDay} />
}

function UnknownPageRoute({ onGoHome }: { onGoHome: () => void }) {
  // Deliberately does not redirect on mount. Bouncing to "/" would erase the
  // evidence of what the user actually typed, leaving no way to tell a typo
  // from a moved page from a real bug. The URL stays as entered until the
  // person chooses to leave.
  const location = useLocation()
  return <main className="placeholder-page" aria-labelledby="not-found-title">
    <div className="placeholder-icon"><SearchX size={24} aria-hidden="true" /></div>
    <p className="eyebrow">NOT FOUND</p>
    <h1 id="not-found-title">이 페이지를 찾을 수 없어요.</h1>
    <p><code>{location.pathname}</code> 주소를 확인해 주세요. 페이지가 이동했거나 존재하지 않을 수 있어요.</p>
    <button className="secondary-button" type="button" onClick={onGoHome}>홈으로 돌아가기</button>
  </main>
}

// Returns `null` for a pathname that matches no known page (an unknown
// route, e.g. a typo). No nav item should read as active in that case --
// falling through to 'stats' would make the UI claim the person is on the
// statistics screen while the content says the page doesn't exist.
function getActivePage(pathname: string): PageId | null {
  if (pathname === '/') return 'dashboard'
  if (pathname.startsWith('/workout')) return 'workout'
  if (pathname.startsWith('/programs')) return 'programs'
  if (pathname.startsWith('/routines')) return 'routines'
  if (pathname.startsWith('/records')) return 'records'
  if (pathname.startsWith('/friends')) return 'friends'
  if (pathname.startsWith('/profile')) return 'profile'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/body')) return 'body'
  if (pathname.startsWith('/exercises')) return 'exercises'
  if (pathname.startsWith('/stats')) return 'stats'
  return null
}

export default App

function formatRequestCount(count: number) {
  return count > 99 ? '99+' : String(count)
}
