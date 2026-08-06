# Architect Packet 8

## Metadata

- repo: Prodigy OS Obsidian Vault
- branch: `codex/journal-codex-exec`
- current commit: `3de0e05d615cdc3f4056d8fb4c289fd72915ed8c`
- packet date: 2026-08-02 Asia/Seoul
- previous packet: `packet-7.md` / `response-21.md`
- review gate: `QA_REMEDIATION_SPEC`
- continuous execution: true
- terminal gate: `IMPLEMENTATION_CONFORMANCE`

## Approval Scope

- destination: existing ChatGPT Project `Prodigy OS Making`, exact conversation reused
- data categories: redacted repository paths, implementation summaries, review findings, named test results
- excluded: secrets, `.env` values, credentials, personal notes, Auction/Daily bodies, live provider calls
- authority: user explicitly authorized GPT review followed by full in-scope implementation and QA
- excluded authority: commit, push, release, permission changes, destructive Object/Daily writes, unapproved proxy activation

## Goal

Make the five-provider real-estate investigation useful by ensuring every result is tied to the same Auction Object through canonical identity. No ambiguous or mismatched provider result may create or apply a candidate patch. The Obsidian flow must explain the state and allow explicit selection/retry without exposing secrets.

## Current implementation evidence

- Prior GPT PLAN decision: `APPROVE` in `responses/response-21.md`.
- Targeted real-estate tests: 26/26 pass.
- Full Auction suite: 723 total, 722 pass, one pre-existing `test_auction_decision_packet.js` failure caused by `정보` versus `지역 정보`.
- Actual Obsidian card/modal QA was previously completed with a temporary fixture; no Auction Object or Daily was changed.
- Fresh local review found the following reproducible implementation defects.

## Findings requiring adjudication

### P0 implementation defects

1. A package with one matched provider and another `needs_selection`/`failed` provider still receives a non-empty `candidate_patch`. The UI blocker is displayed but the approval path and existing writer do not enforce the global gate.
2. Exact identity is not fail-closed in all cases: missing returned court code, missing returned PNU, missing apartment dong/ho code or name, and some land PNU cases can be accepted through weaker address/name fallback.
3. `readAuctionObject()` converts numeric-looking identifiers to `Number`, losing precision for 19-digit PNU and possibly court/dong/ho codes.
4. A fixture provider result can be marked matched without running the same returned-identity verification used by live providers.
5. A package is hash-checked but not re-matched to the current Auction Object identity immediately before approval.
6. `lot_address: "1905"` can be treated as a land query even though `1905호` must remain a unit number.

### P1 package/security/operations findings

7. `match_resolution` is optional in package validation and patch value types are weak; malformed or identity-free packages can pass validation.
8. Child execution inherits the whole environment; npm install is not integrity-locked for the full CLI/transitive dependency tree; `PRODIGY_NODE_BIN` is an unrestricted override.
9. `observed_at` is used in filesystem paths without strict UTC/path-containment validation.
10. The copied retry shell command does not robustly escape shell metacharacters.
11. Proxy endpoint is configurable without a production allowlist, and inherited proxy enablement may survive an unchecked run.
12. Raw provider error bodies may be stored/displayed without bounded redaction.
13. Transactions candidate selection is not fully represented in the UI/runner (`lawd_cd` selection is incomplete).
14. No timeout/bounded retry or stale-result guard exists for slow provider/package responses.

## Proposed bounded remediation slices

1. Add a shared `canApplyCandidatePatch`/package validation gate and enforce it in collector, package validator, UI, and `auction-source-approval-writer.js`.
2. Make all requested canonical identifiers string-preserving and require returned identity presence plus exact equality; remove weaker fallback when a stronger identifier was selected.
3. Route fixture results through the same verification path and add negative fixtures for PNU/court/dong/ho/lot mismatch.
4. Store a canonical Auction identity fingerprint in package metadata and compare it to the current Object at read/approval time.
5. Validate lot syntax and reject unit-only values; keep PNU/parcel land resolution explicit.
6. Harden package schema/types, raw size/redaction, observed-at containment, proxy environment reset/allowlist, child environment allowlist, and safe retry command construction.
7. Add transactions regional candidate selection and bounded provider timeout/retry/stale response protection only within the existing package/UI boundary.
8. Add regression tests and repeat targeted/full tests plus actual Obsidian UI QA. Do not expand Auction schema, Region Metrics, user judgement, or automated approval.

## Decision Needed

Challenge this remediation list against the prior approved PLAN. Return one complete normative specification for the smallest safe implementation, explicitly classifying each finding as `IMPLEMENTATION_DEFECT`, `EVIDENCE_GAP`, or `SCOPE_RISK`. Confirm whether all P0 items are required before candidate approval, and identify any P1 item that should be deferred rather than silently expanding scope.

## Required Response Format

Decision: APPROVE | REVISE | BLOCK
Gate reviewed: QA_REMEDIATION_SPEC
Rationale:
Normative remediation specification:
- invariants and global approval gate
- exact identity rules by provider
- package and stale-object validation
- security/path/process boundaries
- UI/retry behavior
- exact file/symbol map
- automated test matrix
- manual Obsidian QA matrix
Required changes with classification:
Evidence that may remain automated-only:
Scope expansions rejected or justified:
Risks/missing evidence:
Next packet request:
