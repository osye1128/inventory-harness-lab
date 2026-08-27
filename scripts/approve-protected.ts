import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { PROTECTED_PATH_SET } from './protected-paths'

const repository = process.cwd()
const DEFAULT_APPROVER = 'osye1128'
export const approvalPath = path.join(repository, '.harness', 'protected-approvals.json')
const protectedPaths = PROTECTED_PATH_SET
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
  return 'HEAD' // 로컬에서는 현재 작업 트리의 미커밋 변경을 검사한다.
}

export function digest(relativePath: string): string {
  const absolutePath = path.join(repository, relativePath)
  if (!existsSync(absolutePath)) return 'DELETED'
  const normalized = readFileSync(absolutePath, 'utf8').replace(/\r\n?/g, '\n')
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

export function changedProtectedPaths(base = baseRevision()): string[] {
  const tracked = git('diff', '--name-only', base, '--').split(/\r?\n/).filter(Boolean)
  const untracked = git('ls-files', '--others', '--exclude-standard').split(/\r?\n/).filter(Boolean)
  return [...new Set([...tracked, ...untracked])]
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

type Approval = { path: string; sha256: string; approvedBy: string; reason: string }
type ApprovalFile = { version: 1; approvals: Approval[] }

function loadApprovalFile(): ApprovalFile {
  if (!existsSync(approvalPath)) return { version: 1, approvals: [] }
  const parsed = JSON.parse(readFileSync(approvalPath, 'utf8')) as ApprovalFile
  if (parsed.version !== 1 || !Array.isArray(parsed.approvals)) throw new Error('승인 파일 형식이 올바르지 않습니다')
  return parsed
}

export function run(argv: string[]): void {
  if (process.env.GITHUB_ACTIONS === 'true') throw new Error('verify:approve는 CI에서 실행할 수 없습니다')
  const { scope, approvedBy, reason } = parseArgs(argv)
  if (scope.length === 0 || !approvedBy || !reason) throw new Error('사용법: npm run verify:approve -- --scope <path> [--scope <path>] --reason <사유>')
  if (/^(ai|ci|bot|unknown)$/i.test(approvedBy)) throw new Error('AI·CI·bot·unknown은 승인자로 사용할 수 없습니다')
  if (scope.some((filePath) => !PROTECTED_PATH_SET.has(filePath))) throw new Error('scope에 보호되지 않은 경로가 포함되어 있습니다')

  const changed = changedProtectedPaths()
  if (changed.length === 0 || changed.length !== scope.length || changed.some((filePath) => !scope.includes(filePath))) {
    throw new Error(`scope가 현재 보호 경로 변경과 일치하지 않습니다. 변경: ${changed.join(', ') || '(없음)'} / scope: ${scope.join(', ')}`)
  }

  const current = loadApprovalFile()
  const updated = current.approvals.filter((approval) => !scope.includes(approval.path.replaceAll('\\', '/')))
  for (const filePath of scope) updated.push({ path: filePath, sha256: digest(filePath), approvedBy, reason })
  writeFileSync(approvalPath, `${JSON.stringify({ version: 1, approvals: updated }, null, 2)}\n`, 'utf8')
  for (const filePath of scope) console.log(`승인 기록: ${filePath} (sha256: ${digest(filePath)})`)
}

run(process.argv.slice(2))
