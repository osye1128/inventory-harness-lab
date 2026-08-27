export type WorkflowState =
  | 'READY'
  | 'IN_PROGRESS'
  | 'VERIFYING'
  | 'READY_FOR_REVIEW'
  | 'NEEDS_HUMAN'
  | 'INTERRUPTED'
  | 'COMPLETED'
  | 'ABORTED'
  | 'REJECTED'

export type VerificationOutcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN' | 'INTERRUPTED'
export type ReviewDecision = 'APPROVED' | 'REWORK_REQUESTED' | 'REJECTED_FINAL'
export type ReviewState = 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'MERGED' | 'CLOSED'

export type PullRequestRef = {
  number: number
  url: string
  headSha: string
  baseSha: string
  headRef: string
}

export type WorkflowProjection = {
  issueNumber: number
  issueUrl: string
  pullRequest?: PullRequestRef
  state: WorkflowState
  reviewState: ReviewState
  reviewRound: number
  attemptInRound: number
  totalAttempt: number
  maxAttemptsInRound: number
  currentHeadSha?: string
  latestVerification?: { outcome: VerificationOutcome; headSha: string; reasonCode?: string }
  approvedHeadSha?: string
  approvedBy?: string
  closed: boolean
  merged: boolean
  blocker?: { reasonCode: string; details: string }
  processedIds: Set<string>
}

type BaseEvent = {
  id: string
  issueNumber: number
  issueUrl: string
  deliveryId?: string
  actor: string
  actorType: 'human' | 'bot' | 'system'
}

export type WorkflowEvent = BaseEvent & ({
  kind: 'attempt.started'
  reviewRound: number
  attemptInRound: number
  totalAttempt: number
  maxAttemptsInRound: number
  pullRequest?: PullRequestRef
} | {
  kind: 'verification.recorded'
  outcome: VerificationOutcome
  headSha: string
  reasonCode?: string
} | {
  kind: 'review.submitted'
  decision: ReviewDecision | 'COMMENTED' | 'DISMISSED'
  reviewId: string
  headSha: string
} | {
  kind: 'pr.closed'
  merged: boolean
  mergeSha?: string
  headSha: string
} | {
  kind: 'review.round.started'
  reviewRound: number
  issueUpdated: boolean
  pr: PullRequestRef
} | {
  kind: 'repository_dispatch.received'
  action: 'review.rework' | 'workflow.resume'
  reviewRound: number
  headSha: string
  decisionId: string
} | {
  kind: 'decision.recorded'
  decisionId: string
  decision: ReviewDecision | 'APPROVE' | 'ABORT'
  reasonCode: string
  scope: string[]
  evidence: string[]
  allowedNextState: WorkflowState
  supersedes?: string
})

function assertHuman(event: BaseEvent): void {
  if (event.actorType !== 'human' || !event.actor.trim() || /^(ai|ci|bot|system|unknown)$/i.test(event.actor.trim()))
    throw new Error('사람 actor만 review 또는 decision을 기록할 수 있습니다')
}

function freshProjection(event: BaseEvent): WorkflowProjection {
  return {
    issueNumber: event.issueNumber,
    issueUrl: event.issueUrl,
    state: 'READY',
    reviewState: 'PENDING',
    reviewRound: 1,
    attemptInRound: 0,
    totalAttempt: 0,
    maxAttemptsInRound: 3,
    closed: false,
    merged: false,
    processedIds: new Set(),
  }
}

function block(projection: WorkflowProjection, reasonCode: string, details: string): WorkflowProjection {
  return { ...projection, state: 'NEEDS_HUMAN', blocker: { reasonCode, details } }
}

