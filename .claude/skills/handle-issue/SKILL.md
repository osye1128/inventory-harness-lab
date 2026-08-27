---
name: handle-issue
description: This skill should be used when explicitly invoked to process a GitHub Issue end to end: create an Issue branch, implement the requested change, run the repository's local verification, comment the results on the Issue, commit, push, and open a pull request. Use it for `/handle-issue <issue-number-or-url>` and explicit requests such as “이슈 처리해줘 #42”.
argument-hint: <issue-number-or-url>
disable-model-invocation: true
---

# Handle an Issue from branch to PR

Execute this workflow only after the user explicitly invokes this skill. Treat the GitHub Issue as the source of scope and acceptance criteria, and treat the repository Harness documents as the source of execution policy.

## Required inputs

- Resolve exactly one Issue number or URL from `$ARGUMENTS`.
- If `$ARGUMENTS` is empty or ambiguous, ask for the Issue number. Never invent an Issue number.
- Use `gh issue view <number> --json number,title,body,state,url,labels` to inspect the Issue.
- Stop with `NEEDS_HUMAN` if the Issue is missing, closed, inaccessible, ambiguous, or conflicts with `docs/harness/SSOT.md`.

## Phase 1: preflight and branch

Read these before changing files:

- `AGENTS.md`
- `docs/harness/SSOT.md`
- `docs/harness/02-verification.md`
- `docs/harness/03-loop.md`

Then run the clean-tree check first:

```bash
git status --short
```

- If `git status --short` is non-empty, report every existing change and stop before running `git fetch`, creating a branch, or making any external write. Do not stash, reset, or checkout those changes away.

Only after the tree is clean, run:

```bash
git branch --show-current
npm run harness:check
git fetch origin main
```

- If `git fetch origin main` fails or `origin/main` cannot be verified, do not proceed without a known base commit.
- If an existing ledger is present, `npm run harness:check` must pass and there must be no unresolved `NEEDS_HUMAN`, incomplete attempt, or handoff branch/head mismatch. If no ledger/handoff exists, treat this as a new run.
- If the current branch is not `main`, inspect its name, recent commits, and related PR before deciding whether it is connected to the Issue. Do not overwrite an unrelated branch.
- Keep `origin/main` as the branch base without losing user changes.

## Phase 2: understand the Issue

Read and validate the Issue before creating a branch.

```bash
gh issue view <number> --json number,title,body,state,url,labels
```

Extract and record:

- Issue number, URL, and open state
- requested scope and explicitly forbidden scope
- every measurable completion criterion
- specified machine-verification commands
- `max-implementation-loops`; use the repository default only when the Issue omits it, and report that default
- required Issue-specific test path and the evidence expected for each criterion

Do not implement when criteria are vague, contradictory, or not objectively verifiable. If a requirement needs a product or policy decision, stop at `NEEDS_HUMAN` and state the exact question.

## Phase 3: implementation loop

Use one implementation attempt per `max-implementation-loops` limit. Record the attempt using the repository harness when applicable:

```bash
ISSUE_MAX_ATTEMPTS=<issue-limit> npm run harness:run -- start <number>
```

Implement only the Issue scope. Before every attempt, inspect the diff and preserve the Issue's forbidden boundaries. Add or update an Issue-specific test only when the real Issue number and acceptance criteria are known; use `tests/issues/issue-<number>-<feature>.test.ts`.

After implementation, run the Issue's specified checks and the repository's complete verification:

```bash
npm run verify
```

The fixed order is:

```text
Protected → Prepare → Types → Lint → Architecture Check → Test → Build
```

A failed stage stops later stages. A technical failure may use another attempt only when the Issue limit allows it. Record concise checkpoints and never put secrets or unbounded terminal output in the ledger.

### Protected-path gate

After implementation and before any external write, inspect both committed and uncommitted paths:

```bash
git diff --name-only origin/main...HEAD
git diff --name-only HEAD
git diff --cached --name-only
git ls-files --others --exclude-standard
npm run protected
```

Compare the union of these paths with the protected-path list from `docs/harness/SSOT.md` and `scripts/protected-paths.ts`. If a protected path changed, do not generate or edit `.harness/protected-approvals.json`, do not choose an approver, and do not claim the change is approved. Report the exact paths and stop with `NEEDS_HUMAN` unless `npm run protected` succeeds against the intended `origin/main` base and a human has already recorded matching approvals.

A human may run the documented `verify:approve` command locally. That command changes the approval metadata file, so on explicit resume treat that file as the only expected pre-existing change: do not discard it, do not treat it as an AI change, and rerun `PROTECTED_BASE=origin/main npm run protected` before continuing. Any other dirty path still causes an immediate stop.

Protected failures include `PROTECTED_APPROVAL_MISSING` and `PROTECTED_APPROVAL_HASH_MISMATCH`. They are not ordinary implementation failures and must not be fixed by guessing or bypassing approval.

If verification fails, do not comment success, commit, push, or open a PR. Report the failed stage, command, exit code, attempt number, and next permitted action. If the process is interrupted, record an interrupted checkpoint/handoff and do not infer pass or fail.

## Phase 4: Issue comment

Only after all Issue criteria and required local verification pass, write a factual Korean comment:

```bash
gh issue comment <number> --body-file <summary-file>
```

Include:

- implementation summary and changed files
- each completion criterion with its evidence
- every verification command and its actual result
- the fixed stage order and final outcome
- remaining human gates: protected approval, review, and merge

A comment is an execution record, not human approval. If the comment fails, stop and report it; do not silently continue as though it succeeded.

## Phase 5: commit, push, and PR

Recheck the scope before writing Git history:

```bash
git diff --check
git diff --stat
git status --short
```

Stage only files belonging to this Issue. Create a Conventional Commit with the required co-author trailer, then push the new branch:

```bash
git add <issue-files-only>
git commit -m "<type>: <issue-focused summary>" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push --set-upstream origin feature/issue-<number>-<slug>
```

Open a PR only after the push succeeds:

```bash
gh pr create --base main --head feature/issue-<number>-<slug> --title "<type>: <issue-focused summary>" --body-file <pr-body-file>
```

The PR body must contain `Closes #<number>`, the implementation summary, criterion evidence, actual verification results, and a clear note that human review/approval and merge remain separate gates. Never merge the PR yourself.

## Stop conditions

Stop without external writes when any of these occurs:

- no unambiguous Issue
- dirty working tree or unrelated existing branch changes
- Issue/SSOT conflict or unclear acceptance criteria
- protected-path approval missing or hash mismatch
- verification failure, attempt limit reached, or interrupted process
- Issue comment, commit, push, or PR creation failure
- existing branch or PR would need to be overwritten

When stopping, report what has already happened and what remains. Never conceal a partial external action.

## Final report

Report the Issue URL, branch, implementation summary, verification commands and actual results, Issue comment URL, commit SHA, push result, PR URL/state, and remaining human gates. `COMPLETED` means the human review and PR merge have happened; creating a PR is not completion.
