# Architect Packet 9

## Metadata

- repo: Prodigy OS Obsidian Vault
- branch: `codex/journal-codex-exec`
- packet date: 2026-08-02 Asia/Seoul
- previous packet: `packet-8.md` / `response-22.md`
- gate: `IMPLEMENTATION_CONFORMANCE`
- continuous execution: true
- commit/push/release: not requested and not performed

## Scope and authority

The user authorized implementation after GPT review. This packet contains redacted source/test evidence only. No secrets, API keys, personal notes, Auction/Daily bodies, live provider calls, or Object/Daily writes are included.

## Implemented conformance

- Shared package gate: `canApplyCandidatePatch()` is implemented in `SYSTEM/SCRIPTS/real-estate-source-package-core.js`, used by package validation, `SYSTEM/Views/auction-real-estate-research.js`, and `SYSTEM/Views/auction-source-approval-writer.js`.
- Partial success remains allowed: verified Court candidates are preserved when Building, Transactions, Official Price, or Land Price fails; only a field with a verified provider source is selectable/applicable.
- Exact identity is fail-closed for Court case+court code, Building PNU, Official Price PNU or apartment complex/apt/dong/ho, Land PNU or canonical parcel address, and Transactions lawd code/query.
- `readAuctionObject()` preserves identifiers as strings; a 19-digit PNU regression test passes.
- Fixtures use the same returned-identity verification path as live results.
- `query_identity.object_fingerprint` is written from the pre-selection Auction identity and rechecked against the current frontmatter immediately before approval.
- `match_resolution` and `candidate_sources` are required for valid packages. Candidate values reject structured, boolean, negative, and multiline values.
- Unit-only lot inputs such as `1905` are rejected as parcel queries; `1905호` remains a unit identity.
- Package observed time, object/raw paths, raw size, sensitive fields, and provider error output are bounded/validated; child environment and Node override are restricted; proxy is explicit per run; copied retry values use POSIX quoting; Transactions exposes `lawd_cd` selection.
- Obsidian runtime loads the Node-side package/identity cores through `SYSTEM/Views/real-estate-source-runtime.js` before the approval writer.
- UI projection is Korean-label based and filters candidate fields by exact verified provenance. Unresolved provider rows remain visible for selection/retry instead of becoming approval candidates.

## Automated evidence

- Targeted provider/package/identity/writer/research/runner suite: 38 tests pass in the latest combined run.
- Full Auction suite: 734 tests, 733 pass; one pre-existing failure remains in `test_auction_decision_packet.js` because the fixture expects `정보` while the current UI exposes `지역 정보`.
- JavaScript syntax checks pass for all changed runtime files.
- Regression coverage includes PNU string precision, missing returned identifiers, unit-only parcel rejection, unresolved candidate rejection, stale fingerprint, cross-object path rejection, raw tamper rejection, package hash change rejection, shell quoting, lawd code forwarding, proxy reset, unsafe Node override, partial success, and protected lifecycle fields.

## Manual/UI evidence and limitation

- Existing Obsidian fixture QA had already confirmed the card → `부동산 조사` modal, Korean projection, provider status display, and no Object/Daily mutation before this remediation.
- This remediation's changed UI seam is source- and DOM-contract covered: verified candidates are the only selectable rows, unresolved providers retain retry controls, and writer/validator independently block stale or unverified approval.
- A fresh live-provider or real mobile pass was not performed in this packet; no network smoke test was run. Provider capability breadth remains fixture evidence only.

## Required decision

Please review the implementation against `QA_REMEDIATION_SPEC` and return:

`Decision: APPROVE | REVISE | BLOCK`

`Gate reviewed: IMPLEMENTATION_CONFORMANCE`

Check especially:

1. the same candidate provenance rule is enforced by UI, validator, and writer without an all-provider-success gate;
2. fingerprint and exact path checks occur before approval;
3. the runtime loader makes the shared Node contract available to the Obsidian dashboard;
4. fixture parity, partial-success preservation, protected fields, and security boundaries are sufficient;
5. identify any concrete remaining blocker separately from evidence gaps or deferred scope.
