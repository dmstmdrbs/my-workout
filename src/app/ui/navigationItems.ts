import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  Dumbbell,
  Home,
  Layers3,
  ListChecks,
  Scale,
  Settings2,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { PageId } from '../model/navigation'

interface NavigationItem {
  id: PageId
  label: string
  icon: LucideIcon
}

const navigationItems: NavigationItem[] = [
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

// Explicit placement keeps adding an item from silently reshuffling menus.
export const sideNavPages: PageId[] = [
  'dashboard',
  'programs',
  'workout',
  'routines',
  'records',
  'friends',
  'stats',
  'body',
  'exercises',
]
export const bottomNavPages: PageId[] = ['dashboard', 'programs', 'workout', 'records']
export const moreMenuPages: PageId[] = ['friends', 'profile', 'routines', 'stats', 'body', 'exercises', 'settings']

export function getNavigationItem(id: PageId) {
  const item = navigationItems.find((entry) => entry.id === id)
  if (!item) throw new Error(`Unknown navigation page: ${id}`)
  return item
}

export function formatRequestCount(count: number) {
  return count > 99 ? '99+' : String(count)
}
