# GPT Pro Architect Response 20

- topic: llmwiki-rethink
- packet: packets/packet-6.md
- transport: Codex in-app browser, exact existing authenticated ChatGPT Project conversation
- model evidence: ChatGPT UI Pro
- verdict: APPROVE for the QA fixture; Todo 14 remains incomplete

## 핵심 판정

Synthetic stale packet 버튼은 실제 승인 계약을 왜곡하지 않는다. 기존 synthetic approval packet과 buildCommitRequest를 사용하고 첫 요청의 revision만 의도적으로 오래된 값으로 바꾸는 QA용 fault injection이기 때문이다.

다음 경계가 유지되어야 한다.

- 첫 요청만 stale revision
- retry는 정상 builder의 최신 revision
- 선택 operation intent 유지
- preview=true
- canonical Knowledge write 없음
- 새 Object/type 없음
- fixture state는 메모리 전용이며 reset으로 제거
- 버튼은 LLMWiki Approval QA.md 안의 QA 전용 control로만 유지

## 테스트 충분성

현재 fixture 계약 검증으로 stale recovery의 핵심은 충분하다.

- 첫 요청 stale revision
- 두 번째 요청 최신 revision
- retry 전후 operation intent 보존
- preview 상태 보존
- reset 소유권
- Vault write 0
- 반복 실행 안정성

다만 이것은 JS/runtime fixture 수준의 충분성이다. 실제 Obsidian에서 stale mismatch 표시, retry control의 실제 UI event, UI 상태의 선택 operation 유지, reset 후 정상 approval 복귀는 별도 증거가 필요하다.

## Provider/network/Git runtime spy

이 fixture의 필수 blocker는 아니다. 테스트의 직접 목적은 stale revision 복구와 approval intent 보존이며 provider/network/Git은 기능적 참여자가 아니다.

현재 preview-only, fake Vault write counter 0, canonical write 미수행, source/structure상 provider/network/Git 경로 없음이 확인되므로 runtime spy가 없다는 이유만으로 실제 Obsidian QA를 막을 필요는 없다.

단, Todo 14 acceptance가 runtime non-call 증명을 명시한다면 provider/network/Git 각각의 spy 대신 하나의 통합 forbidden-side-effect guard로 보완하면 충분하다.

## 실제 Obsidian QA

지금 실행해도 된다.

QA note 열기 → synthetic stale packet 준비 → 기본값이 아닌 operation 선택 → 첫 승인 → stale mismatch 표시 → 최신 revision retry → 선택 operation 유지 → preview 결과 → reset → fixture wrapper와 commitOptions 제거 순서로 확인한다.

QA 전후 canonical Knowledge hash 또는 mtime이 동일해야 한다.

## Todo 14 완료 여부

아직 완료할 수 없다.

- QA fixture 설계: 승인
- focused runtime contract test: 통과
- 반복 안정성: 통과
- 실제 Obsidian UI stale/retry 검증: 미실행
- Todo 14: 미완료 유지

## 완료 전 최소 추가 테스트

1. 실제 Obsidian stale/retry UI 테스트: stale 표시, retry, operation 보존, preview, canonical write 0.
2. fixture 격리·reset 누출 테스트: reset 후 wrapper와 commitOptions 복구, 다음 정상 승인에 stale override 미적용.
3. acceptance가 명시하는 경우에만 통합 side-effect guard로 provider/network/Git 호출 합계 0 확인.

이번 판정은 코드 수정, canonical Knowledge write, 파일 변경, commit, push, release를 승인하지 않는다.
