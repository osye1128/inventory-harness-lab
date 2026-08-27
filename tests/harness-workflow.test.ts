import { describe, expect, it } from 'vitest'
import { reduceWorkflow, type WorkflowEvent } from '../scripts/github-events'

const base = {
  id: 'event-1',
  issueNumber: 42,
  issueUrl: 'https://github.com/example/repo/issues/42',
  actor: 'automation',
  actorType: 'system' as const,
}

const pr = { number: 7, url: 'https://github.com/example/repo/pull/7', headSha: 'head-1', baseSha: 'base-1', headRef: 'feature/42' }

function event<T extends WorkflowEvent>(value: T): T { return value }

describe('GitHub workflow lifecycle', () => {
  it('requires current pass and human approval before completing a merge', () => {
    let state = reduceWorkflow(undefined, event({ ...base, kind: 'attempt.started', reviewRound: 1, attemptInRound: 1, totalAttempt: 1, maxAttemptsInRound: 3, pullRequest: pr }))
    state = reduceWorkflow(state, event({ ...base, id: 'verify', kind: 'verification.recorded', outcome: 'PASS', headSha: 'head-1' }))
    state = reduceWorkflow(state, event({ ...base, id: 'merge', kind: 'pr.closed', merged: true, headSha: 'head-1', mergeSha: 'merge-1' }))
    expect(state.state).toBe('NEEDS_HUMAN')
    state = reduceWorkflow(state, event({ ...base, id: 'review', kind: 'review.submitted', decision: 'APPROVED', reviewId: 'review-1', headSha: 'head-1', actor: 'reviewer', actorType: 'human' }))
    expect(state.state).toBe('COMPLETED')
  })

  it('preserves total attempts while starting a rework round', () => {
    let state = reduceWorkflow(undefined, event({ ...base, kind: 'attempt.started', reviewRound: 1, attemptInRound: 1, totalAttempt: 1, maxAttemptsInRound: 3, pullRequest: pr }))
    state = reduceWorkflow(state, event({ ...base, id: 'verify', kind: 'verification.recorded', outcome: 'PASS', headSha: 'head-1' }))
    state = reduceWorkflow(state, event({ ...base, id: 'review', kind: 'review.submitted', decision: 'REWORK_REQUESTED', reviewId: 'review-1', headSha: 'head-1', actor: 'reviewer', actorType: 'human' }))
    state = reduceWorkflow(state, event({ ...base, id: 'decision', kind: 'decision.recorded', decisionId: 'decision-1', decision: 'REWORK_REQUESTED', reasonCode: 'REWORK_DECISION_REQUIRED', scope: ['src'], evidence: ['https://example.test/review'], allowedNextState: 'NEEDS_HUMAN', actor: 'reviewer', actorType: 'human' }))
    state = reduceWorkflow(state, event({ ...base, id: 'round', kind: 'review.round.started', reviewRound: 2, issueUpdated: true, pr: { ...pr, headSha: 'head-2' } }))
    expect(state.reviewRound).toBe(2)
    expect(state.attemptInRound).toBe(0)
    expect(state.totalAttempt).toBe(1)
  })

  it('blocks an unmerged close without a human decision', () => {
    let state = reduceWorkflow(undefined, event({ ...base, kind: 'attempt.started', reviewRound: 1, attemptInRound: 1, totalAttempt: 1, maxAttemptsInRound: 3, pullRequest: pr }))
    state = reduceWorkflow(state, event({ ...base, id: 'verify', kind: 'verification.recorded', outcome: 'PASS', headSha: 'head-1' }))
    state = reduceWorkflow(state, event({ ...base, id: 'close', kind: 'pr.closed', merged: false, headSha: 'head-1' }))
    expect(state.state).toBe('NEEDS_HUMAN')
    expect(state.blocker?.reasonCode).toBe('PR_CLOSED_UNMERGED')
  })
})
