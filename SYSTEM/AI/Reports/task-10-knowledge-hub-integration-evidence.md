# Task 10 — Knowledge Hub authoring integration evidence

Date: 2026-07-21

## Scope

- Added the non-persistent Knowledge Hub action mount and adapter.
- Wired the completed direct, single-source, and batch-source authoring views with explicit validation, Candidate/Source stores, retrieval, AI provider, and provider-config dependencies.
- Kept the action mount outside the Explorer model; opening a view performs no save, approval, or automatic write.

## Static verification

Passed:

```text
node --check SYSTEM/Views/knowledge-authoring-hub-adapter.js
node SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_direct_authoring_view.js
node SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_source_authoring_view.js
node SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_source_batch_view.js
node SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_source_batch_service.js
node SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_hub_integration.js
```

The Hub integration fake-mount test verifies both Hub actions, the single/batch chooser paths, no Explorer total mutation, and no navigation/write action merely from opening authoring UI.

## Obsidian visual QA

- Opened `HUB/50 Knowledge.md` in Obsidian 1.12.7.
- Confirmed visible Korean actions: `+ 지식 작성`, `+ 자료 정리`.
- Opened and safely dismissed the direct authoring modal, then the material chooser, single-material authoring form, and batch-material form.
- Confirmed the original Hub action bar and domain counts remained visible after each close.
- Did not enter content or activate save, approval, retrieval, or AI controls.

Verdict: **PASS WITH LIMITATION** — desktop primary paths and accessibility names were observed; a deliberately narrowed desktop window and physical mobile device were not exercised.

---

# Task 10 refresh — batch approval/archival remediation (2026-08-26)

## Scope of this refresh

Resumed and completed the preserved shared-workspace diff for the
`llmwiki-batch-core-simplification` Task 10 remediation (batch adapter,
write boundary, risk write set, processed-source service). No prior partial
edits were discarded; no Hub/manifest/controller/UI files were touched.

Final state of the remediation contract:

1. No custom `llmwiki_batch_approval_selection_v1` mint and no direct
   canonical `vault.writeExact` path outside the retained chain: every
   selected operation is branded into a retained `LLMWikiRiskApprovalPacket`,
   authorized via `LLMWikiSafeBatchApproval.authorizeExactBatch` /
   `LLMWikiApprovalReviewCommit.authorizeRiskPacket`, and applied only via
   `commitExactBatch` / `commitRiskApproved` with real audit receipts and
   branded writer-core compensation.
2. Canonical write-boundary policy (`llmwiki-write-boundary-policy.js`) and
   risk write-set allowlists (`llmwiki-risk-write-set.js`) extended additively
   to `ZETA/LITERATURE/` and `ZETA/CANDIDATES/`; `ZETA/PERMANENT/` rules are
   unchanged (covered by `test_llmwiki_write_boundary_lifecycle_prefixes.js`).
3. Full operation binding: kind, destinations, before revisions+bytes and
   after bytes are bound into the retained authorization via packet hashes;
   apply re-verifies exact group payload (`verifyGroupBinding`) and rejects a
   tampered group with zero writes. ORIGINAL-authorized / TAMPERED-group
   regression included in the focused suite.
4. Partial multi-destination failure compensates through the retained chain;
   no stray target remains and replay is retryable.
5. Processed post-write readback mismatch quarantines only the newly created
   bad destination, preserves the source byte-identically, and stays
   retryable; destination conflict/drift fail closed unchanged.
6. Map live-read bug and dead assess helper removed during the partial pass;
   verified absent in the final adapter.
7. Canonical commits produce nonzero exact `audit_writes`/receipts
   (per-operation receipts + one batch record); replay yields duplicate
   statuses with zero additional writes.

## Verification

```text
node --check  # all five touched modules + test file: syntax OK
node --test SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_llmwiki_task10_batch_approval_archival.js
  -> tests 19, pass 19, fail 0
node --test (boundary/risk-write-set/task9/task10-update/approval-packet/
             compensation/deterministic-commit/merge-transaction/writer-core)
  -> tests 60, pass 60, fail 0
node --test (risk-approval + risk-production-integration + knowledge-audit)
  -> tests 20, pass 20, fail 0
node --test safe-batch/approval/deterministic-commit/compensation/transaction
  -> tests 46, pass 46, fail 0
```

Manual disposable-vault scenario (in-memory exact-write vault, fault
injection), observed counters:

- approve2of3: 2 canonical writes, touched exactly the two create
  destinations + 3 audit records (2 per-op + 1 batch); update left untouched
  and reviewable; source kept in INBOX.
- tamper after authorize: rejected `tampered_group_payload`, 0 writes,
  0 touched paths; ORIGINAL group still applies fully against the same
  authorization.
- mid-batch injected write fault at physical write #3: both rows report
  `failed`, compensation deleted the one landed create (deletes=1), existing
  candidate bytes preserved, healthy-vault retry commits fully.
- processed readback corruption: `processed_write_verification_failed`,
  quarantined=true, bad Processed destination removed, source preserved,
  immediate retry archives byte-identically touching only the expected two
  paths; archived replay reports `duplicate` with zero extra writes.

## Known out-of-scope failures (pre-existing, not caused by this diff)

`test_llmwiki_task15_production_audit.js` (6 P1 cases) and
`test_llmwiki_compensation_production_route.js` (Hub route case) fail on the
current workspace independent of Task 10 changes — none of them reference
any Task 10 module, and they exercise production provider/Hub surfaces that
this remediation is explicitly barred from modifying. Tracked separately.

Verdict: **REVISED_DONE** for the Task 10 batch approval/archival scope.
