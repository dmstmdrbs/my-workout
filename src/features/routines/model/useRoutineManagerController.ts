import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getDateInTimeZone } from '../../../lib/localDate'
import { dashboardOverviewQueryKey, routineManagerQueryKey, useAppServices, useSettings, workoutSetupQueryKey } from '../../../services'
import type { Exercise, ProgramRun, ProgramRunDay, Routine } from '../../../types/domain'
import { blankToNull, draftFingerprint, toDraft, type RoutineDraft } from './routineDraft'

interface RoutineManagerData {
  routines: Routine[]
  exercises: Exercise[]
  activeProgramRun: ProgramRun | null
}

export type PendingNavigation =
  | { kind: 'select'; routine: Routine }
  | { kind: 'create' }
  | { kind: 'mobile-list' }

export interface RoutineManagerControllerOptions {
  initialSelectedRoutineId?: string | null
  initialCreate?: boolean
  onRoutineChange?: (routineId: string | 'new' | null) => void
  onStartProgramDay?: (dayId: string) => void
}

export interface RoutineManagerController {
  isPending: boolean
  isError: boolean
  retry: () => void
  routines: Routine[]
  exercises: Exercise[]
  activeProgramRun: ProgramRun | null
  today: string | null
  programDay: ProgramRunDay | null
  canStartProgramDay: boolean
  defaultRestSeconds: number | null
  draft: RoutineDraft | null
  notice: string | null
  isSaving: boolean
  saveError: boolean
  isMobileEditorOpen: boolean
  pendingNavigation: PendingNavigation | null
  isDirty: boolean
  routineNotFound: boolean
  selectedRoutineId: string | null
  createRoutine: () => void
  selectRoutine: (routine: Routine) => void
  requestNavigation: (navigation: PendingNavigation) => void
  updateDraft: (changes: Partial<RoutineDraft>) => void
  save: () => void
  clearNotice: () => void
  cancelPendingNavigation: () => void
  discardPendingNavigation: () => void
  startProgramDay?: (dayId: string) => void
}

export function navigationLabel(navigation: PendingNavigation) {
  return navigation.kind === 'select' ? `“${navigation.routine.name}” 루틴으로` : navigation.kind === 'create' ? '새 루틴으로' : '루틴 목록으로'
}

