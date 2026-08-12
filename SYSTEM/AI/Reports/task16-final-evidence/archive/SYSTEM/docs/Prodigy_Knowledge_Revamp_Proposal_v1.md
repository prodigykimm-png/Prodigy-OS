# Prodigy Knowledge Revamp Proposal v1

## Status

- Proposal status: `ready`
- User placement decision: `fourth_tab`
- Current WP1 state: `implementation_ready`
- Placement contract: `user_choice: fourth_tab`, `decision_status: accepted`, `blocking_wps: []`
- Current valid placement choices: `fourth_tab`, `embedded_region`
- Standalone: comparison-only; requires f11 renegotiation, schema/version bump, and replan.
- Human-first rule: this document records the user's choice; implementation and gates remain constrained by the accepted contract.

## Placement comparison

| Option | Mount ownership | Benefits | Costs / risks | Current status |
|---|---|---|---|---|
| Fourth Knowledge tab | `knowledge-workspace-tabs.js` owns `llmwiki` and `llmwiki-browse`; `HUB/50 Knowledge.md` mounts both | Separates read/browse from run/review lifecycle; clear focus and scroll ownership; reversible | Four-tab responsive coverage at 375/768/1024px and 200% zoom | **Accepted; implementation path** |
| Embedded read-only region | Existing `llmwiki` panel owns lifecycle and a distinct `llmwiki-browse` region | Fewer tab actions; keeps related knowledge work together | Requires separate focus, scroll, loading, and error ownership; must not obscure consent/review | Not selected |
| Standalone workspace | Registry/launcher/HUB route would own `llmwiki-browse` | Independent surface and full-screen room | Requires workspace switch, violates fixed f11 one-screen/few-click criterion | Non-compliant and non-selectable in v1 |

The user accepted `fourth_tab` after the placement comparison. WP1 may implement the four-panel mount; standalone remains comparison-only and cannot unblock or alter this plan.

## Candidate proposal

| Proposal item | Current evidence | Proposed contract | Gate disposition | Priority |
|---|---|---|---|---|
| Candidate title/detail split | `SYSTEM/AI/Skills/prodigy-daily-reflection/references/response-schema.json` knowledge_candidates currently requires `label`; `SYSTEM/Views/daily-reflection-knowledge-handoff.js` falls back to statement | New rows carry `title`/headword + `detail`; legacy rows retain label-only storage/read compatibility; deterministic normalization rejects title=statement duplication | Preserve Evidence Gate, Human Review Gate, Knowledge Approval | P1 |
| Taxonomy pair safety | `SYSTEM/Views/knowledge-candidate-core.js` rejects invalid topic/domain combinations | Normalize both-empty or registry-valid domain+topics; candidate-level Korean recovery; never pass independently optional invalid pairs | Preserve existing candidate validation | P1 |
| Existing candidate compatibility | f24 decision in the approved plan | New shape only for new rows; existing sentence rows remain readable/approvable; no migration/write | Preserve legacy bytes and approval path | P0 |

## Recovery proposal

All provider, source, snapshot, stale-read, malformed-response, and taxonomy failures must use the existing Korean recovery contract. The UI must not expose raw provider payloads, secrets, transport internals, or contract stack details. Every recovery state names a safe next action: retry, refresh, supplement evidence, or return to the previous read-only state.

## Knowledge Workspace UX proposal

The proposal artifact schema requires every improvement item to carry:

- stable `id`
- `current_screen` and cited file/symbol evidence
- observed route steps/count
- proposed route steps/count
- proposed change and expected effect
- priority `P0`–`P3`
- gate disposition, owner, dependencies, decision status, and lifecycle status

The acceptance route is one screen and no workspace switch. Candidate review, search, browse, loading, empty, stale, and recovery paths are counted explicitly; recovery actions are not hidden in the total.

## General improvement catalog scope

Explore only user-facing `SYSTEM/Views` and `HUB` mount surfaces. Each catalog entry must include evidence, effect, priority, owner/dependencies, and gate disposition. Collection pipelines, Region rebuilds, automatic architecture changes, and automatic approvals are explicit exclusions.

## Canonical citations

- `main:SYSTEM/AI/Skills/prodigy-daily-reflection/references/response-schema.json#L36-L47@knowledge_candidates`
- `main:SYSTEM/Views/daily-reflection-knowledge-handoff.js#L1-L80@handoff`
- `main:SYSTEM/Views/knowledge-candidate-core.js#L159-L163@validateCandidate`
- `main:SYSTEM/Views/knowledge-workspace-tabs.js#L1-L40@TABS`
- `main:HUB/50 Knowledge.md#L1-L124@dataview_mount`
- `main:DESIGN.md#L1-L200@ui_contract`
## Knowledge Workspace Walkthrough

`SYSTEM/docs/Prodigy_Knowledge_Workspace_Walkthrough_v1.json` is the enforceable route record for `candidate-review`, `wiki-search`, and `wiki-browse`.

- Counting starts after the Knowledge workspace is open.
- Activations, submitted text entries, facet changes, tab/panel transitions, result/detail selection, approval, back, retry, and refresh each count once.
- Focus movement and automatic rendering count zero.
- Recovery routes are separate from happy-path totals.
- Candidate review is proposed at 3 actions; search at 3; browse at 4.
- All routes declare zero workspace switches. The accepted LLMWiki routes use the fourth-tab mount; standalone is not inferred or accepted under f11.
- The artifact records screen identity, visible controls, keyboard equivalents, citations, owner/dependencies, priority, gate disposition, and recovery route for each path.
