# Task12 — Reading Candidate Lifecycle Evidence

Date: 2026-07-20 (Asia/Seoul)

## Result

Reading now projects active shared Knowledge Candidates as a compact follow-up list and sends review to the shared Knowledge Explorer Inbox. It does not approve, reject, promote, count, or write a Candidate from this surface.

## Code Review

- `SYSTEM/Views/reading-workspace-core.js` accepts only `proposed` and `saved` Candidates, derives the Reading session provenance and quality availability, and marks every projection `counts_as_knowledge: false`.
- `SYSTEM/Views/reading-view.js` renders Korean lifecycle/quality/source labels and only exposes `세션 열기` plus `Knowledge Explorer에서 검토`; no duplicated approval, rejection, or promotion control remains.
- Explorer routing uses `HUB/50 Knowledge` and supplies one compact recovery Notice when the workspace cannot open it.
- The Reading memory core/retrieval code contains no Candidate input path; direct memory suites passed unchanged.
- `git diff --check`, JavaScript syntax checks, and the Property Contract audit passed. No schema, template, or real Object was changed.

## Manual QA

- Synthetic UI harness: canonical `saved` and legacy `proposed` Candidates render with source session and quality availability; `rejected` is absent; the handoff opens `HUB/50 Knowledge`; unavailable Explorer produces the compact recovery Notice; approval/rejection controls are absent.
- Shared Candidate core/store/view suites passed, including active-status compatibility and terminal exclusion.
- Reading workspace/history and memory suites passed. Candidate projections are explicitly excluded from Knowledge count and Reading history.

## Visual QA

Verdict: **PASS WITH LIMITATION**.

Obsidian 1.12.7 opened `HUB/20 Reading.md` without creating or changing any Object. The Reading tab's content area remained stale with the previously opened Auction Region content, so a live Candidate card and narrow-layout interaction could not be observed. No Candidate fixture or real Vault Object was created merely to force that state. The rendered candidate handoff is covered by the direct FakeElement UI test; live Obsidian Candidate-card QA remains required once the Reading DataviewJS pane refreshes normally and a user-owned Candidate already exists.

## Notepad

- Keep the Candidate lifecycle owned by `KnowledgeCandidateView` / `KnowledgeCandidateStore` in Knowledge Explorer.
- Reading is read-only follow-up context: lifecycle badge, source session, quality availability, and navigation.
- Do not add a Reading-only approval, rejection, promotion, Knowledge count, or memory-retrieval path.

## Commands

```bash
node SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_candidate_lifecycle.js
node SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_workspace.js
node SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_store_loop.js
node SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_memory.js
node SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_memory_view.js
node SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_learning_loop.js
node SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_core.js
node SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_store.js
node SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_view.js
node SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_candidate_contract.js
node --check SYSTEM/Views/reading-workspace-core.js
node --check SYSTEM/Views/reading-view.js
uv run SYSTEM/AI/Skills/prodigy-property-contract/scripts/audit_property_contract.py --vault . --format text
```
