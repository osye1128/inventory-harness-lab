# Harness execution records

`ledger.jsonl` is the append-only execution history for Issue attempts, verification checkpoints, handoffs, human decisions, and PR lifecycle events. It is committed with the related Issue work when a durable cross-session record is required.

- Existing attempts and `totalAttempt` are never deleted or reset.
- Each human `REWORK_REQUESTED` increments `reviewRound`; only `attemptInRound` resets to zero for the new round.
- After `READY_FOR_REVIEW`, the ledger records PR review, merge, close, rework, and `repository_dispatch` correlation. `COMPLETED` requires latest-HEAD PASS, human review approval, and an actual merge.
- PR and Issue comments are observations/evidence, not automatic loop triggers. Only an accepted `repository_dispatch` starts the next loop.
- Use `npm run harness:run -- start <issue-number>` to start an attempt, then use `checkpoint`, `finish`, `handoff`, or `decision` to append events. PR lifecycle events use their explicit event commands.
- Use `npm run harness:check` to validate and replay the ledger.
- Do not store secrets or unbounded command output in the ledger. A missing ledger is valid when no tracked Issue run exists; malformed existing records fail closed.
- Duplicate event or delivery IDs, stale HEAD/round/counters, and inconsistent PR/Issue references fail closed and require `NEEDS_HUMAN`.
- PR comments are the source for rejection reasons, Issue comments record re-entry links, and the ledger is the machine-state source.
