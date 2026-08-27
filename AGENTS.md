<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Harness 문서 라우팅

작업을 시작하기 전에 아래 원본 문서의 책임 범위를 확인한다. 이 파일은 정책을 복제하지 않고 원본으로 라우팅만 한다.

- 기준·책임 경계·충돌 처리·보호 경로 승인: [`docs/harness/SSOT.md`](docs/harness/SSOT.md) §§2–5
- 검증 실행 흐름·단계별 판정·실패 처리: [`docs/harness/02-verification.md`](docs/harness/02-verification.md) §§1–7
  - 판정 이후 반복 절차는 같은 문서 §8의 연결을 따라 [`docs/harness/03-loop.md`](docs/harness/03-loop.md)로 이동한다.
- 판정 이후 구현·재검증 반복, 상태 전이·시도 상한·세션/에이전트 handoff·사람 결정·완료/중단: [`docs/harness/03-loop.md`](docs/harness/03-loop.md) §§1–9
- 개별 작업의 범위와 종료 조건: 해당 GitHub Issue. Issue가 없거나 원본 간 충돌이 있으면 임의로 해석하지 않고 `NEEDS_HUMAN`으로 처리한다.
- [`docs/HANDOVER.md`](docs/HANDOVER.md)는 정적 프로젝트 참고 문서이며, 실행 상태·시도 원장·handoff의 원본이 아니다.

문서 책임이 겹치거나 링크된 절이 현재 파일과 맞지 않으면 구현 전에 원본 문서를 다시 확인한다.
