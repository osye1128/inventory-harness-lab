# 02. 검증

> 작성일: 2026-08-26 · 상태: 검증 판정 원본 · 원본: 이 문서

이 문서는 검증 단계와 기계 판정의 원본이다. `SSOT.md`는 이 문서의 위치와 책임을 등록하며, 판정 이후의 workflow 상태·반복·사람 결정은 [`03-loop.md`](./03-loop.md)가 담당한다. 이 문서는 검증 결과만 반환하고 `NEEDS_HUMAN`이나 재시도 여부를 직접 결정하지 않는다.

## 1. 목적

이 문서는 검증 단계, 실행 순서, 단계별 통과 조건과 판정 코드의 원본이다. 도메인 완료 기준과 아키텍처 불변식은 SSOT.md가 지정한 원본 문서를 참조한다.

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

CI에서는 [`../../.github/workflows/verify.yml`](../../.github/workflows/verify.yml)이 `npm ci` 후 `npm run verify`를 실행한다. workflow는 실제 운영 비밀을 사용하지 않고 CI 전용 `SESSION_SECRET`만 제공한다. 로컬에는 CI와 동일한 Node/npm 버전·base SHA·환경을 자동으로 주입하는 `verify:ci` 명령이 아직 없으므로, “로컬 CI 재현”은 제안된 개선 흐름이며 현재 검증 단계가 아니다.

## 4. 단계별 동작

### 4.1 Protected

구현: [`scripts/check-protected.ts`](../../scripts/check-protected.ts)

보호 경로에 변경이 있으면 현재 파일의 LF 정규화 UTF-8 내용 SHA-256을 승인 파일과 비교한다.

- 승인 기록: [`.harness/protected-approvals.json`](../../.harness/protected-approvals.json)
- 사람이 로컬에서 명시적으로 실행하는 승인 명령: `npm run verify:approve -- --scope <path> --reason <사유>` (`approvedBy` 기본값: `osye1128`) 또는 다른 승인자가 필요한 경우 `--approved-by <사람>` 추가
- 승인 필드: `path`, `sha256`, `approvedBy`, `reason`
- `--scope`는 현재 보호 경로 변경과 정확히 일치해야 하며, 승인 기록이 없으면 `outcome=BLOCKED`, `reasonCode=PROTECTED_APPROVAL_MISSING`, 해시가 다르면 `outcome=BLOCKED`, `reasonCode=PROTECTED_APPROVAL_HASH_MISMATCH`로 반환한다. workflow 상태 전환은 [`03-loop.md`](./03-loop.md)가 담당한다.
- 승인 명령은 CI에서 실행할 수 없고, PR 생성·CI 성공·AI 실행은 승인으로 간주하지 않는다.
- 로컬·PR CI·`main` push CI는 모두 같은 승인 대조를 수행한다. CI는 비교 base만 이벤트에 따라 선택하며 보호 검사를 우회하지 않는다.
- 승인 파일 자체는 자기참조 해시 문제를 피하기 위해 보호 경로 목록에서 제외
- 승인 파일 변경은 [`.github/CODEOWNERS`](../../.github/CODEOWNERS)와 GitHub branch protection 또는 ruleset으로 사람 review를 요구

로컬 승인 명령은 base 환경변수가 없으면 `HEAD` 대비 미커밋 변경을 대상으로 한다. CI/PR은 workflow가 명시한 base SHA를 사용한다.

비교 기준은 다음 우선순위를 따른다.

1. `PROTECTED_BASE`
2. `GITHUB_BASE_SHA`
3. `GITHUB_BASE_REF`
4. 로컬 기본값 `HEAD`

보호 경로 충돌이나 승인 의미가 불명확한 경우에는 `outcome=BLOCKED`, `reasonCode=PROTECTED_APPROVAL_SCOPE_AMBIGUOUS`로 판정하고 [`SSOT.md`](./SSOT.md)의 `NEEDS_HUMAN` 정책을 따른다. AI와 CI는 승인 기록을 생성하지 않으며, PR 이벤트나 CI 환경 변수는 보호 경로 승인 예외가 아니다. 로컬과 CI는 동일한 승인 검사를 수행한다.

검증 결과는 다음 개념적 형식으로 기록한다.

