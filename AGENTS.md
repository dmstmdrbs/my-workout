# Trainlog Agent Guide

이 문서는 이 저장소에서 작업을 이어받는 에이전트와 개발자를 위한 실행 규칙입니다. 변경 전 [README.md](README.md), 관련 화면 코드, 그리고 테스트를 먼저 확인합니다.

## 프로젝트 개요

Trainlog는 개인용 운동 기록 PWA입니다. 루틴·자유 운동, 목표/실제 RIR 분리, 진행 중 운동 복원, 공유 PNG 카드가 핵심입니다.

- 프론트엔드: React 19, TypeScript, Vite
- 상태/서버 캐시: TanStack Query
- 라우팅: React Router
- 백엔드: Supabase Auth (Google OAuth), Postgres, RLS
- 배포: Vercel
- 테스트: Vitest + Testing Library

## 빠른 시작

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

정상 종료 전 최소 검증:

```bash
npm run lint
npx tsc -b
npm test -- --reporter=verbose
npm run build
```

Windows 환경에서 Vite 자식 프로세스가 sandbox 권한 오류(EPERM)로 실패할 수 있습니다. 이 경우 권한이 허용된 일반 환경에서 동일 명령을 한 번 재실행하고, 결과를 명확히 보고합니다.

## 저장소 구조

```text
src/
  App.tsx                         앱 셸, 라우트, 로그인 게이트, 진행 중 운동 토스트
  features/
    dashboard/                    대시보드
    programs/                     프로그램 카탈로그·템플릿·회차·고정 7일 일정
    workout/                      운동 선택·진행·휴식·초안 복원
    routines/                     루틴 편집
    records/                      운동 기록·공유 PNG 카드
    settings/                     설정·로그아웃
    body/                         신체 측정 기록
  services/
    contracts.ts                  AuthAdapter, WorkoutRepository 인터페이스
    AppServicesProvider.tsx       mock/Supabase 서비스 선택 경계
    useSettings.ts                설정 단일 쿼리 훅
    mock/                         localStorage 개발용 adapter와 시드 데이터
    supabase/                     실제 Supabase adapter
  lib/theme.ts                    테마 적용과 localStorage 미러
  types/domain.ts                 앱의 도메인 모델
  test/
    app-user-flows.test.tsx       핵심 사용자 플로우 회귀 테스트
    program-flows.test.tsx        프로그램 시작·기록·중도 하차·재시작
    settings-flows.test.tsx       UF-12 설정 변경
    signout-flows.test.tsx        UF-12 로그아웃
    body-flows.test.tsx           UF-13 신체 측정 기록
    theme-session-flows.test.tsx  테마 설정과 세션 복원
    repository-query-flows.test.ts 저장소 조회 계약과 페이지네이션
    records-pagination-flows.test.tsx UF-14 기록 화면 페이지네이션
    workout-runner-resilience.test.tsx 운동 화면 회복력
supabase/migrations/              스키마, RLS, 기본 운동 카탈로그
  20260815160127_trainlog_schema.sql
  20260816090000_atomic_writes.sql 저장소 함수, RPC 트랜잭션
  20260817000000_body_measurement_unique.sql 신체 측정 unique 제약
docs/user-flow-test-plan.md       수동/자동 검증 기준
```

## 아키텍처 규칙

