import { SearchX } from 'lucide-react'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { BodyMeasurements } from '../features/body'
import { Dashboard } from '../features/dashboard'
import { ExerciseCatalog } from '../features/exercises'
import { FriendDetail, Friends, InviteLanding } from '../features/friends'
import { Profile } from '../features/profile'
import { OneRepMaxSettingsCard, Programs } from '../features/programs'
import { RecordDetail, RecordEditor, Records, WorkoutComplete } from '../features/records'
import { RoutineManager } from '../features/routines'
import { Settings } from '../features/settings'
import { Stats } from '../features/stats'
import { WorkoutRunner, type StoredWorkoutDraft } from '../features/workout'
import { Button } from '../shared/ui'
import {
  buildRecordPath,
  buildRecordsPath,
  buildRoutinePath,
  buildWorkoutCompletePath,
  buildWorkoutPath,
  pagePaths,
} from './model/navigation'

interface AppRoutesProps {
  onNavigate: (to: string) => void
  onWorkoutDraftChange: (draft: StoredWorkoutDraft | null) => void
  onWorkoutEnd: () => void
  onRecordDirtyChange: (isDirty: boolean) => void
  onRoutineDirtyChange: (isDirty: boolean) => void
  onOpenExerciseManagement: () => void
  hasActiveWorkoutDraft: boolean
}

export function AppRoutes({
  onNavigate,
  onWorkoutDraftChange,
  onWorkoutEnd,
  onRecordDirtyChange,
  onRoutineDirtyChange,
  onOpenExerciseManagement,
  hasActiveWorkoutDraft,
}: AppRoutesProps) {
  const navigate = useNavigate()

  return (
    <Routes>
      <Route path={pagePaths.dashboard} element={(
        <Dashboard
          onStartWorkout={() => onNavigate('/workout')}
          onViewRecords={() => onNavigate('/records')}
          onSelectSession={(sessionId) => onNavigate(buildRecordPath(sessionId))}
          onManageRoutines={() => onNavigate('/routines')}
          onSelectRoutine={(routineId) => onNavigate(buildRoutinePath(routineId))}
          onOpenPrograms={() => onNavigate('/programs')}
          onStartProgramDay={(dayId) => onNavigate(buildWorkoutPath(dayId))}
          hasActiveWorkoutDraft={hasActiveWorkoutDraft}
        />
      )} />
      <Route path={pagePaths.workout} element={(
        <WorkoutRoute
          onWorkoutDraftChange={onWorkoutDraftChange}
          onWorkoutEnd={onWorkoutEnd}
          onOpenExerciseManagement={onOpenExerciseManagement}
        />
      )} />
      <Route
        path={`${pagePaths.workout}/complete/:sessionId`}
        element={<WorkoutCompleteRoute
          onViewRecord={(sessionId) => navigate(buildRecordPath(sessionId))}
          onGoHome={() => navigate('/')}
        />}
      />
      <Route
        path={pagePaths.programs}
        element={<Programs
          onStartDay={(dayId) => navigate(buildWorkoutPath(dayId))}
          onSelectSession={(sessionId) => navigate(buildRecordPath(sessionId))}
        />}
      />
      <Route
        path={`${pagePaths.routines}/:routineId?`}
        element={<RoutineRoute
          onRoutineChange={(routineId) => navigate(
            buildRoutinePath(routineId),
          )}
          onStartProgramDay={(dayId) => onNavigate(buildWorkoutPath(dayId))}
          onDirtyChange={onRoutineDirtyChange}
          onOpenExerciseManagement={onOpenExerciseManagement}
        />}
      />
      <Route
        path={pagePaths.records}
        element={<RecordsRoute
          onSelectDay={(dateKey) => navigate(buildRecordsPath(dateKey), { replace: true })}
          onSelectSession={(sessionId) => navigate(buildRecordPath(sessionId))}
        />}
      />
      <Route
        path={`${pagePaths.records}/:sessionId/edit`}
        element={<RecordEditRoute
          onDone={(sessionId) => navigate(buildRecordPath(sessionId), { replace: true })}
          onDirtyChange={onRecordDirtyChange}
        />}
      />
      <Route
        path={`${pagePaths.records}/:sessionId`}
        element={<RecordDetailRoute
          onBack={(dateKey) => navigate(buildRecordsPath(dateKey))}
          onEdit={(sessionId) => navigate(buildRecordPath(sessionId, 'edit'))}
        />}
      />
      <Route path={pagePaths.stats} element={<Stats />} />
      <Route path={pagePaths.body} element={<BodyMeasurements />} />
      <Route path={pagePaths.exercises} element={<ExerciseCatalog />} />
      <Route path={`${pagePaths.friends}/invite/:token`} element={<InviteLanding />} />
      <Route path={`${pagePaths.friends}/:friendshipId`} element={<FriendDetail />} />
      <Route path={pagePaths.friends} element={<Friends />} />
      <Route path={pagePaths.profile} element={<Profile />} />
      <Route path={pagePaths.settings} element={<Settings additionalSections={<OneRepMaxSettingsCard />} />} />
      <Route path="*" element={<UnknownPageRoute onGoHome={() => onNavigate('/')} />} />
    </Routes>
  )
}

