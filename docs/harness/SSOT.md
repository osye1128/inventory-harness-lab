# Harness SSOT

> 작성일: 2026-08-26 · 상태: 기준 선언 · 검증 규칙/구현·검증 루프: 추후 생성

## 1. 목적

이 문서는 재고관리 프로젝트의 문서 기준점을 선언한다. 각 주제의 원본을 하나로 지정하고, `docs/harness`는 원본을 복제하거나 대체하지 않는 탐색·연결 계층으로 사용한다.

## 2. SSOT 매트릭스

| 영역 | 원본(SSOT) | 현재 상태 | 원본이 결정하는 범위 |
|---|---|---|---|
| 재고 도메인 | [`docs/01-requirements.md`](../01-requirements.md) | 존재 | 재고 개념, 로트, 거점, FEFO/LEFO, 이동·사유·팝업·감사 규칙, 범위와 완료 기준 |
| 아키텍처 | [`docs/06-architecture.md`](../06-architecture.md) | 존재 | 기술 스택, 데이터 모델, 계층·트랜잭션 경계, 재고 변경 통로, 상태 흐름, 성능·동시성 결정 |
| 개별 작업 | 해당 [GitHub Issue](https://github.com/osye1128/inventory-harness-lab/issues) 및 [`maintenance.yml`](../../.github/ISSUE_TEMPLATE/maintenance.yml) | 현재 등록된 Issue 없음 | 작업 목적, 범위, 수용 조건, 의존성, 상태와 구현·검증 결과 |
| 보호 경로 검사 | [`scripts/check-protected.ts`](../../scripts/check-protected.ts) | 구현됨 | 승인된 보호 경로 변경만 로컬·CI에서 통과 |
| 검증 규칙 | [`02-verification.md`](./02-verification.md) | 구현됨 | 현재 하네스의 검증 절차와 단계별 규칙 |
| 검증 실행 | [`scripts/verify.ts`](../../scripts/verify.ts) | 구현됨 | Protected → Prepare → Types → Lint → Architecture Check → Test → Build 실행 |
| 구현·검증 루프 | [`02-verification.md`](./02-verification.md) | 구현됨 | 시도 원장, 검증 checkpoint, 세션 handoff, 사람 결정 기록 및 재개 규칙 |

> **현재 원본이 없는 영역:** 구현·검증 루프는 아직 정의하지 않는다. 검증 절차의 원본은 [`02-verification.md`](./02-verification.md)이며, 이 문서는 해당 절차를 대체하지 않는다.

## 3. 문서 간 책임 경계

- 재고 도메인에 대한 결정은 [`docs/01-requirements.md`](../01-requirements.md)에서 한다.
- 아키텍처에 대한 결정은 [`docs/06-architecture.md`](../06-architecture.md)에서 한다.
- 개별 작업의 정의와 수용 조건은 해당 GitHub Issue에서 한다. Issue가 없는 작업은 원본이 없는 상태로 남긴다.
- 유지보수 Issue는 [`.github/ISSUE_TEMPLATE/maintenance.yml`](../../.github/ISSUE_TEMPLATE/maintenance.yml)의 6개 항목을 따른다. 종료 조건은 기준·수치·기대 결과로 참·거짓을 판정할 수 있게 작성하고, 구현 루프 최대 횟수의 기본값은 3회다.
- Issue의 종료 조건을 검증하는 테스트는 `tests/issues/issue-{Issue 번호}-{기능명}.test.ts` 규칙을 따른다. 테스트가 종료 조건을 모두 검증하지 않거나 실패하면 완료로 보지 않는다.
- `docs/harness` 문서는 원본의 위치와 관계만 안내한다. 도메인 규칙, 아키텍처 결정, 작업 목록, 검증 규칙을 별도로 복제하지 않는다.
- 기존 [`docs/07-plan.md`](../07-plan.md)의 계획·QA 내용은 해당 문서의 범위에 머문다. 아직 생성되지 않은 Harness 검증 규칙이나 구현·검증 루프로 간주하지 않는다.

## 4. 충돌 처리

원본 간 책임이 겹쳐 보일 때는 다음 정책을 따른다.

1. 참고 문서와 SSOT가 충돌하면 **SSOT를 우선한다.** 참고 문서는 SSOT를 해석하거나 탐색하기 위한 보조 자료이며, SSOT의 결정을 덮어쓰지 않는다.
2. GitHub Issue와 SSOT가 충돌하면 `NEEDS_HUMAN` 상태를 선언하고 사람에게 판단을 요청한다. AI는 어느 쪽을 적용할지 임의로 결정하지 않는다.
3. SSOT와 SSOT가 충돌해도 `NEEDS_HUMAN` 상태를 선언하고 사람에게 판단을 요청한다. 담당 영역이나 문서의 작성 시점만으로 우선순위를 추정하지 않는다.
4. AI는 충돌이 발생한 상태에서 자신의 판단대로 구현·문서화·검증을 진행하지 않는다. 충돌한 원본과 쟁점을 기록하고, 사람의 판단이 확인된 뒤에만 작업을 재개한다.

`NEEDS_HUMAN`을 선언할 때는 충돌한 문서 또는 Issue의 경로·URL, 충돌하는 문장이나 섹션, 영향받는 작업, 사람에게 필요한 결정 사항을 함께 제시한다.

### SSOT 변경 보호 정책

- 사람이 SSOT를 수정하려는 경우, 사람이 명시적으로 요청하면 그 변경 요청을 받아들인다.
- AI는 사람의 명시적인 요청 없이 SSOT를 임의로 수정하지 않는다.
- 사람의 요청이 기존 SSOT 간 충돌을 해소하거나 새로운 충돌을 만들 수 있으면, 변경 전후의 영향과 충돌 내용을 사람에게 알린다.
- SSOT 변경 요청이 명시적으로 확인된 뒤에는 요청된 범위 안에서만 변경하고, 변경 내용을 요약한다.

Harness 문서는 충돌을 임의로 해결하지 않는다. 사람의 판단으로 원본이 변경되면 관련 GitHub Issue로 변경을 추적하고, 이 문서의 링크와 상태를 필요한 범위에서 갱신한다.

## 5. 보호 경로 변경 승인

### 보호 경로

다음 경로는 도메인·아키텍처·검증 실행의 기준을 담으므로 보호한다.

- `docs/01-requirements.md`
- `docs/06-architecture.md`
- `docs/harness/SSOT.md`
- `package.json`의 검증 관련 scripts
- `scripts/check-architecture.ts`
- `scripts/check-protected.ts`
- `scripts/prepare-verify.ts`
- `scripts/verify.ts`

### 승인 방법

- 보호 경로 변경은 [`scripts/check-protected.ts`](../../scripts/check-protected.ts)가 로컬과 CI에서 검사한다.
- 사람이 승인할 때는 [`.harness/protected-approvals.json`](../../.harness/protected-approvals.json)의 `approvals` 배열에 변경된 경로의 현재 `sha256`, `approvedBy`, `reason`을 기록한다.
- 검사기는 현재 변경 경로와 파일의 LF 정규화된 UTF-8 내용에 대한 SHA-256 및 승인 기록을 대조한다. 승인 기록이 없거나 값이 다르면 `PROTECTED_CHANGE_NEEDS_HUMAN` 상태로 실패한다.
- 승인 파일은 사람이 명시적으로 갱신하며, AI가 승인자를 대신해 기록하지 않는다.
- 로컬과 CI는 같은 승인 파일과 같은 검사 명령을 사용한다. CI에서는 `GITHUB_BASE_SHA` 또는 `GITHUB_BASE_REF`를 비교 기준으로 사용하고, 로컬에서는 `PROTECTED_BASE`를 지정할 수 있으며 기본값은 `HEAD`다.
- 보호 경로 변경이 충돌하거나 승인의 의미가 불명확하면 승인 기록을 추측하지 않고 `NEEDS_HUMAN`으로 판단을 요청한다.
- 기본적으로 AI와 CI는 사람 승인자를 대행하지 않는다. 단, `GITHUB_ACTIONS=true` 및 `GITHUB_EVENT_NAME=pull_request`가 정확히 일치하는 PR CI에서는 보호 경로 변경을 CI 검증 예외로 통과시킬 수 있다. 이 예외는 사람 승인, `approvedBy` 기록, 승인 파일 갱신 또는 병합 권한을 의미하지 않는다.
- 위 두 환경 신호가 누락·변조·오타이거나 실행 이벤트가 `main` push·로컬 실행·기타 이벤트이면 예외를 적용하지 않고 사람 승인 검사를 수행한다.
- `.harness/protected-approvals.json`은 승인 메타데이터이므로 `scripts/check-protected.ts`의 보호 경로 목록에는 포함하지 않는다. 대신 [`.github/CODEOWNERS`](../../.github/CODEOWNERS)와 GitHub branch protection 또는 ruleset으로 사람의 review를 요구한다.
- [`.github/CODEOWNERS`](../../.github/CODEOWNERS)는 보호 경로 및 승인 파일의 소유자로 `@osye1128`을 선언한다. CODEOWNERS 파일만으로는 병합이 차단되지 않으므로 GitHub 원격 설정에서 CODEOWNER review와 `Verify` required check를 별도로 활성화해야 한다.
- GitHub Actions는 `contents: read` 권한으로 승인 파일을 읽기만 하며, 승인 기록을 생성·수정하지 않는다.
- GitHub Actions workflow와 CODEOWNERS는 저장소에 선언되지만, branch protection 또는 ruleset의 원격 enforcement는 별도 GitHub 설정이다. 원격 설정이 적용되기 전 상태는 `정책 선언`으로 본다.

## 6. 개별 작업 참조 규칙

- 작업은 먼저 GitHub Issue로 등록한다.
- 문서나 변경 설명에는 Issue 번호와 정식 URL을 함께 사용한다.
- Issue URL 형식은 `https://github.com/osye1128/inventory-harness-lab/issues/<number>`이다.
- Pull Request는 구현 결과를 전달하는 수단이며, 개별 작업의 원본인 Issue를 대체하지 않는다.
- 현재 저장소에는 등록된 Issue가 없으므로 이 문서에 임의의 작업·번호·제목을 추가하지 않는다.

## 7. 추후 생성 항목

### 검증 규칙

- 상태: `정의됨`
- 원본: [`02-verification.md`](./02-verification.md)
- 실행 진입점: [`scripts/verify.ts`](../../scripts/verify.ts)
- 구현 방식: 현재 하네스의 검증 절차를 문서로 정의하고 `npm run verify`로 실행한다.

도메인 완료 기준과 아키텍처 불변식은 각각 [`docs/01-requirements.md`](../01-requirements.md)와 [`docs/06-architecture.md`](../06-architecture.md)를 참조하며, 검증 실행 절차와 단계별 규칙은 [`02-verification.md`](./02-verification.md)가 원본이다.

### 구현·검증 루프

- 상태: `정의됨`
- 실행 원장: [`.harness/ledger.jsonl`](../../.harness/ledger.jsonl)
- 실행 명령: `npm run harness:run -- start|checkpoint|finish|handoff|decision <Issue 번호>`
- 원장은 시도·검증 단계·세션 인수인계·사람 결정 이벤트를 append-only JSONL로 기록하며, `npm run harness:check`로 재생·검증한다.
- 시도는 Issue의 최대 횟수를 초과할 수 없고, 원장과 현재 브랜치·커밋이 불일치하거나 미해결 `NEEDS_HUMAN` 결정이 있으면 자동 재개하지 않는다.
- `.harness/ledger.jsonl`은 실행 이력의 기준이며, GitHub Issue/PR은 작업 정의와 사람 판단을 공유하는 기록이다. 둘이 충돌하면 `NEEDS_HUMAN`으로 중단한다.
- AI와 CI는 사람 결정 이벤트를 대신 기록하거나 시도 횟수를 초기화하지 않는다.

## 8. 갱신 규칙

- 도메인 원본이 바뀌면 이 문서의 링크와 상태만 필요한 범위에서 갱신한다.
- 아키텍처 원본이 바뀌면 이 문서의 링크와 상태만 필요한 범위에서 갱신한다.
- Issue는 GitHub를 원본으로 하며, 이 문서에 작업 내용을 복사해 별도 백로그를 만들지 않는다.
- 검증 규칙과 구현·검증 루프가 실제로 생성될 때 각각의 원본·상태·책임 범위를 이 문서에 추가한다.
- 이 디렉터리의 문서 변경은 코드·DB 변경과 별도로 검토한다.

## 9. 참고

재고 도메인과 아키텍처의 책임 경계는 위의 `## 3. 문서 간 책임 경계`를, 충돌 처리 정책은 위의 `## 4. 충돌 처리`를 따른다.

- 재고 도메인: [`docs/01-requirements.md`](../01-requirements.md)
- 아키텍처: [`docs/06-architecture.md`](../06-architecture.md)
- 개별 작업: 해당 [GitHub Issue](https://github.com/osye1128/inventory-harness-lab/issues)
- 보호 경로 승인: [`.harness/protected-approvals.json`](../../.harness/protected-approvals.json)
- 보호 경로 검사: [`scripts/check-protected.ts`](../../scripts/check-protected.ts)
- 보호 경로 소유자: [`.github/CODEOWNERS`](../../.github/CODEOWNERS)
- 현재 부재: 검증 규칙, 구현·검증 루프

이 문서는 위 원본을 대체하지 않으며, 원본이 변경되면 링크와 상태를 필요한 범위에서만 갱신한다.
