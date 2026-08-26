# 02. 검증

> 작성일: 2026-08-26 · 상태: 현재 하네스 골격 기준 · 원본: [`SSOT.md`](./SSOT.md)

## 1. 목적

이 문서는 현재 저장소에 구현된 검증 하네스의 실행 흐름과 각 단계의 책임을 안내한다. 검증 규칙의 도메인 원본은 [`SSOT.md`](./SSOT.md)가 지정한 원본 문서를 따르며, 이 문서는 실행 방법을 설명하는 참조 문서다.

이 문서는 재고 도메인이나 아키텍처를 새로 정의하지 않는다. 도메인 규칙은 [`../01-requirements.md`](../01-requirements.md), 아키텍처 결정은 [`../06-architecture.md`](../06-architecture.md)를 따른다.

## 2. 전체 실행 흐름

`npm run verify`는 다음 순서로 실행된다.

```text
Protected
  → Prepare
  → Types
  → Lint
  → Architecture Check
  → Test
  → Build
```

검증은 앞 단계가 성공해야 다음 단계로 진행한다. 어느 단계에서 실패하면 이후 단계는 실행하지 않는다.

| 순서 | 단계 | 실행 위치 | 책임 |
|---:|---|---|---|
| 1 | Protected | `scripts/check-protected.ts` | 보호 경로 변경과 사람 승인 기록 대조 |
| 2 | Prepare | `scripts/prepare-verify.ts` | 검증 전용 임시 SQLite DB 생성·마이그레이션·시드 |
| 3 | Types | `tsc --noEmit` | TypeScript 타입 검사 |
| 4 | Lint | `eslint` | Next.js 규칙 및 코드 스타일 검사 |
| 5 | Architecture Check | `scripts/check-architecture.ts` | `applyMovement()` 외부의 직접 재고 변경 검사 |
| 6 | Test | `vitest run` | 자동 테스트 실행 |
| 7 | Build | `prisma generate && next build` | Prisma Client 생성 및 Next.js production build |

실행 진입점은 [`scripts/verify.ts`](../../scripts/verify.ts)이며, 단계 순서를 임의로 바꾸지 않는다.

## 3. 실행 전제

의존성을 설치하고 환경 파일을 준비한다.

```bash
npm ci
cp .env.example .env
```

`npm run verify`는 검증 전용 DB를 자체 생성하므로 기존 `prisma/dev.db`를 사용하거나 삭제하지 않는다. `DATABASE_URL`은 각 하위 단계에 검증 전용 임시 DB URL로 전달된다.

CI에서는 [`../.github/workflows/verify.yml`](../../.github/workflows/verify.yml)이 `npm ci` 후 `npm run verify`를 실행한다. workflow는 실제 운영 비밀을 사용하지 않고 CI 전용 `SESSION_SECRET`만 제공한다.

## 4. 단계별 동작

### 4.1 Protected

구현: [`scripts/check-protected.ts`](../../scripts/check-protected.ts)

보호 경로에 변경이 있으면 현재 파일의 LF 정규화 UTF-8 내용 SHA-256을 승인 파일과 비교한다.

- 승인 기록: [`.harness/protected-approvals.json`](../../.harness/protected-approvals.json)
- 승인 필드: `path`, `sha256`, `approvedBy`, `reason`
- 승인 기록이 없거나 해시가 다르면 `PROTECTED_CHANGE_NEEDS_HUMAN`으로 실패
- 승인 파일 자체는 자기참조 해시 문제를 피하기 위해 보호 경로 목록에서 제외
- 승인 파일 변경은 [`.github/CODEOWNERS`](../../.github/CODEOWNERS)와 GitHub branch protection 또는 ruleset으로 사람 review를 요구

비교 기준은 다음 우선순위를 따른다.

1. `PROTECTED_BASE`
2. `GITHUB_BASE_SHA`
3. `GITHUB_BASE_REF`
4. 로컬 기본값 `HEAD`

보호 경로 충돌이나 승인 의미가 불명확한 경우에는 [`SSOT.md`](./SSOT.md)의 `NEEDS_HUMAN` 정책을 따른다. 기본적으로 AI나 CI가 승인 기록을 생성하지 않는다. 단, `GITHUB_ACTIONS=true`와 `GITHUB_EVENT_NAME=pull_request`가 정확히 일치하는 PR CI에서는 `PR_CI_PROTECTED_CHECK_EXCEPTION`으로 보호 경로 변경을 검증 예외 처리할 수 있다. 이 예외는 사람 승인이나 승인 기록을 대체하지 않는다.

### 4.2 Prepare

구현: [`scripts/prepare-verify.ts`](../../scripts/prepare-verify.ts)

매번 OS 임시 디렉터리에 검증 전용 SQLite DB를 만들고 다음 준비 작업을 실행한다.

1. `prisma migrate deploy`
2. `prisma generate`
3. `prisma/seed.ts`

검증이 끝나면 `try/finally`로 DB와 SQLite 부속 파일을 정리한다. 시드가 기존 데이터를 삭제하는 동작을 포함하더라도 사용자 개발 DB와 분리된 임시 DB에서만 실행된다.