export function reduceWorkflow(previous: WorkflowProjection | undefined, event: WorkflowEvent): WorkflowProjection {
  const projection = previous ?? freshProjection(event)
  if (projection.issueNumber !== event.issueNumber || projection.issueUrl !== event.issueUrl)
    throw new Error('Issue 식별자가 기존 workflow와 일치하지 않습니다')
  const externalId = event.deliveryId ?? event.id
  if (projection.processedIds.has(externalId)) return projection
  const next = { ...projection, processedIds: new Set(projection.processedIds).add(externalId) }

  if (event.kind === 'attempt.started') {
    if (next.state !== 'READY' && next.state !== 'IN_PROGRESS') throw new Error(`현재 상태에서 attempt를 시작할 수 없습니다: ${next.state}`)
    if (event.reviewRound !== next.reviewRound || event.attemptInRound !== next.attemptInRound + 1 || event.totalAttempt !== next.totalAttempt + 1)
      throw new Error('attempt counter가 현재 workflow projection과 일치하지 않습니다')
    next.reviewRound = event.reviewRound
    next.attemptInRound = event.attemptInRound
    next.totalAttempt = event.totalAttempt
    next.maxAttemptsInRound = event.maxAttemptsInRound
    next.pullRequest = event.pullRequest ?? next.pullRequest
    next.currentHeadSha = event.pullRequest?.headSha ?? next.currentHeadSha
    next.state = 'IN_PROGRESS'
    return next
  }

  if (event.kind === 'verification.recorded') {
    next.latestVerification = { outcome: event.outcome, headSha: event.headSha, reasonCode: event.reasonCode }
    if (event.outcome === 'PASS') {
      if (next.currentHeadSha && next.currentHeadSha !== event.headSha) return block(next, 'STALE_VERIFICATION_HEAD', '검증 결과가 최신 PR HEAD에 적용되지 않았습니다')
      next.state = 'READY_FOR_REVIEW'
    } else if (event.outcome === 'INTERRUPTED') next.state = 'INTERRUPTED'
    else if (event.outcome === 'BLOCKED') return block(next, event.reasonCode ?? 'VERIFICATION_BLOCKED', '검증이 차단되었습니다')
    else if (event.outcome === 'FAIL') next.state = next.attemptInRound < next.maxAttemptsInRound ? 'IN_PROGRESS' : 'NEEDS_HUMAN'
    return next
  }

  if (event.kind === 'review.submitted') {
    if (event.decision === 'COMMENTED' || event.decision === 'DISMISSED') return next
    assertHuman(event)
    if (next.state !== 'READY_FOR_REVIEW' && !(next.state === 'NEEDS_HUMAN' && next.blocker?.reasonCode === 'MERGE_GATE_UNSATISFIED'))
      throw new Error('READY_FOR_REVIEW가 아닌 상태에서 review를 처리할 수 없습니다')
    if (next.currentHeadSha !== event.headSha) return block(next, 'STALE_REVIEW_HEAD', 'review가 최신 PR HEAD에 적용되지 않았습니다')
    if (event.decision === 'APPROVED') {
      next.reviewState = 'APPROVED'
      next.approvedHeadSha = event.headSha
      next.approvedBy = event.actor
      if (next.merged && next.latestVerification?.outcome === 'PASS' && next.latestVerification.headSha === event.headSha)
        next.state = 'COMPLETED'
    } else {
      next.reviewState = 'CHANGES_REQUESTED'
      next.state = 'NEEDS_HUMAN'
      next.blocker = { reasonCode: 'REWORK_DECISION_REQUIRED', details: 'REWORK_REQUESTED 여부와 재진입을 사람 결정으로 확정해야 합니다' }
    }
    return next
  }

  if (event.kind === 'review.round.started') {
    if (!next.blocker || !['REWORK_DECISION_REQUIRED', 'PR_CLOSED_UNMERGED'].includes(next.blocker.reasonCode)) throw new Error('유효한 REWORK_REQUESTED blocker 없이 review round를 시작할 수 없습니다')
    if (!event.issueUpdated) return block(next, 'REQUIREMENT_CHANGE_ISSUE_NOT_UPDATED', '종료 조건 변경 후 Issue가 갱신되지 않았습니다')
    if (event.reviewRound !== next.reviewRound + 1) throw new Error('reviewRound는 정확히 1씩 증가해야 합니다')
    next.reviewRound = event.reviewRound
    next.attemptInRound = 0
    next.currentHeadSha = event.pr.headSha
    next.pullRequest = event.pr
    next.reviewState = 'PENDING'
    next.approvedHeadSha = undefined
    next.approvedBy = undefined
    next.blocker = undefined
    next.state = 'IN_PROGRESS'
    return next
  }

  if (event.kind === 'repository_dispatch.received') {
    if (event.action !== 'review.rework' || !next.blocker || next.blocker.reasonCode !== 'REWORK_DECISION_REQUIRED')
      return block(next, 'INVALID_DISPATCH', '허용되지 않은 repository_dispatch 또는 활성 rework 결정이 없습니다')
    if (event.reviewRound !== next.reviewRound || event.headSha !== next.currentHeadSha)
      return block(next, 'STALE_DISPATCH', 'repository_dispatch가 현재 round 또는 HEAD와 일치하지 않습니다')
    return next
  }

  if (event.kind === 'decision.recorded') {
    assertHuman(event)
    if (!next.blocker) throw new Error('해결할 blocker가 없는 decision입니다')
    if (event.reasonCode !== next.blocker.reasonCode) throw new Error('decision reasonCode가 활성 blocker와 다릅니다')
    if (event.decision === 'REJECTED_FINAL') {
      next.state = 'REJECTED'
      next.blocker = undefined
    } else if (event.decision === 'ABORT') {
      next.state = 'ABORTED'
      next.blocker = undefined
    } else if (event.decision === 'REWORK_REQUESTED') {
      next.state = 'NEEDS_HUMAN'
      next.blocker = { reasonCode: 'REWORK_DECISION_REQUIRED', details: 'repository_dispatch로 재진입을 명시적으로 시작해야 합니다' }
    } else {
      next.state = event.allowedNextState
      next.blocker = undefined
    }
    return next
  }

  if (event.kind === 'pr.closed') {
    next.closed = true
    next.merged = event.merged
    if (event.merged) {
      if (next.state !== 'READY_FOR_REVIEW' || next.latestVerification?.outcome !== 'PASS' || next.latestVerification.headSha !== event.headSha || next.approvedHeadSha !== event.headSha)
        return block(next, 'MERGE_GATE_UNSATISFIED', '최신 HEAD PASS와 사람 review 승인 없이는 COMPLETED가 될 수 없습니다')
      next.reviewState = 'MERGED'
      next.state = 'COMPLETED'
    } else {
      next.reviewState = 'CLOSED'
      next.state = 'NEEDS_HUMAN'
      next.blocker = { reasonCode: 'PR_CLOSED_UNMERGED', details: 'merged=false PR close의 후속 결정을 기록해야 합니다' }
    }
    return next
  }

  return next
}

export function replayWorkflow(events: WorkflowEvent[]): WorkflowProjection | undefined {
  return events.reduce<WorkflowProjection | undefined>((state, event) => reduceWorkflow(state, event), undefined)
}
