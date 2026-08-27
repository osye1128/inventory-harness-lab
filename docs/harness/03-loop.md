# 03. 구현·검증 반복 절차

> 상태: workflow 상태·반복 원본 · 원본: 이 문서

## 1. 목적과 책임

이 문서는 GitHub Issue를 기준으로 구현하고, [`02-verification.md`](./02-verification.md)의 검증 판정을 바탕으로 수정·재검증·중단·사람 개입을 결정하는 반복 절차를 정의한다.

- `02-verification.md`: 검증 단계, 실행 조건, 성공·실패 판정
- `03-loop.md`: 판정 이후 행동, 시도 상한, 재개, 인수인계, 사람 결정
- Issue: 작업 범위와 종료 조건
- `.harness/ledger.jsonl`: 실행 이벤트의 영속 원장

검증 통과는 사람의 승인이나 Issue 완료와 같지 않다. 사람 리뷰·승인·머지는 별도 게이트다.

## 2. 상태와 검증 결과의 분리

workflow 상태와 기계 검증 결과를 같은 열거형으로 기록하지 않는다.

```text
workflowState:
READY → IN_PROGRESS → VERIFYING → READY_FOR_REVIEW → COMPLETED
                         │                 │
                         │                 └─ 사람 리뷰·승인·머지 후
                         ├─ outcome=FAIL, 시도 남음 → IN_PROGRESS
                         ├─ outcome=BLOCKED → NEEDS_HUMAN
                         └─ outcome=INTERRUPTED → INTERRUPTED → handoff → 재개 또는 NEEDS_HUMAN

NEEDS_HUMAN → allowedNextState (유효한 사람 결정 후)
IN_PROGRESS → INTERRUPTED → handoff → IN_PROGRESS
사람의 중단 결정 → ABORTED
```

