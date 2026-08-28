#!/usr/bin/env node
/**
 * 에이전트 워크플로 가드.
 *
 * `.claude/settings.json`의 PreToolUse hook으로 실행된다. stdin으로 도구 호출
 * 정보를 받아, AGENTS.md의 Git 규칙을 어기는 호출이면 종료 코드 2로 **호출
 * 자체를 막는다**. 문서와 스킬은 에이전트가 읽지 않으면 그만이지만 이 경로는
 * 하네스가 실행하므로 우회할 수 없다 -- 아래 명시적 통로를 빼고는.
 *
 * 막는 것(규칙 번호는 AGENTS.md "에이전트 워크플로 가드" 절과 맞춘다):
 *   G1 main/master에서 git commit
 *   G2 main으로 git push
 *   G3 git push --force
 *   G4 vercel deploy --prod (Vercel이 Git에 연결돼 main 병합이 곧 배포다)
 *   G5 main 체크아웃에서 파일 편집(Write/Edit)
 *
 * 통로:
 *   - Bash(G1~G4): 명령 앞에 `TRAINLOG_ALLOW=<규칙>` 을 붙인다. 한 명령에만
 *     적용되고 명령어에 그대로 드러나 승인 화면에서 보인다.
 *   - 편집(G5): 저장소 루트에 `.agent-allow-main` 파일을 만든다. 남아 있으면
 *     매번 경고한다 -- 통로가 조용히 상주하면 가드가 없는 것과 같다.
 *
 * 판정은 순수 함수(`evaluate`)로 두고 종료 코드는 아래 CLI 래퍼만 다룬다.
 * hook은 조용히 망가지면 아무도 모르는 종류라 테스트가 붙어 있어야 한다.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const BLOCK_EXIT_CODE = 2
export const ALLOW_MARKER = '.agent-allow-main'
const MAIN_BRANCHES = new Set(['main', 'master'])
const START_TASK = 'scripts/start-task.sh <작업이름>'

function git(dir, args) {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/** 실제 git·파일시스템을 쓰는 기본 컨텍스트. 테스트는 이걸 대신 넘긴다. */
export function defaultContext(cwd) {
  return {
    cwd,
    repoRoot: (dir) => git(dir, ['rev-parse', '--show-toplevel']),
    currentBranch: (dir) => git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']),
    hasAllowMarker: (root) => existsSync(path.join(root, ALLOW_MARKER)),
  }
}

/** 명령 앞에 붙은 `TRAINLOG_ALLOW=<규칙>` 을 모은다. */
function allowedRules(command) {
  const found = new Set()
  for (const match of command.matchAll(/(?:^|[;&|]\s*|\s)TRAINLOG_ALLOW=([A-Za-z0-9_,-]+)/g)) {
    for (const rule of match[1].split(',')) found.add(rule.trim())
  }
  return found
}

/**
 * 명령 문자열에서 특정 git 하위 명령이 실제로 실행되는지 본다. 단어 경계를
 * 요구해, 커밋 메시지 본문에 우연히 들어간 단어를 잡지 않는다.
 */
function runsGit(command, subcommand) {
  return new RegExp(String.raw`(?:^|[;&|(]\s*|&&\s*|\|\|\s*)(?:\w+=\S+\s+)*git\b[^;&|\n]*?\s${subcommand}\b`).test(command)
}

