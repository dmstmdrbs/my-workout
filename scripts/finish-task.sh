#!/usr/bin/env bash
# 병합이 끝난 작업의 worktree 와 브랜치를 정리한다 (AGENTS.md Git 규칙 7).
#
#   scripts/finish-task.sh <작업이름>
#
# 커밋되지 않은 변경이나 아직 병합되지 않은 커밋이 남아 있으면 지우지 않고
# 멈춘다 -- 정리 스크립트가 작업을 삼키는 일은 없어야 한다.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "사용법: scripts/finish-task.sh <작업이름>" >&2
  exit 1
fi

slug=$1
main_checkout=$(git rev-parse --show-toplevel)
repo_name=$(basename "$main_checkout")
worktree="$(dirname "$main_checkout")/${repo_name}-wt/${slug}"

if [ ! -d "$worktree" ]; then
  echo "worktree 가 없습니다: $worktree" >&2
  exit 1
fi

branch=$(git -C "$worktree" rev-parse --abbrev-ref HEAD)

if [ -n "$(git -C "$worktree" status --porcelain)" ]; then
  echo "커밋되지 않은 변경이 남아 있어 정리하지 않습니다: $worktree" >&2
  git -C "$worktree" status --short >&2
  exit 1
fi

git -C "$main_checkout" fetch origin main --quiet
unmerged=$(git -C "$main_checkout" rev-list --count "origin/main..${branch}")
if [ "$unmerged" != "0" ]; then
  echo "브랜치 ${branch} 에 origin/main 에 없는 커밋이 ${unmerged}개 남아 있어 정리하지 않습니다." >&2
  git -C "$main_checkout" log --oneline "origin/main..${branch}" >&2
  exit 1
fi

# 통로 파일이 남아 있으면 다음 작업에서 가드가 꺼진 채로 시작한다.
if [ -f "$main_checkout/.agent-allow-main" ]; then
  rm "$main_checkout/.agent-allow-main"
  echo "→ .agent-allow-main 제거 (main 편집 가드 복구)"
fi

echo "→ worktree 제거: $worktree"
git -C "$main_checkout" worktree remove "$worktree"

echo "→ 로컬 브랜치 삭제: $branch"
git -C "$main_checkout" branch -d "$branch"

if git -C "$main_checkout" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  echo "→ 원격 브랜치 삭제: origin/$branch"
  git -C "$main_checkout" push origin --delete "$branch"
fi

git -C "$main_checkout" worktree prune
echo "정리 완료."