`verificationOutcome`은 `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `INTERRUPTED` 중 하나이며, `02-verification.md`가 `stage`와 `reasonCode`를 함께 판정한다.

- `PASS`는 기계 검증 결과이고, `READY_FOR_REVIEW`는 사람 검토를 기다리는 workflow 상태다.
- `COMPLETED`는 모든 종료 조건·전용 테스트·검증·필요한 사람 리뷰·머지가 확인된 경우에만 사용한다.
- `NEEDS_HUMAN`은 자동화가 안전하게 다음 행동을 결정할 수 없는 workflow 상태다.
- 상태와 이벤트는 [`ledger.jsonl`](../../.harness/ledger.jsonl)에 기록하며, 검증 결과가 `PASS`여도 사람 승인이나 완료로 추정하지 않는다.

## 3. 시도 횟수

Issue의 `max-implementation-loops`를 구현→검증 사이클의 전체 상한으로 사용한다.

- 1회는 `변경 또는 수정 → 02의 지정 검증 → 결과 판정`이다.
- `attempt.started`를 기록할 때 시도 1회를 소비한다. 계획·상태 조회·검증 결과 재출력은 시도가 아니다.
- 시도 번호는 1부터 시작하며, `attempt.number > max`는 거부한다.
- 기술적 검증 실패이고 남은 횟수가 있으면 실패 원인을 기록한 뒤 다음 시도를 시작한다.
- 마지막 허용 시도가 실패하면 즉시 `NEEDS_HUMAN`으로 전환하고 추가 시도를 하지 않는다.
- 검증에 통과하면 반복을 끝내고 `READY_FOR_REVIEW`로 전환한다.
- 세션·프로세스가 검증 중 끊기면 성공이나 실패로 추정하지 않고 `interrupted` checkpoint와 handoff를 기록한다.
- 원장, Issue의 최대 횟수, 현재 branch/head commit이 서로 다르면 카운터를 초기화하지 않고 `NEEDS_HUMAN`으로 멈춘다.

## 4. 검증 판정 이후 행동

| `02-verification.md` 결과 | workflow 행동 |
| --- | --- |
| `PASS` | 결과를 기록하고 `READY_FOR_REVIEW`로 이동. 사람 리뷰·승인·머지 전에는 완료하지 않는다. |
| `FAIL` + 시도 남음 | 실패 원인·영향을 기록하고 새 attempt에서 수정 후 전체 재검증한다. |
| `FAIL` + 시도 소진 | `ATTEMPT_LIMIT_REACHED`로 `NEEDS_HUMAN`에 진입하고 추가 시도하지 않는다. |
| `BLOCKED / PROTECTED_APPROVAL_*` | 승인 추정·우회 금지. 사람이 같은 범위를 승인한 뒤 재검증하거나 유효한 decision으로 다음 상태를 정한다. |
| `BLOCKED / *_CONFLICT`, `*_AMBIGUOUS`, `ISSUE_MISSING` | 구현을 중단하고 구조화된 blocker와 사람 결정을 기록한다. |
| `BLOCKED / ISSUE_TEST_MISSING` 또는 `ISSUE_ACCEPTANCE_CRITERIA_UNCOVERED` | 보완 가능한 명확한 작업이면 남은 attempt에서 보완하고, Issue 해석이 필요하면 `NEEDS_HUMAN`으로 이관한다. |
| `INTERRUPTED` | 성공·실패로 추정하지 않고 interrupted checkpoint와 handoff를 기록한 뒤 일치성 확인 후 재개 또는 `NEEDS_HUMAN`으로 전환한다. |

`02-verification.md`는 결과만 판정하며, 위 결과를 workflow 상태로 전환하고 재시도 여부를 결정하는 책임은 이 문서에 있다.

판정의 의미는 02가 정하고, 그 판정에 따른 반복·중단 행동은 이 문서가 정한다.

## 5. 표준 시도 절차

1. Issue, 원장, 최신 handoff를 읽고 상태·남은 횟수·branch/head를 확인한다.
2. 미해결 `NEEDS_HUMAN`이나 원장/Git 불일치가 있으면 수정하지 않고 사람에게 넘긴다.
3. active attempt가 없고 상한이 남아 있을 때 `attempt.started`를 기록한다.
4. Issue의 범위와 금지 범위를 다시 확인한 뒤 구현 또는 수정한다.
5. 02에 정의된 검증 명령을 실행하고 단계별 checkpoint를 기록한다.
6. 판정 결과를 `attempt.finished`에 기록한다.
7. 통과하면 handoff와 PR/사람 리뷰 정보를 기록하고 반복을 종료한다.
8. 실패하면 실패 요약·영향·남은 횟수·다음 행동을 기록한다.
9. 재현 가능한 기술 실패이고 남은 횟수가 있으면 다음 시도로 이동한다.
10. 판단 필요 또는 상한 도달이면 `NEEDS_HUMAN`과 handoff를 기록하고 멈춘다.

## 6. 세션·에이전트 교체와 handoff

실행 원장은 `.harness/ledger.jsonl`에 append-only 이벤트로 남긴다. 다음 세션은 구현 전에 `npm run harness:check`로 원장을 검증하고 마지막 handoff를 확인한다.

handoff에는 최소한 다음을 기록한다.

- Issue 번호·URL
- attempt ID·번호·최대 횟수
- 작성자·세션 ID·에이전트 ID
- branch·base commit·head commit
- 마지막 성공 checkpoint와 현재 실패·중단 checkpoint
- 남은 쟁점·blocker
- 다음 허용 행동
- `NEEDS_HUMAN` 여부와 필요한 결정
- 기계 검증과 사람 리뷰 상태의 구분

다음 세션은 다음 조건에서 자동 재개하지 않는다.

- handoff의 branch/head와 현재 Git 상태가 다름
- Issue 번호·범위·최대 횟수가 원장과 다름
- 원장에 미완료 attempt가 둘 이상 있음
- 결정이 superseded 되었거나 필요한 사람 결정이 없음
- 원장이 손상되었거나 handoff projection과 불일치함

## 7. NEEDS_HUMAN 진입·기록·해제

`NEEDS_HUMAN`은 이 문서가 정의하는 workflow 상태다. 검증기 `outcome=BLOCKED`나 단순 사람 리뷰 대기(`READY_FOR_REVIEW`)와 혼동하지 않는다.

`NEEDS_HUMAN` blocker에는 최소한 `reasonCode`, 발생 단계, Issue 번호·URL, 영향받는 문서·파일·종료 조건, branch/base/head/tree, attempt/max, 자동 진행이 불가능한 이유, 사람에게 필요한 질문과 선택지를 기록한다.

이 상태에서는 코드 수정·자동 재시도·승인자 추정·attempt 초기화·충돌한 원본 중 하나를 임의 선택·자동 `READY` 복귀를 하지 않는다. 유효한 `decision.recorded` 이벤트가 기록되기 전까지 상태를 유지한다.

결정에는 `decisionId`, 사람 `actor`, `decidedAt`, blocker와 일치하는 `reasonCode`, `decision`, `scope`, `allowedNextState`, `evidence`, 선택적 `supersedes`를 포함한다. AI·CI·빈 actor, 단순 댓글, CI 재실행·성공은 사람 결정이 아니다. 결정이 blocker와 일치하고 superseded되지 않았을 때만 `allowedNextState`로 전환하며, 코드 수정이 필요하면 새 attempt로 시작한다.

다음 경우 자동화는 `NEEDS_HUMAN`으로 전환한다.

- 원본 간 충돌 또는 종료 조건 해석의 모호성
- 보호 경로 승인 필요 또는 승인 범위 불명확
- 구현 attempt 상한 도달
- ledger·Git·handoff 불일치
- 데이터 손실·상태 모델 변경·외부 시스템 변경 판단 필요
- CI 실패가 로컬에서 재현되지 않음

상태가 `NEEDS_HUMAN`인 동안 추가 수정·자동 재시도·승인 추정·attempt 초기화·자동 상태 복귀를 금지한다. 기록에는 `reasonCode`, 발생 단계, Issue/URL, 관련 문서·경로·조건, branch/base/head/tree, 사용 attempt/max, 자동 진행 불가 이유, 사람에게 필요한 질문과 선택지를 포함한다.

해제는 유효한 `decision.recorded` 이벤트로만 가능하다. 결정에는 `decisionId`, 사람 `actor`, `decidedAt`, `reasonCode`, `decision`, `scope`, `allowedNextState`, `evidence`, 선택적 `supersedes`를 포함한다. AI·CI·빈 actor, 단순 댓글, CI 재실행·성공은 사람 결정이 아니다. 결정의 reasonCode가 blocker와 일치하고 superseded되지 않았을 때만 `allowedNextState`로 복귀하며, 코드 수정은 새 attempt로 시작한다.

## 8. 사람 개입과 결정 기록

다음 상황은 자동으로 판단하지 않고 `NEEDS_HUMAN`으로 멈춘다.

- Issue와 SSOT 또는 SSOT 간 충돌
- 종료 조건의 해석이 둘 이상임
- 보호 경로 승인 또는 승인 범위가 불명확함
- 최대 시도 횟수 도달
- 원장·Git·handoff가 불일치함
- 데이터 손실, 상태 모델 변경, 외부 시스템 변경이 필요함
- PR 생성·CI 성공을 사람 승인으로 간주해야 함

`decision.recorded` 이벤트에는 다음을 포함한다.

- decision ID와 Issue 번호·URL
- 질문 또는 충돌 내용
- 영향받는 파일·범위
- 검토한 선택지와 선택 결과
- 선택 근거
- 증거·문서·PR·리뷰 링크
- 사람 결정자와 결정 시각
- 이전 결정을 대체하면 `supersedes`
- 결정 후 허용되는 상태

AI·CI·빈 actor는 사람 결정자로 기록하지 않는다. 유효한 결정이 기록되기 전에는 `NEEDS_HUMAN`을 유지한다.

## 9. READY_FOR_REVIEW 이후 PR 생명주기

`READY_FOR_REVIEW`는 다음 조건을 모두 만족하는 열린 PR에만 유지한다.

- PR이 `OPEN`이다.
- 최신 PR HEAD에 대한 required CI가 `PASS`다.
- 필요한 사람 review가 현재 HEAD에 대해 승인되었다.
- Issue 종료 조건과 전용 테스트 증거가 모두 유효하다.

CI 통과, PR 생성, 일반 코멘트, AI·bot 활동만으로는 사람 승인이나 `COMPLETED`가 되지 않는다. `pull_request.closed`에서 `merged == true`인 경우에만, 최신 HEAD PASS·현재 HEAD에 대한 `review.approved`·Issue 조건을 다시 확인한 뒤 `COMPLETED`로 전환한다.

```text
READY_FOR_REVIEW
        │
        ├─ PR merged == true
        │      → review.approved 및 최신 HEAD PASS 확인
        │      → COMPLETED
        │
        └─ PR closed && merged == false
               │
               ├─ 유효한 사람 결정 없음 → NEEDS_HUMAN
               ├─ decision == REJECTED_FINAL
               │      → 자동 재진입 없음 → REJECTED 또는 ABORTED
               └─ decision == REWORK_REQUESTED
                      ├─ requirementChange == true + Issue 미갱신 → NEEDS_HUMAN
                      └─ 재진입 허용
                             → repository_dispatch
                             → reviewRound += 1
                             → attemptInRound = 0
                             → totalAttempt 유지
                             → 같은 branch 재구현·검증·push
                             → 기존 PR reopen 및 최신 HEAD CI
                             → PASS → READY_FOR_REVIEW