1. UI는 `useAppServices()`를 통해 서비스에 접근합니다. 컴포넌트에서 Supabase 클라이언트를 직접 호출하지 않습니다.
2. `contracts.ts`와 `types/domain.ts`가 저장소 경계입니다. 데이터 모델 변경은 mock과 Supabase 구현 모두에 반영합니다.
3. `VITE_SUPABASE_URL`과 `VITE_SUPABASE_PUBLISHABLE_KEY`가 없을 때는 mock adapter가 동작해야 합니다. 데모·테스트 흐름을 깨지 마세요.
4. 목표 RIR(`targetRir`)과 실제 RIR(`actualRir`)은 독립 값입니다. 실제 RIR 입력이 루틴 처방을 바꾸면 안 됩니다.
5. 운동은 한 번에 하나의 진행 중 초안만 허용합니다. 초안 키는 `trainlog:workout-draft:v1`이며 `startedAt`을 보존해 경과 시간을 계산합니다.
6. 완료 세트가 0개인 운동 종료는 기록을 저장하지 않고 초안을 제거한 뒤 홈으로 돌아갑니다.
7. 공유 카드에는 개인 식별 정보나 비밀값을 넣지 않습니다.
8. 설정은 `useSettings()`로만 읽습니다. 화면별 쿼리에서 `getSettings()`를 직접 호출하지 않습니다. 설정 저장 후에는 `['user-settings']`를 무효화합니다.
9. 테마는 `src/lib/theme.ts`의 `applyTheme()`을 통해서만 적용됩니다. 컴포넌트는 DOM에 `data-theme`이나 `color-scheme`을 직접 설정하거나 `trainlog:theme:v1` localStorage 미러를 직접 쓰면 안 됩니다. 데이터베이스가 진실의 원천이며, 미러는 첫 페인트 깜빡임을 방지하기 위해서만 존재하고, `src/main.tsx`가 React 렌더링 전에 미러를 적용합니다.
10. 여러 테이블을 함께 바꾸는 저장은 Postgres 함수(RPC)로 한 트랜잭션에 담습니다. 어댑터에서 DELETE 후 INSERT를 나눠 호출하지 않습니다. 함수는 `security invoker`로 정의하고 함수 안에서도 `auth.uid()` 소유권을 검증합니다.
11. 세션 목록은 필요한 범위만 조회합니다. `listSessions`를 옵션 없이 호출해 전체를 받지 않습니다. 목록은 커서(`startedBefore`), 기간 집계는 `startedAfter`, 단건 참조는 전용 조회(`getLastCompletedSetForExercise`)를 씁니다.
12. 프로그램 카탈로그는 정적 템플릿이고, 시작한 프로그램만 `program_runs` 회차와 56개의 `program_run_days` 스냅샷으로 저장합니다. 활성 회차의 현재 Day는 내 루틴에 가상 카드로 합치며, 개인 `routines` 행으로 복제하지 않습니다. 중도 하차·완료 시 연결된 `workout_sessions`는 삭제하지 않습니다.

## 라우팅과 UX

현재 주요 URL은 다음과 같습니다.

- `/` 대시보드
- `/programs` 8주 프로그램 시작·진행·회차 기록
- `/workout` 운동 시작/진행/재개
- `/routines`, `/routines/new`, `/routines/:routineId` 루틴
- `/records`, `/records/:sessionId` 기록/공유
- `/records/:sessionId/edit` 완료된 기록 편집(완료 세트의 값·세트 수·메모만)
- `/settings` 설정
- `/body` 신체 측정 기록
- `/stats` 주간 통계(총 볼륨/전주 대비, 요일별, 부위별)와 종목별 중량 추이(최고 중량·예상 1RM, 최근 180일)

새 화면은 URL을 가져야 하며, 브라우저 뒤로가기와 직접 주소 진입을 고려합니다. 운동 초안이 있는 상태에서 `/workout`을 벗어날 때의 이탈 확인과 하단 재개 토스트를 유지합니다.

반응형 원칙:

- 데스크톱/태블릿은 사이드바와 다열 관리 화면을 우선합니다.
- 모바일은 하단 탭, 큰 터치 영역, 하단 고정 제어를 사용합니다.
- 고정된 휴식 타이머나 내비게이션이 마지막 입력/버튼을 가리지 않아야 합니다.
- 모바일에서는 더보기 팝오버가 상단 바 아래가 아니라 하단 내비게이션 위에 고정됩니다. 상단 바는 고정되지 않아 뷰포트 밖으로 스크롤되므로, 하단 탭에서 열린 팝오버가 화면 밖으로 열리지 않도록 하기 위함입니다.

## Supabase 규칙

