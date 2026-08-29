import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { ALLOW_MARKER, evaluate } from '../../scripts/agent-guard.mjs'

/**
 * 워크플로 가드는 hook으로 실행되므로, 망가지면 아무 소리 없이 통과시키거나
 * 반대로 정상 작업을 막는다. 둘 다 눈에 띄지 않으니 규칙마다 "막는 경우"와
 * "막지 않는 경우"를 함께 고정해 둔다.
 *
 * 실제 git을 부르지 않고 컨텍스트를 주입한다 -- main 브랜치의 저장소를
 * 테스트마다 만들 수는 없다.
 */
const REPO = path.resolve('/repo')

function context({ branch = 'main', root = REPO, marker = false } = {}) {
  return {
    cwd: root ?? '/elsewhere',
    repoRoot: () => root,
    currentBranch: () => branch,
    hasAllowMarker: () => marker,
  }
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } })
const write = (file_path) => ({ tool_name: 'Write', tool_input: { file_path } })

const ruleOf = (verdict) => verdict?.rule ?? null

describe('G1 main에서 커밋', () => {
  test('main에서는 막는다', () => {
    expect(ruleOf(evaluate(bash('git commit -m "x"'), context({ branch: 'main' })))).toBe('G1')
  })

  test('master도 막는다', () => {
    expect(ruleOf(evaluate(bash('git add -A && git commit -q -m x'), context({ branch: 'master' })))).toBe('G1')
  })

  test('작업 브랜치에서는 통과한다', () => {
    expect(evaluate(bash('git commit -m "x"'), context({ branch: 'feature/records' }))).toBeNull()
  })

  test('통로를 명시하면 통과한다', () => {
    expect(evaluate(bash('TRAINLOG_ALLOW=main-commit git commit -m "docs"'), context({ branch: 'main' }))).toBeNull()
  })

  test('커밋 본문에 들어간 단어는 명령으로 보지 않는다', () => {
    // heredoc 본문에 "push"가 있어도 푸시로 오인하면 안 된다.
    const command = 'git commit -F - <<\'EOF\'\nfix: 배포 전에 push 하지 않도록 안내한다\nEOF'
    expect(ruleOf(evaluate(bash(command), context({ branch: 'feature/x' })))).toBeNull()
  })
})

describe('G2 main으로 푸시', () => {
  test('대상을 main으로 적으면 작업 브랜치에서도 막는다', () => {
    expect(ruleOf(evaluate(bash('git push origin main'), context({ branch: 'feature/x' })))).toBe('G2')
  })

  test('main에 서서 대상 없이 푸시하면 막는다', () => {
    expect(ruleOf(evaluate(bash('git push'), context({ branch: 'main' })))).toBe('G2')
  })

  test('작업 브랜치를 올리는 푸시는 통과한다', () => {
    expect(evaluate(bash('git push -u origin feature/records-tab'), context({ branch: 'feature/records-tab' }))).toBeNull()
  })

  test('원격 브랜치 삭제는 통과한다 (정리 스크립트가 쓴다)', () => {
    expect(evaluate(bash('git push origin --delete chore/guard'), context({ branch: 'main' }))).toBeNull()
  })

  test('통로를 명시하면 통과한다', () => {
    expect(evaluate(bash('TRAINLOG_ALLOW=main-push git push origin main'), context({ branch: 'main' }))).toBeNull()
  })
})

describe('G3 강제 푸시', () => {
  test('--force는 막는다', () => {
    expect(ruleOf(evaluate(bash('git push --force origin feature/x'), context({ branch: 'feature/x' })))).toBe('G3')
  })

  test('--force-with-lease도 막는다', () => {
    expect(ruleOf(evaluate(bash('git push --force-with-lease origin feature/x'), context({ branch: 'feature/x' })))).toBe('G3')
  })

  test('통로를 명시하면 통과한다', () => {
    expect(evaluate(bash('TRAINLOG_ALLOW=force-push git push --force origin feature/x'), context({ branch: 'feature/x' }))).toBeNull()
  })
})

describe('G4 수동 프로덕션 배포', () => {
  test('deploy --prod는 막는다', () => {
    expect(ruleOf(evaluate(bash('npx vercel deploy --prod --yes'), context({ branch: 'main' })))).toBe('G4')
  })

  test('--prod 축약형도 막는다', () => {
    expect(ruleOf(evaluate(bash('npx vercel --prod'), context({ branch: 'feature/x' })))).toBe('G4')
  })

  test('preview 배포는 통과한다', () => {
    expect(evaluate(bash('npx vercel deploy'), context({ branch: 'feature/x' }))).toBeNull()
  })

  test('롤백과 재배포는 통과한다', () => {
    expect(evaluate(bash('npx vercel rollback trainlog-abc.vercel.app --yes'), context({ branch: 'main' }))).toBeNull()
    expect(evaluate(bash('npx vercel redeploy trainlog-abc.vercel.app --target production'), context({ branch: 'main' }))).toBeNull()
  })

  test('조회 명령은 통과한다', () => {
    expect(evaluate(bash('npx vercel ls trainlog --environment production'), context({ branch: 'main' }))).toBeNull()
  })

  test('통로를 명시하면 통과한다', () => {
    expect(evaluate(bash('TRAINLOG_ALLOW=prod-deploy npx vercel deploy --prod'), context({ branch: 'main' }))).toBeNull()
  })
})

describe('G5 main 체크아웃에서 편집', () => {
  test('main에서는 한 줄 수정도 막는다', () => {
    expect(ruleOf(evaluate(write(`${REPO}/src/App.tsx`), context({ branch: 'main' })))).toBe('G5')
  })

  test('작업 브랜치에서는 통과한다', () => {
    expect(evaluate(write(`${REPO}/src/App.tsx`), context({ branch: 'feature/x' }))).toBeNull()
  })

  test('저장소 밖 파일은 이 규칙과 무관하다', () => {
    expect(evaluate(write('/tmp/scratch/notes.md'), context({ branch: 'main' }))).toBeNull()
  })

  test('통로 파일 자체는 만들 수 있다', () => {
    expect(evaluate(write(`${REPO}/${ALLOW_MARKER}`), context({ branch: 'main' }))).toBeNull()
  })

  test('통로 파일이 있으면 막지 않고 경고만 한다', () => {
    const verdict = evaluate(write(`${REPO}/src/App.tsx`), context({ branch: 'main', marker: true }))
    expect(verdict?.rule).toBeUndefined()
    expect(verdict?.warn).toContain(ALLOW_MARKER)
  })

  test('git 저장소가 아니면 통과한다', () => {
    expect(evaluate(write('/anywhere/file.txt'), context({ branch: 'main', root: null }))).toBeNull()
  })
})

describe('그 외 도구', () => {
  test('읽기 도구는 판정하지 않는다', () => {
    expect(evaluate({ tool_name: 'Read', tool_input: { file_path: `${REPO}/src/App.tsx` } }, context({ branch: 'main' }))).toBeNull()
  })

  test('알 수 없는 입력에도 터지지 않는다', () => {
    expect(evaluate(null, context())).toBeNull()
    expect(evaluate({ tool_name: 'Bash' }, context())).toBeNull()
  })
})
