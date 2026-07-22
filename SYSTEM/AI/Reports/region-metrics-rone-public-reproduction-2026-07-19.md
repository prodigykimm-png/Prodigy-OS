# Region Metrics R-ONE Public Reproduction — 부산광역시 금정구

Generated: 2026-07-19
Contract: Region_Property_Contract_v1 Version 1.2.5
Mode: official raw reproduction + deterministic adapter
Vault Region Object numeric write: **NO**

## A. Judgment

- dry-run overall: **PASS**
- Adapter Freeze: **PASS** for source map, collection/normalization package, and atomic note writer
- `auction_bid_rate_6m`: **N/A** (v1 intentional null)
- adapter output verification: **unverified** until a person reviews it
- no `PARA/RESOURCES/Auction Regions/부산광역시-금정구.md` note was created or modified

## B. Frozen source map

| property | provider | source_id | result |
|---|---|---|---|
| sale_volume_3m | reb_rone_public_table | A_2024_00554 | PASS |
| housing_stock | reb_stock | 15106861 | PASS |
| sale_turnover_rate | derived | sale_volume_3m+housing_stock | PASS |
| sale_price_change_yoy | reb_rone_public_table | A_2024_00045 | PASS |
| jeonse_ratio | reb_rone_public_table | A_2024_00073 | PASS |
| move_in_12m | reb_supply | 15111714 | PASS |
| move_in_24m | reb_supply | 15111714 | PASS |
| households | mois_jumin_statmonth_csv | jumin_statmonth_csv | PASS |
| household_change_yoy | mois_jumin_statmonth_csv | jumin_statmonth_csv | PASS |
| auction_bid_rate_6m | court_auction | — | N/A |

R-ONE endpoints:

```text
POST https://www.reb.or.kr/r-one/portal/openapi/selectOpenApiItmCd.do
POST https://www.reb.or.kr/r-one/portal/stat/sttsDataPreviewList.do
```

Region selection: `lawdCd=26410000` and exactly one matching class per table.
Item: `100001`.

## C. Reproduced snapshot

Aligned metrics month: **2026-05-01** (latest month available in the three-month volume response).

| metric | reproduced value | basis |
|---|---:|---|
| sale_volume_3m | 435건 | 2026-03 178 + 2026-04 125 + 2026-05 132 |
| housing_stock | 48,544호 | 15106861, 금정구 prefix + apartment type 1 |
| sale_turnover_rate | 0.03584377 | `(435×4)/48544` |
| sale_price_change_yoy | -0.988757% | 2026-05 vs 2025-05 original index |
| jeonse_ratio | 69.96933% | 2026-05 |
| move_in_12m | 415세대 | 15111714, 2025-12 basis |
| move_in_24m | 1,409세대 | 12개월 포함 1~24개월 누적 |
| households | 105,378세대 | 2026-05 시군구 집계 행 |
| household_change_yoy | 0.478661% | 2026-05 vs 2025-05 |

## D. Raw integrity evidence

| raw artifact | SHA-256 |
|---|---|
| rone-volume.json | `5460ade9315b67948e4127d6a1cdfff3286cb0999b19c5707fffedd8cf13d010` |
| rone-price.json | `a5e3e49e71efcbf6d057ed1b8d51fcd3c519f9f8906b2a2be62206634ba136fd` |
| rone-price-prior.json | `b332ad1c68f8f2ac6e350d85a5a12888c39001e34725f89900e9be8400685ea4` |
| rone-jeonse.json | `4effca4c59e1750c5667d010ccaf565680a5024ce0b92a5f46c5ca2bc69defb7` |
| households.csv | `576bf4419ddebd24da4b1c917269ed298f03bd6c413213c8b3e93599462d415a` |
| households-prior.csv | `e451385dddfb976ed6687a5750e23a8a70d51cd291c841eae0606950e8104ead` |
| housing-stock.csv | `2fe472b92867b69644d368a89df2acd81a65004cfc01afff0a7e72021c7f2e0a` |
| move-in.csv | `09cf2ad66d74bb0f5840a3249fc54634bdc08dd9d34630bfb730ae544a20c3a2` |

Counts:

- stock total rows: 307,407
- stock matched apartment rows: 468
- supply matched rows: 2
- each R-ONE response: exactly one verified region row

## E. Adapter artifacts

- deterministic calculations: `SYSTEM/SCRIPTS/region-metrics-core.js`
- official-source collector/cache writer: `SYSTEM/SCRIPTS/region-metrics-refresh.js`
- validated Region Object renderer: `SYSTEM/SCRIPTS/region-metrics-note-core.js`
- atomic existing-note writer: `SYSTEM/SCRIPTS/region-metrics-apply.js`
- unit/contract test: `SYSTEM/AI/Skills/prodigy-review/tests/auction/test_region_metrics_core.js`
- raw cache layout: `SYSTEM/CACHE/region-metrics/{region_key}/{snapshot_id}/`
  - `raw/`
  - `hashes.json`
  - `snapshot.json`

The collector creates a cache package. The separate writer can patch Frontmatter, history, and the display table in one atomic write, but only for an existing approved Region Object. No real Region Object was used as a fixture in this run.

## F. PASS checklist

- [x] canonical source IDs frozen
- [x] region code/class resolved deterministically
- [x] exactly one sigungu row required
- [x] units and missing-value behavior fixed
- [x] three consecutive volume months checked
- [x] exact prior-year month required for YoY
- [x] raw responses and code lists preserved
- [x] SHA-256 recorded
- [x] sample values reproduced end-to-end
- [x] automatic output remains `unverified`
- [x] Frontmatter + history + display table render together
- [x] same-raw rerun is a no-op
- [x] malformed/mismatched input leaves the original fixture unchanged

## G. Not done

- No real Region Object creation
- No production Frontmatter/history write
- No human `verified` approval
- No court auction proxy for `auction_bid_rate_6m`

## H. Second-region cross-check

인천광역시 계양구를 같은 전국 stock/supply 원본과 동일 adapter contract로 재현했다.

- region key: `인천광역시-계양구`
- R-ONE `lawdCd`: `28245000`
- MOIS row: `인천광역시 계양구 (2824500000)`
- aligned month: 2026-05
- sale volume 3m: 876건
- housing stock: 72,637호 (220 matched apartment rows)
- sale turnover rate: 0.04823988
- sale price YoY: -0.366393%
- jeonse ratio: 71.80157%
- move-in 12m / 24m: 1,285 / 5,708세대 (6 matched rows)
- households: 129,138세대
- household YoY: 1.195019%

Result: **PASS**. 금정구와 다른 R-ONE 지역 계층에서도 정확히 한 class/row를 선택했고, 주소 prefix와 시군구 집계 행 규칙이 동일하게 작동했다. 출력은 `unverified`이며 실제 Region Object에는 쓰지 않았다.