- migration은 `supabase/migrations/`에 추가합니다. 이미 적용된 migration은 수정하지 않습니다.
- `public` 스키마의 모든 사용자 데이터 테이블은 RLS를 켜고, `auth.uid()` 기반 소유권 정책을 둡니다.
- 자식 테이블도 `user_id`와 소유권 검증을 유지합니다. 세션/루틴 하위 행으로 다른 사용자의 데이터에 접근할 수 없어야 합니다.
- 공통 운동 카탈로그는 `exercises.user_id IS NULL`로 읽기만 허용합니다. 사용자가 만든 운동만 수정·삭제할 수 있습니다.
- 브라우저에는 publishable/anon 키만 사용합니다. `service_role`, DB 비밀번호, Google OAuth secret은 코드·커밋·클라이언트 번들에 절대 넣지 않습니다.
- Supabase Auth의 Redirect URL과 Google Cloud의 콜백 URL은 로컬 및 실제 Vercel 도메인에 맞춰 유지합니다.

## 배포 규칙

Vercel Production 환경 변수:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

배포 전 전체 검증을 실행합니다. 성공 후 운영 URL HTTP 응답과 Vercel 오류 로그를 확인합니다.

```bash
npx vercel deploy --prod --yes
```

DB 변경은 먼저 migration 적용과 RLS 확인을 마친 뒤 프론트엔드를 배포합니다. 데이터 파괴 가능성이 있는 migration, 원격 강제 푸시, Vercel/Supabase 설정 변경은 사용자 승인 없이는 실행하지 않습니다.

## 작업 방식

- 기존 구조를 확장하고, 관계없는 리팩터링은 피합니다.
- 수정은 작은 단위로 하고 실제 기능의 사용자 플로우 테스트를 추가 또는 갱신합니다.
- `docs/user-flow-test-plan.md`의 기대 결과도 기능 변경에 맞춰 갱신합니다.
- 작업 트리에 다른 사람이 만든 변경이 있으면 덮어쓰지 말고 범위를 먼저 확인합니다.
- `.env.local`, `node_modules`, `dist`, `.vercel`은 커밋하지 않습니다.
- 완료 보고에는 변경 내용, 실행한 검증, 남은 제한 사항을 짧게 씁니다.

### Git 브랜치·워크트리·PR

1. 모든 기능·스펙 작업은 시작 시 예외 없이 먼저 `git fetch origin main`을 실행해 원격 `main`의 최신 커밋을 가져옵니다. 이전 작업에서 확인한 상태나 로컬 `main`이 최신일 것이라고 가정하지 않습니다.
2. fetch 직후의 `origin/main`을 명시적인 시작점으로 작업 범위가 드러나는 별도 브랜치와 전용 Git worktree를 만듭니다. 로컬 `main`, 오래된 브랜치 또는 이전 worktree의 HEAD에서 새 작업 브랜치를 만들지 않습니다.
3. 서로 독립적인 기능·스펙은 한 브랜치에 섞지 않습니다. 하나의 응집된 사용자 가치와 그 테스트·문서·migration을 한 작업 단위와 한 PR로 묶습니다.
4. 구현이 끝나면 관련 테스트뿐 아니라 린트, 타입 검사, 프로덕션 빌드 등 변경 범위에 필요한 검증을 완료하고 브랜치를 원격에 푸시합니다.
5. 검증된 작업은 별도 사용자 승인 요청 없이 PR을 생성하고 병합합니다. PR에는 변경 목적, 주요 동작, 검증 결과, DB migration·배포 영향과 남은 제한 사항을 기록합니다.
6. PR 병합 전 최신 `origin/main`과의 충돌 및 CI 상태를 확인합니다. 다른 작업을 보존하며 충돌을 해결하고, 검증이 실패한 상태에서는 병합하지 않습니다. 강제 푸시는 사용자가 명시적으로 승인한 경우에만 허용합니다.
7. 병합 후 `origin/main`에 결과가 포함됐는지 확인하고, 더 이상 필요 없는 worktree와 로컬·원격 작업 브랜치는 안전하게 정리합니다. 완료 보고에는 PR과 병합 커밋을 함께 남깁니다.
8. 문서 규칙 변경처럼 사용자가 `origin/main` 직접 반영을 명시한 경우에만 예외적으로 `main`에 바로 커밋하고 푸시합니다.