### 4.3 Types

실행: `npm run types`

```bash
tsc --noEmit
```

`tsconfig.json`의 strict 타입 검사 설정을 사용하며 출력 파일은 만들지 않는다. 별도의 `typecheck` 명령은 없고, 현재 타입 검사 명령은 `types`다.

### 4.4 Lint

실행: `npm run lint`

```bash
eslint
```

`eslint.config.mjs`의 Next.js Core Web Vitals 및 TypeScript 설정을 사용한다. 자동 수정(`--fix`)은 검증 흐름에 포함되지 않는다.

### 4.5 Architecture Check

구현: [`scripts/check-architecture.ts`](../../scripts/check-architecture.ts)

`src/` 아래 TypeScript/TSX 파일을 검사해 다음 직접 mutation을 찾는다.

- `lot.update()`, `lot.upsert()`, `lot.create()` 등 Lot 변경
- `movement.create()` 등 Movement 변경
- `quantity: { increment }` 또는 `quantity: { decrement }`

허용된 재고 변경 구현 지점은 [`src/lib/stock.ts`](../../src/lib/stock.ts)의 `applyMovement()`다. Prisma generated client와 조회 조건은 검사에서 제외한다.

### 4.6 Test

실행: `npm test`

```bash
vitest run
```

현재 포함되는 테스트 파일:

- `tests/fefo.test.ts`
- `tests/stock-invariant.test.ts`
- `tests/popup-settle.test.ts`

Vitest는 Node 환경에서 실행되며 `tests/**/*.test.ts`를 대상으로 한다. `npm run verify`에서는 Prepare가 전달한 검증 전용 `DATABASE_URL`을 테스트 프로세스가 사용한다.

### 4.7 Build

실행: `npm run build`

```bash
prisma generate && next build
```

Prisma Client를 생성한 뒤 Next.js production build를 수행한다. Build는 검증의 마지막 단계이며, 앞 단계가 모두 성공해야 실행된다.

## 5. 로컬 실행

일반적인 전체 검증:

```bash
npm run verify
```

개별 단계 확인:

```bash
npm run protected
npm run prepare:verify
npm run types
npm run lint
npm run architecture:check
npm test
npm run build
```

`npm run prepare:verify`는 독립 실행 시 검증 DB를 만들고 종료 시 정리한다. 전체 검증에서 각 단계에 같은 검증 DB 환경을 전달하는 역할은 `scripts/verify.ts`가 담당한다.

## 6. GitHub Actions 실행

workflow: [`../../.github/workflows/verify.yml`](../../.github/workflows/verify.yml)

다음 이벤트에서 실행된다.

- Pull Request: `opened`, `synchronize`, `reopened`
- `main` 브랜치 push

CI의 기본 흐름은 다음과 같다.

```text
checkout(fetch-depth: 0)
  → setup Node 20.x
  → npm ci
  → npm run verify
```

PR에서는 PR base SHA를 Protected 비교 기준으로 사용하고, `main` push에서는 직전 커밋을 기준으로 사용한다. `GITHUB_ACTIONS=true` 및 `GITHUB_EVENT_NAME=pull_request`가 정확히 일치하는 PR CI에서는 `PR_CI_PROTECTED_CHECK_EXCEPTION`이 적용될 수 있지만, 이는 사람 승인이나 승인 파일 갱신을 대체하지 않는다. workflow는 `contents: read` 권한만 가지며 승인 파일이나 저장소 내용을 수정하지 않는다.

## 7. 실패 처리

| 상태 | 의미 | 조치 |
|---|---|---|
| `PROTECTED_CHANGE_NEEDS_HUMAN` | 보호 경로 변경에 승인 기록이 없거나 해시가 불일치 | 사람이 승인 내용을 검토하고 승인 파일을 갱신한 뒤 재실행 |
| `NEEDS_HUMAN` | SSOT·Issue·SSOT 간 충돌 또는 판단 불가 | AI가 임의로 진행하지 않고 사람의 판단을 요청 |
| Types/Lint/Architecture Check/Test/Build 실패 | 해당 기술 검증 단계 실패 | 오류를 수정한 뒤 전체 검증 재실행 |

실패 원인을 숨기거나 승인 단계를 우회하지 않는다.

## 8. Issue 처리

개별 작업의 원본은 해당 GitHub Issue다. 이 문서는 Issue의 내용을 대신 정의하지 않고, Issue에 적힌 종료 조건을 검증 하네스와 연결하는 방법을 안내한다.

### 처리 기준

1. 작업을 시작하기 전에 해당 Issue의 배경, 변경할 내용, 종료 조건, 기계 검증, 변경 금지 범위, 구현 루프 최대 횟수를 확인한다.
2. Issue의 종료 조건마다 실행 조건·판정 기준·기대 결과가 있는지 확인한다. 기준이 추상적이거나 서로 충돌하면 구현을 시작하지 않고 `NEEDS_HUMAN`으로 판단을 요청한다.
3. Issue 번호와 기능명을 사용해 종료 조건을 검증하는 테스트를 다음 경로에 둔다.

   ```text
   tests/issues/issue-{Issue 번호}-{기능명}.test.ts
   ```

