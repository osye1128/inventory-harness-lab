import { describe, expect, it } from 'vitest'
import { parseDispatch } from '../scripts/process-repository-dispatch'

describe('repository dispatch validation', () => {
  const valid = {
    schemaVersion: 1,
    action: 'review.rework',
    issue: { number: 42, url: 'https://github.com/example/repo/issues/42' },
    pullRequest: {
      number: 7,
      url: 'https://github.com/example/repo/pull/7',
      headSha: 'head-2',
      baseSha: 'base-1',
      headRef: 'feature/42',
    },
    reviewRound: 2,
    headSha: 'head-2',
    decisionId: 'decision-1',
    deliveryId: 'delivery-1',
  } as const

  it('accepts a re-entry payload with matching head SHA', () => {
    expect(parseDispatch(valid).deliveryId).toBe('delivery-1')
  })

  it('rejects counter or identity-free payloads', () => {
    expect(() => parseDispatch({ ...valid, headSha: 'stale' })).toThrow('headSha')
    expect(() => parseDispatch({ ...valid, reviewRound: 0 })).toThrow('reviewRound')
    expect(() => parseDispatch({ ...valid, decisionId: '' })).toThrow('decisionId')
  })
})