function WorkoutRoute({
  onWorkoutDraftChange,
  onWorkoutEnd,
  onOpenExerciseManagement,
}: {
  onWorkoutDraftChange: (draft: StoredWorkoutDraft | null) => void
  onWorkoutEnd: () => void
  onOpenExerciseManagement: () => void
}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedProgramDayId = searchParams.get('programDay')

  return (
    <WorkoutRunner
      initialProgramRunDayId={requestedProgramDayId}
      onSelectProgramDay={(dayId) => navigate(buildWorkoutPath(dayId))}
      onFinish={(sessionId) => {
        onWorkoutEnd()
        navigate(buildWorkoutCompletePath(sessionId))
      }}
      onCancel={() => {
        onWorkoutEnd()
        navigate(requestedProgramDayId ? pagePaths.programs : pagePaths.dashboard)
      }}
      onDraftStateChange={onWorkoutDraftChange}
      onOpenExerciseManagement={onOpenExerciseManagement}
    />
  )
}

/**
 * 보고 있는 날짜는 경로가 아니라 쿼리(`?d=YYYY-MM-DD`)에 둔다. 상세에서
 * 돌아왔을 때 같은 선택을 복원해야 하므로 컴포넌트 state로 내리지 않는다.
 */
function RecordsRoute({
  onSelectDay,
  onSelectSession,
}: {
  onSelectDay: (dateKey: string) => void
  onSelectSession: (sessionId: string) => void
}) {
  const [searchParams] = useSearchParams()
  const dateKey = searchParams.get('d')
  return (
    <Records
      selectedDateKey={dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null}
      onSelectDay={onSelectDay}
      onSelectSession={onSelectSession}
    />
  )
}

function RecordDetailRoute({
  onBack,
  onEdit,
}: {
  onBack: (dateKey: string | null) => void
  onEdit: (sessionId: string) => void
}) {
  const { sessionId } = useParams()
  if (!sessionId) return <Navigate replace to="/records" />
  return <RecordDetail sessionId={sessionId} onBack={onBack} onEdit={onEdit} />
}

function RecordEditRoute({
  onDone,
  onDirtyChange,
}: {
  onDone: (sessionId: string) => void
  onDirtyChange: (isDirty: boolean) => void
}) {
  const { sessionId } = useParams()
  if (!sessionId) return <Navigate replace to="/records" />
  return (
    <RecordEditor
      sessionId={sessionId}
      onDone={() => onDone(sessionId)}
      onDirtyChange={onDirtyChange}
    />
  )
}

function WorkoutCompleteRoute({
  onViewRecord,
  onGoHome,
}: {
  onViewRecord: (sessionId: string) => void
  onGoHome: () => void
}) {
  const { sessionId } = useParams()
  if (!sessionId) return <UnknownPageRoute onGoHome={onGoHome} />
  return (
    <WorkoutComplete
      sessionId={sessionId}
      onViewRecord={() => onViewRecord(sessionId)}
      onGoHome={onGoHome}
    />
  )
}

function RoutineRoute({
  onRoutineChange,
  onStartProgramDay,
  onDirtyChange,
  onOpenExerciseManagement,
}: {
  onRoutineChange: (routineId: string | 'new' | null) => void
  onStartProgramDay: (dayId: string) => void
  onDirtyChange: (isDirty: boolean) => void
  onOpenExerciseManagement: () => void
}) {
  const { routineId } = useParams()
  return (
    <RoutineManager
      initialSelectedRoutineId={routineId && routineId !== 'new' ? routineId : null}
      initialCreate={routineId === 'new'}
      onRoutineChange={onRoutineChange}
      onStartProgramDay={onStartProgramDay}
      onDirtyChange={onDirtyChange}
      onOpenExerciseManagement={onOpenExerciseManagement}
    />
  )
}

function UnknownPageRoute({ onGoHome }: { onGoHome: () => void }) {
  const location = useLocation()
  return (
    <main className="placeholder-page" aria-labelledby="not-found-title">
      <div className="placeholder-icon"><SearchX size={24} aria-hidden="true" /></div>
      <p className="eyebrow">NOT FOUND</p>
      <h1 id="not-found-title">이 페이지를 찾을 수 없어요.</h1>
      <p>
        <code>{location.pathname}</code> 주소를 확인해 주세요. 페이지가 이동했거나 존재하지 않을 수 있어요.
      </p>
      <Button variant="secondary" onClick={onGoHome}>홈으로 돌아가기</Button>
    </main>
  )
}