function checkBash(command, context) {
  const allowed = allowedRules(command)
  const root = context.repoRoot(context.cwd)
  const branch = root ? context.currentBranch(root) : null
  const onMain = branch !== null && MAIN_BRANCHES.has(branch)

  if (runsGit(command, 'push') && /\s(?:--force|--force-with-lease|-f)(?:\s|$|=)/.test(command) && !allowed.has('force-push')) {
    return { rule: 'G3', lines: [
      '강제 푸시는 사용자가 명시적으로 승인한 경우에만 허용됩니다 (AGENTS.md Git 규칙 6).',
      '승인을 받았다면: TRAINLOG_ALLOW=force-push <명령>',
    ] }
  }

  if (runsGit(command, 'commit') && onMain && !allowed.has('main-commit')) {
    return { rule: 'G1', lines: [
      `현재 브랜치가 '${branch}'입니다. 변경 규모와 무관하게 작업은 별도 브랜치에서 합니다.`,
      `먼저: ${START_TASK}`,
      '문서 규칙 변경처럼 사용자가 main 직접 반영을 명시했다면: TRAINLOG_ALLOW=main-commit <명령>',
    ] }
  }

  if (runsGit(command, 'push') && !allowed.has('main-push')) {
    // `git push origin main` 처럼 대상을 적었거나, main에 서 있는 채로 대상을
    // 생략한(= 현재 브랜치를 밀어 올리는) 푸시를 막는다.
    const pushesMainExplicitly = /\bgit\b[^;&|\n]*\spush\b[^;&|\n]*\s(?:main|master|HEAD:main|HEAD:refs\/heads\/main)(?:\s|$)/.test(command)
    const pushesCurrentBranch = !/\bpush\b[^;&|\n]*?\s[\w./@-]+\s+[\w./:@-]+/.test(command)
    if (pushesMainExplicitly || (onMain && pushesCurrentBranch)) {
      return { rule: 'G2', lines: [
        'main으로 직접 푸시하지 않습니다. 브랜치를 푸시하고 PR로 병합합니다 (AGENTS.md Git 규칙 4~6).',
        `브랜치가 없다면 먼저: ${START_TASK}`,
        '사용자가 main 직접 반영을 명시했다면: TRAINLOG_ALLOW=main-push <명령>',
      ] }
    }
  }

  // 조회·롤백 계열(rollback, redeploy, inspect, ls …)은 --prod/--target을 써도 막지 않는다.
  const isVercelProdDeploy = /\bvercel\b(?![^;&|\n]*\b(?:rollback|redeploy|inspect|ls|env|project|git|whoami|link|logs)\b)[^;&|\n]*\s--prod\b/.test(command)
  if (isVercelProdDeploy && !allowed.has('prod-deploy')) {
    return { rule: 'G4', lines: [
      'Vercel이 Git에 연결돼 있어 main 병합이 곧 프로덕션 배포입니다. 수동 --prod 배포는 쓰지 않습니다.',
      '배포하려면 PR을 병합하세요. 미리 보려면 --prod 없이 `npx vercel deploy` (preview).',
      '롤백은 `npx vercel rollback` 또는 `npx vercel redeploy <url> --target production` 을 씁니다.',
      '긴급 상황으로 사용자가 승인했다면: TRAINLOG_ALLOW=prod-deploy <명령>',
    ] }
  }

  return null
}

function checkEdit(filePath, context) {
  const root = context.repoRoot(context.cwd)
  if (!root) return null

  const absolute = path.resolve(context.cwd, filePath)
  // 저장소 밖(스크래치패드 등)은 이 규칙과 무관하다.
  if (!absolute.startsWith(`${root}${path.sep}`)) return null
  // 통로 파일 자체는 만들 수 있어야 한다.
  if (path.basename(absolute) === ALLOW_MARKER) return null
  if (context.hasAllowMarker(root)) {
    return { warn: `${ALLOW_MARKER} 가 남아 있어 main 편집 가드가 꺼져 있습니다. 작업이 끝나면 지우세요.` }
  }

  const branch = context.currentBranch(root)
  if (branch === null || !MAIN_BRANCHES.has(branch)) return null

  return { rule: 'G5', lines: [
    `현재 브랜치가 '${branch}'입니다. 한 줄 수정이라도 별도 브랜치에서 합니다 (AGENTS.md Git 규칙 2).`,
    `먼저: ${START_TASK}`,
    `사용자가 main 직접 반영을 명시했다면: touch ${ALLOW_MARKER} (끝나면 지울 것)`,
  ] }
}

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

/**
 * 도구 호출 하나를 판정한다.
 * @returns `null`(통과) | `{ rule, lines }`(차단) | `{ warn }`(통과하되 경고)
 */
export function evaluate(payload, context) {
  const tool = payload?.tool_name
  const input = payload?.tool_input ?? {}

  if (tool === 'Bash' && typeof input.command === 'string') return checkBash(input.command, context)
  if (EDIT_TOOLS.has(tool) && typeof input.file_path === 'string') return checkEdit(input.file_path, context)
  return null
}

function main() {
  let payload = null
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return 0 // 입력을 못 읽으면 판단하지 않는다.
  }

  const context = defaultContext(payload?.cwd ?? process.cwd())
  const verdict = evaluate(payload, context)
  if (verdict === null) return 0
  if (verdict.warn) {
    console.error(`[agent-guard] 경고: ${verdict.warn}`)
    return 0
  }
  console.error(`[agent-guard ${verdict.rule}] ${verdict.lines.join('\n')}`)
  return BLOCK_EXIT_CODE
}

// 테스트에서 import할 때는 실행하지 않는다.
if (process.argv[1]?.endsWith('agent-guard.mjs')) {
  try {
    process.exit(main())
  } catch (error) {
    // 가드가 스스로 망가져 작업을 막는 일은 없어야 한다.
    console.error(`[agent-guard] 검사 실패(통과 처리): ${error}`)
    process.exit(0)
  }
}
