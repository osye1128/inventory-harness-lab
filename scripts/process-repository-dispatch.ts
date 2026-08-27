import { readFileSync } from 'node:fs'

export type DispatchAction = 'review.rework' | 'workflow.resume'

export type RepositoryDispatchPayload = {
  schemaVersion: 1
  action: DispatchAction
  issue: { number: number; url: string }
  pullRequest: { number: number; url: string; headSha: string; baseSha: string; headRef: string }
  reviewRound: number
  headSha: string
  decisionId: string
  deliveryId: string
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name}이(가) 필요합니다`)
  return value.trim()
}

export function parseDispatch(value: unknown): RepositoryDispatchPayload {
  if (typeof value !== 'object' || value === null) throw new Error('repository_dispatch payload가 객체가 아닙니다')
  const input = value as Partial<RepositoryDispatchPayload>
  if (input.schemaVersion !== 1 || !['review.rework', 'workflow.resume'].includes(String(input.action)))
    throw new Error('repository_dispatch payload 형식 또는 action이 올바르지 않습니다')
  if (!input.issue || !Number.isInteger(input.issue.number) || input.issue.number < 1)
    throw new Error('repository_dispatch Issue 번호가 올바르지 않습니다')
  if (!input.pullRequest || !Number.isInteger(input.pullRequest.number) || input.pullRequest.number < 1)
    throw new Error('repository_dispatch PR 번호가 올바르지 않습니다')
  const issueUrl = requiredString(input.issue.url, 'Issue URL')
  const pullRequest = input.pullRequest
  const normalizedPr = {
    number: pullRequest.number,
    url: requiredString(pullRequest.url, 'PR URL'),
    headSha: requiredString(pullRequest.headSha, 'PR head SHA'),
    baseSha: requiredString(pullRequest.baseSha, 'PR base SHA'),
    headRef: requiredString(pullRequest.headRef, 'PR branch'),
  }
  if (!Number.isInteger(input.reviewRound) || (input.reviewRound ?? 0) < 1)
    throw new Error('reviewRound가 올바르지 않습니다')
  const reviewRound = input.reviewRound as number
  const headSha = requiredString(input.headSha, 'headSha')
  if (headSha !== normalizedPr.headSha) throw new Error('dispatch headSha가 PR headSha와 다릅니다')
  return {
    schemaVersion: 1,
    action: input.action as DispatchAction,
    issue: { number: input.issue.number, url: issueUrl },
    pullRequest: normalizedPr,
    reviewRound,
    headSha,
    decisionId: requiredString(input.decisionId, 'decisionId'),
    deliveryId: requiredString(input.deliveryId, 'deliveryId'),
  }
}

if (process.argv[1]?.endsWith('process-repository-dispatch.ts')) {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH가 필요합니다')
  const raw = readFileSync(eventPath, 'utf8')
  const event = JSON.parse(raw) as { client_payload?: unknown }
  const payload = parseDispatch(event.client_payload)
  console.log(`repository_dispatch 검증 완료: ${payload.action} issue=${payload.issue.number} delivery=${payload.deliveryId}`)
}
