# GPT Pro Architect Review Packet 6

## 목적

LLMWiki Todo 14에서 추가한 QA 전용 stale/retry 테스트 항목과 현재 검증 상태를 재검토한다.
질문은 다음과 같다.

1. QA note에 별도의 synthetic stale packet 준비 버튼을 두는 방식이 실제 LLMWiki 승인 계약을 왜곡하지 않는가?
2. 첫 승인 요청을 의도적으로 stale revision으로 만들고 최신 revision retry를 검증하는 테스트 설계가 충분한가?
3. 현재 needs-fix 판정(provider/network/Git 비호출의 런타임 spy 부족)을 반드시 해결해야 하는가?
4. 현재 상태에서 실제 Obsidian 수동 QA로 넘어가도 되는가?
5. Todo 14를 완료로 표시하려면 추가해야 할 최소 테스트 항목은 무엇인가?

## 전송 범위와 제외 범위

전송 대상은 다음의 redacted 요약뿐이다.

- LLMWiki Approval QA.md
- SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_approval_qa_fixture.js
- .omo/evidence/llmwiki-qa-stale-fixture-executor.json
- .omo/evidence/llmwiki-qa-stale-fixture-verifier.json
- Todo 14 acceptance 요약

제외:

- secrets, tokens, credentials, .env, auth headers, cookies
- 개인 노트 본문, 연락처, 결제정보
- 전체 dirty worktree와 unrelated file contents
- 원격 provider payload와 외부 서비스 인증정보

## 구현 요약

- vault root의 LLMWiki Approval QA.md에 visible QA control data-action=prepare-llmwiki-qa-stale-packet 추가
- 기존 LLMWikiApprovalReviewView.createSyntheticApprovalPacket() 사용
- KnowledgeExplorerHub.commitOptions = { preview: true }
- QA note가 fixture-owned buildCommitRequest wrapper를 설치
- 첫 요청에만 canonical_revision.current = 64 zeroes 적용
- retry 요청은 normal builder revision 사용
- selected operation intent는 retry에 유지
- reset은 approval packet, commit options, wrapper 등 in-memory fixture state만 복구
- canonical Knowledge 파일과 새 type: llmwiki는 생성하지 않음

## 검증 결과

Focused runtime contract test:

- 4 tests passed
- 3 independent repeats passed
- node --check passed
- extracted DataviewJS new Function syntax check passed
- first request stale revision asserted
- second request normal revision asserted
- selected operation intent preserved
- preview-only result asserted
- reset ownership asserted
- fake Vault write counter remained zero

Independent verifier:

- stale first request: pass
- normal retry revision: pass
- selected intent preservation: pass
- preview state: pass
- reset ownership: pass
- provider/network/Git non-call: only structural/source evidence
- verdict: needs-fix
- real Obsidian stale UI QA: deferred

## 현재 제한

- 실제 Obsidian 화면에서 stale mismatch -> retry -> selected approval preservation을 아직 실행하지 않음
- provider/network/Git 비호출을 런타임 spy로 독립 관찰하지 못함
- canonical write와 index refresh는 preview fixture이므로 증명 범위 밖
- 전체 Todo 14는 미완료이며 계획 체크박스는 변경하지 않음

## 검토 요청 형식

다음 순서로 답변해 달라.

1. APPROVE, NEEDS_FIX, 또는 BLOCK
2. 테스트 설계의 신뢰 경계
3. 반드시 추가할 테스트 항목
4. 실제 Obsidian QA 전제조건
5. Todo 14 완료 판정 가능 여부

승인 권한은 canonical Knowledge 변경, commit, push, release를 포함하지 않는다.
이번 검토는 설계·검증 판정만을 위한 것이다.
