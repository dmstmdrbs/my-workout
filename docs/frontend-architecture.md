# 프런트엔드 아키텍처

Trainlog는 작은 SPA에 맞춘 **점진적 FSD(Feature-Sliced Design)** 를 사용합니다.
기능을 멈추고 전체 경로를 한 번에 옮기지 않고, 새 코드부터 아래 의존 방향을
지키면서 기존 코드를 기능 단위로 이동합니다.

## 목표 계층

```text
app       앱 부트스트랩, 라우팅, 전역 provider와 레이아웃
pages     URL 하나를 구성하는 얇은 조합 계층
widgets   여러 feature/entity를 조합하는 독립적인 화면 블록
features  사용자가 수행하는 행동과 그 상태 전이
entities  운동, 루틴, 기록처럼 재사용되는 도메인 모델과 표시
shared    도메인을 모르는 UI, 유틸, 인프라 계약
```

목표 의존성은 위에서 아래로만 흐릅니다. `shared`는 다른 계층을 import하지 않고,
`entities`는 `features`를 import하지 않으며, feature끼리 직접 import하지
않습니다. 현재는 `records/settings/stats/routines` 등이 `workout/programs`를
직접 참조하는 예외가 남아 있으며, 아래 이관 순서에 따라 제거합니다. 다른
feature의 UI나 모델이 필요하다면 아래 중 하나를 선택합니다.

- 도메인 지식이면 `entities`로 내린다.
- 도메인을 모르는 표현/동작이면 `shared`로 내린다.
- 화면에서 둘을 조합하는 책임이면 `widgets` 또는 `pages`로 올린다.

각 slice의 외부 사용은 가능한 한 `index.ts` 공개 API를 통합니다. 다만 같은
slice 내부에서는 barrel을 거치지 않고 파일을 직접 import해 순환 의존을
피합니다. 정적 브랜드 파일을 만드는 Node 스크립트는 브라우저 번들 밖의 도구이므로
`brandArt.ts`를 직접 읽는 예외입니다.

현재 `entities`에는 여러 feature가 함께 사용하는 순수 운동 도메인 모델이
들어 있습니다.

```text
entities/
  exercise/model/exerciseLabels.ts  운동 부위·장비·브랜드 메타데이터와 라벨
  workout/model/setInput.ts         세트 입력 단위·파싱·타입 라벨과 마커
```

이 모델을 사용하는 코드는 `src/entities/exercise` 또는
`src/entities/workout`의 공개 `index.ts`를 통해서만 import합니다. 해당
모델은 React, 서비스, 라우터를 참조하지 않는 순수 TypeScript 코드입니다.

## 디자인 시스템

공통 UI는 `src/shared/ui`에 둡니다. 디자인 토큰은
`src/shared/styles/tokens.css`가 단일 진실 원천입니다.

- 색은 실제 hex 대신 역할 토큰(`--color-brand`, `--color-surface`)을 사용합니다.
- 간격, 높이, radius, motion도 토큰을 우선합니다.
- 버튼은 `Button`과 `IconButton`을 사용합니다. 아이콘 전용 버튼에는
  `aria-label`이 필수입니다.
- 운동 선택 시트의 기본 액션도 이 공통 버튼 계약을 사용하며, 필터·목록처럼
  고유한 상태 표현이 필요한 버튼은 feature 스타일을 유지합니다.
- 떠 있는 UI는 focus trap, Escape, focus 복원을 제공하는 `Overlay`를
  사용합니다.
- 브랜드 표시는 `BrandLogo`를 사용하고 SVG 경로를 별도로 복제하지 않습니다.

기존 feature CSS가 사용하던 `--accent`, `--surface` 같은 이름은 점진적
이관을 위한 alias입니다. 새 shared UI에는 `--color-*` 역할 토큰을 직접
사용합니다.

## 상태와 비즈니스 로직

- 서버 상태와 mutation은 TanStack Query 기반의 feature/model 훅이 소유합니다.
- URL로 복원되어야 하는 선택은 컴포넌트 state가 아니라 route/query string에
  둡니다.
- 여러 렌더 블록이 공유하는 화면 전용 상태 전이는 custom hook으로 분리합니다.
- 계산과 정규화는 React를 모르는 순수 함수로 만들고 단위 테스트를 붙입니다.
- UI 컴포넌트는 저장소를 직접 호출하지 않고 feature hook이 만든 값과 command를
  props로 받습니다.
- 앱 서비스 접근은 계속 `useAppServices()` 경계를 사용합니다.

## 현재 구조에서의 점진적 이관 순서

1. `shared/ui`와 토큰을 먼저 사용해 화면 간 기본 동작을 통일합니다.
2. `App.tsx`의 라우팅, navigation, 세션, 진행 중 운동 표시를 `app` 계층으로
   분리합니다.
3. 가장 큰 `WorkoutRunner`부터 model hook과 ui section으로 나눕니다.
4. feature 간 직접 import는 관련 코드를 만질 때 `entities/shared/widgets`로
   옮깁니다. 운동 메타데이터/라벨과 세트 입력 모델은 `entities`로 이관을
   시작했으며, 컴포넌트와 화면 조합은 별도 단위로 이동합니다. 경로만
   맞추기 위한 대규모 파일 이동은 하지 않습니다.

이 순서는 각 단계가 독립적으로 테스트·리뷰 가능하고, 도중에도 기존 기능을
온전히 유지하기 위한 것입니다.

현재 `app` 계층은 route 조합, 전역 shell, 인증 session, navigation UI만
소유합니다. 친구 요청 수와 운동 초안 같은 feature 상태는 각 feature의 공개
API를 통해 사용하며, route entry 컴포넌트도 feature 내부 파일을 직접 참조하지
않습니다. 운동 러너는 초안 생성·정규화를 `model`의 순수 함수로, 초안 저장과
타이머·wake lock 효과를 runtime hook으로, 서버 조회를 query hook으로 분리했습니다.
화면은 운동 카드·초기 설정·휴식 타이머·순서 변경 UI로 나뉩니다. 아직 남은 큰
화면 컴포넌트와 feature 간 직접 import는 다음 이관 대상입니다. Programs는
`model/useProgramsController`가 조회·mutation·화면 전환 command를 소유하고,
`ui/ProgramLibrary`, `ui/ActiveProgram`, `ui/ProgramStates`가 렌더 책임을 나눕니다.
현재 남은
feature 간 참조는 운동 선택/생성 UI(`workout/ExercisePicker`), 세트 행
컴포넌트(`workout/SetRow`), 운동 초안 저장 모델(`workout/activeWorkoutDraft`),
1RM 설정 카드(`programs/OneRepMaxSettingsCard`), 친구 아바타·쿼리 키
(`friends/*`)이며, 공통 도메인 모델을 먼저 `entities`로 내린 뒤 화면 조합
계층을 정리합니다.
