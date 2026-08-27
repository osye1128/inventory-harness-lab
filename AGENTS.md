<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Harness 문서 라우팅

작업을 시작하기 전에 아래 원본 문서의 책임 범위를 확인한다. 이 파일은 정책을 복제하지 않고 원본으로 라우팅만 한다.

- 기준 문서 등록·책임 경계·충돌 처리·보호 정책·갱신 규칙: [`docs/harness/SSOT.md`](docs/harness/SSOT.md) §§2–8
- 검증 실행 흐름·단계별 판정·실패 처리·Issue 검증 연결: [`docs/harness/02-verification.md`](docs/harness/02-verification.md) §§1–9
- 판정 이후 구현·재검증 반복, 상태 전이·시도 상한·세션/에이전트 handoff·사람 결정·완료/중단: [`docs/harness/03-loop.md`](docs/harness/03-loop.md) §§1–9
- 개별 작업의 범위와 종료 조건: 해당 GitHub Issue
- [`docs/HANDOVER.md`](docs/HANDOVER.md)는 정적 프로젝트 참고 문서이며, 실행 상태·시도 원장·handoff의 원본이 아니다.

정책 원본 간 충돌, 링크된 절의 불일치, Issue와 원본의 충돌은 해당 원본 문서의 충돌 절차에 따라 `NEEDS_HUMAN`으로 처리한다.
