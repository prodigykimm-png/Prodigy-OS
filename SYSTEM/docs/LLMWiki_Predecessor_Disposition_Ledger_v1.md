# LLMWiki Predecessor Disposition Ledger v1

> Todo 1의 선행 Gateway/LLMWiki 산출물 disposition 기록. `discard-without-deleting`은 파일을 삭제한다는 뜻이 아니라 새 계약의 입력·권위로 사용하지 않는다는 뜻이다.

| predecessor artifact | disposition | Todo 1 decision | reason / re-verification |
| --- | --- | --- | --- |
| `.omo/drafts/llmwiki-phase1-trust-core.md` | `reuse-and-reverify` | canonical `knowledge` read boundary, Candidate/Literature separation, human approval principle을 재사용 | 문서의 Phase 1 상태·snapshot vocabulary는 유효하지만 Todo 1의 operation/write contract와 대조해 재검증했다 |
| `.omo/drafts/prodigy-ai-gateway-llmwiki.md` | `redesign` | source/proposal/approval topology만 참고하고 gateway coupling은 채택하지 않음 | 이전 문서는 전역 Gateway와 LLMWiki를 하나의 완료 단위로 묶었고, Todo 1은 provider나 global domain을 계약 권위로 두지 않는다 |
| `.omo/drafts/prodigy-ai-gateway-llmwiki-rethink.md` | `reuse-and-reverify` | local-first, optional provider, service boundary 방향을 참고 | 기존 문서가 아직 계획·draft이며 일부 source/archive 경로가 구현되지 않았으므로 이 validator의 proven input으로 간주하지 않는다 |
| `.omo/plans/prodigy-ai-gateway-llmwiki.md` | `redesign` | old plan의 acceptance vocabulary를 historical context로만 보존 | Gateway/OmniRoute migration, UI, archive implementation, benchmark는 Todo 1 범위를 넘어가며 새 trust boundary로 재구성해야 한다 |
| `.omo/ulw-loop/prodigy-ai-gateway-llmwiki-20260801/brief.md` | `reuse-and-reverify` | 이전 task의 contract-first 방향과 no-rewrite guard를 참고 | brief는 실행 지시와 후속 Todo를 섞은 계획 artifact이므로 현재 root의 계약·테스트를 대신하지 않는다 |
| sibling task worktree `SYSTEM/Views/llmwiki-contract.js` | `redesign` | query/proposal fail-closed 아이디어만 재검증 | 이전 validator는 query status와 네 proposal kind만 다뤘고 `operation`, `ingest`, `approve`, `abstain`, `no_change`, write authorization을 고정하지 않았다 |
| sibling task worktree `SYSTEM/docs/LLMWiki_Trust_Contract_v1.md` | `redesign` | canonical read/default-state 원칙만 재검증 | 이전 문서는 이번 Todo 1의 operation/provenance/status 및 final approval boundary가 없다 |
| sibling task worktree `SYSTEM/Prodigy/Schema/Source_Archive_Schema.md` | `reuse-and-reverify` | immutable bytes, archive ID, source_url, metadata-only separation을 후속 Source Archive contract의 참고로 보존 | 현재 Todo 1은 archive writer를 구현하지 않으며 explicit ingest write intent만 검증한다 |
| sibling task worktree `SYSTEM/Views/llmwiki-source-archive.js` | `reuse-and-reverify` | 후속 archive implementation 후보로 남김 | 실제 root 산출물이 아니며 Todo 1에서는 실행·복사하지 않는다 |
| sibling task worktree `SYSTEM/Views/prodigy-sha256.js` | `reuse-and-reverify` | 후속 immutable archive hash seam 후보로 남김 | 이번 validator는 hash 형식과 provenance만 검증하며 archive bytes를 저장하지 않는다 |
| sibling task worktree `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_contract.js` | `redesign` | stale-state, prompt-shaped data, no-rewrite test intent를 재사용 | 이전 테스트는 새 six-kind/operation/write policy를 증명하지 않으므로 현재 test로 대체한다 |
| `.omo/start-work/ledger.jsonl`의 이전 task-12 completion claim | `discard-without-deleting` | evidence pointer로만 보존, 현재 root의 사실로 승격하지 않음 | claim에 기록된 files는 현재 root에 없고 sibling worktree에만 있어 root에서 재현·재검증하기 전에는 완료 근거가 아니다 |
| 현재 root의 unrelated Auction/Region/Home/Journal/Knowledge dirty paths | `discard-without-deleting` | LLMWiki source/provenance/fixture로 사용하지 않음 | 사용자 변경을 수정·stage·commit하지 않으며 final scope check에서 baseline set과 overlap을 검사한다 |

## Ledger rules

1. 삭제·이동·migration으로 predecessor를 정리하지 않는다.
2. `reuse-and-reverify` artifact는 현재 root의 공식 Constitution → Core Concepts → Object Model → Schema → Test 순서로 다시 확인한 뒤에만 후속 Todo가 소비한다.
3. `redesign` artifact의 vocabulary가 현재 contract와 충돌하면 이 문서와 validator가 우선한다.
4. 이 Todo에서는 새 `llmwiki` type, global domain, automatic Candidate persistence, query write, Git commit을 도입하지 않는다.

