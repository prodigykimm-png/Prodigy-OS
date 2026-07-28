# Region Intelligence Source Contract v1

## Overview

This document defines the frozen source contracts for the Prodigy Region Intelligence system. It governs how official data providers are registered, validated, and gated before any network dispatch or Region Object mutation occurs.

The canonical machine-readable registry is `SYSTEM/SCRIPTS/region-source-registry.json`. The validation module is `SYSTEM/SCRIPTS/region-source-registry-core.js`. All schemas are in `SYSTEM/SCRIPTS/region-*.schema.json`.

## Provider Registry

The registry contains exactly **32 provider rows**. Each row carries:

- `provider_id` — unique ASCII snake_case or kebab-case identifier
- `status` — one of: `planned_enabled`, `blocked_coverage`, `blocked_fixture`, `disabled`, `accepted_legacy`, `candidate`, `manual`
- `canonical_source_url` — attribution/future-gate metadata (never an executable endpoint unless transport is frozen)
- `auth_placement` — where authentication credentials are placed
- `scope` — canonical measures and coverage description
- `cadence` — collection frequency
- `parser_version` — semver of the parser implementation
- `units` — measure-to-unit mapping
- `correction_semantics` — how corrections and enablement gates work
- `retention` — how many periods/releases are surfaced
- `license_url` — attribution URL
- `network_allowed` — boolean; only `true` for MOIS
- `fixture_policy` — one of five values (see below)
- `fixtures` — array of `{role, path, sha256}` objects sorted by role then path
- `fixture_missing_reason` — required non-null for `absent_blocked` and `manual_no_fetch`
- `transport` — closed object for MOIS, `null` for all zero-network rows
- `transport_missing_reason` — required non-null when `network_allowed:false`

## Provider Matrix Summary

| Provider | Status | Fixture Policy | Network |
|----------|--------|---------------|---------|
| `mois_jumin_statmonth_csv` | `planned_enabled` | `required` | ✓ |
| `reb_rone_public_table` | `blocked_coverage` | `parser_seed` | ✗ |
| `reb_stock` | `blocked_fixture` | `parser_seed` | ✗ |
| `molit_apt_sale` | `blocked_fixture` | `absent_blocked` | ✗ |
| `molit_apt_rent` | `blocked_fixture` | `absent_blocked` | ✗ |
| `reb_supply` | `blocked_fixture` | `parser_seed` | ✗ |
| `building_hub_housing_permit` | `blocked_fixture` | `absent_blocked` | ✗ |
| `kapt_basic` | `blocked_fixture` | `absent_blocked` | ✗ |
| `national_establishments` | `blocked_fixture` | `absent_blocked` | ✗ |
| `kosis_disabled` | `disabled` | `absent_blocked` | ✗ |
| `official_land_price_region` | `blocked_fixture` | `absent_blocked` | ✗ |
| `official_land_price_case` | `blocked_fixture` | `absent_blocked` | ✗ |
| `admin_code` | `blocked_fixture` | `absent_blocked` | ✗ |
| `admin_boundary_vworld` | `blocked_fixture` | `absent_blocked` | ✗ |
| `incheon-metro` | `accepted_legacy` | `grandfathered_set` | ✗ |
| `busan-metro` | `accepted_legacy` | `grandfathered_set` | ✗ |
| `seoul-metro` | `candidate` | `absent_blocked` | ✗ |
| `metro9-stage1` | `candidate` | `absent_blocked` | ✗ |
| `metro9-stage23` | `candidate` | `absent_blocked` | ✗ |
| `korail-station-candidate` | `candidate` | `absent_blocked` | ✗ |
| `kric-station-candidate` | `candidate` | `absent_blocked` | ✗ |
| `arex` | `candidate` | `absent_blocked` | ✗ |
| `shinbundang` | `candidate` | `absent_blocked` | ✗ |
| `gimpo-goldline` | `candidate` | `absent_blocked` | ✗ |
| `ui-sinseol` | `candidate` | `absent_blocked` | ✗ |
| `sillim` | `candidate` | `absent_blocked` | ✗ |
| `everline` | `candidate` | `absent_blocked` | ✗ |
| `uijeongbu-lrt` | `candidate` | `absent_blocked` | ✗ |
| `seohae-rail` | `candidate` | `absent_blocked` | ✗ |
| `naver_candidate` | `disabled` | `absent_blocked` | ✗ |
| `youtube_candidate` | `disabled` | `absent_blocked` | ✗ |
| `instagram_manual` | `manual` | `manual_no_fetch` | ✗ |