```text
{ outcome: PASS | FAIL | BLOCKED | NOT_RUN | INTERRUPTED,
  reasonCode, stage, exitCode, details }
```

`PASS`는 모든 기계 단계를 통과했다는 뜻이며 사람 리뷰·승인·머지 또는 `COMPLETED`를 의미하지 않는다. PR의 최신 HEAD CI가 `PASS`이고 PR이 열린 상태일 때만 `READY_FOR_REVIEW`의 기계 조건을 만족한다. PR lifecycle의 review·merge·rework 및 다음 실행 진입은 [`03-loop.md`](./03-loop.md)가 담당하며, 일반 댓글은 자동 trigger가 아니고 `repository_dispatch`만 재진입을 시작한다.

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
- `tests/issues/issue-6-popup-expiration.test.ts`

Issue 전용 테스트는 실제 GitHub Issue의 번호와 종료 조건을 확인한 경우에만 완료 증거로 사용한다. 현재 저장소의 Issue 전용 파일은 Vitest 대상에는 포함되지만, Issue 원본 확인과 종료 조건 매핑은 별도 절차다.

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

PR에서는 PR base SHA를 Protected 비교 기준으로 사용하고, `main` push에서는 직전 커밋을 기준으로 사용한다. 보호 경로 변경은 PR CI와 `main` push, 로컬 실행 모두 승인 기록이 필요하며 CI 환경 변수로 우회할 수 없다. workflow는 `contents: read` 권한만 가지며 승인 파일이나 저장소 내용을 수정하지 않는다.

## 7. 실패 처리

| 상태                                          | 의미                            | 조치                               |
| ------------------------------------------- | ----------------------------- | -------------------------------- |
| `BLOCKED / PROTECTED_APPROVAL_MISSING` 또는 `PROTECTED_APPROVAL_HASH_MISMATCH` | 보호 경로 승인 기록이 없거나 해시가 불일치 | 판정을 03-loop에 전달하고 사람 승인 후 같은 범위 재검증 |
| `BLOCKED / *_CONFLICT`, `PROTECTED_APPROVAL_SCOPE_AMBIGUOUS` | 원본 충돌 또는 승인 범위 판단 불가 | 판정을 03-loop에 전달하고 상태 전환은 03-loop가 결정 |
| `BLOCKED / ACCEPTANCE_CRITERIA_AMBIGUOUS` | Issue 종료 조건 해석 불가 | 판정을 03-loop에 전달하고 사람 결정 전 중단 |
| `FAIL / PREPARE_FAILED`, `TYPES_FAILED`, `LINT_FAILED`, `ARCHITECTURE_CHECK_FAILED`, `TEST_FAILED`, `BUILD_FAILED` | 해당 기술 검증 단계 실패 | 결과를 03-loop에 전달하고 재시도 여부는 loop가 결정 |
| `INTERRUPTED / INTERRUPTED` | 세션·프로세스·runner 중단 | 성공·실패로 추정하지 않고 checkpoint와 handoff 기록 |

실패 원인을 숨기거나 승인 단계를 우회하지 않는다.

## 8. 반복 절차 연결

검증 결과에 따른 수정·재검증·시도 상한·세션 handoff·사람 결정 절차는 [`03-loop.md`](./03-loop.md)를 따른다. 이 문서는 검증 판정 자체를 정의하며, 판정 이후의 행동을 중복해서 정의하지 않는다.

## 9. Issue 처리

Issue 종료 조건과 반복 실행을 연결할 때는 [`03-loop.md`](./03-loop.md)의 상태·시도·재개 규칙을 함께 적용한다.

개별 작업의 원본은 해당 GitHub Issue다. 이 문서는 Issue의 내용을 대신 정의하지 않고, Issue에 적힌 종료 조건을 검증 하네스와 연결하는 방법을 안내한다.

### 처리 기준

