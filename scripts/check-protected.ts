import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { PROTECTED_PATH_SET } from './protected-paths'

const repository = process.cwd()
const approvalPath = path.join(repository, '.harness', 'protected-approvals.json')
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
  const untracked = git('ls-files', '--others', '--exclude-standard').split(/\r?\n/).filter(Boolean)
  return [...new Set([...tracked, ...untracked])].map((filePath) => filePath.replaceAll('\\', '/'))
}

function digest(relativePath: string): string {
  const absolutePath = path.join(repository, relativePath)
  if (!existsSync(absolutePath)) return 'DELETED'
  const normalized = readFileSync(absolutePath, 'utf8').replace(/\r\n?/g, '\n')
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

type Approval = { path: string; sha256: string; approvedBy: string; reason: string }

function loadApprovals(): Approval[] {
  if (!existsSync(approvalPath)) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(approvalPath, 'utf8'))
  } catch {
    throw new Error(`${path.relative(repository, approvalPath)} 형식이 올바르지 않습니다`)
  }
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed) || !('approvals' in parsed))
    throw new Error(`${path.relative(repository, approvalPath)} 형식이 올바르지 않습니다`)
  const value = parsed as { version: unknown; approvals: unknown }
  if (value.version !== 1 || !Array.isArray(value.approvals))
    throw new Error(`${path.relative(repository, approvalPath)} 형식이 올바르지 않습니다`)
  const seen = new Set<string>()
  return value.approvals.map((candidate, index) => {
    if (typeof candidate !== 'object' || candidate === null) throw new Error(`승인 항목 ${index + 1}이 올바르지 않습니다`)
    const approval = candidate as Partial<Approval>
    const normalizedPath = typeof approval.path === 'string' ? approval.path.replaceAll('\\', '/') : ''
    const sha256 = typeof approval.sha256 === 'string' ? approval.sha256 : ''
    const approvedBy = typeof approval.approvedBy === 'string' ? approval.approvedBy.trim() : ''
    const reason = typeof approval.reason === 'string' ? approval.reason.trim() : ''
    if (!PROTECTED_PATH_SET.has(normalizedPath) || seen.has(normalizedPath) || !/^[a-f0-9]{64}$/.test(sha256) || !approvedBy || !reason)
      throw new Error(`승인 항목 ${index + 1}이 올바르지 않습니다`)
    seen.add(normalizedPath)
    return { path: normalizedPath, sha256, approvedBy, reason }
  })
}

const base = baseRevision()
const changedProtected = changedPaths(base).filter((filePath) => PROTECTED_PATH_SET.has(filePath))
if (changedProtected.length === 0) {
  console.log('Protected 통과: 보호 경로 변경이 없습니다.')
  process.exit(0)
}

const approvals = loadApprovals()
const missing = changedProtected.filter((filePath) => {
  const currentHash = digest(filePath)
  return !approvals.some((approval) => approval.path === filePath && approval.sha256 === currentHash)
})
if (missing.length > 0) {
  console.error('PROTECTED_CHANGE_NEEDS_HUMAN: 승인되지 않은 보호 경로 변경입니다.')
  console.error(`비교 기준: ${base}`)
  for (const filePath of missing) console.error(`- ${filePath} (sha256: ${digest(filePath)})`)
  console.error('사람이 npm run verify:approve -- --scope <path> --reason <사유>를 실행한 뒤 다시 실행하세요.')
  process.exit(1)
}
console.log('Protected 통과: 모든 보호 경로 변경이 사람의 승인 기록과 일치합니다.')
