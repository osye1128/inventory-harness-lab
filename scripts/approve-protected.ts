import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const repository = process.cwd()
const DEFAULT_APPROVER = 'osye1128'
export const approvalPath = path.join(repository, '.harness', 'protected-approvals.json')
export const protectedPaths = new Set([
  'docs/01-requirements.md',
  'docs/06-architecture.md',
  'docs/harness/SSOT.md',
  'package.json',
  'scripts/check-architecture.ts',
  'scripts/check-protected.ts',
  'scripts/prepare-verify.ts',
  'scripts/verify.ts',
])

type Approval = { path: string; sha256: string; approvedBy: string; reason?: string }
type ApprovalFile = { version: 1; approvals: Approval[] }

const git = (...args: string[]) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim()

function baseRevision(): string {
  return process.env.PROTECTED_BASE ?? process.env.GITHUB_BASE_SHA ?? 'HEAD'
}

export function digest(relativePath: string): string {
  const absolutePath = path.join(repository, relativePath)
  if (!existsSync(absolutePath)) return 'DELETED'
  const normalized = readFileSync(absolutePath, 'utf8').replace(/\r\n?/g, '\n')
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

export function changedProtectedPaths(base = baseRevision()): string[] {
  return [...new Set(git('diff', '--name-only', base, '--').split(/\r?\n/).filter(Boolean))]
    .map((filePath) => filePath.replaceAll('\\', '/'))
    .filter((filePath) => protectedPaths.has(filePath))
}

function parseArgs(argv: string[]) {
  const scope: string[] = []
  let approvedBy = DEFAULT_APPROVER
  let reason = ''
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--scope') scope.push(...(argv[++index] ?? '').split(',').map((value) => value.trim()).filter(Boolean))
    else if (arg === '--approved-by') approvedBy = argv[++index] ?? ''
    else if (arg === '--reason') reason = argv[++index] ?? ''
    else throw new Error(`알 수 없는 인자입니다: ${arg}`)
  }
  return { scope: [...new Set(scope.map((entry) => entry.replaceAll('\\', '/')))], approvedBy: approvedBy.trim(), reason: reason.trim() }
}

function loadApprovalFile(): ApprovalFile {
  if (!existsSync(approvalPath)) return { version: 1, approvals: [] }
  const parsed = JSON.parse(readFileSync(approvalPath, 'utf8')) as ApprovalFile
  if (parsed.version !== 1 || !Array.isArray(parsed.approvals)) throw new Error('승인 파일 형식이 올바르지 않습니다')
  return parsed
}

export function run(argv: string[]): void {
  if (process.env.GITHUB_ACTIONS === 'true') throw new Error('verify:approve는 CI에서 실행할 수 없습니다')
  const { scope, approvedBy, reason } = parseArgs(argv)
  if (scope.length === 0 || !approvedBy || !reason) throw new Error('사용법: npm run verify:approve -- --scope <path> [--scope <path>] --approved-by <사람> --reason <사유>')
  if (/^(ai|ci|bot|unknown)$/i.test(approvedBy)) throw new Error('AI·CI·bot·unknown은 승인자로 사용할 수 없습니다')
  if (scope.some((filePath) => !protectedPaths.has(filePath))) throw new Error('scope에 보호되지 않은 경로가 포함되어 있습니다')

  const changed = changedProtectedPaths()
  const missingFromScope = changed.filter((filePath) => !scope.includes(filePath))
  const extraInScope = scope.filter((filePath) => !changed.includes(filePath))
  if (missingFromScope.length || extraInScope.length) {
    throw new Error(`scope가 현재 보호 경로 변경과 일치하지 않습니다. 변경: ${changed.join(', ') || '(없음)'} / scope: ${scope.join(', ')}`)
  }

  const current = loadApprovalFile()
  const updated = current.approvals.filter((approval) => !scope.includes(approval.path.replaceAll('\\', '/')))
  for (const filePath of scope) updated.push({ path: filePath, sha256: digest(filePath), approvedBy, reason })
  writeFileSync(approvalPath, `${JSON.stringify({ version: 1, approvals: updated }, null, 2)}\n`, 'utf8')
  for (const filePath of scope) console.log(`승인 기록: ${filePath} (sha256: ${digest(filePath)})`)
}

run(process.argv.slice(2))
