# GPT Pro Architect Response 8

- date: 2026-08-01
- topic: `llmwiki-rethink`
- review gate: `PLAN`
- transport: Aside MCP, authenticated ChatGPT project conversation
- project: `Prodigy OS Making`
- conversation: `프로젝트 수정 검토`
- conversation url: `https://chatgpt.com/g/g-p-6a4b05e4c9a881919da91b28922095eb/c/6a5038a9-c6e8-83ee-ab4a-04fcc06a56e3`
- model evidence: ChatGPT UI Pro mode; response completed after 55 seconds of processing
- prompt role: re-audit of the prior PLAN-only approval against the actual draft and plan artifacts

## Split verdict

- Conceptual direction: `APPROVE`
- Actual plan artifact: `BLOCK`
- Implementation start: `BLOCK`

## Contracts retained

- Deterministic read model, write=0 query path, and AI non-ownership.
- Five trust statuses, proposal kinds, `knowledge_state`, and `captured`/`metadata_only`.
- Source Archive immutable bytes versus Literature interpretation ownership; raw excluded from default search.
- Candidate → human approval → Knowledge promotion.
- Evidence → Pattern → Suggested Principle → Human Validation.
- Topology ledger is a responsibility/data-layer map, not an automatic write lifecycle.
- OmniRoute is a feature-level optional provider, never a global runtime requirement.

## Actual blockers

1. The rethink draft says feature-level `direct|omniroute`, while the actual plan TL;DR and Must-have section still require all AI consumers and LLMWiki to migrate to pinned OmniRoute. This is a direct scope contradiction.
2. The draft points to `.omo/plans/prodigy-ai-gateway-llmwiki-rethink.md`, but that plan file does not exist. The existing plan is one XL gateway + LLMWiki artifact, so execution would follow the wrong scope.
3. The draft marks C1–C9 active while the agreed phase boundary moves ontology/application feedback and external-repository concepts to Phase 2. The component statuses and phase definition must be reconciled.
4. The existing 48-Todo, 7-wave plan combines OmniRoute infrastructure, Tailscale, Journal privacy, all AI callers, LLMWiki, and manual QA into one completion unit, violating the separation of LLMWiki deterministic core and optional provider infrastructure.
5. The existing plan requires nine persisted Property/enum expansions although the rethink draft says existing Object contracts should be reused and new persisted properties require separate contract review. This is a schema-governance blocker, not a naming issue.
6. `PRE` remains in the plan, and `source_url`/`final_url` remains unresolved; these are contract-drift signals.

## Recommended structure

Split the plan into two artifacts:

- `LLMWiki Plan`: source/archive, projection, deterministic retrieval, citation, trust/query contract, bounded proposal, human approval boundary, and synthetic validation.
- `AI Gateway Plan`: OmniRoute, provider selection, sidecar/Tailscale, routing, retry ownership, Journal privacy, and gateway rollout.

They may share a provider interface, but neither plan is a completion prerequisite for the other.

## Phase boundary

- Phase 1: source/archive and deterministic read core, bounded proposals, existing Candidate/human approval path, service boundary, synthetic validation, and feature-level provider selection without global migration.
- Phase 2: ontology refinement, LLMWiki-driven application-feedback refinement, and selective external-repository concepts.

The existing draft’s C5 combines Candidate/canonical approval with application feedback and therefore must be split by responsibility rather than deferred wholesale: the existing human approval boundary remains Phase 1; the feedback-driven refinement loop is Phase 2.

## External placement

- AutoRAG: Phase 2 retrieval refinement.
- OWNtology-Kit: Phase 2 ontology refinement and proposal patterns.
- AutoRAG-Research: Phase 2 experiment/metric vocabulary; synthetic baseline metrics may be used in Phase 1 without importing the runtime.
- OmniRoute: optional per-feature provider; separate gateway plan; no global migration.

## Required before implementation

- Choose the split plan structure and create the actual rethink plan artifact.
- Remove the global OmniRoute migration language from the LLMWiki scope and keep provider work separate.
- Reconcile actual component IDs and Phase 1/2 statuses, splitting Candidate approval from application feedback.
- Put every new persisted Property/enum behind an explicit contract review; do not assume the existing nine-property expansion is approved.
- Remove unsupported abstractions such as `PRE`/`Memory Store` and resolve `source_url`/`final_url`.

## Prohibitions

No global OmniRoute mandate, AI Knowledge writes, raw → summary → candidate pipeline, unsupported layers, unreviewed persisted properties, or combined gateway + LLMWiki completion gate.