## Fixture Policy

Five values are permitted:

1. **`required`** — Nonempty fixtures array required. Used by MOIS (roles: `current_period`, `yoy_prior_period`).
2. **`parser_seed`** — Nonempty fixtures array required; additionally requires `network_allowed:false`. Used by R-ONE (roles: `jeonse_current`, `price_current`, `volume_window`), stock and supply (role: `parser_seed`).
3. **`grandfathered_set`** — Nonempty fixtures array with role `region_<sha256(NFC region_key UTF-8)[0:12]>` for each immutable transit package. Used by Incheon (7 packages) and Busan (15 packages).
4. **`absent_blocked`** — Empty fixtures array, nonempty `fixture_missing_reason`, `network_allowed:false`. Used by all blocked/candidate/disabled providers without seed data.
5. **`manual_no_fetch`** — Empty fixtures array, nonempty `fixture_missing_reason`, `network_allowed:false`. Used by Instagram manual only.

Fixture objects have exactly three fields: `role` (nonempty unique ASCII snake_case), `path` (canonical repo-relative), `sha256` (64 lowercase hex). Arrays are sorted by role then path. Duplicate role/path, empty strings, fabricated hashes, and `TBD` are validation failures.

## Transport Policy

- `network_allowed:true` requires a non-null closed `transport` object with exact keys: `method`, `url`, `query`, `headers`, `body`, `pagination`, `response_encoding`, `response_columns`. `transport_missing_reason` must be null.
- `network_allowed:false` requires `transport:null` and nonempty `transport_missing_reason`.
- Only MOIS (`mois_jumin_statmonth_csv`) has a frozen transport. Its literal shape is defined in the plan and enforced byte-for-byte by the validation module.
- Source/catalog URLs in the matrix are attribution and future-gate metadata, never executable endpoints.

## MOIS Transport (Frozen Literal)

```json
{
  "method": "POST",
  "url": "https://jumin.mois.go.kr/downloadCsv.do",
  "query": { "searchYearMonth": "month", "xlsStats": "3" },
  "headers": { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
  "body": {
    "sltOrgType": "1", "sltOrgLvl1": "A", "sltOrgLvl2": "",
    "gender": "gender", "genderPer": "genderPer", "generation": "generation", "sltUndefType": "",
    "searchYearStart": "{{YYYY}}", "searchMonthStart": "{{MM}}",
    "searchYearEnd": "{{YYYY}}", "searchMonthEnd": "{{MM}}",
    "sltOrderType": "1", "sltOrderValue": "ASC", "category": "month", "state": "3"
  },
  "pagination": { "kind": "none", "max_requests": 1 },
  "response_encoding": "euc-kr",
  "response_columns": [
    "행정구역", "{{YYYY}}년{{MM}}월_총인구수", "{{YYYY}}년{{MM}}월_세대수",
    "{{YYYY}}년{{MM}}월_세대당 인구", "{{YYYY}}년{{MM}}월_남자 인구수",
    "{{YYYY}}년{{MM}}월_여자 인구수", "{{YYYY}}년{{MM}}월_남여 비율"
  ]
}
```

`{{YYYY}}` and `{{MM}}` are the only allowed template tokens. One request returns the nationwide CSV. No executor-selected endpoint, parameter, encoding, or column is permitted.

## Stable Secret IDs

Secret values exist only in Obsidian `app.secretStorage` and are read only by the Obsidian runtime using `requestUrl`.

- `prodigy-reb-openapi-key`
- `prodigy-data-go-kr-service-key`
- `prodigy-vworld-api-key`
- `prodigy-kosis-api-key`
- `prodigy-seoul-openapi-key`
- `test-naver-client-id-placeholder`
- `test-naver-client-secret-placeholder`
- `prodigy-youtube-api-key`

