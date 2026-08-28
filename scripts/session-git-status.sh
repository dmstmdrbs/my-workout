#!/usr/bin/env bash
# SessionStart hook. 지금 어디에 서 있는지를 세션 첫 컨텍스트에 넣는다.
#
# 어제 운영 사고의 원인이 "로컬 main이 origin/main보다 7커밋 앞선 줄 모르고
# 배포한 것"이었다. 상태를 추측하지 않게 하려고 매 세션 시작에 찍는다.
#
# 일부러 fetch 하지 않는다 -- hook이 네트워크를 기다리면 세션 시작이 느려진다.
# origin 최신화는 scripts/start-task.sh 가 책임진다.
set -uo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0

branch=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')
dirty=$(git -C "$root" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
ahead_behind=$(git -C "$root" rev-list --left-right --count 'origin/main...HEAD' 2>/dev/null || echo '? ?')
behind=${ahead_behind%%[[:space:]]*}
ahead=${ahead_behind##*[[:space:]]}
worktrees=$(git -C "$root" worktree list 2>/dev/null | sed 's/^/    /')
vercel_project=$( [ -f "$root/.vercel/project.json" ] \
  && python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['projectName'])" "$root/.vercel/project.json" 2>/dev/null \
  || echo '링크 없음' )

allow_marker=''
[ -f "$root/.agent-allow-main" ] && allow_marker='
  ⚠ .agent-allow-main 이 있어 main 편집 가드가 꺼져 있습니다. 필요 없으면 지우세요.'

read -r -d '' context <<CONTEXT || true
[Trainlog 작업 상태]
  체크아웃      $root
  브랜치        $branch
  origin/main 대비  앞 ${ahead}커밋 / 뒤 ${behind}커밋 (fetch 안 함 -- 값이 낡을 수 있음)
  커밋 안 된 변경  ${dirty}개 파일
  Vercel 프로젝트  $vercel_project
  worktree
$worktrees

  규칙: 작업은 변경 규모와 무관하게 origin/main 에서 딴 브랜치+worktree 에서 합니다.
  시작   scripts/start-task.sh <작업이름> [브랜치접두사]
  정리   scripts/finish-task.sh <작업이름>
  main 에서의 커밋·푸시·편집과 수동 --prod 배포는 hook 이 차단합니다(AGENTS.md 참고).$allow_marker
CONTEXT

python3 - "$context" <<'PY'
import json, sys
print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'SessionStart',
        'additionalContext': sys.argv[1],
    }
}, ensure_ascii=False))
PY