```

사람의 재구현 요청마다 `reviewRound`를 1 증가시킨다. 기존 attempt와 `totalAttempt`는 삭제·초기화하지 않으며, 새 round에서만 `attemptInRound`를 0으로 되돌린다. 재진입 시 Issue 코멘트에는 PR 및 반려 코멘트 링크와 round를 남기고, 동일 사건을 ledger에 append한다. 반려 사유의 원본은 PR 코멘트, 재진입 기록의 원본은 Issue 코멘트, 기계 상태의 원본은 ledger다.

사유 없는 미머지 Close는 `NEEDS_HUMAN`이다. `REJECTED_FINAL`은 자동 재진입하지 않는다. 종료 조건의 해석이 변경되면 Issue 또는 공식 `decision.recorded`를 먼저 갱신해야 한다. PR 코멘트나 Issue 코멘트 자체는 자동 루프를 시작하지 않으며, 허용된 `repository_dispatch`만 다음 루프를 시작한다. 재구현 중에는 PR을 닫아 두고, 구현·로컬 검증·commit/push가 끝난 뒤 reopen한다. `OPEN`이고 최신 HEAD CI가 `PASS`일 때만 다시 `READY_FOR_REVIEW`가 된다.

카운터는 다음처럼 보존한다.

| 카운터 | 규칙 |
| --- | --- |
| `reviewRound` | 사람의 유효한 `REWORK_REQUESTED`마다 증가. 중복 review/delivery는 증가시키지 않음 |
| `attemptInRound` | round 안의 attempt 수. 새 round에서만 0으로 초기화하고 `attempt.started`마다 증가 |
| `totalAttempt` | 모든 round의 누적 attempt. 절대 초기화·삭제하지 않음 |

## 10. 중단·완료 기준

- `READY_FOR_REVIEW`: 열린 PR의 최신 HEAD 기계 검증은 통과했지만 사람 리뷰·승인·머지가 남음
- `COMPLETED`: Issue 종료 조건, 전용 테스트, 최신 HEAD 검증, 사람 review, 실제 PR merge가 모두 확인됨
- `NEEDS_HUMAN`: 사람 결정·승인·해석이 필요하거나 시도 상한을 소진함
- `INTERRUPTED`: 세션·프로세스가 중단되어 성공·실패를 추정하지 않음
- `ABORTED`: 사람이 작업을 중단했으며 자동 재개하지 않음
- `REJECTED`: 사람이 최종 반려하여 자동 재진입하지 않음

## 11. 명령과 기록

`repository_dispatch` payload에는 Issue/PR 식별자, 현재 `reviewRound`, 최신 `headSha`, 결정 ID와 중복 방지용 delivery ID만 포함한다. `attemptInRound`·`totalAttempt`·승인 여부는 dispatch가 정하지 않고 ledger projection에서 검증·계산한다. stale HEAD/round, 중복 delivery, 다른 branch 또는 갱신되지 않은 Issue는 자동 진행하지 않는다.

```bash
npm run harness:run -- start <Issue 번호>
npm run harness:run -- checkpoint <Issue 번호>
npm run harness:run -- finish <Issue 번호>
npm run harness:run -- handoff <Issue 번호>
npm run harness:run -- decision <Issue 번호>
npm run harness:check
```

원장에는 비밀값이나 전체 터미널 출력을 기록하지 않는다. 짧은 요약, exit code, 단계명, commit, artifact 참조만 기록한다. 원장 변경은 사람의 판단이나 보호 경로 승인을 대신하지 않는다.
