# GPT Pro Architect response 4

- transport: Aside MCP
- conversation title: `LLMWiki Plan Review`
- browser tab: `90351AB0AEB15C75EDD1B2FDE25A1B27`
- model evidence: ChatGPT UI showed `Pro`; generation UI showed `Pro 생각 중`
- review gate: `PLAN`

Decision: REVISE

Gate reviewed: PLAN

Rationale:

The draft establishes a strong boundary model (source/provenance, deterministic retrieval, human approval), but the proposed topology and layering introduce lifecycle inversions and contract collisions with the Constitution and Knowledge/Candidate/Literature schemas. The scope is also broader than required for a minimal Phase 1 and mixes gateway/provider concerns into the LLMWiki core plan.

Required changes:

See severity-ordered findings and corrected plan below.

Risks/missing evidence:

See section below.

Next packet request:

Submit a reduced Phase 1 plan with corrected topology, explicit read/write boundaries, and contract-aligned interfaces only (no ontology persistence, no provider routing implementation).

## Severity-ordered findings

### BLOCKER 1 — Topology violates Prodigy Knowledge lifecycle (authority + order inversion)

Where:

- `.omo/drafts/prodigy-ai-gateway-llmwiki-rethink.md` topology
- `01-llmwiki-rethink`
- Constitution lifecycle
- `02-constitution`

Issue:

Draft topology:

`source → ontology → knowledge → evidence → retrieval`

Constitution lifecycle:

`Experience → Evidence → Pattern → Suggested Principle → Human Validation → Knowledge`

This is not a minor mismatch—it inverts authority:

- Evidence is upstream input to Knowledge, not downstream “application”
- Ontology proposal is a pattern/projection stage, not a required path before Knowledge
- Retrieval is not a terminal stage; it is a read-layer over verified knowledge + sources

Impact:

- Breaks Evidence Before Principle rule
- Confuses Knowledge creation vs Knowledge usage
- Risks treating ontology as precondition for knowledge (violates Human Validation gate)

Classification: Plan defect (must fix before approval)

### BLOCKER 2 — Ontology layer risks becoming implicit authority Object

Where:

- C2, ontology proposal layer
- `01-llmwiki-rethink`
- Candidate + Object Model
- `06-knowledge-candidate-schema`
- `03-object-model`

Issue:

Draft claims:

“새 권위 Object는 만들지 않음”

But it:

- introduces entity/link/decision/preference projection
- introduces ontology layer as persistent conceptual layer
- introduces approval ledger concept

This risks:

- becoming a shadow Object system
- duplicating Candidate + Knowledge responsibilities

Impact:

- Violates Object First (only Objects are assets)
- Risks hidden state outside Object lifecycle
- Breaks “SSoT = Property” principle

Classification: Plan defect

### BLOCKER 3 — Retrieval positioned as downstream of knowledge creation

Where:

- topology + flow diagram
- `01-llmwiki-rethink`

Issue:

Retrieval is placed after:

`knowledge → evidence → feedback → evaluation`

But Trust Contract defines:

- retrieval = read-only deterministic layer
- query must NOT trigger Candidate/Knowledge mutation

`08-llmwiki-trust-contract`

Impact:

- Blurs read vs write boundary
- Risks retrieval depending on feedback loop state
- Violates “query has no side effects”

Classification: Plan defect

### BLOCKER 4 — Provider (OmniRoute) concerns leak into LLMWiki core plan

Where: C8 + provider section in `01-llmwiki-rethink`

Issue:

Provider routing is:

- orthogonal to LLMWiki trust model
- unrelated to knowledge lifecycle

The draft mixes:

- retrieval correctness
- provider routing
- retry ownership

Impact:

- Violates Simplicity First / Architecture separation
- Expands blast radius of LLMWiki changes
- Creates false coupling: “LLMWiki readiness ↔ provider routing”

Classification: Plan defect (scope contamination)

### HIGH 5 — Source → projection rule conflicts with Literature contract

Where:

- raw excluded from search, projection-only corpus
- `01-llmwiki-rethink`
- Literature schema
- `07-literature-source-schema`

Issue:

The draft says raw source is excluded from the corpus and only the projection is used. But:

- Literature note is already the approved projection layer
- storing extraction artifacts risks duplicating the “본문 금지” rule

Impact:

- Introduces a parallel projection system
- Risks violating “no full-text duplication”

Classification: Plan defect (duplicate abstraction)

### HIGH 6 — “evidence/application” conflates two different concepts

Where: topology + components in `01-llmwiki-rethink`

Issue:

Evidence is input to knowledge; application is usage of knowledge. The draft merges them as `evidence/application`.

Impact:

- Breaks lifecycle clarity
- Makes feedback loop ambiguous
- Risks mixing evaluation signals with raw evidence