4. Issue 테스트는 각 종료 조건을 하나 이상의 명시적인 assertion으로 검증한다. 테스트 이름이나 주석만으로 종료 조건을 덮었다고 간주하지 않는다.
5. Issue에 적힌 기계 검증 명령을 실행하고 종료 코드·테스트 결과·핵심 수치를 Issue에 기록한다.
6. 모든 종료 조건과 기계 검증이 통과했을 때만 Issue를 완료 후보로 본다. 검증 결과가 없거나 일부 조건만 통과한 상태는 완료로 표시하지 않는다.

### Issue 테스트 예시

Issue `#42`의 재고 이동 종료 조건을 검증하는 파일 예시는 다음과 같다.

```text
tests/issues/issue-42-stock-transfer.test.ts
```

```ts
describe('Issue #42: 재고 이동', () => {
  it('종료 조건: 이동 후 출발지·도착지 수량과 총량이 기대값과 일치한다', async () => {
    // 실행 조건을 설정한다.
    // expect(...)로 기준과 기대 결과를 판정한다.
  })
})
```

위 예시는 파일명과 테스트 구조를 보여주기 위한 형식이며, 실제 Issue의 도메인 규칙과 수치를 임의로 대신하지 않는다.

### 결과 및 중단 처리

- Issue 테스트가 실패하면 실패한 종료 조건, 실제 결과, 실행 명령을 Issue에 기록하고 수정 후 다시 검증한다.
- Issue에 정한 구현 루프 최대 횟수에 도달할 때까지 검증이 통과하지 않으면 AI는 반복·추가 수정·횟수 초과 재시도를 하지 않는다.
- 상한에 도달하면 `NEEDS_HUMAN` 상태를 선언하고, 실제 시도 횟수·마지막 실패 결과·남은 쟁점·사람에게 필요한 판단을 Issue에 전달한다.
- SSOT와 Issue가 충돌하거나 종료 조건의 해석이 둘 이상 가능하면 AI는 자신의 판단으로 진행하지 않고 `NEEDS_HUMAN` 상태로 멈춘다.
- PR CI의 `PR_CI_PROTECTED_CHECK_EXCEPTION`은 보호 경로 검증 예외일 뿐이며 Issue의 종료 조건 통과나 사람의 작업 승인을 의미하지 않는다.

### 완료 기록

Issue를 완료로 전환하기 전에 다음 결과를 Issue에 남긴다.

- 연결된 Issue 테스트 파일 경로
- 실행한 명령
- 종료 코드
- 통과한 테스트 파일·테스트 수 또는 검증 수치
- 미검증 항목과 그 사유
- 필요 시 PR 및 최종 커밋 링크

현재 표준화된 구현·검증 루프 자체는 [`SSOT.md`](./SSOT.md)의 상태대로 추후 생성 예정이며, 위 내용은 Issue의 종료 조건과 검증 결과를 연결하기 위한 현재 문서화 기준이다.

## 10. 현재 범위와 향후 생성

현재 하네스는 실행 가능한 `Protected`, `Prepare`, `Types`, `Lint`, `Architecture Check`, `Test`, `Build` 단계를 제공한다.

다음 항목은 [`SSOT.md`](./SSOT.md)의 상태대로 아직 별도 원본이 없다.

- 표준화된 구현·검증 루프
- 자동 승인 또는 승인자 대행 절차

단, PR CI에서는 위 정책의 실행 예외가 적용될 수 있다. `GITHUB_ACTIONS=true`와 `GITHUB_EVENT_NAME=pull_request`가 모두 정확히 일치할 때만 보호 경로 변경을 CI 검증 예외로 통과시키며, 사람 review·CODEOWNERS·branch protection을 우회하거나 승인자를 대행하지 않는다. 로컬과 `main` push에서는 사람 승인 정책을 유지한다.

`docs/07-plan.md`의 기존 QA 체크리스트와 `docs/06-architecture.md`의 자동 테스트 불변식은 각각의 원본 문서 내용이며, 이 문서의 실행·Issue 연결 기준과 충돌할 경우 SSOT 정책을 따른다.

## 11. 변경 원칙

- 실행 순서와 단계 책임을 바꾸면 `scripts/verify.ts`와 이 문서를 함께 확인한다.
- 보호 경로와 승인 정책은 [`SSOT.md`](./SSOT.md)를 원본으로 한다.
- 이 문서는 하네스 실행 안내이며, 도메인·아키텍처·GitHub Issue의 원본을 대체하지 않는다.
- 보호 경로 변경이 발생하면 SSOT의 승인 및 `NEEDS_HUMAN` 정책을 적용한다.

- 실행 순서와 단계 책임을 바꾸면 `scripts/verify.ts`와 이 문서를 함께 확인한다.
- 보호 경로와 승인 정책은 [`SSOT.md`](./SSOT.md)를 원본으로 한다.
- 이 문서는 하네스 실행 안내이며, 도메인·아키텍처·GitHub Issue의 원본을 대체하지 않는다.
- 보호 경로 변경이 발생하면 SSOT의 승인 및 `NEEDS_HUMAN` 정책을 적용한다.
