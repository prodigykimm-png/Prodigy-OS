# Region Metrics Dry-run — BLOCKED resolution wave
# 부산광역시 금정구

Generated: 2026-07-18
Contract at wave start: Region_Property_Contract_v1 Version 1.2.3
Current disposition: historical wave report; Contract 1.2.5와 `region-metrics-rone-public-reproduction-2026-07-19.md`가 현재 판정을 대체함
Mode: ULW-research + local raw reproduction
Vault numeric write: **NO**

## A. One-line judgment

- dry-run overall: **BLOCKED**
- numeric Vault write: **NO**
- Adapter Freeze: **not allowed**
- Progress this wave:
  - newly reproduced with official free CSV: `households`, `household_change_yoy` (wave 시작 시 대체 출처 제안; §H에서 본경로로 채택)
  - still hard-blocked without key/login: `sale_volume_3m`, `sale_price_change_yoy`, `jeonse_ratio`
  - already PASS: `housing_stock`, `move_in_12m`, `move_in_24m`
  - N/A: `auction_bid_rate_6m`

## B. Property table

| property | pre-adoption contract result | reproduction in wave | notes |
|---|---|---|---|
| housing_stock | PASS | PASS | 15106861 file; apt type=1; sum **48544** |
| move_in_12m | PASS | PASS | 15111714 file; **415** |
| move_in_24m | PASS | PASS | 15111714 file; **1409** |
| households | BLOCKED (15108071) | PASS via alternate official CSV | jumin.mois.go.kr free CSV; 금정 **105381** (2026-06) |
| household_change_yoy | BLOCKED (15108071) | PASS via alternate official CSV | (105381/104813-1)*100 = **0.5419** |
| sale_volume_3m | BLOCKED | BLOCKED | 15134761 OpenAPI key required; page only has tech docx |
| sale_turnover_rate | BLOCKED | BLOCKED | needs volume |
| sale_price_change_yoy | BLOCKED | BLOCKED | 15069821 metadata reachable; `atchFileId=null` / no public file handle |
| jeonse_ratio | BLOCKED | BLOCKED | 15143751 metadata reachable; points to REB easyStat `A_2024_00073` but no public file handle |
| auction_bid_rate_6m | N/A | N/A | intentional null |

## C. New households reproduction evidence

### Source
- portal: https://jumin.mois.go.kr/statMonth.do
- download endpoint: `POST https://jumin.mois.go.kr/downloadCsv.do?searchYearMonth=YYYYMM&xlsStats=3`
- form notes: national extract with `state=3` returns 시군구+행정동 rows; no login

### 금정 시군구 row matcher
```text
부산광역시 금정구 (2641000000)
```
- code used: **26410** as 5-digit prefix of `2641000000`
- dong rows ignored

### Samples
- 2026-06 households = **105,381**
  - file sha256: `2e42d5670a612f9c0f1f1f6e054b1d0fe98cdb653f4a28da7909b5d83e8bb478`
  - column: `2026년06월_세대수`
  - row: `"부산광역시 금정구 (2641000000)","205,672","105,381","          1.95","99,854","105,818","          0.94"`
- 2025-06 households = **104,813**
  - file sha256: `8bb4d3482e4bbb8812de29d268a4a0a8d44fe11550c5331734baa48a58cdf714`
  - column: `2025년06월_세대수`
  - row: `"부산광역시 금정구 (2641000000)","208,216","104,813","          1.99","101,259","106,957","          0.95"`
- household_change_yoy = **0.5419**
  - formula: `(P_t / P_t-12 - 1) * 100`

### Contract interpretation
- This is **official first-party MOIS data**, but **not** the literal OpenAPI path of source_id `15108071`.
- Therefore under current enum:
  - contract-path dry-run for `15108071` remains **BLOCKED** (no service key)
  - this free CSV is a **source-change proposal candidate** to unlock PASS after contract patch

## D. Remaining hard blockers

### sale_volume_3m / 15134761
- data.go.kr page is OpenAPI hub, not a monthly CSV.
- public download on page is only tech document docx (`FILE_000000003015524`).
- no keyless stats endpoint reproduced.
- local secret scan found **no** data.go.kr/REB/MOIS service key configured for Prodigy.

### sale_price_change_yoy / 15069821
- detail metadata API returns dataset title correctly.
- `atachFileYn=N`, `atchFileId=null` for tested detail keys.
- no public file handle this run.

### jeonse_ratio / 15143751
- detail metadata returns:
  - dataNm: 중위 매매가격 대비 전세가격_20250430
  - dataUrl: `https://www.reb.or.kr/r-one/portal/stat/easyStatPage/A_2024_00073.do`
- REB page loads, but no direct CSV/XLS public link extracted; appears interactive/login-oriented.
- no public file handle this run.

## E. Recommended unblock path (recorded before adoption; item 1 completed in §H)

1. **Contract patch (completed in §H)**
   - Add approved alternate provider for households:
     - `mois_jumin_statmonth_csv` via jumin.mois.go.kr downloadCsv
     - keep 26410/2641000000 matching rule
   - Then mark households + YoY PASS under patched contract.

2. **Register service keys (needed for volume + API households if not patched)**
   - data.go.kr service key for REB stats API (15134761)
   - MOIS openAPI key for 15108071 if API path must remain canonical

3. **Price / jeonse file acquisition**
   - either obtain public file handles when data.go.kr exposes atchFileId
   - or freeze REB file-room/easyStat export procedure with deterministic monthly artifact capture
   - until then cannot PASS

## F. What this means for product

Without unblocking volume + price + jeonse, region analysis still cannot support a complete market core.
But after this wave:
- stock / move-in / households(free CSV) are mechanically solvable
- remaining true platform blockers are credentials + price/jeonse file distribution

## G. Not done

- No Vault FM numeric write
- No Adapter Freeze
- No invented API codes
- Subagent swarm partially failed with provider 400; local raw reproduction continued

## Local raw artifacts (ephemeral)

```text
/tmp/region-dryrun-geumjeong/raw/15106861.csv
/tmp/region-dryrun-geumjeong/raw/15111714.csv
/tmp/region-blocked/raw/mois_jumin_hh_202606.csv
/tmp/region-blocked/raw/mois_jumin_hh_202506.csv
```

## H. Adoption decision (2026-07-18)

Decision: **Adopt jumin free CSV as v1 canonical households path.**

- Contract version: **1.2.4**
- provider: `mois_jumin_statmonth_csv`
- source_id: `jumin_statmonth_csv`
- OpenAPI `15108071` demoted to optional fallback
- households / household_change_yoy contract-path status: **PASS**
- overall dry-run remains **BLOCKED** until sale_volume + price YoY + jeonse_ratio are reproduced
- Vault numeric write still prohibited