export function useRoutineManagerController({ initialSelectedRoutineId = null, initialCreate = false, onRoutineChange, onStartProgramDay }: RoutineManagerControllerOptions = {}): RoutineManagerController {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const settingsQuery = useSettings()
  const [draft, setDraft] = useState<RoutineDraft | null>(null)
  const [lastSavedDraft, setLastSavedDraft] = useState<RoutineDraft | null>(null)
  const [isMobileEditorOpen, setIsMobileEditorOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null)
  const appliedRouteSelection = useRef<string | null>(null)

  const setupQuery = useQuery({
    queryKey: routineManagerQueryKey,
    queryFn: async (): Promise<RoutineManagerData> => {
      const [routines, exercises, activeProgramRun] = await Promise.all([
        workoutRepository.listRoutines(),
        workoutRepository.listExercises(),
        workoutRepository.getActiveProgramRun(),
      ])
      return { routines, exercises, activeProgramRun }
    },
  })

  useEffect(() => {
    if (!setupQuery.data) return
    const routeSelection = initialCreate ? 'new' : initialSelectedRoutineId ?? 'list'
    if (appliedRouteSelection.current === routeSelection) return

    if (initialCreate) {
      setDraft({ name: '새 루틴', description: null, color: '#2563eb', exercises: [] })
      setLastSavedDraft(null)
      setNotice(null)
      setIsMobileEditorOpen(true)
    } else if (!setupQuery.data.routines.length) {
      setDraft(null)
      setLastSavedDraft(null)
    } else if (!(initialSelectedRoutineId && draft?.id === initialSelectedRoutineId)) {
      // An `initialSelectedRoutineId` that names no known routine (a deleted
      // or mistyped id) must never fall back to some other routine -- that
      // would let the person edit and save a routine they didn't ask for
      // while the URL still names the one they think they're editing. Leave
      // the draft empty; the render below shows a not-found screen instead.
      const initialRoutine = initialSelectedRoutineId
        ? setupQuery.data.routines.find((routine) => routine.id === initialSelectedRoutineId) ?? null
        : setupQuery.data.routines[0]
      if (initialRoutine) {
        const initialDraft = toDraft(initialRoutine)
        setDraft(initialDraft)
        setLastSavedDraft(initialDraft)
        setNotice(null)
      } else {
        setDraft(null)
        setLastSavedDraft(null)
      }
    }
    appliedRouteSelection.current = routeSelection
  }, [draft?.id, initialCreate, initialSelectedRoutineId, setupQuery.data])

  const saveMutation = useMutation({
    mutationFn: (routine: RoutineDraft) => workoutRepository.saveRoutine({
      ...routine,
      name: routine.name.trim(),
      description: blankToNull(routine.description),
    }),
    onSuccess: (saved) => {
      const savedDraft = toDraft(saved)
      setDraft(savedDraft)
      setLastSavedDraft(savedDraft)
      setNotice('루틴을 저장했어요.')
      void queryClient.invalidateQueries({ queryKey: routineManagerQueryKey })
      void queryClient.invalidateQueries({ queryKey: dashboardOverviewQueryKey })
      void queryClient.invalidateQueries({ queryKey: workoutSetupQueryKey.all })
      onRoutineChange?.(saved.id)
    },
  })

  const readyData = setupQuery.data && settingsQuery.data
  const routines = setupQuery.data?.routines ?? []
  const exercises = setupQuery.data?.exercises ?? []
  const activeProgramRun = setupQuery.data?.activeProgramRun ?? null
  const today = settingsQuery.data ? getDateInTimeZone(settingsQuery.data.timezone) : null
  const programDay = activeProgramRun && today
    ? activeProgramRun.days.find((day) => day.scheduledOn === today)
      ?? (today < activeProgramRun.startDate ? activeProgramRun.days[0] : null)
    : null
  const canStartProgramDay = Boolean(programDay && today && programDay.scheduledOn === today && programDay.dayType !== 'rest' && !programDay.workoutSession)
  const isDirty = draft !== null && (lastSavedDraft === null || draftFingerprint(draft) !== draftFingerprint(lastSavedDraft))

  const performNavigation = (navigation: PendingNavigation) => {
    if (navigation.kind === 'select') {
      const selectedDraft = toDraft(navigation.routine)
      setDraft(selectedDraft)
      setLastSavedDraft(selectedDraft)
      setNotice(null)
      setIsMobileEditorOpen(true)
      onRoutineChange?.(navigation.routine.id)
      return
    }
    if (navigation.kind === 'create') {
      setDraft({ name: '새 루틴', description: null, color: '#2563eb', exercises: [] })
      setLastSavedDraft(null)
      setNotice(null)
      setIsMobileEditorOpen(true)
      onRoutineChange?.('new')
      return
    }
    setIsMobileEditorOpen(false)
  }

  const requestNavigation = (navigation: PendingNavigation) => {
    if (isDirty) {
      setPendingNavigation(navigation)
      return
    }
    performNavigation(navigation)
  }

  const createRoutine = () => requestNavigation({ kind: 'create' })
  const selectRoutine = (routine: Routine) => requestNavigation({ kind: 'select', routine })
  const updateDraft = (changes: Partial<RoutineDraft>) => setDraft((current) => current ? { ...current, ...changes } : current)
  const save = () => {
    if (!draft?.name.trim() || saveMutation.isPending) return
    saveMutation.mutate(draft)
  }
  const discardPendingNavigation = () => {
    if (!pendingNavigation) return
    performNavigation(pendingNavigation)
    setPendingNavigation(null)
  }

  return {
    isPending: setupQuery.isPending || settingsQuery.isPending,
    isError: setupQuery.isError || !setupQuery.data || settingsQuery.isError || !settingsQuery.data,
    retry: () => { void setupQuery.refetch(); void settingsQuery.refetch() },
    routines,
    exercises,
    activeProgramRun,
    today,
    programDay,
    canStartProgramDay,
    defaultRestSeconds: readyData ? settingsQuery.data.defaultRestSeconds : null,
    draft,
    notice,
    isSaving: saveMutation.isPending,
    saveError: saveMutation.isError,
    isMobileEditorOpen,
    pendingNavigation,
    isDirty,
    routineNotFound: Boolean(readyData && initialSelectedRoutineId && !initialCreate && !routines.some((routine) => routine.id === initialSelectedRoutineId)),
    selectedRoutineId: draft?.id ?? null,
    createRoutine,
    selectRoutine,
    requestNavigation,
    updateDraft,
    save,
    clearNotice: () => setNotice(null),
    cancelPendingNavigation: () => setPendingNavigation(null),
    discardPendingNavigation,
    startProgramDay: onStartProgramDay,
  }
}