Classification: Plan defect

### MEDIUM 7 — Evaluation layer lacks contract grounding

Where: C7, C9 in `01-llmwiki-rethink`

Issue:

The draft introduces metrics such as MRR and nDCG but does not bind them to Trust Contract outputs. The Trust Contract defines status enum and citation correctness.

Impact: evaluation may drift from the actual correctness definition.

Classification: Evidence gap

### MEDIUM 8 — Source lineage ambiguity (`final_url` vs `source_url`)

Where:

- draft assumptions
- archive schema
- `09-source-archive-schema`

Issue:

- draft references `final_url`
- schema only defines `source_url`

Impact:

- Provenance inconsistency
- Potential duplicate lineage tracking

Classification: Plan defect (contract mismatch)

### MEDIUM 9 — Knowledge state expansion risk

Where:

- mention of superseded/outdated handling
- Trust Contract

Issue:

- draft suggests new states indirectly via projection
- Explorer compatibility is not defined

Classification: Plan defect (premature extension)

## Minimal corrected topology (required)

Replace the linear topology with a two-axis model.

### 1. Write lifecycle (authoritative)

`Experience → Evidence → Candidate (AI propose) → Human Approval → Knowledge (canonical)`

From the Constitution (`02-constitution`).

### 2. Read system (LLMWiki core)

`Knowledge + Literature + Source Archive → Deterministic Retrieval (scope + ranking + citation) → Trust Envelope (answer | conflict | no_verified_answer | stale | unavailable) → Optional AI summarizer (no authority)`

From the Trust Contract (`08-llmwiki-trust-contract`).

### 3. Optional supporting layers (non-core)

- Ontology → read-only projection only
- Evaluation → offline / synthetic only
- Feedback → Evidence creation trigger only

## Corrected phase cut (mandatory)

### Phase 1 (only)

- Deterministic retrieval over `knowledge`
- `permanent_note`
- `literature_note` as citation
- Trust envelope output
- Source archive linkage using the existing contract

### Phase 2 (optional)

- Ontology projection (read-only)
- Feedback signals

### Phase 3 (optional)

- Evaluation matrix

### Phase 4 (separate plan)

- Provider routing (OmniRoute)

## Concrete corrected plan outline

### Task 1 — Retrieval core

Path: `SYSTEM/Services/llmwiki-retrieval.js`

Interface: TypeScript `query({ scope, query_text }) → LLMWikiTrustEnvelope`

Test:

- given conflicting knowledge → returns `conflict`
- no knowledge → `no_verified_answer`

Acceptance:

- no file writes
- deterministic ordering

Rollback: disable service → fallback to existing explorer

### Task 2 — Corpus definition

Path: `SYSTEM/Contracts/llmwiki-corpus.md`

Rule:

- include: knowledge, permanent_note
- exclude: candidate, ontology

Acceptance: matches Knowledge Explorer contract (`05-knowledge-explorer-schema`).

### Task 3 — Source citation binding

Path: `SYSTEM/Services/llmwiki-citation.js`

Rule:

- citation must reference `knowledge_path` or `literature_note`
- must map to archive if it exists

Acceptance: passes `claim_id → citation` validation (`10-llmwiki-contract`).

### Task 4 — AI summarizer (optional)

Constraint: cannot modify ranking, citation, or status.

Acceptance: removing AI still yields an identical envelope.

### Task 5 — Ontology (deferred)

Restriction:

- no persistence
- no Object creation

### Task 6 — Provider separation

Move out of this plan to `.omo/plans/prodigy-ai-gateway-provider-routing.md`.

## OmniRoute decision (explicit)

Keep:

- feature-level `direct | omniroute`

Remove from the LLMWiki plan:

- retry ownership
- fallback semantics
- qualification

Reason: provider routing is a transport layer, not a knowledge system layer.

## Risks / Missing evidence

1. Retrieval correctness proof missing: no test demonstrating stable ranking and deterministic behavior.
2. Citation fidelity not validated against archive: no end-to-end `knowledge → source → archive hash` check.
3. Synthetic benchmark validity unclear: no definition of gold locator format or pass/fail criteria.
4. Ontology usefulness unproven: conflicts with Real Usage First (`02-constitution`).

## Next packet request (smallest)

Submit `.omo/plans/prodigy-ai-gateway-llmwiki-phase1-core.md`.

It must include only:

- Retrieval contract
- Corpus definition
- Trust envelope integration
- Citation binding

It must exclude:

- ontology
- evaluation
- provider routing

## Final assessment

This is a strong conceptual draft, but:

- topology is incorrect for Prodigy lifecycle
- scope is too wide
- boundaries are blurred between read/write/provider layers

Fix those three, and the plan becomes clean, minimal, and executable.
