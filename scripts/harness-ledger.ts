import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type EventKind = 'attempt.started' | 'checkpoint.recorded' | 'attempt.finished' | 'decision.recorded' | 'handoff.recorded'
export type EventStatus = 'running' | 'passed' | 'failed' | 'interrupted' | 'needs_human'

export type LedgerEvent = {
  schemaVersion: 1
  eventId: string
  kind: EventKind
  issue: { number: number; url: string }
  attempt: { id: string; number: number; max: number }
  sessionId: string
  agentId: string
  actor: string
  repository: string
  branch: string
  baseCommit: string
  headCommit: string
  occurredAt: string
  payload: Record<string, unknown>
}

export type LedgerState = {
  events: LedgerEvent[]
  attempts: Map<string, { number: number; max: number; status: EventStatus; headCommit: string }>
  activeAttempt?: LedgerEvent
}

export function ledgerPath(root = process.cwd()): string {
  return process.env.HARNESS_LEDGER_PATH ?? path.join(root, '.harness', 'ledger.jsonl')
}

function validate(event: unknown): asserts event is LedgerEvent {
  if (typeof event !== 'object' || event === null) throw new Error('하네스 원장 이벤트가 객체가 아닙니다')
  const value = event as Partial<LedgerEvent>
  if (value.schemaVersion !== 1 || typeof value.eventId !== 'string' || typeof value.kind !== 'string')
    throw new Error('하네스 원장 이벤트 형식이 올바르지 않습니다')
  if (!['attempt.started', 'checkpoint.recorded', 'attempt.finished', 'decision.recorded', 'handoff.recorded'].includes(value.kind))
    throw new Error(`알 수 없는 하네스 원장 이벤트입니다: ${value.kind}`)
  if (!value.issue || typeof value.issue.number !== 'number' || typeof value.issue.url !== 'string')
    throw new Error('하네스 원장 Issue 정보가 올바르지 않습니다')
  if (!value.attempt || typeof value.attempt.id !== 'string' || !Number.isInteger(value.attempt.number) || !Number.isInteger(value.attempt.max))
    throw new Error('하네스 원장 시도 정보가 올바르지 않습니다')
  if (value.attempt.number < 1 || value.attempt.number > value.attempt.max)
    throw new Error('하네스 원장 시도 횟수가 상한을 초과했습니다')
  for (const key of ['sessionId', 'agentId', 'actor', 'repository', 'branch', 'baseCommit', 'headCommit', 'occurredAt']) {
    if (typeof value[key as keyof LedgerEvent] !== 'string') throw new Error(`하네스 원장 ${key}가 없습니다`)
  }
  if (!value.payload || typeof value.payload !== 'object') throw new Error('하네스 원장 payload가 올바르지 않습니다')
}

export function readLedger(file = ledgerPath()): LedgerEvent[] {
  if (!existsSync(file)) return []
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)
  const ids = new Set<string>()
  const events: LedgerEvent[] = []
  for (const line of lines) {
    const event: unknown = JSON.parse(line)
    validate(event)
    if (ids.has(event.eventId)) throw new Error(`하네스 원장 eventId가 중복됩니다: ${event.eventId}`)
    ids.add(event.eventId)
    events.push(event)
  }
  return events
}

export function appendEvent(input: Omit<LedgerEvent, 'schemaVersion' | 'eventId' | 'occurredAt'>, file = ledgerPath()): LedgerEvent {
  const event: LedgerEvent = { ...input, schemaVersion: 1, eventId: randomUUID(), occurredAt: new Date().toISOString() }
  validate(event)
  mkdirSync(path.dirname(file), { recursive: true })
  appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8')
  return event
}

export function replayLedger(events = readLedger()): LedgerState {
  const attempts = new Map<string, { number: number; max: number; status: EventStatus; headCommit: string }>()
  let activeAttempt: LedgerEvent | undefined
  for (const event of events) {
    const current = attempts.get(event.attempt.id) ?? {
      number: event.attempt.number,
      max: event.attempt.max,
      status: 'running' as EventStatus,
      headCommit: event.headCommit,
    }
    if (event.kind === 'attempt.started') {
      if (attempts.has(event.attempt.id)) throw new Error(`하네스 원장 시도가 중복 시작되었습니다: ${event.attempt.id}`)
      attempts.set(event.attempt.id, current)
      activeAttempt = event
    } else if (event.kind === 'attempt.finished') {
      current.status = event.payload.status as EventStatus
      attempts.set(event.attempt.id, current)
      if (activeAttempt?.attempt.id === event.attempt.id) activeAttempt = undefined
    } else {
      if (!attempts.has(event.attempt.id)) throw new Error(`시작되지 않은 시도의 이벤트입니다: ${event.attempt.id}`)
      attempts.set(event.attempt.id, current)
      if (event.kind === 'handoff.recorded') activeAttempt = event
    }
  }
  return { events, attempts, activeAttempt }
}

export function nextAttempt(events = readLedger(), issueNumber?: number): number {
  const attempts = replayLedger(events).attempts
  const issueAttempts = issueNumber === undefined
    ? [...attempts.values()]
    : [...attempts.entries()]
        .filter(([id]) => events.some((event) => event.attempt.id === id && event.issue.number === issueNumber))
        .map(([, attempt]) => attempt)
  return issueAttempts.length === 0 ? 1 : Math.max(...issueAttempts.map((attempt) => attempt.number)) + 1
}
