# GPT Pro Architect Response 6

- date: 2026-08-01
- topic: `llmwiki-rethink`
- review gate: `PLAN`
- transport: Aside MCP, authenticated ChatGPT project conversation
- project: `Prodigy OS Making`
- conversation: `프로젝트 수정 검토`
- conversation url: `https://chatgpt.com/g/g-p-6a4b05e4c9a881919da91b28922095eb/c/6a5038a9-c6e8-83ee-ab4a-04fcc06a56e3`
- model evidence: ChatGPT UI Pro mode; response UI showed Pro processing
- prompt role: Codex rebuttal against the first project re-review

## Decision

`REVISE (PLAN only)`.

## Accepted contracts

- Deterministic read core: query/read does not call Candidate, writer, or promotion; AI does not own status, ranking, citation, or approval.
- Trust/state contracts: the five trust statuses, proposal kinds, `knowledge_state`, and `captured`/`metadata_only` are already sufficiently specified.
- Source separation: raw is excluded from default search; Source Archive owns immutable bytes; Literature owns interpretation; no forced raw → summary → candidate pipeline.
- Topology is a responsibility/data-layer ledger, not a linear write order; read projection is separate.
- AI proposes; human approval controls promotion.
- AutoRAG/OWNtology concepts are not global runtime requirements; OmniRoute remains feature-level optional.

## First-pass remaining items

- Make the Evidence → Pattern → Suggested Principle → Human Validation execution contract explicit.
- Make the Knowledge → Decision reuse path explicit.
- Place ontology proposal and application feedback in a named phase without deleting them.
- Remove unsupported names such as Reading Memory Projection, Memory Store, and PRE unless grounded in an existing contract.
- Document the Source Archive → Literature → Candidate/read-path relationship.

## Caution

The response still treated the first two items as blockers before the existing detailed PLAN tasks were reconciled. The next Codex round supplied those local plan references for final arbitration.
