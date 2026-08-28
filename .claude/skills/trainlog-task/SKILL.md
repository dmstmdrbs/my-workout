---
name: trainlog-task
description: Trainlog 저장소에서 작업을 시작하거나 마무리할 때 사용한다. origin/main에서 브랜치와 전용 worktree를 만들고, 검증·PR·병합·정리까지의 순서를 안내한다. "작업 시작", "브랜치 만들어", "이거 고쳐줘"처럼 파일을 고치게 될 모든 요청의 첫 단계이며, 한 줄 수정도 예외가 아니다.
---

# Trainlog 작업 절차

이 저장소는 **변경 규모와 무관하게** 모든 작업을 `origin/main`에서 딴 브랜치와 전용 worktree에서 한다.
`main` 체크아웃에서의 편집·커밋·푸시와 수동 프로덕션 배포는 PreToolUse hook이 **차단한다**
(`scripts/agent-guard.mjs`). 이 절차는 그 차단에 걸리지 않는 길이다.

## 시작

```bash
scripts/start-task.sh <작업이름> [브랜치접두사]   # 접두사 기본값 feature
```

`fetch` → `origin/main`에서 브랜치·worktree 생성 → `node_modules` 심볼릭 링크 → 경로 출력까지 한다.
**출력된 절대 경로에서 작업한다.** 이 세션의 셸은 `cd`가 유지되지 않으므로, 절대 경로를 쓰거나
한 명령 안에서 `cd <경로> && <명령>` 형태로 실행한다.

접두사는 작업 성격에 맞춘다: `feature`, `fix`, `chore`, `docs`, `refactor`.

의존성을 바꾸는 작업이라면 링크된 `node_modules`가 거짓이 되므로 먼저 끊는다.

```bash
rm node_modules && npm ci
```

## 작업 단위

서로 독립적인 기능·수정을 한 브랜치에 섞지 않는다. 하나의 응집된 사용자 가치와 그 테스트·문서·
migration을 한 브랜치·한 PR로 묶는다.

## 끝내기

1. 변경 범위에 필요한 검증을 **전부** 돌린다.
   ```bash
   npm run lint && npx tsc -b && npm test && npm run build
   ```
2. 브랜치를 푸시하고 PR을 만든다. PR 본문에는 목적·주요 동작·검증 결과·DB migration과 배포
   영향·남은 제한 사항을 적는다.
3. 최신 `origin/main`과의 충돌과 체크 상태를 확인한 뒤 병합한다. 검증이 실패한 상태로 병합하지
   않는다.
4. 병합 결과가 `origin/main`에 들어갔는지 확인하고 정리한다.
   ```bash
   scripts/finish-task.sh <작업이름>
   ```
   커밋되지 않은 변경이나 병합되지 않은 커밋이 남아 있으면 스크립트가 멈춘다. 그때는 지우지 말고
   무엇이 남았는지 먼저 본다.
5. 완료 보고에 PR 번호와 병합 커밋을 함께 남긴다.

## 배포

Vercel이 Git에 연결돼 있어 **`main` 병합이 곧 프로덕션 배포다.** 수동 `vercel deploy --prod`는
hook이 막는다. 미리 보려면 `npx vercel deploy`(preview), 되돌리려면 `npx vercel rollback` 또는
`npx vercel redeploy <url> --target production`을 쓴다.

## 가드에 막혔을 때

메시지가 어느 규칙(G1~G5)인지와 올바른 명령을 알려준다. **막혔다는 것은 대개 절차를 건너뛰었다는
뜻이므로, 통로를 쓰기 전에 브랜치를 만드는 쪽이 맞는지 먼저 본다.**

통로는 사용자가 명시적으로 그렇게 하라고 했을 때만 쓴다.

| 상황 | 통로 |
|---|---|
| G1 main 커밋 | `TRAINLOG_ALLOW=main-commit <명령>` |
| G2 main 푸시 | `TRAINLOG_ALLOW=main-push <명령>` |
| G3 강제 푸시 | `TRAINLOG_ALLOW=force-push <명령>` |
| G4 수동 프로덕션 배포 | `TRAINLOG_ALLOW=prod-deploy <명령>` |
| G5 main 체크아웃 편집 | `touch .agent-allow-main` (끝나면 지운다) |

`.agent-allow-main`은 남아 있는 동안 G5를 끈 상태로 두고 매 편집마다 경고한다.
`scripts/finish-task.sh`가 정리할 때 함께 지운다.
