import { Dumbbell, ListX, Plus } from 'lucide-react'
import { Button, Overlay } from '../../../shared/ui'

export function EmptyRoutineEditor({ onCreate }: { onCreate: () => void }) {
  return <div className="routine-editor-empty"><span><Dumbbell size={25} aria-hidden="true" /></span><h2>루틴을 선택하거나 새로 만드세요.</h2><p>세트별 중량, 반복 수, 휴식 시간, 목표 RIR을 직접 설계할 수 있습니다.</p><button className="primary-button" type="button" onClick={onCreate}><Plus size={16} aria-hidden="true" /> 첫 루틴 만들기</button></div>
}

export function DiscardChangesDialog({ destination, onCancel, onDiscard }: { destination: string; onCancel: () => void; onDiscard: () => void }) {
  return <Overlay
    isOpen
    onClose={onCancel}
    presentation="dialog"
    labelledBy="discard-dialog-title"
    describedBy="discard-dialog-description"
    className="routine-discard-dialog"
  >
      <p className="eyebrow">UNSAVED CHANGES</p>
      <h2 id="discard-dialog-title">저장하지 않은 변경사항이 있어요.</h2>
      <p id="discard-dialog-description">저장하지 않고 {destination} 이동하면 현재 편집 내용은 사라집니다.</p>
      <div className="routine-discard-actions">
        <Button variant="secondary" onClick={onCancel} data-overlay-initial-focus>취소</Button>
        <Button variant="danger" onClick={onDiscard}>저장하지 않고 나가기</Button>
      </div>
  </Overlay>
}

export function RoutineManagerLoading() {
  return <main className="routine-manager-page" aria-label="루틴을 불러오는 중"><div className="routine-loading-heading" /><div className="routine-loading-layout"><div /><div /></div></main>
}

export function RoutineManagerError({ onRetry }: { onRetry: () => void }) {
  return <main className="routine-manager-message"><span><Dumbbell size={25} aria-hidden="true" /></span><h1>루틴을 불러오지 못했어요.</h1><p>저장소 연결을 확인한 뒤 다시 시도해 주세요.</p><button className="primary-button" type="button" onClick={onRetry}>다시 시도</button></main>
}

export function RoutineNotFound({ onBackToList }: { onBackToList: () => void }) {
  return <main className="routine-manager-message"><span><ListX size={25} aria-hidden="true" /></span><h1>루틴을 찾을 수 없어요.</h1><p>주소가 잘못되었거나 삭제된 루틴일 수 있어요.</p><button className="primary-button" type="button" onClick={onBackToList}>루틴 목록으로 돌아가기</button></main>
}
