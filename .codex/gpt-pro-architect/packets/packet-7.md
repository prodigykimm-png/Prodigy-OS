# Architect Packet 7

## Metadata

- repo: Prodigy OS Vault
- branch: `codex/journal-codex-exec`
- commit: `3de0e05d615cdc3f4056d8fb4c289fd72915ed8c`
- packet date: 2026-08-02 Asia/Seoul
- previous packet: `packets/packet-5.md`
- current goal: k-skill 부동산 5종 조사에서 식별자·주소·물건 단위 매칭을 완성하여, 조사 패키지가 실제 근거를 담고 사용자가 선택 승인할 수 있게 한다.
- review gate: PLAN
- continuous execution: true
- terminal gate: IMPLEMENTATION_CONFORMANCE
- execution authority: 사용자가 최종 GPT 결론 후 매칭·수집·패키지·UI·테스트·Obsidian QA 구현을 명시적으로 승인함
- excluded authority: commit, push, release, Vault Object/Daily 직접 수정, 비밀값 수집·전송, 무단 프록시 활성화
- stop conditions: 외부 검토가 지정한 구현 경계와 로컬 테스트·실제 Obsidian QA가 충족되면 종료; 새 권한·새 데이터 목적지·파괴적 변경은 중단

## Approval Scope

- destination: 기존 인증된 ChatGPT Project `Prodigy OS Making` 대화
- transport: Codex in-app browser, exact existing conversation reuse
- data categories: redacted repository architecture, selected source snippets, package status summaries, tests, implementation plan
- excluded: `.env`, API keys, credentials, private notes, actual Object/Daily bodies, unrelated dirty files, external provider response bodies

## User requirement

사용자는 “법원경매, 건축물대장, 실거래가, 공시가격, 개별공시지가가 매칭되지 않으면 조사 패키지가 무슨 의미인지 모르겠다”며, GPT 검토 후 최종 결론으로 구현까지 진행하도록 요청했다.

## Existing repo contract

- Selected k-skill commit: `06d017ac05317da31ab2c8d6a9accf4ad4db70ad`
- CLI: `@nomadamas/k-skill@0.2.2`
- Selected skills: court-auction-notice-search, building-register-search, real-estate-search, housing-official-price, gongsijiga-search
- Package contract: `SYSTEM/SCRIPTS/real-estate-source-package-core.js`
- Collector: `SYSTEM/SCRIPTS/real-estate-source-collect.js`
- Research projection/UI: `SYSTEM/Views/auction-real-estate-research-core.js`, `SYSTEM/Views/auction-real-estate-research.js`
- Protected fields: `status`, `expected_bid`, `my_bid_price`, `decision_reason`, `my_opinion`; no automatic outcome from date passage; no automatic judgment or ranking.
- External data boundary: all providers write raw and normalized package evidence first; only explicitly selected candidate facts may pass through the existing approval writer.
- Proxy policy: direct official sources by default; k-skill proxy requires explicit opt-in through `PRODIGY_REAL_ESTATE_ALLOW_PROXY`.

## Observed current behavior

Recent package status summaries (redacted, status/warning only):

| provider | observed status | blocking reason |
|---|---|---|
| court | `success` in one case, `needs_identifier` in others | court office code is missing or not resolved from court name |
| building | `needs_identifier` | official lookup requires 19-digit PNU |
| transactions | `needs_identifier` | proxy opt-in is not enabled by policy |
| official-price | `needs_selection` | PNU or apartment complex/building/unit selection is missing |
| land-price | `failed` | address parser treats unit suffix such as `1905호` as a land lot number |

In the latest failed packages, all five provider branches were attempted and a package was written, but `candidate_patch` contained only normalized `region_sido`, `region_sigungu`, and `region_dong`. This is technically partial-failure preservation but not the user's intended useful investigation result.

## Current implementation facts

- `readAuctionObject()` reads case number, court, address, region, property type, PNU/land parcel fields, and building name when already present.
- `liveProvider()` currently passes court lookup only when a court code can be resolved, building direct lookup only with PNU, transactions only when proxy opt-in is set, official price only with PNU or a building-name selection path, and land price directly from the unparsed address.
- `writePackage()` correctly preserves raw responses, provider status, warnings, evidence, candidate patch, and errors, but does not currently include a durable match-resolution record explaining how each provider identity was selected.
- The UI currently displays partial package status and candidate diff, but has no interactive identity-resolution step for court code, PNU, apartment complex/building/unit, or land parcel.

## Design constraints

1. Do not write external evidence directly into Region Metrics or user judgment fields.
2. Do not invent a winning bid, outcome, or recommendation from a missing source.
3. Preserve raw source and SHA-256 integrity; stale/tampered packages cannot be approved.
4. A provider may be `success`, `empty`, `needs_selection`, `needs_identifier`, or `failed`; partial success must remain visible and retryable.
5. “Automatic” means automatic resolution from unambiguous existing Auction identity plus source lookup. Ambiguous apartment/unit or parcel matches must become explicit in-modal selection, not silent guessing.
6. Proxy use must remain explicit and auditable; no secret or API key may be persisted in package/log/UI.
7. Keep the existing approval writer and lifecycle/status contracts unchanged.

## Decision needed

Produce a bounded, coder-ready architecture for completing provider matching:

1. What canonical identity-resolution pipeline should run before providers?
2. Which identifiers may be derived automatically from an Auction Object, and which require user selection?
3. How should court code, PNU/land parcel, apartment complex/building/unit, and road-vs-lot address be represented in package/query identity without expanding the persisted Auction schema in the first pass?
4. How should explicit proxy opt-in be exposed without storing secrets?
5. What exact provider state machine and UI flow should turn `needs_identifier`/`needs_selection` into a retryable matching step?
6. What minimum files, tests, fixtures, and real Obsidian QA scenarios are required?

## Required response format

Decision: APPROVE | REVISE | BLOCK
Gate reviewed: PLAN
Rationale:
Normative implementation specification:
- identity-resolution pipeline
- provider adapter contracts
- package schema additions (if any)
- UI/state flow
- security and approval boundaries
- exact file/symbol map
- automated test matrix
- manual Obsidian QA matrix
Required changes:
Risks/missing evidence:
Next packet request:
