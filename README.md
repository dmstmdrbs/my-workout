# Trainlog

광고 없이 개인적으로 사용하는 운동 기록 웹앱입니다. 루틴 기반 운동과 자유 운동을 모두 지원하며, 목표 RIR과 실제 RIR을 별도로 기록합니다.

**운영 주소:** https://trainlog-psi.vercel.app

## 주요 기능

- Google 로그인과 Supabase 기반 개인 데이터 분리
- 루틴 생성·편집 및 세트별 목표 중량, 반복 수, 목표 RIR, 휴식 시간 설정
- 루틴 운동과 자유 운동 기록
- 진행 중 운동 초안 자동 저장, 재진입·새로고침 복원, 정확한 시작 시각 기반 운동 시간 계산
- 종목 추가·삭제 및 순서 변경 모달(마우스/터치 드래그앤드롭, 키보드 보조 버튼)
- 완료 세트별 실제 RIR 기록과 휴식 타이머
- 데스크톱 대시보드 및 모바일 하단 탭 UI
- 완료 운동 기록과 PNG 공유 카드 저장/공유
- 기록 화면 무한 스크롤 페이지네이션(커서 기반, 20개 단위)
- URL 기반 화면 이동과 브라우저 뒤로가기 지원
- 테마·기본 휴식 시간·기본 목표 RIR·표시 이름 설정과 로그아웃
- 체중·골격근량·체지방률 신체 측정 기록

## 기술 구성

- React 19 + TypeScript + Vite
- React Router, TanStack Query
- Supabase Auth (Google OAuth) + Postgres + RLS
- PWA (`vite-plugin-pwa`)
- Vitest + Testing Library

## 로컬 실행

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

`.env.local`에 아래 공개 클라이언트 값을 설정합니다.

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

두 값이 없으면 앱은 `localStorage` 기반 mock adapter로 실행됩니다. 이 모드는 UI 개발과 사용자 플로우 테스트에만 사용합니다.

## 검증

```bash
npm run lint
npx tsc -b
npm test -- --reporter=verbose
npm run build
```

테스트 시나리오와 수동 반응형 검수 항목은 [docs/user-flow-test-plan.md](docs/user-flow-test-plan.md)에 있습니다.

## 데이터베이스와 인증

스키마와 RLS 정책은 [supabase/migrations/20260815160127_trainlog_schema.sql](supabase/migrations/20260815160127_trainlog_schema.sql)에 있습니다.

새 Supabase 프로젝트에 적용할 때는 CLI로 로그인·연결 후 migration을 적용합니다. 운영 프로젝트나 기존 사용자 데이터에 영향을 주는 명령은 실행 전 반드시 백업 범위를 확인하세요.

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Google OAuth는 Supabase Dashboard의 Authentication > Sign In / Providers에서 설정합니다. Google Cloud Console의 승인된 리디렉션 URI에는 다음 형식의 Supabase 콜백을 등록해야 합니다.

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Supabase Auth URL Configuration에는 로컬 주소와 운영 도메인을 Redirect URL로 추가합니다.

## 배포

Vercel 프로젝트에 아래 환경 변수를 **Production**으로 설정한 뒤 배포합니다.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

```bash
npx vercel deploy --prod --yes
```

배포 전에는 위 검증 명령을 모두 통과해야 합니다. `service_role` 키, Google OAuth client secret, 사용자 데이터, `.env.local`은 절대 커밋하거나 브라우저 코드에 포함하지 마세요.

## 작업 이어가기

에이전트 또는 개발자용 구조·설계·안전 규칙은 [AGENTS.md](AGENTS.md)를 먼저 읽어 주세요.
