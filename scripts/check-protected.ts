import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const repository = process.cwd()
const approvalPath = path.join(repository, '.harness', 'protected-approvals.json')
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

const git = (...args: string[]) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim()

function baseRevision(): string {
  if (process.env.PROTECTED_BASE) return process.env.PROTECTED_BASE
  if (process.env.GITHUB_BASE_SHA) return process.env.GITHUB_BASE_SHA
  const baseRef = process.env.GITHUB_BASE_REF
  if (baseRef) {
    try {
      return git('rev-parse', `origin/${baseRef}`)
    } catch {
      return git('rev-parse', baseRef)
    }
  }
  return 'HEAD'
}

function changedPaths(base: string): string[] {
  const tracked = git('diff', '--name-only', base, '--').split(/\r?\n/).filter(Boolean)
  const untracked = git('status', '--porcelain', '--untracked-files=all')
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => line.startsWith('?? '))
    .map((line) => line.slice(3))
  return [...new Set([...tracked, ...untracked])]
}

function digest(relativePath: string): string {
  const absolutePath = path.join(repository, relativePath)
  if (!existsSync(absolutePath)) return 'DELETED'
  return createHash('sha256').update(readFileSync(absolutePath)).digest('hex')
}

type Approval = { path: string; sha256: string; approvedBy: string; reason?: string }
type ApprovalFile = { version: 1; approvals: Approval[] }

function loadApprovals(): Approval[] {
  if (!existsSync(approvalPath)) return []
  const parsed = JSON.parse(readFileSync(approvalPath, 'utf8')) as ApprovalFile
  if (parsed.version !== 1 || !Array.isArray(parsed.approvals)) {
    throw new Error(`${path.relative(repository, approvalPath)} 형식이 올바르지 않습니다`)
  }
  return parsed.approvals
}

const base = baseRevision()
const changedProtected = changedPaths(base).filter((filePath) => protectedPaths.has(filePath.replaceAll('\\', '/')))

if (changedProtected.length === 0) {
  console.log('Protected 통과: 보호 경로 변경이 없습니다.')
  process.exit(0)
}

const approvals = loadApprovals()
const missing = changedProtected.filter((filePath) => {
  const normalized = filePath.replaceAll('\\', '/')
  const currentHash = digest(normalized)
  return !approvals.some((approval) => approval.path === normalized && approval.sha256 === currentHash && approval.approvedBy.trim())
})

if (missing.length > 0) {
  console.error('PROTECTED_CHANGE_NEEDS_HUMAN: 승인되지 않은 보호 경로 변경입니다.')
  console.error(`비교 기준: ${base}`)
  for (const filePath of missing) {
    const normalized = filePath.replaceAll('\\', '/')
    console.error(`- ${normalized} (sha256: ${digest(normalized)})`)
  }
  console.error(`사람이 ${path.relative(repository, approvalPath)}에 경로·sha256·approvedBy·reason을 기록한 뒤 다시 실행하세요.`)
  process.exit(1)
}

console.log('Protected 통과: 모든 보호 경로 변경이 사람의 승인 기록과 일치합니다.')
