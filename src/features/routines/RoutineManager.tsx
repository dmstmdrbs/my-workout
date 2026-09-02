import { useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { DiscardChangesDialog, EmptyRoutineEditor, RoutineManagerError, RoutineManagerLoading, RoutineNotFound } from './ui/RoutineStates'
import { RoutineEditor } from './ui/RoutineEditor'
import { RoutineListPane } from './ui/RoutineListPane'
import { navigationLabel, useRoutineManagerController } from './model/useRoutineManagerController'
import './RoutineManager.css'

export function RoutineManager({ initialSelectedRoutineId = null, initialCreate = false, onRoutineChange, onStartProgramDay }: { initialSelectedRoutineId?: string | null; initialCreate?: boolean; onRoutineChange?: (routineId: string | 'new' | null) => void; onStartProgramDay?: (dayId: string) => void }) {
  const navigate = useNavigate()
  const controller = useRoutineManagerController({ initialSelectedRoutineId, initialCreate, onRoutineChange, onStartProgramDay })
  const routineListPaneRef = useRef<HTMLElement>(null)
  const shouldRestoreRoutineListFocus = useRef(false)

  useEffect(() => {
    if (controller.isMobileEditorOpen || !shouldRestoreRoutineListFocus.current) return
    shouldRestoreRoutineListFocus.current = false
    routineListPaneRef.current?.focus()
  }, [controller.isMobileEditorOpen])

  if (controller.isPending) return <RoutineManagerLoading />
  if (controller.isError) return <RoutineManagerError onRetry={controller.retry} />
  if (controller.routineNotFound) return <RoutineNotFound onBackToList={() => onRoutineChange?.(null)} />

  return (
    <main className="routine-manager-page" aria-labelledby="routine-manager-title">
      <header className="routine-manager-heading">
        <div>
          <p className="eyebrow">ROUTINE BUILDER</p>
          <h1 id="routine-manager-title">루틴 관리</h1>
          <p>운동 구성과 세트별 목표 중량, 반복 수, RIR을 한 곳에서 설계하세요.</p>
        </div>
        <button className="primary-button routine-new-button" type="button" onClick={controller.createRoutine}>
          <Plus size={17} aria-hidden="true" /> 새 루틴
        </button>
      </header>

      <div className={`routine-manager-layout ${controller.isMobileEditorOpen ? 'is-editor-open' : ''}`}>
        <RoutineListPane
          routines={controller.routines}
          activeProgramName={controller.activeProgramRun?.programName ?? null}
          programDay={controller.programDay}
          today={controller.today}
          canStartProgramDay={controller.canStartProgramDay}
          selectedRoutineId={controller.selectedRoutineId}
          onStartProgramDay={controller.startProgramDay}
          onSelectRoutine={controller.selectRoutine}
          onCreateRoutine={controller.createRoutine}
          routineListPaneRef={routineListPaneRef}
        />

        <section className="routine-editor-pane" aria-label="루틴 편집">
          {controller.draft ? (
            <RoutineEditor
              draft={controller.draft}
              exercises={controller.exercises}
              defaultRestSeconds={controller.defaultRestSeconds!}
              isSaving={controller.isSaving}
              saveError={controller.saveError}
              notice={controller.notice}
              onBack={() => {
                if (!controller.isDirty) shouldRestoreRoutineListFocus.current = true
                controller.requestNavigation({ kind: 'mobile-list' })
              }}
              onChange={controller.updateDraft}
              onSave={controller.save}
              onClearNotice={controller.clearNotice}
              onOpenExerciseManagement={() => navigate('/exercises')}
            />
          ) : (
            <EmptyRoutineEditor onCreate={controller.createRoutine} />
          )}
        </section>
      </div>
      {controller.pendingNavigation && <DiscardChangesDialog
        destination={navigationLabel(controller.pendingNavigation)}
        onCancel={controller.cancelPendingNavigation}
        onDiscard={() => {
          if (controller.pendingNavigation?.kind === 'mobile-list') shouldRestoreRoutineListFocus.current = true
          controller.discardPendingNavigation()
        }}
      />}
    </main>
  )
}
