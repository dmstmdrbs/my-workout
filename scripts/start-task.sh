#!/usr/bin/env bash
# 새 작업을 규칙대로 시작한다 (AGENTS.md "Git 브랜치·워크트리·PR").
#
#   scripts/start-task.sh <작업이름> [브랜치접두사]
#   scripts/start-task.sh records-empty-state fix
#
# 하는 일:
#   1. origin/main 을 fetch 한다 (직전 상태를 최신이라 가정하지 않는다)
#   2. fetch 직후의 origin/main 에서 브랜치와 전용 worktree 를 만든다
#   3. node_modules 를 메인 체크아웃에 심볼릭 링크한다 (install 0초)
#   4. 작업할 절대 경로를 출력한다
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "사용법: scripts/start-task.sh <작업이름> [브랜치접두사(기본 feature)]" >&2
  exit 1
fi

slug=$1
prefix=${2:-feature}
branch="${prefix}/${slug}"

# worktree 안에서 실행해도 메인 체크아웃을 가리켜야 한다. --show-toplevel 은
# 현재 worktree 를 돌려주므로, 그걸 쓰면 worktree 안에서 실행했을 때
# <repo>-wt-wt/<slug> 같은 엉뚱한 경로를 찾는다. --git-common-dir 은 어느
# worktree 에서 불러도 메인 저장소의 .git 을 가리킨다.
main_checkout=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
repo_name=$(basename "$main_checkout")
worktree_root="$(dirname "$main_checkout")/${repo_name}-wt"
worktree="${worktree_root}/${slug}"

if [ -e "$worktree" ]; then
  echo "이미 있습니다: $worktree" >&2
  echo "이어서 작업하려면 그 경로를 쓰고, 새로 시작하려면 scripts/finish-task.sh ${slug} 로 정리하세요." >&2
  exit 1
fi

echo "→ origin/main fetch"
git -C "$main_checkout" fetch origin main --quiet

echo "→ worktree 생성: $worktree (브랜치 $branch, 시작점 origin/main)"
mkdir -p "$worktree_root"
git -C "$main_checkout" worktree add "$worktree" -b "$branch" origin/main

# node_modules 는 메인 체크아웃 것을 그대로 쓴다. worktree 마다 npm ci 를 돌리면
# 작업 시작이 느려져 결국 규칙을 건너뛰게 된다 -- 그게 이 스크립트가 생긴 이유다.
link_target=$(python3 -c "import os,sys;print(os.path.relpath(sys.argv[1], sys.argv[2]))" "$main_checkout/node_modules" "$worktree")
ln -s "$link_target" "$worktree/node_modules"
echo "→ node_modules 링크: $link_target"

# 링크된 의존성은 메인 체크아웃의 package.json 기준이다. 브랜치에서 의존성을
# 건드리면 그 링크는 거짓이 되므로, 그때는 링크를 끊고 제대로 설치해야 한다.
cat <<'NOTE'

주의: node_modules 는 메인 체크아웃과 공유됩니다.
  package.json / package-lock.json 을 바꾸는 작업이라면 먼저 링크를 끊으세요.
    rm node_modules && npm ci
NOTE

echo
echo "작업 경로:"
echo "  $worktree"
echo
echo "끝나고 PR 병합까지 마쳤으면:"
echo "  scripts/finish-task.sh ${slug}"
