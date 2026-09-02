import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { daysBetween, getDateInTimeZone } from '../../../lib/localDate'
import { useAppServices, useSettings } from '../../../services'
import type { Exercise, ExerciseOneRepMax, ProgramRun } from '../../../types/domain'
import { formatDate, getErrorMessage } from './programView'
import type { OneRepMaxValue } from './programTypes'
import { getProgramOneRepMaxRequirements, missingProgramOneRepMaxes, personalizeProgramRun } from '../programPersonalization'
import { getTrainingProgram, trainingProgramCatalog } from '../programTemplate'

type ActiveSection = 'mine' | 'explore'

interface ProgramsData {
  exercises: Exercise[]
  maxes: ExerciseOneRepMax[]
}

export function useProgramsController() {
  const { workoutRepository } = useAppServices()
  const queryClient = useQueryClient()
  const settingsQuery = useSettings()
  const runsQuery = useQuery({ queryKey: ['program-runs'], queryFn: () => workoutRepository.listProgramRuns() })
  const personalizationQuery = useQuery({
    queryKey: ['program-personalization'],
    queryFn: async (): Promise<ProgramsData> => {
      const [exercises, maxes] = await Promise.all([
        workoutRepository.listExercises(),
        workoutRepository.listExerciseOneRepMaxes(),
      ])
      return { exercises, maxes }
    },
  })
  const [startDate, setStartDate] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [selectedProgramKey, setSelectedProgramKey] = useState(trainingProgramCatalog[0].key)
  const [previewWeek, setPreviewWeek] = useState(1)
  const [isMaxSetupOpen, setIsMaxSetupOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<ActiveSection>('mine')

  const timezone = settingsQuery.data?.timezone ?? 'Asia/Seoul'
  const today = getDateInTimeZone(timezone)
  const runs = runsQuery.data ?? []
  const activeRun = runs.find((run) => run.status === 'active') ?? null
  const activeRunId = activeRun?.id
  const activeRunStartDate = activeRun?.startDate
  const activeRunDurationWeeks = activeRun?.durationWeeks
  const selectedProgram = getTrainingProgram(selectedProgramKey)
  const activeProgramDefinition = activeRun ? trainingProgramCatalog.find((program) => program.key === activeRun.programKey) : undefined
  const latestActiveProgramInput = activeRun && activeProgramDefinition ? activeProgramDefinition.build(activeRun.startDate) : null
  const availableTemplateVersion = activeRun && latestActiveProgramInput && latestActiveProgramInput.templateVersion > activeRun.templateVersion
    ? latestActiveProgramInput.templateVersion
    : null

  useEffect(() => {
    if (!startDate) setStartDate(today)
  }, [startDate, today])

  useEffect(() => {
    if (!activeRunId || !activeRunStartDate || !activeRunDurationWeeks) {
      setSelectedWeek(1)
      return
    }
    const offset = daysBetween(activeRunStartDate, today)
    setSelectedWeek(Math.min(activeRunDurationWeeks, Math.max(1, Math.floor(offset / 7) + 1)))
  }, [activeRunDurationWeeks, activeRunId, activeRunStartDate, today])

  const refreshProgramQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['program-runs'] }),
      queryClient.invalidateQueries({ queryKey: ['active-program-run'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] }),
    ])
  }

  const startMutation = useMutation({
    mutationFn: (maxes: ExerciseOneRepMax[]) => {
      if (!personalizationQuery.data) throw new Error('개인화 정보를 불러오지 못했어요.')
      const input = personalizeProgramRun(selectedProgram.build(startDate), personalizationQuery.data.exercises, maxes)
      return workoutRepository.startProgramRun(input)
    },
    onSuccess: async () => {
      setIsMaxSetupOpen(false)
      setActiveSection('mine')
      await refreshProgramQueries()
    },
  })

  const saveMaxesAndStartMutation = useMutation({
    mutationFn: async (values: OneRepMaxValue[]) => {
      const saved = await Promise.all(values.map((value) => workoutRepository.saveExerciseOneRepMax(value.exerciseId, value.oneRepMaxKg)))
      const savedIds = new Set(saved.map((item) => item.exerciseId))
      const merged = [
        ...(personalizationQuery.data?.maxes ?? []).filter((item) => !savedIds.has(item.exerciseId)),
        ...saved,
      ]
      await startMutation.mutateAsync(merged)
      return merged
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['program-personalization'] })
    },
  })

  const endMutation = useMutation({
    mutationFn: ({ run, outcome }: { run: ProgramRun; outcome: 'completed' | 'withdrawn' }) => workoutRepository.endProgramRun(run.id, outcome),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['program-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['active-program-run'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] }),
      ])
      setStartDate(today)
    },
  })

  const completeRestMutation = useMutation({
    mutationFn: (dayId: string) => workoutRepository.completeProgramRunDay(dayId),
    onSuccess: refreshProgramQueries,
  })

  const refreshRunMutation = useMutation({
    mutationFn: () => {
      if (!activeRun || !latestActiveProgramInput || !personalizationQuery.data) throw new Error('적용할 최신 프로그램을 찾지 못했어요.')
      const personalized = personalizeProgramRun(latestActiveProgramInput, personalizationQuery.data.exercises, personalizationQuery.data.maxes)
      return workoutRepository.refreshProgramRun(activeRun.id, today, personalized)
    },
    onSuccess: refreshProgramQueries,
  })

  const startInput = selectedProgram.build(startDate || today)
  const maxRequirements = personalizationQuery.data ? getProgramOneRepMaxRequirements(startInput, personalizationQuery.data.exercises) : []
  const requiredMaxExercises = maxRequirements.map((requirement) => requirement.exercise)

  const beginProgram = () => {
    if (!personalizationQuery.data) return
    const missing = missingProgramOneRepMaxes(maxRequirements, personalizationQuery.data.maxes)
    if (missing.length > 0) {
      startMutation.reset()
      saveMaxesAndStartMutation.reset()
      setIsMaxSetupOpen(true)
      return
    }
    startMutation.mutate(personalizationQuery.data.maxes)
  }

  const endRun = (run: ProgramRun, outcome: 'completed' | 'withdrawn') => {
    const message = outcome === 'completed'
      ? '이 프로그램 회차를 완료할까요? 저장된 운동 기록은 그대로 유지됩니다.'
      : '프로그램을 중도 하차할까요? 지금까지 저장한 운동 기록은 유지되며, 다시 시작하면 새로운 회차의 Day 1부터 시작합니다.'
    if (window.confirm(message)) endMutation.mutate({ run, outcome })
  }

  const refreshActiveRun = () => {
    const message = `오늘(${formatDate(today)})부터 아직 완료하지 않았고 운동 기록도 연결되지 않은 Day만 최신 처방으로 바꿉니다. 이전 날짜와 완료·기록된 Day는 그대로 유지됩니다. 적용할까요?`
    if (window.confirm(message)) refreshRunMutation.mutate()
  }

  return {
    isLoading: runsQuery.isPending || settingsQuery.isPending || personalizationQuery.isPending,
    isError: runsQuery.isError || settingsQuery.isError || personalizationQuery.isError || !personalizationQuery.data,
    retry: () => { void runsQuery.refetch(); void settingsQuery.refetch(); void personalizationQuery.refetch() },
    runs,
    programCount: trainingProgramCatalog.length,
    activeRun,
    today,
    timezone,
    selectedProgram,
    selectedWeek,
    previewWeek,
    startDate,
    activeSection,
    isMaxSetupOpen,
    personalizationMaxes: personalizationQuery.data?.maxes ?? [],
    requiredMaxExercises,
    availableTemplateVersion,
    startError: startMutation.isError ? getErrorMessage(startMutation.error) : saveMaxesAndStartMutation.isError ? getErrorMessage(saveMaxesAndStartMutation.error) : null,
    isStarting: startMutation.isPending || saveMaxesAndStartMutation.isPending,
    maxSetupError: saveMaxesAndStartMutation.isError ? getErrorMessage(saveMaxesAndStartMutation.error) : null,
    completingRestDayId: completeRestMutation.isPending ? completeRestMutation.variables ?? null : null,
    restCompletionError: completeRestMutation.isError ? getErrorMessage(completeRestMutation.error) : null,
    isRefreshing: refreshRunMutation.isPending,
    refreshError: refreshRunMutation.isError ? getErrorMessage(refreshRunMutation.error) : null,
    isEnding: endMutation.isPending,
    setActiveSection,
    setSelectedWeek,
    setPreviewWeek,
    setStartDate,
    setIsMaxSetupOpen,
    selectProgram: (key: string) => { setSelectedProgramKey(key); setPreviewWeek(1); startMutation.reset() },
    beginProgram,
    saveMaxesAndStart: (values: OneRepMaxValue[]) => saveMaxesAndStartMutation.mutate(values),
    completeRest: (dayId: string) => completeRestMutation.mutate(dayId),
    refreshActiveRun,
    endRun,
  }
}
