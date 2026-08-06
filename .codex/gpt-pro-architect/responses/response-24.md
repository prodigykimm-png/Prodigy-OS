# Round 24 — LLMWiki productization and usability plan

- Date: 2026-08-02 Asia/Seoul
- Gate: `PLAN`
- Project: `Prodigy OS Making`
- Conversation: `https://chatgpt.com/g/g-p-6a4b05e4c9a881919da91b28922095eb/c/6a5038a9-c6e8-83ee-ab4a-04fcc06a56e3`
- Packet: `../packets/packet-10.md`
- Authority: planning and architecture records only

## Initial architect review

`DECISION: REVISE`

The dedicated `LLM Wiki` tab was accepted, but it must own the complete proposal lifecycle rather than act as an embedded approval queue. The intended flow is source selection → run → progress → proposal review → approve/reject/preserve → canonical result and audit. `제텔카스텐` remains the human authoring/exploration surface, `PARA` remains the approved-knowledge use surface, and `LLM Wiki` becomes the AI proposal lifecycle surface. Beginner-facing Korean copy is primary; contract metadata is collapsed as advanced information. Phase 1 permits one active run.

## Codex challenge

Repository inspection found blocking trust and product-integration defects:

- `llmwiki-deterministic-commit.js` replays only `approve_selected` and `approve_all`; `edit_then_approve` is not commit-authorized.
- The writer validates caller-supplied hashes but does not derive or byte-bind target, properties, and `after_bytes` to the reviewed payload.
- `llmwiki-approval-review-commit.js` serializes reviewed payload JSON as canonical `after_bytes` and assumes empty `before_bytes`.
- The Hub renders only an injected `KnowledgeExplorerHub.approvalPacket`; there is no proven production run controller.
- The Node filesystem commit/refresh path is not proven to use the real Obsidian `app.vault` adapter.
- Unresolved-conflict approval, outbound consent, and capture side-effect idempotency require explicit gates.

## Challenge verdict

`CHALLENGE VERDICT: ACCEPT`

The architect accepted that trust reconciliation must precede UX expansion. Canonical commit remains preview-only until exact packet-to-target/property/bytes/hash binding is proved. Editing must create a new payload, diff, packet, and hash, followed by explicit user reconfirmation.

## Final accepted plan

1. **Wave 0 — Contract/evidence rebaseline**: classify stale or incomplete evidence, lock canonical writes to preview-only, separate source selection from outbound consent, block unresolved-conflict approval, and define capture idempotency by observable side effects.
2. **Wave 1 — Exact approval-to-write trust core**: read live canonical bytes/revision, create exact canonical Markdown through the existing schema/serializer, bind target/properties/bytes/hashes/provenance to the packet, reject mutation/target swap/property expansion/stale/replay, repacket edited proposals, and connect `app.vault` write plus derived refresh with Git writes disabled.
3. **Wave 2 — Minimum production vertical slice**: in the separate LLM Wiki surface, select one source, consent to outbound processing, run one create-only proposal, inspect exact diff/source/target, approve, commit exactly those bytes, refresh derived indexes, and show canonical path/audit. Provider failure, abstention, and stale state write nothing.
4. **Wave 3 — Dedicated lifecycle UX**: use three tabs `제텔카스텐 / PARA / LLM Wiki`; move approval out of Zettelkasten; give LLM Wiki empty, source-selection, progress, review, and result states; keep the current review view as a child component; use beginner-first Korean labels and responsive Obsidian QA at 375/768/1024.
5. **Wave 4 — Operation expansion**: after the create slice passes the same trust gate, add update, merge, partial approval, conflict resolution, evidence-more, and explicit fleeting/candidate preservation. Defer persistent history, Workspace Evidence handoff, multi-run/resume, and external adapters.

Todo 14 is redefined as a production integration gate, not a simple Hub mount. It must prove the production controller, exact reviewed-payload binding, real Obsidian writer/refresh, dedicated lifecycle tab, responsive manual evidence, and runtime trust tests. Existing synthetic stale fixtures remain component evidence only.

External repositories remain Phase 2 selective references or adapters: AutoRAG for retrieval/evaluation feedback, OWNtology-Kit for ontology proposal/refinement, AutoRAG-Research for research/evaluation workflow, and the three LLM Wiki projects for interaction/proposal patterns. No repository is vendored or granted canonical authority. OmniRoute remains optional per run/feature; direct provider is the default.

## Final architect verdict

```text
FINAL PLAN VERDICT: APPROVE
Gate reviewed: PLAN
Wave 0~1이 exact packet binding, repacket/reconfirm, app.vault writer·refresh 연결을 P0로 선행해 확인된 trust blocker를 닫는다.
Wave 2는 create-only production vertical slice로 축소되어 synthetic preview와 실제 제품 경로를 명확히 분리한다.
Todo 14가 Wave 0~3 및 독립 Obsidian E2E 증거까지 요구하도록 재정의되어 추가 blocker는 없다.
canonical write는 exact packet-to-target/property/bytes binding 전까지 preview-only인지: YES
별도 LLM Wiki lifecycle 탭을 유지하는지: YES
Implementation authority: PLAN only; no code, canonical write, commit, push, release
```

One off-scope response concerning a Reading/Capability Promotion Rule was rejected and excluded from the plan.
