import { appendEvent, nextAttempt, readLedger, replayLedger, type EventKind, type EventStatus } from './harness-ledger'
import { execFileSync } from 'node:child_process'

const [command, ...args] = process.argv.slice(2)
const issue = Number(process.env.ISSUE_NUMBER ?? args.shift())
const issueUrl = process.env.ISSUE_URL ?? `https://github.com/osye1128/inventory-harness-lab/issues/${issue}`
const max = Number(process.env.ISSUE_MAX_ATTEMPTS ?? 3)
const sessionId = process.env.HARNESS_SESSION_ID ?? 'unknown-session'
const agentId = process.env.HARNESS_AGENT_ID ?? 'unknown-agent'
const actor = process.env.HARNESS_ACTOR ?? 'unknown-actor'
const repository = process.env.GITHUB_REPOSITORY ?? 'local'
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
const headCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const baseCommit = process.env.PROTECTED_BASE ?? ''

if (!Number.isInteger(issue) || issue < 1) throw new Error('Issue 번호가 필요합니다')
if (!Number.isInteger(max) || max < 1) throw new Error('최대 시도 횟수가 올바르지 않습니다')

const events = readLedger()
const attemptNumber = nextAttempt(events, issue)
if (command === 'start') {
  const issueAttempts = events.filter((event) => event.issue.number === issue)
  const persistedMax = issueAttempts[0]?.attempt.max
  if (persistedMax !== undefined && persistedMax !== max) {
    throw new Error(`Issue #${issue}의 최대 시도 횟수가 기존 원장과 다릅니다. NEEDS_HUMAN으로 전환하세요.`)
  }
  if (issueAttempts.some((event) => event.kind === 'attempt.started' && !['passed', 'failed', 'interrupted', 'needs_human'].includes(String(event.payload.status)))) {
    throw new Error(`Issue #${issue}에 완료되지 않은 시도가 있습니다. 먼저 handoff를 기록하세요.`)
  }
  if (attemptNumber > max) throw new Error(`최대 시도 횟수(${max})에 도달했습니다. NEEDS_HUMAN으로 전환하세요.`)
  appendEvent({
    kind: 'attempt.started',
    issue: { number: issue, url: issueUrl },
    attempt: { id: `${issue}-${attemptNumber}`, number: attemptNumber, max },
    sessionId, agentId, actor, repository, branch, baseCommit, headCommit,
    payload: { command },
  })
  console.log(`Issue #${issue} attempt ${attemptNumber}/${max} 시작`)
} else if (command === 'checkpoint' || command === 'finish' || command === 'handoff' || command === 'decision') {
  const state = replayLedger(events)
  const active = state.activeAttempt?.issue.number === issue
    ? state.activeAttempt
    : events.filter((event) => event.issue.number === issue).at(-1)
  if (!active) throw new Error('활성 시도를 찾을 수 없습니다')
  const kindByCommand: Record<string, EventKind> = {
    checkpoint: 'checkpoint.recorded',
    finish: 'attempt.finished',
    handoff: 'handoff.recorded',
    decision: 'decision.recorded',
  }
  const kind = kindByCommand[command]
  const status = (process.env.HARNESS_STATUS ?? (command === 'finish' ? 'passed' : 'running')) as EventStatus
  if (!kind) throw new Error(`지원하지 않는 명령입니다: ${command}`)
  appendEvent({
    kind,
    issue: active.issue,
    attempt: active.attempt,
    sessionId, agentId, actor, repository, branch, baseCommit, headCommit,
    payload: { stage: process.env.HARNESS_STAGE, status, details: args },
  })
  console.log(`${kind} 기록 완료 (${active.attempt.id})`)
} else {
  throw new Error('사용법: issue-run start|checkpoint|finish|handoff|decision [issue-number]')
}
