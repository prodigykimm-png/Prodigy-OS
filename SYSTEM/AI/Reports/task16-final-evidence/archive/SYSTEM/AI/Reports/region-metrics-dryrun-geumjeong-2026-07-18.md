# Region Metrics Dry-run — 부산광역시 금정구

Generated: 2026-07-18
Contract at run: Region_Property_Contract_v1 Version 1.2.3
Current disposition: historical baseline; Contract 1.2.5와 `region-metrics-rone-public-reproduction-2026-07-19.md`가 현재 판정을 대체함
Scope: official source reproduction only
Vault numeric write: **NO**

## A. One-line judgment

- dry-run overall: **BLOCKED**
- numeric Vault write allowed: **NO**
- Adapter Freeze: **not allowed**
- PASS candidates ready for freeze discussion:
  - `housing_stock`
  - `move_in_12m`
  - `move_in_24m`
- still blocked / blocked-derived:
  - `sale_volume_3m`, `sale_turnover_rate`, `sale_price_change_yoy`, `jeonse_ratio`, `households`, `household_change_yoy`
- N/A:
  - `auction_bid_rate_6m`

## B. Property results

| property | result | source_id | sigungu row | unit | as_of rule | sample |
|---|---|---|---|---|---|---|
| sale_volume_3m | BLOCKED | 15134761 | unconfirmed via contract path | unknown | n/a | none (OpenAPI key required) |
| housing_stock | PASS | 15106861 | yes (`부산광역시 금정구` prefix) | 세대 | file label 2025-09-18; stock annual | **48544** (type=1 apartment only) |
| sale_turnover_rate | BLOCKED | derived | n/a | ratio | n/a | blocked because volume blocked |
| sale_price_change_yoy | BLOCKED | 15069821 | unconfirmed | % | n/a | file page present; download not available without login/session |
| jeonse_ratio | BLOCKED | 15143751 | unconfirmed | unknown | n/a | file page present; download not available without login/session |
| move_in_12m | PASS | 15111714 | yes (2 rows) | 세대 | data basis 2025-12-31 / month 2025-12 | **415** |
| move_in_24m | PASS | 15111714 | yes (2 rows) | 세대 | same; horizon to 2027-12 | **1409** |
| households | BLOCKED | 15108071 | unconfirmed | 세대 | n/a | endpoint found; `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` |
| household_change_yoy | BLOCKED | 15108071 | unconfirmed | % | n/a | blocked with households |
| auction_bid_rate_6m | N/A | — | n/a | % | n/a | intentional null |

## C. Confirmed endpoints / files

### housing_stock (15106861)
- page: https://www.data.go.kr/data/15106861/fileData.do
- download: `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003521525&fileDetailSn=1&insertDataPrcus=N`
- local raw: `<task-temp>/region-dryrun-geumjeong/raw/15106861.csv`
- sha256: `2fe472b92867b69644d368a89df2acd81a65004cfc01afff0a7e72021c7f2e0a`
- columns: `단지고유번호,필지고유번호,주소,단지명_공시가격,단지명_건축물대장,단지명_도로명주소,단지종류,동수,세대수,사용승인일`
- filter:
  - address prefix `부산광역시 금정구`
  - `단지종류 == 1` (apartment)
- counts:
  - total_rows: 307407
  - matched_prefix: 2314
  - matched_apartment: 468
  - unmatched_nonprefix_geumjeong_samples: 0
- sample sum: 48544

### move_in (15111714)
- page: https://www.data.go.kr/data/15111714/fileData.do
- download: `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003604297&fileDetailSn=1&insertDataPrcus=N`
- local raw: `<task-temp>/region-dryrun-geumjeong/raw/15111714.csv`
- sha256: `09cf2ad66d74bb0f5840a3249fc54634bdc08dd9d34630bfb730ae544a20c3a2`
- columns: `입주예정월,지역,사업유형,주소,아파트명,세대수`
- data basis (file title): 2025-12-31 → window month `2025-12`
- formula:
  - 12m: `0 < delta_months <= 12`
  - 24m: `0 < delta_months <= 24` (includes 1..12)
- matched rows:
  - 2026-06 delta=6 hh=415 e편한세상 금정 메종카운티 | 부산광역시 금정구 남산동  3-1
  - 2027-02 delta=14 hh=994 더샵 금정위버시티 | 부산광역시 금정구 부곡동  200-1
- move_in_12m = 415
- move_in_24m = 1409

### households (15108071)
- docs page: https://www.data.go.kr/data/15108071/openapi.do
- candidate endpoints:
  - `https://rdoa.jumin.go.kr/stdgPpltnHhStus/selectStdgPpltnHhStus`
  - `https://rdoa.jumin.go.kr/openStats/selectConStdgPpltnHh`
- call without registered key → `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`
- result: BLOCKED until service key + 26410 query reproduction

### sale_volume_3m (15134761)
- docs page: https://www.data.go.kr/data/15134761/openapi.do
- provider portal: REB R-ONE OpenAPI list
- no keyless raw reproduction in this run
- result: BLOCKED

### price YoY / jeonse ratio files
- pages exist and titles match intended series
- no public `fileDownload.do` handle extracted without login/session
- result: BLOCKED (not PASS)

## D. Normalization draft

```text
sigungu_code = 26410  # 금정구 (for API paths)
address_match = normalize(address).startswith("부산광역시 금정구")
apartment_only = 단지종류 == "1"
housing_stock = sum(세대수 where address_match and apartment_only)
move_in_delta = months(입주예정월, metrics_month)
move_in_12m = sum(세대수 where address_match and 0 < delta <= 12)
move_in_24m = sum(세대수 where address_match and 0 < delta <= 24)
sale_turnover_rate = (sale_volume_3m * 4) / housing_stock  # only if both non-null
null if source missing / unit unknown / no sigungu reproduction
snapshot_id = {metrics_as_of}_{UTC_fetched}
```

## E. Raw preservation design (not written into Vault)

```text
SYSTEM/CACHE/region-metrics/부산광역시-금정구/{snapshot_id}/
  raw/
    15106861.csv
    15111714.csv
  meta.json
  hashes.json   # sha256
```

Current local dry-run raw only under `<task-temp>/region-dryrun-geumjeong/` (ephemeral).

## F. Contract modification proposals

1. Keep `15106861` / `15111714` as file-data sources — reproduction succeeded.
2. For `15069821` / `15143751`, either:
   - document required data.go.kr login/session download procedure, or
   - propose alternate official distribution once a keyless/stable path is proven.
3. For `15134761` / `15108071`, store service-key based adapter config outside git; dry-run remains BLOCKED without key.
4. No change to auction null rule.

## G. Not done

- No Frontmatter numeric write
- No history JSON write
- No Adapter Freeze
- No guessed stats codes for sale volume
- No court auction proxy

## Next gate (recorded at run time)

1. Register/use official keys for REB stats + MOIS households and reproduce 금정 values.
2. Obtain price/jeonse official files with stable download path.
3. Only then recompute overall PASS set and consider Adapter Freeze.