1. 작업을 시작하기 전에 해당 Issue의 배경, 변경할 내용, 종료 조건, 기계 검증, 변경 금지 범위, 구현 루프 최대 횟수를 확인한다.
2. Issue의 종료 조건마다 실행 조건·판정 기준·기대 결과가 있는지 확인한다. 기준이 추상적이거나 서로 충돌하면 `outcome=BLOCKED`, `reasonCode=ACCEPTANCE_CRITERIA_AMBIGUOUS`로 반환하고 상태 전환은 [`03-loop.md`](./03-loop.md)에 맡긴다.
3. Issue 번호와 기능명을 사용해 종료 조건을 검증하는 테스트를 다음 경로에 둔다.

   Issue 번호와 기능명은 반드시 실제 GitHub Issue의 값과 일치해야 한다. Issue가 아직 없거나 번호를 특정할 수 없으면 테스트 파일을 임의로 만들지 않고 사람에게 Issue 등록 또는 번호 확인을 요청한다.

   테스트 파일 경로는 영문 소문자·숫자·하이픈으로 구성한다. 예를 들어 Issue #42의 “재고 이동” 기능은 `stock-transfer`로 변환한다.

   테스트 파일명은 다음 정규식 형식을 따른다.

   ```text
   ^tests/issues/issue-[1-9][0-9]*-[a-z0-9]+(?:-[a-z0-9]+)*\.test\.ts$
   ```

   Issue 번호와 기능명이 파일명에 없거나, 다른 Issue의 번호를 사용하거나, 기능명을 식별할 수 없는 파일명은 유효한 Issue 테스트로 보지 않는다.

4. Issue 테스트는 각 종료 조건을 하나 이상의 명시적인 assertion으로 검증한다. 테스트 이름이나 주석만으로 종료 조건을 덮었다고 간주하지 않는다.
5. Issue에 적힌 기계 검증 명령을 실행하고 종료 코드·테스트 결과·핵심 수치를 Issue에 기록한다.
6. 모든 종료 조건과 기계 검증이 통과했을 때만 Issue를 완료 후보로 본다. 검증 결과가 없거나 일부 조건만 통과한 상태는 완료로 표시하지 않는다.

### Issue 테스트 파일 규칙

- 파일 하나는 하나의 GitHub Issue와 하나의 기능을 대상으로 한다.
- 파일명은 `issue-{Issue 번호}-{기능명}.test.ts` 형식이어야 한다.
- 기능명은 공백·한글·특수문자 대신 영문 소문자 케밥 케이스를 사용한다.
- 예: Issue `#42`의 재고 이동 → `tests/issues/issue-42-stock-transfer.test.ts`
- Issue 본문에 기재한 종료 조건과 테스트의 `it`/`test` assertion을 일대일로 추적할 수 있어야 한다.
- Vitest의 `tests/**/*.test.ts` 포함 패턴에 따라 `npm test`에서 자동 실행된다.
- 파일이 없거나, 파일명이 Issue와 불일치하거나, 종료 조건을 모두 검증하지 않으면 기계 검증 완료로 보지 않는다.

### Issue 테스트 파일 구조 예시

```text
tests/issues/issue-42-stock-transfer.test.ts
```

```ts
describe('Issue #42: 재고 이동', () => {
  it('종료 조건 1: 출발지 수량이 10개 감소한다', async () => {
    // 실행 조건을 설정한다.
    // expect(actual).toBe(기대값)
  })

  it('종료 조건 2: 도착지 수량이 10개 증가한다', async () => {
    // expect(actual).toBe(기대값)
  })
})
```

### Issue 테스트 미충족 시

Issue 번호가 없으면 `outcome=BLOCKED`, `reasonCode=ISSUE_MISSING`으로 처리하고, 테스트 파일이 없으면 `outcome=BLOCKED`, `reasonCode=ISSUE_TEST_MISSING`으로 처리한다. 파일명이 Issue와 맞지 않으면 `ISSUE_TEST_MISMATCH`, 종료 조건 중 하나라도 assertion으로 검증하지 못하면 `ISSUE_ACCEPTANCE_CRITERIA_UNCOVERED`로 판정한다. 이 결과를 workflow 상태(`NEEDS_HUMAN` 또는 남은 시도에서의 보완)로 바꾸는 책임은 [`03-loop.md`](./03-loop.md)에 있다.

### Issue 테스트 실행

특정 Issue 테스트만 실행:

```bash
npm test -- tests/issues/issue-42-stock-transfer.test.ts
```

전체 Issue 테스트 포함 실행:

```bash
npm test
```
