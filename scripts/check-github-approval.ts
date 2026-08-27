import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const repository = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
const eventPath = process.env.GITHUB_EVENT_PATH
const baseSha = process.env.GITHUB_BASE_SHA
const headSha = process.env.GITHUB_HEAD_SHA

const protectedPaths = new Set([
  'docs/01-requirements.md',
  'docs/06-architecture.md',
  'docs/harness/SSOT.md',
  'package.json',
  'scripts/check-architecture.ts',
  'scripts/check-protected.ts',
  'scripts/prepare-verify.ts',
  'scripts/verify.ts',
])

function fail(message: string): never {
  console.error(`PROTECTED_CHANGE_NEEDS_HUMAN: ${message}`)
  process.exit(1)
}

if (!repository || !token || !eventPath || !baseSha || !headSha) {
  fail('GitHub PR review 확인 정보가 없습니다.')
}

const event = JSON.parse(readFileSync(eventPath, 'utf8')) as { pull_request?: { number?: number } }
const pullNumber = event.pull_request?.number
if (!pullNumber) fail('PR 번호가 없습니다.')

const changed = execFileSync('git', ['diff', '--name-only', baseSha!, headSha!, '--'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .map((filePath) => filePath.replaceAll('\\', '/'))
  .filter((filePath) => protectedPaths.has(filePath))

if (changed.length === 0) {
  console.log('Protected 통과: PR의 보호 경로 변경이 없습니다.')
  process.exit(0)
}

const codeowners = readFileSync('.github/CODEOWNERS', 'utf8')
  .split(/\r?\n/)
  .map((line) => line.replace(/#.*/, '').trim())
  .filter(Boolean)
  .map((line) => line.split(/\s+/))
const owners = new Set<string>()
for (const filePath of changed) {
  const rule = codeowners
    .filter(([pattern]) => pattern === `/${filePath}` || pattern === filePath)
    .at(-1)
  if (!rule || rule.length < 2) fail(`CODEOWNER를 확인할 수 없습니다: ${filePath}`)
  for (const owner of rule.slice(1)) {
    if (owner.startsWith('@') && !owner.includes('/')) owners.add(owner.slice(1))
  }
}
if (owners.size === 0) fail('보호 경로를 담당하는 사용자 CODEOWNER가 없습니다.')

async function verifyReview(): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/pulls/${pullNumber}/reviews?per_page=100`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )
  if (!response.ok) fail(`GitHub 리뷰 조회 실패 (${response.status}).`)

  const reviews = (await response.json()) as Array<{
  user?: { login?: string; type?: string }
  state?: string
  commit_id?: string
  submitted_at?: string
  dismissed_at?: string | null
}>
  const latestByUser = new Map<string, (typeof reviews)[number]>()
  for (const review of reviews) {
    const login = review.user?.login
    if (!login || review.user?.type !== 'User' || !review.submitted_at) continue
    const previous = latestByUser.get(login)
    if (!previous || previous.submitted_at! < review.submitted_at) latestByUser.set(login, review)
  }

  const missing = [...owners].filter((owner) => {
    const review = latestByUser.get(owner)
    return !review || review.state !== 'APPROVED' || review.commit_id !== headSha || review.dismissed_at
  })
  if (missing.length > 0) fail(`현재 PR head에 대한 CODEOWNER 승인이 필요합니다: ${missing.join(', ')}`)

  console.log(`Protected 통과: CODEOWNER 승인이 현재 PR head ${headSha}에 일치합니다.`)
}

verifyReview().catch((error: unknown) => {
  fail(`GitHub 리뷰 확인 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
})
