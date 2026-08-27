# 03. 구현·검증 반복 절차

> 상태: 기준 선언 · 원본: 이 문서

## 1. 목적과 책임

이 문서는 GitHub Issue를 기준으로 구현하고, [`02-verification.md`](./02-verification.md)의 검증 판정을 바탕으로 수정·재검증·중단·사람 개입을 결정하는 반복 절차를 정의한다.

- `02-verification.md`: 검증 단계, 실행 조건, 성공·실패 판정
- `03-loop.md`: 판정 이후 행동, 시도 상한, 재개, 인수인계, 사람 결정
- Issue: 작업 범위와 종료 조건
- `.harness/ledger.jsonl`: 실행 이벤트의 영속 원장

검증 통과는 사람의 승인이나 Issue 완료와 같지 않다. 사람 리뷰·승인·머지는 별도 게이트다.

## 2. 상태 전이

```text
READY → IN_PROGRESS → VERIFYING → PASSED → READY_FOR_REVIEW → COMPLETED
                         │
                         └→ FAILED → IN_PROGRESS (남은 시도 있음)
                                  └→ NEEDS_HUMAN (상한 도달/판단 필요)

IN_PROGRESS → HANDOFF → IN_PROGRESS
NEEDS_HUMAN → READY (유효한 사람 결정 후)
```

- `NEEDS_HUMAN`은 자동화가 안전하게 다음 행동을 결정할 수 없어 유효한 사람 결정 전까지 중단된 workflow 상태다.
- 이 상태에서는 추가 코드 수정·attempt·retry·승인자 추정·attempt 초기화·원본 임의 선택·자동 READY 복귀를 하지 않는다.
- `PASSED`는 기계 검증 결과이고, `READY_FOR_REVIEW`는 사람 검토를 기다리는 상태다.
- `COMPLETED`는 모든 종료 조건과 검증, 필요한 사람 리뷰·머지가 확인된 경우에만 사용한다.
- 상태 전이와 이벤트는 [`ledger.jsonl`](../../.harness/ledger.jsonl)에 기록한다.

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

| `02-verification.md` 판정        | 반복 절차의 행동                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 모든 단계 통과                       | 결과를 기록하고 반복 종료, `READY_FOR_REVIEW`로 이동                                                                    |
| 코드·테스트 검증 실패                   | 원인·영향을 기록하고 남은 시도 안에서 수정 후 재검증                                                                            |
| `PROTECTED_CHANGE_NEEDS_HUMAN` | 우회·승인 추정 금지, 사람이 `npm run verify:approve -- --scope ... --approved-by ... --reason ...`을 실행한 뒤 같은 범위로 재검증 |
| `NEEDS_HUMAN` 또는 원본 충돌         | 구현 중단, 결정 기록 후 사람 결정이 있을 때만 재개                                                                            |
| Issue 테스트·종료 조건 불충족            | 완료 주장 금지, 보완 가능하면 다음 시도, 해석이 필요하면 사람에게 이관                                                                 |
| 실행 중단·취소                       | `interrupted`로 기록하고 handoff 작성, 상태 확인 후 재개                                                                |

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

`NEEDS_HUMAN`은 이 문서가 정의하는 workflow 상태다. 검증기 outcome이나 단순 사람 리뷰 대기(`READY_FOR_REVIEW`)와 혼동하지 않는다.

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

## 8. 중단·완료 기준

- `READY_FOR_REVIEW`: 기계 검증은 통과했지만 사람 리뷰·승인이 남음
- `COMPLETED`: 종료 조건, 전용 테스트, 02 판정, 사람 리뷰·머지가 모두 확인됨
- `NEEDS_HUMAN`: 사람 결정·승인·해석이 필요하거나 시도 상한을 소진함
- `INTERRUPTED`: 세션·프로세스가 중단되어 성공·실패를 추정하지 않음
- `ABORTED`: 사람이 작업을 중단했으며 자동 재개하지 않음

## 9. 명령과 기록

```bash
npm run harness:run -- start <Issue 번호>
npm run harness:run -- checkpoint <Issue 번호>
npm run harness:run -- finish <Issue 번호>
npm run harness:run -- handoff <Issue 번호>
npm run harness:run -- decision <Issue 번호>
npm run harness:check
```

원장에는 비밀값이나 전체 터미널 출력을 기록하지 않는다. 짧은 요약, exit code, 단계명, commit, artifact 참조만 기록한다. 원장 변경은 사람의 판단이나 보호 경로 승인을 대신하지 않는다.
