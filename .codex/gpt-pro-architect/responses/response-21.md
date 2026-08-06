# GPT Pro Architect Response 21

- date: 2026-08-02 Asia/Seoul
- gate: PLAN
- packet: `packets/packet-7.md`
- transport: Codex in-app browser, existing authenticated `Prodigy OS Making` conversation
- conversation: `https://chatgpt.com/g/g-p-6a4b05e4c9a881919da91b28922095eb-prodigy-os-making/c/6a6dfe26-f208-83e8-b090-2ee0b085d273`

## Final decision

`Decision: APPROVE`

`FINAL_PLAN_VERDICT: APPROVE`

The architect identified the real blocker as identity resolution, not provider count. The package is not useful when providers do not share a canonical understanding of the same property.

## Normative specification

### Canonical pipeline

`Auction Object → readAuctionObject() → normalize input → canonical identity resolution → provider query identity → provider execution → returned-identity verification → package → candidate patch`

Identity levels are separate:

- case: `court_code`, `case_number`
- parcel: `pnu`, legal parcel
- building: apartment/complex/building
- unit: building and unit

Automatic resolution is allowed only when an existing canonical identifier or a provider candidate is unique and every required identity field exactly matches. Court candidates, parcels, apartment complex/building/unit candidates, road-to-parcel ambiguity, parcel-to-building ambiguity, and multi-parcel cases require explicit selection. `1905호` is always a unit suffix, never a parcel number.

Every provider must verify that the returned identity equals the selected identity. On mismatch, preserve raw data but set `status: failed`, `reason: identity_mismatch`, and do not create a candidate patch.

### Provider contracts

| Provider | Query identity | Automatic rule | Selection path |
| --- | --- | --- | --- |
| Court | `court_code + case_number` | exact one-to-one | court code selection/input |
| Building | 19-digit PNU | valid unique PNU | PNU selection |
| Transactions | canonical address or selected building plus proxy policy | exact match only | target selection and policy confirmation |
| Official price | PNU or complex/building/unit | exact match only | apartment selection |
| Land price | PNU or lot parcel | exact match only | parcel selection |

### Package contract

Do not expand Auction schema. Add package-only `match_resolution` containing:

- `schema_version`
- `normalized_input`
- `resolution_method`
- `selected_identity`
- minimal `candidate_list`
- `provider_query_identity`
- `query_fingerprint`
- `match_verified`
- `evidence_refs`

This explains why each provider used its identifier without writing it into the Auction Object.

### UI and security

The flow is: investigate → package hash verification → provider status → `식별 정보 필요` or `대상 선택 필요` → copy a retry command containing the selected values → provider execution → evidence → candidate diff → explicit approval writer.

Transactions may expose an explicit proxy opt-in only in the copied command, such as `PRODIGY_REAL_ESTATE_ALLOW_PROXY=1`. The UI does not persist environment variables; the package records only `transport: direct|proxy`, never secrets.

Keep raw sources, SHA-256, immutable packages, existing approval writer, lifecycle, protected fields, Region Metrics, user judgment, outcome rules, recommendation/ranking prohibitions, and no direct network/process execution from Obsidian.

### Exact implementation map

- add `SYSTEM/SCRIPTS/real-estate-source-identity-core.js` with `normalizeAuctionIdentity()`, `parseCanonicalAddress()`, `resolveIdentity()`, and `verifyReturnedIdentity()`;
- modify `SYSTEM/SCRIPTS/real-estate-source-collect.js` so `readAuctionObject()` and `liveProvider()` use canonical query identities;
- modify `SYSTEM/SCRIPTS/real-estate-source-package-core.js` and `writePackage()` to persist `match_resolution`;
- modify `SYSTEM/Views/auction-real-estate-research-core.js` for matching projection, retry command construction, and explainability;
- modify `SYSTEM/Views/auction-real-estate-research.js` for identifier/selection/proxy states and retry UX;
- leave `SYSTEM/Views/auction-source-approval-writer.js` behavior unchanged and cover it with regression tests;
- document the package contract in `SYSTEM/docs/Real_Estate_Source_Package_Contract_v1.md`.

### Required tests and QA

Test exact/ambiguous/mismatched court, existing/unique/multiple/invalid PNU, proxy disabled/enabled, multiple transactions, exact/ambiguous official-price unit, road/lot/mountain/multi-parcel land, `1905호` regression, package hash/stale/tamper, partial success, UI retry/selection/explanation, protected fields, and unchanged Approval Writer/Lifecycle/Region/DecisionPacket behavior. Manual Obsidian QA must cover court auto match, court selection, apartment selection, unit preservation, multi-parcel, proxy disabled/enabled, partial success, identity mismatch, and approval with protected fields unchanged.

## Required changes and risks

- `IMPLEMENTATION_DEFECT`: no shared canonical identity, land parser misreads unit suffix, transaction policy and identity are conflated, package lacks durable matching record, and UI lacks identity resolution.
- `EVIDENCE_GAP`: audit the locked k-skill commit's actual candidate schemas, court candidate source, address-to-PNU capability, apartment candidate shape, and multi-parcel support before assuming them.
- `SCOPE_RISK`: do not expand Auction schema, create a generic matching engine, use fuzzy/first-result matching, run network from UI, enable proxy by default, or auto-approve.

The architect's next conformance evidence request is provider capability audit, automatic/selection/failure `match_resolution` fixtures, the `1905호` regression, all five provider fixtures, hash/immutable package verification, the complete retry flow in Obsidian, and protected-field/approval-writer regression proof.
