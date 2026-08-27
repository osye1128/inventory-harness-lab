# Harness execution records

`ledger.jsonl` is the append-only execution history for Issue attempts, verification checkpoints, handoffs, and human decisions. It is committed with the related Issue work when a durable cross-session record is required.

Use `npm run harness:run -- start <issue-number>` to start an attempt, then use `checkpoint`, `finish`, `handoff`, or `decision` to append events. Use `npm run harness:check` to validate and replay the ledger.

Do not store secrets or unbounded command output in the ledger. A missing ledger is valid when no tracked Issue run exists; malformed existing records fail closed.
