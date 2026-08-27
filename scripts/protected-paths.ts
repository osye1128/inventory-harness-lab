export const PROTECTED_PATHS = [
  // 정책과 실행 경계를 함께 보호한다.
  'docs/01-requirements.md',
  'docs/06-architecture.md',
  'docs/harness/SSOT.md',
  'docs/harness/02-verification.md',
  'docs/harness/03-loop.md',
  '.github/workflows/verify.yml',
  '.github/workflows/harness.yml',
  '.github/CODEOWNERS',
  '.github/ISSUE_TEMPLATE/maintenance.yml',
  'package.json',
  'scripts/check-architecture.ts',
  'scripts/check-protected.ts',
  'scripts/prepare-verify.ts',
  'scripts/verify.ts',
  'scripts/approve-protected.ts',
  'scripts/harness-ledger.ts',
  'scripts/issue-run.ts',
  'scripts/check-ledger.ts',
  'scripts/protected-paths.ts',
  'scripts/github-events.ts',
  'scripts/process-repository-dispatch.ts',
] as const

export const PROTECTED_PATH_SET = new Set<string>(PROTECTED_PATHS)