No secret may enter Vault JSON, Git, cache, receipt, error text, command line, environment export, or standalone Node subprocess.

## 83-Region Identity

The canonical 83-region identity is defined by literal triples `(region_key, lawd_code, household_code)` in manifest-index order 부산→서울→경기→인천. The digest input maps each row to a JSON object with RFC 8785 lexicographically ordered keys (`household_code`, `lawd_code`, `region_key`), encoded as compact UTF-8 JSON with NFC strings, no BOM, no whitespace, no trailing newline.

**Digest SHA-256:** `663998ddf2f7b1b4d4242d52e5ea0fc99884c55230b3ceb3f555f07a101dab1b`

Manifests: 부산 16, 서울 25, 경기 31, 인천 11 = 83 total.

## Evidence Lineage

Every provider generation follows this acyclic order:

`request.json → raw/** → raw-manifest.json → normalized.json → diff.json → receipt.json + domain-inputs/** → hashes.json → immutable selection-receipt.json → selected.json`

Production root: `SYSTEM/CACHE/region-intelligence/providers/{provider_id}/`

All artifacts except `selected.json` are generation-qualified, hash-addressed, and immutable.

## Enablement Gates

- Only `mois_jumin_statmonth_csv` may become newly enabled, and only after all frozen transport/fixture/schema/coverage gates pass.
- `accepted_legacy` (Incheon/Busan) rows preserve approved corpus; future refresh requires the same validator.
- `blocked_fixture`, `blocked_coverage`, `candidate`, `disabled`, and `manual` rows never auto-promote.
- No provider is enabled without a frozen official sample.
- R-ONE fixtures validate parsing only and do not remove `blocked_coverage` state.
- MOIS pre-reform fixtures (2025-05, 2026-05) cover exactly 79/83 current canonical Region codes plus three quarantined predecessor sigungu codes.

## Seed Fixtures

Seven seed fixtures are copied byte-for-byte from the grandfathered 부산 사하구 snapshot at `SYSTEM/CACHE/region-metrics/부산광역시-사하구/2026-05-01_20260719T051111Z/raw/`:

| Fixture | SHA-256 |
|---------|---------|
| `mois_jumin_statmonth_csv/2026-05-households.csv` | `576bf4419dde...` |
| `mois_jumin_statmonth_csv/2025-05-households.csv` | `e451385dddfb...` |
| `reb_rone_public_table/2026-05-price-sahagu.json` | `40dd9f8fdb6b...` |
| `reb_rone_public_table/2026-03_05-volume-sahagu.json` | `485a5f75a2d0...` |
| `reb_rone_public_table/2026-05-jeonse-sahagu.json` | `21953cc92414...` |
| `reb_stock/2026-release.csv` | `2fe472b92867...` |
| `reb_supply/2026-release.csv` | `09cf2ad66d74...` |

Fixture paths are permanent tracked test inputs. Provider fixtures are never deleted by cleanup or retention.

## Schema Files

Ten JSON Schema files define the artifact contracts:

1. `region-source-registry.schema.json` — Provider registry structure
2. `region-run.schema.json` — Run identity envelope
3. `region-normalized.schema.json` — Normalized data rows
4. `region-diff.schema.json` — Correction-aware diff
5. `region-receipt.schema.json` — Terminal collection receipt
6. `region-selection-receipt.schema.json` — Immutable selection receipt
7. `region-domain-input.schema.json` — Domain input payload
8. `region-retention.schema.json` — Retention computation
9. `region-metrics-bundle.schema.json` — Aggregated metrics bundle
10. `region-approval.schema.json` — Approval envelope

## Validation

Run the contract test suite:

```bash
node --test SYSTEM/AI/Skills/prodigy-review/tests/auction/test_region_source_contract.js
```

Programmatic validation:

```js
const core = require("./SYSTEM/SCRIPTS/region-source-registry-core.js");
const result = core.validateAll();
// result.ok === true, result.errors === []
```
