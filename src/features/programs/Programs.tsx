import { Compass, Dumbbell } from 'lucide-react'
import { OneRepMaxSetupSheet } from './OneRepMaxSetup'
import { useProgramsController } from './model/useProgramsController'
import { ActiveProgram, ProgramHistory } from './ui/ActiveProgram'
import { ProgramLibrary } from './ui/ProgramLibrary'
import { ProgramsError, ProgramsLoading } from './ui/ProgramStates'
import './Programs.css'

interface ProgramsProps {
  onStartDay: (dayId: string) => void
  onSelectSession: (sessionId: string) => void
}

export function Programs({ onStartDay, onSelectSession }: ProgramsProps) {
  const controller = useProgramsController()

  if (controller.isLoading) return <ProgramsLoading />
  if (controller.isError) return <ProgramsError onRetry={controller.retry} />

  return <main className="programs-page">
    <header className="programs-heading">
      <div><p className="eyebrow">TRAINING PROGRAM</p><h1>8주의 흐름을 놓치지 않게.</h1><p>예정일은 가이드로 보고, 원하는 Day를 수행하거나 다시 복습할 수 있습니다.</p></div>
      {controller.activeRun && <span className="program-active-pill"><span /> {controller.activeRun.startDate} 시작</span>}
    </header>

    <nav className="program-section-tabs" role="tablist" aria-label="프로그램 메뉴">
      <button id="my-programs-tab" type="button" role="tab" aria-selected={controller.activeSection === 'mine'} aria-controls="my-programs-panel" className={controller.activeSection === 'mine' ? 'is-selected' : ''} onClick={() => controller.setActiveSection('mine')}>
        <Dumbbell size={17} /><span>내 프로그램</span>{controller.activeRun && <em>진행 중</em>}
      </button>
      <button id="explore-programs-tab" type="button" role="tab" aria-selected={controller.activeSection === 'explore'} aria-controls="explore-programs-panel" className={controller.activeSection === 'explore' ? 'is-selected' : ''} onClick={() => controller.setActiveSection('explore')}>
        <Compass size={17} /><span>둘러보기</span><em>{controller.programCount}</em>
      </button>
    </nav>

    <section id="my-programs-panel" className="program-tab-panel" role="tabpanel" aria-labelledby="my-programs-tab" hidden={controller.activeSection !== 'mine'}>
      {controller.activeRun ? <ActiveProgram
        run={controller.activeRun}
        today={controller.today}
        selectedWeek={controller.selectedWeek}
        onSelectWeek={controller.setSelectedWeek}
        onStartDay={onStartDay}
        onSelectSession={onSelectSession}
        onCompleteRest={controller.completeRest}
        completingRestDayId={controller.completingRestDayId}
        restCompletionError={controller.restCompletionError}
        availableTemplateVersion={controller.availableTemplateVersion}
        onRefresh={controller.refreshActiveRun}
        isRefreshing={controller.isRefreshing}
        refreshError={controller.refreshError}
        onEnd={(outcome) => controller.endRun(controller.activeRun!, outcome)}
        isEnding={controller.isEnding}
      /> : <ProgramEmptyState onExplore={() => controller.setActiveSection('explore')} />}

      <ProgramHistory runs={controller.runs.filter((run) => run.status !== 'active')} onSelectSession={onSelectSession} />
    </section>

    <section id="explore-programs-panel" className="program-tab-panel" role="tabpanel" aria-labelledby="explore-programs-tab" hidden={controller.activeSection !== 'explore'}>
      <ProgramLibrary
        selectedProgram={controller.selectedProgram}
        selectedWeek={controller.previewWeek}
        startDate={controller.startDate}
        minDate={controller.today}
        activeRun={controller.activeRun}
        isStarting={controller.isStarting}
        error={controller.startError}
        onSelectProgram={controller.selectProgram}
        onSelectWeek={controller.setPreviewWeek}
        onChangeDate={controller.setStartDate}
        onStart={controller.beginProgram}
      />
    </section>

    <OneRepMaxSetupSheet
      isOpen={controller.isMaxSetupOpen}
      exercises={controller.requiredMaxExercises}
      maxes={controller.personalizationMaxes}
      isSaving={controller.isStarting}
      error={controller.maxSetupError}
      onClose={() => controller.setIsMaxSetupOpen(false)}
      onSave={controller.saveMaxesAndStart}
    />
  </main>
}

function ProgramEmptyState({ onExplore }: { onExplore: () => void }) {
  return <section className="program-empty-state">
    <span><Compass size={24} /></span>
    <div><p className="card-kicker">MY PROGRAM</p><h2>진행 중인 프로그램이 없어요.</h2><p>목표와 일정에 맞는 프로그램을 둘러보고 Day 1부터 시작해 보세요.</p></div>
    <button className="primary-button" type="button" onClick={onExplore}><Compass size={17} /> 프로그램 둘러보기</button>
  </section>
}
