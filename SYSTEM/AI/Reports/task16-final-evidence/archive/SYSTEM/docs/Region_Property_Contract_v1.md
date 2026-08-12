# Region Property Contract v1

**표시 명칭:** 부동산 지역 분석 (Real Estate Region Resource)
**내부 type:** `auction_region` (리네임 보류 · Registry 라벨: 부동산 지역)
**경로:** `PARA/RESOURCES/Auction Regions/{시도}-{시군구}.md`
**Version:** 1.5.0
**Status:** Operational — source map, collector, atomic writer, body ownership frozen, research package writer

Object(`auction_case`) = 사건·입찰 판단.
Resource(지역 노트) = 재사용 가능한 시장 근거 + 시계열.

**파일명 `Region_Property_Contract_v1.md` 유지. 개정은 Version 필드만.**

### 공식 상태 (금정 dry-run 2026-07-19 / R-ONE public table adopted)

```text
Contract: 1.3.0 Operational
Dry-run overall (금정구): PASS
Numeric write: frozen writer only; no real Vault Object was used as a fixture
Adapter Freeze: source map + collector + atomic writer frozen
Body ownership: AUTO + AI:PENDING + HUMAN:OWNED
Raw reproduction:
  PASS = sale_volume_3m, housing_stock, sale_turnover_rate,
         sale_price_change_yoy, jeonse_ratio, move_in_12m, move_in_24m,
         move_in_36m, move_in_48m, move_in_60m,
         households, household_change_yoy
  N/A = auction_bid_rate_6m
R-ONE source decision:
  provider = reb_rone_public_table
  volume = A_2024_00554
  price index = A_2024_00045
  jeonse ratio = A_2024_00073
Households source decision:
  adopted jumin.mois.go.kr free CSV as v1 canonical path
  provider = mois_jumin_statmonth_csv
  source_id = jumin_statmonth_csv
  legacy OpenAPI 15108071 = optional fallback only (not required for PASS)
Reports:
  SYSTEM/AI/Reports/region-metrics-dryrun-geumjeong-2026-07-18.md
  SYSTEM/AI/Reports/region-metrics-blocked-resolution-2026-07-18.md
  SYSTEM/AI/Reports/region-metrics-rone-public-reproduction-2026-07-19.md
Next gate:
  approve an existing Region Object for the first production write,
  then human-review values before changing verification to verified
```

탐색(데이터셋·컬럼 발견) 성공 ≠ dry-run PASS.
dry-run PASS ≠ 사람의 수치 승인. 어댑터 출력은 기본 `unverified`다.

---

## 0. Freeze 순서

```text
1) 계약 Draft + 형식·판정 규칙 고정
2) 금정구 dry-run (원본 재현)
3) 문제 Property 수정 또는 제외
4) 어댑터 계약 Freeze                 ← 1.2.5
5) 승인된 실제 Object에 어댑터 실행
6) 사람 검증 후에만 verified
7) 본문 조사 소유권 Freeze             ← 1.2.6
```

- 출처 ID 확인 ≠ 수집 가능.
- dry-run overall PASS 전 FM 시장 지표 **기입 금지**.
- 수집·산식은 결정적 코드만 담당한다. **AI는 숫자를 추정하거나 산식 결과를 직접 만들지 않는다.** AI = 본문 Evidence 요약 only.

### 0.1 dry-run 결과 enum (계약 공식 — 이것만 사용)

```text
PASS
BLOCKED
N/A
```

- `N/A` = intentional_null 등 v1 의도적 미수집 (예: `auction_bid_rate_6m`).
- 금지/비공식 라벨 (리포트 메모 전용, 계약 PASS 승격 금지): `PASS_PATH`, `PASS_PARTIAL`, `보류`, `PASS(null)`.

| 결과 | 의미 |
|------|------|
| **PASS** | **원계약 `source_id` 경로**로 시군구 샘플 값·단위·합산(해당 시)·raw SHA-256 재현 |
| **BLOCKED** | 미달. 파일/API 존재만 확인, 키 없음, 시군구 행 미확인, 단위 미확정 포함 |
| **N/A** | v1에서 의도적으로 null 고정 (통계 부재 확인 포함) |

**대체 배포 경로** (KOSIS 등, 같은 원기관이라도 계약 `source_id`와 다른 채널):

- 자동 PASS 아님
- dry-run 결과는 **BLOCKED** (원계약 경로 기준)
- 가치 있으면 §F **source 변경 제안**만 — 채택·재 dry-run 후 PASS 가능

### 0.2 dry-run PASS 체크리스트 (property마다 — 전부 충족)

```text
[ ] 원계약 source_id (또는 Freeze된 후속 ID) 경로로 접근
[ ] 통계·항목·지역 코드 / 파일 컬럼 확정
[ ] 시군구 행 존재 (금정: 코드 또는 정규화 주소)
[ ] 단위·결측 표현 확정 (추정 금지)
[ ] 합산 규칙 버전 고정 + 전체/매칭/미매칭 행 수 기록 (해당 시)
[ ] 기준월·공표 지연 문서화
[ ] 원본 raw 보존 + SHA-256 + 계산 결과 재현
[ ] 샘플 값 1개 (공식 원본에서)
```

미달 = **BLOCKED**. 값 기입 금지.

### 0.3 시점 필드

| 필드 | 의미 | 형식 예 |
|------|------|---------|
| `metrics_as_of` | **통계 기준월** (패키지 라벨) | `YYYY-MM-01` |
| 지표별 `as_of` | 해당 지표 통계 기준 | `YYYY-MM-01` 등 |
| `source_as_of` / `fetched_at` | **수집·다운로드 시각** | 날짜 또는 ISO UTC |

`metrics_as_of`에 수집일을 넣지 않는다.

### 0.4 `move_in` 창 (산식 고정)

기준일 = 입주 데이터 파일 메타 **데이터 기준시점** (수집일 아님).

```text
move_in_12m = SUM(세대수) where 0 < (입주예정월 - 기준) ≤ 12개월
move_in_24m = SUM(세대수) where 0 < (입주예정월 - 기준) ≤ 24개월
              # 1~24 전체 = 12개월 물량 포함. 13~24만 합산 금지
move_in_36m / move_in_48m / move_in_60m = 같은 누적 산식의 36/48/60개월 창
원본 CSV의 최종 입주예정월이 해당 horizon에 닿지 않으면 그 horizon 값 = null
원본 제공 범위가 해당 horizon에 닿고 매칭 사업이 없을 때만 값 = 0
```

`snapshot.evidence.supply_coverage`는 `basis_month`, 원본의 `source_month_min/max`,
`matched_rows`, `observed_horizon_months`, `unavailable_horizons`를 기록한다. `0`은 관측된
무공급이고 `null`은 원본 제공 범위 미확보다. 25~60개월의 사업 후보는 이 누적 지표가 아니라 §10의 파이프라인으로만 기록한다.

### 0.5 주소 매핑 (합산 시)

- 정규화 후 **`부산광역시 금정구` 접두(동등 정규형)** 우선. 단순 `CONTAINS "금정구"` 만으로 PASS 금지.
- 반드시 기록: `total_rows`, `matched_rows`, `unmatched_rows` (+ 미매칭 주소 샘플).

---

## 1. 지역 단위

- Object = **시군구 only**. 파일키 = `{region_sido}-{region_sigungu}`.
- 지역 Resource에 **`region_dong` 없음**.
- 범위: 아파트·REB 공시/통계 정의 중심 (총주택 전부 아님).

---

## 2. 수집 철학 — 공식 데이터 어댑터

```text
공식 API/CSV
→ 원본 보존 (path + sha256)
→ 결정적 정규화
→ 산식 (코드 only)
→ 히스토리 JSON 스냅샷 append (규칙 §5)
→ Frontmatter 최신 패치 (canonical)
→ 본문 표시 표 재생성 (FM에서 렌더, non-canonical)
```

- v1 본경로는 R-ONE 공개 통계표 POST 응답을 사용한다. 렌더링된 화면 DOM 크롤은 금지.
- 2차 가공 사이트 1차 출처 금지.

### 2.1 Provider 코드

| code | 역할 |
|------|------|
| `reb_rone_public_table` | R-ONE 공개 통계표 원계열 (거래량·가격지수·전세가율) |
| `reb_statistics` | OpenAPI 거래 등 |
| `reb_price_file` | 매매가격지수 파일 |
| `reb_jeonse_ratio_file` | 중위 매매 대비 전세 |
| `reb_stock` | 단지 식별 → 아파트 합산 |
| `reb_supply` | 입주예정물량 |
| `mois_jumin_statmonth_csv` | 주민등록 세대 (jumin free CSV · v1 본경로) |
| `mois_households` | 주민등록 세대 OpenAPI (15108071 · optional fallback) |
| `court_auction` | 경매 (v1 미수집) |
| `derived` | 파생 지표 |

### 2.2 원본 보존

```text
경로: SYSTEM/CACHE/region-metrics/{region_key}/{snapshot_id}/
  raw/            # 응답·CSV·코드 목록 원본
  hashes.json     # 파일별 SHA-256
  snapshot.json   # source_id, fetched_at, 결과·근거
해시: SHA-256 (hex lower-case), 필드 raw_hash
region_key: normalize 된 {시도}-{시군구} (파일명과 동일)
```

캐시는 git 커밋 대상 아님 (로컬/운영 산출물).

---

## 3. Freeze된 출처 지도 (v1.2.5)

| Property | source_id | provider | 규칙 |
|----------|-----------|----------|------|
| `sale_volume_3m` | `A_2024_00554` | `reb_rone_public_table` | 최근 공표된 연속 3개월 합. 항목 `100001` |
| `housing_stock` | `15106861` | `reb_stock` | 아파트만 시군구 합, 연 1회 |
| `sale_turnover_rate` | — | `derived` | `(vol*4)/stock`, 소수 최대 8자리 |
| `sale_price_change_yoy` | `A_2024_00045` | `reb_rone_public_table` | 아파트 매매가격 원지수의 정확한 전년동월 YoY. 월간 변동률 직접 저장 금지 |
| `jeonse_ratio` | `A_2024_00073` | `reb_rone_public_table` | 중위 매매가격 대비 중위 전세가격. 전세지수 대체 금지 |
| `move_in_12m` | `15111714` | `reb_supply` | §0.4: 1~12개월 합 (30세대+ 공동주택) |
| `move_in_24m` | `15111714` | `reb_supply` | §0.4: **1~24개월 누적**(12 포함). horizon < 24m → null |
| `move_in_36m` | `15111714` | `reb_supply` | §0.4: 1~36개월 누적. 원본 horizon 부족 시 null |
| `move_in_48m` | `15111714` | `reb_supply` | §0.4: 1~48개월 누적. 원본 horizon 부족 시 null |
| `move_in_60m` | `15111714` | `reb_supply` | §0.4: 1~60개월 누적. 원본 horizon 부족 시 null |
| `households` | `jumin_statmonth_csv` | `mois_jumin_statmonth_csv` | jumin free CSV 시군구 행 세대수. 매칭: `{{시도}} {{시군구}} ({{sigungu5}}000000)`. 행정동 행 제외 |
| `household_change_yoy` | `jumin_statmonth_csv` | `mois_jumin_statmonth_csv` | 전년 동월 대비 % = `(P_t/P_t-12 − 1)×100` |
| `auction_bid_rate_6m` | — | `court_auction` | **v1 null** |

### 3.1 정의 요약

- `housing_stock_basis: reb_public_price_apartment_units`
- turnover: FM·history는 비율 0.xxxx, 본문 표는 `×100`한 %를 소수 둘째 자리로 표시; vol·stock 없으면 null
- 시군구 코드 5자리; 법정동·행정동 혼칭 금지
- `households_provider` 기본값: `mois_jumin_statmonth_csv`

### 3.2 R-ONE 공개 통계표 경로 (v1.2.5 채택)

```text
code lookup: POST https://www.reb.or.kr/r-one/portal/openapi/selectOpenApiItmCd.do
data: POST https://www.reb.or.kr/r-one/portal/stat/sttsDataPreviewList.do
provider: reb_rone_public_table
item: 100001
region class: lawdCd와 정확히 일치하는 분류 1개
```

규칙:

1. `selectOpenApiItmCd.do` 결과에서 `itmTag=분류`이고 요청 `lawdCd`와 같은 행을 정확히 1개 선택한다.
2. 데이터 응답의 지역 분류명은 코드 조회 결과의 계층과 정확히 같아야 한다.
3. 거래량은 `A_2024_00554`, `dmPointVal=0`, 최근 공표된 연속 3개월을 합한다.
4. 가격 YoY는 `A_2024_00045`, `dmPointVal=5`, 기준월과 정확히 12개월 전 원지수로 `(P_t/P_t-12−1)×100`을 계산한다.
5. 전세가율은 `A_2024_00073`, `dmPointVal=5`의 기준월 값을 사용한다.
6. R-ONE 세 지표는 거래량의 최신 공표월에 맞춘다. 필요한 월이 없거나 행이 복수면 실패한다.
7. 코드 목록과 원응답 JSON을 모두 보존하고 SHA-256을 기록한다.
8. 공공데이터포털 `15134761`, `15069821`, `15143751`은 출처 발견·문서 참조용 catalog ID이며, v1.2.5의 canonical 수치 `source_id`는 위 R-ONE 통계표 ID다.

금정 재현 샘플 (실제 Object 미기입 · 증거만):

- 기준월 2026-05, 거래량 2026-03~05 합 = 435건
- 매매가격 원지수 YoY = -0.988757%
- 전세가율 = 69.96933%

### 3.3 households 경로 (v1.2.4 채택)

v1 본경로:

```text
portal: https://jumin.mois.go.kr/statMonth.do
download: POST https://jumin.mois.go.kr/downloadCsv.do?searchYearMonth=YYYYMM&xlsStats=3
provider: mois_jumin_statmonth_csv
source_id: jumin_statmonth_csv
```

규칙:

1. 로그인 없는 free CSV를 v1 재현 경로로 사용한다.
2. 시군구 행만 사용한다. 행정동 행은 합산하지 않는다.
3. 금정 예시 매칭 키: `부산광역시 금정구 (2641000000)`
   - 시군구 코드 5자리 = `26410`
   - 행 코드 suffix `000000` 은 시군구 집계 행 식별용.
4. `household_change_yoy` 는 전년 동월 원계열로 계산한다.
5. OpenAPI `15108071` 은 optional fallback 이다.
   - 키가 없어도 v1 PASS에 필요하지 않다.
   - fallback을 쓸 경우에도 시군구 5자리/`2641000000` 동등 규칙을 유지한다.
6. dry-run PASS 조건: raw CSV 보존 + SHA-256 + 시군구 행 1개 + 단위(세대) + as_of 월.

금정 재현 샘플 (2026-05 정렬 실행 · 실제 Object 미기입):

- 2026-05 households = 105378
- 2025-05 households = 104876
- YoY = 0.478661%

### 3.4 시점

| 필드 | 의미 |
|------|------|
| FM `metrics_as_of` | **통계 기준월** 라벨 (`YYYY-MM-01`). 수집일 금지 |
| 지표 `as_of` | 해당 통계 실제 기준 |
| `source_as_of` / `fetched_at` | **수집·다운로드** 시각 |
| move_in 기준일 | **`15111714` 파일 메타의 데이터 기준시점** (예: 2025-12-31), 수집일과 혼동 금지 |

---

## 4. 최신값: Frontmatter = canonical

| 위치 | 역할 |
|------|------|
| **Frontmatter** | **유일한 최신 수치 canonical** |
| **본문 시장 지표 표** | **표시 전용** (한글 라벨). 어댑터가 FM 패치 직후 **같은 실행에서** 표를 FM으로 재생성 |
| **히스토리 JSON** | 시계열 canonical |

규칙:

1. 어댑터는 FM 시장 키와 표시 표를 **한 트랜잭션(한 번 write)** 으로 맞춤.
2. 불일치 시 **FM 우선**. 표만 수동 수정 금지(다음 실행이 덮음).
3. 표시 표에 **영어 property 키를 사용자 열로 쓰지 않음** — 한글 라벨 + (선택) 내부키는 주석/비고.
4. 표시 정밀도: 건·호·세대는 천 단위 구분, `%` 지표는 소수 둘째 자리, 회전율은 저장 비율에 `×100` 후 `%`로 표시.
5. `metrics_source`는 frozen package 식별자 `region_metrics_v1_2_5`를 기록한다.

### 4.1 Frontmatter 키

정체성: `type`, `region_sido`, `region_sigungu`, `status`, `updated`

메타: `metrics_as_of`, `metrics_scope`, `metrics_source`, `source_as_of`,
`verification_status`, `housing_stock_basis`, `sale_price_change_basis`

코어: `sale_volume_3m`, `housing_stock`, `sale_turnover_rate`,
`sale_price_change_yoy`, `jeonse_ratio`, `move_in_12m`, `move_in_24m`,
`move_in_36m`, `move_in_48m`, `move_in_60m`,
`households`, `household_change_yoy`

지가 추세(지역 별도 근거): `land_price_trend_yoy`, `land_price_trend_as_of`,
`land_price_trend_scope`, `land_price_trend_source`. 공시지가는 시세·감정가·낙찰가가 아니다.

경매: `auction_bid_rate_6m` (null)

### 4.2 `verification_status` 집계 (FM 대표값)

최신 스냅샷에 **값이 있는** 지표( null 제외, `auction_bid_rate_6m` v1 제외)의 지표별 `verification`에 대해:

```text
하나라도 unverified → FM verification_status = unverified
전부 verified        → verified
그 외(혼합·partial) → partial
값이 있는 지표 0개   → unverified
```

- 어댑터 자동 기입 직후 기본: 지표 `unverified` 또는 규칙상 `partial`.
- **`verified`는 사람만** 개별 지표 또는 패키지에 부여.

**의미 (오해 방지):**

- `verified` = **기입된(non-null) 값**에 대해 사람 검증이 끝났다는 뜻.
- **`verified` ≠ 모든 코어 필드 충족 · 스키마 완전 기입 · dry-run 전 항목 완료.**
- null 로 비운 지표(미수집·기간 부족·v1 제외)는 집계 분모에 넣지 않으므로,
  일부만 채우고 그 값이 모두 검증되면 FM은 `verified` 가 될 수 있다.
  완전 커버리지는 별도(히스토리·빈 칸·어댑터 리포트)로 본다.

### 4.3 표시 라벨 (본문 표)

| property | 한글 라벨 |
|----------|-----------|
| sale_volume_3m | 매매 거래량(3개월) |
| housing_stock | 주택 재고(아파트·공시) |
| sale_turnover_rate | 매매 회전율 |
| sale_price_change_yoy | 매매가 변동 YoY |
| jeonse_ratio | 전세가율 |
| move_in_12m | 입주 예정 12개월 |
| move_in_24m | 입주 예정 24개월 |
| move_in_36m | 입주 예정 36개월 |
| move_in_48m | 입주 예정 48개월 |
| move_in_60m | 입주 예정 60개월 |
| households | 세대수 |
| household_change_yoy | 세대수 변동 YoY |
| auction_bid_rate_6m | 경매 낙찰가율(6개월) |

### 4.4 본문 조사 소유권 (v1.2.6)

본문은 비워두는 것이 기본이 아니다. **출처로 확인 가능한 사실은 자동 채우고, 해석과 현장 경험만 승인 경계를 둔다.**

| marker | 소유자 | 갱신 규칙 |
|---|---|---|
| `AUTO:REGION_MARKET` | metrics writer | snapshot에서 결정적으로 재생성. 수동 편집 금지 |
| `AUTO:REGION_LAND_PRICE` | land-price writer | 공식 지가 package에서만 재생성. research writer 수정 금지 |
| `AUTO:REGION_TRANSIT` | transit writer | hash-verified crosswalk snapshot에서 결정적으로 재생성. research/metrics/land-price writer 수정 금지 |
| `AUTO:REGION_RESEARCH_SOURCES` | research job | 공식 1차 출처 URL·조회일·담당기관. job이 교체 가능 |
| `AUTO:REGION_RESEARCH_LOG` | research job | 조사 실행일·상태·한계 기록 |
| `AI:PENDING:SUMMARY` | AI 제안 | 공식 사실과 pending 해석을 압축. 사람 승인 전 확정문 아님 |
| `AI:PENDING:ZONES` | AI 제안 | 행정동·교통·생활권 기반 후보 권역. `HUMAN:LOCKED` 표를 대체하지 않음 |
| `AI:PENDING:TRANSPORT_LIFE` | AI 제안 | 공식 자료로 확인된 교통·생활 사실 + 출처 번호 |
| `AI:PENDING:RISKS` | AI 제안 | 공식 위험 신호와 확인 필요 항목. 투자 결론 금지 |
| `AI:PENDING:SITE_VISIT` | AI 제안 | 현장에서 확인할 관찰 체크리스트만. 관찰 결과를 선기입하지 않음 |
| `AI:PENDING:SUPPLY_PIPELINE` | AI 제안 | 25~60개월 공식 사업 후보. 확정 입주물량으로 표시 금지 |
| `HUMAN`, `HUMAN:LOCKED`, `HUMAN:OWNED` | 사람 | adapter/research job 수정 금지 |

규칙:

1. `AUTO`는 공식 원본이나 결정적 snapshot에서 재현 가능한 사실만 쓴다.
2. `AI:PENDING`은 공식 출처에 가까이 인용하고, 해석은 `AI 제안 · 확인 필요`로 표시한다.
3. 권역 후보와 한 줄 요약은 자동 확정하지 않는다. 사람이 승인한 내용만 HUMAN 구간으로 이동한다.
4. 교통·생활·정비사업 등 변할 수 있는 정보는 조사일과 직접 URL을 `출처·리서치`에 기록한다.
5. 임장 전 체크리스트는 AI가 만들 수 있지만 경사 체감, 소음, 냄새, 관리, 보안, 점유 정황은 사용자 Evidence만 허용한다.
6. 연구 job은 marker 사이만 교체한다. marker 밖 기존 Content를 재작성하지 않는다.

### 4.5 Region Experience 사람 확인 append (v1.4.0)

이 경로는 **새 explicit user action**이다. metrics adapter, research package writer, provider/AI writer가 아니며, `AI:PENDING` 제안은 사람이 검토할 입력일 뿐이다. **AI/provider는 Region에 직접 append할 수 없다.**

append 전제조건은 모두 충족해야 한다.

1. Daily Evidence가 이미 저장(commit)되어 canonical path와 stable Evidence ID를 가진다.
2. 사람이 후보 하나를 명시적으로 선택하고 `human_confirmed: true`로 승인한다.
3. target은 정확히 일치하는 기존 `auction_region` TFile이다. Region key·경로·frontmatter identity가 모두 일치해야 하며, 이 경로는 Object를 자동 생성하지 않는다.
4. category는 고정 map만 사용한다: `transport_life` → `교통·생활`의 `HUMAN`, `risk` → `리스크·주의`의 `HUMAN`, `site_visit` → `임장 포인트`의 `HUMAN:OWNED`, `supply_observation` → `임장 포인트`의 `HUMAN:OWNED`.

저장된 Daily Evidence의 stable provenance(`committed_daily_path` + `committed_evidence_id`)가 같은 재시도는 **no-op**이다. Daily 저장 뒤 Region append가 실패해도 Daily Evidence를 되돌리지 않으며, 같은 승인 입력으로 retry할 수 있다.

guardrail:

- Region append는 사람 확인 선택만 허용한다. AI/provider 제안, adapter, research job, metrics writer는 이 user action을 호출하거나 대신 실행할 수 없다.
- 이 action은 Region Object를 자동 생성하지 않으며, Knowledge candidate를 자동 저장·승인하거나 Knowledge promotion을 실행하지 않는다. Knowledge는 별도 사람 승인 흐름이다.
- `supply_observation`은 사용자의 임장 관찰만 기록한다. append할 prose는 사용자가 저장한 `direct_observation`과 **verbatim으로 정확히 같아야 하며**, AI/provider는 요약·해석·추론·보강을 추가할 수 없다. 공식 공급 pipeline, 사업명·단지명, 세대/호/가구 단위, 월, 수치가 아니며, 어떤 category든 candidate prose의 공식 공급 또는 planned move-in 수량은 거부한다.
- 새 소유 marker 또는 template block marker는 추가하지 않는다. 단, 같은 Daily Evidence 재시도의 idempotency 확인만을 위해 승인된 사람이 확인한 append 항목에 바로 붙는 인라인 `<!-- REGION_EXPERIENCE_PROVENANCE:{committed_daily_path}#{committed_evidence_id} -->` 주석은 허용한다. 이 주석은 새 marker block이나 writer 소유권을 만들지 않으며, research/metrics writer가 읽거나 소비하는 입력도 아니다.
- frontmatter, metrics display/history, `AUTO`, `AI:PENDING`, `HUMAN:LOCKED`, 그리고 append 대상 밖의 unrelated text를 포함한 모든 기존 human text는 보호한다. Property/frontmatter/schema/template migration은 수행하지 않는다.
- 이 사람 action은 adapter/research writer의 기존 marker 소유권·fail-closed 규칙을 완화하지 않는다.

Dataview Hub가 로드하는 `SYSTEM/Views/`의 모든 코드는 사용자가 신뢰한 local executable code다. Vault sync/write 접근은 사용자의 기존 Obsidian/Dataview 신뢰 경계에 속하며, 비신뢰 콘텐츠 sandbox가 아니다. 따라서 신뢰하지 않는 vault sync origin에서 온 `SYSTEM/Views/` 코드는 실행해서는 안 된다.

Region Experience의 인증/secret-bearing provider 설정은 canonical 승인 provider key인 `gemini` 또는 `mimo`에서만 허용한다. 각 key는 기대 adapter(`gemini` → `gemini`, `mimo` → `openai-compatible`)와 정확히 일치하는 승인 HTTPS endpoint만 사용하며, endpoint에는 query 또는 fragment를 둘 수 없다. 등록되지 않은 alias는 어떤 secret도 재사용할 수 없다. 반면 built-in secret이 없는 명시적 `authMode: none` local configuration은 허용되며 secret을 읽거나 전송하지 않는다.

---

## 5. 히스토리 형식 (고정)

### 5.1 위치

노트 본문:

```markdown
## 지표 히스토리

> [!abstract]- 원본 지표 이력
> ```json
> { ...snapshots... }
> ```
```

- 언어 태그 **`json` 필수**.
- 접이식 callout은 Reading View presentation만 담당하며, 이 코드펜스 **하나만** 히스토리 canonical이다.
- 마커: 펜스 직전 HTML 주석 `<!-- PRODIGY_REGION_METRICS_HISTORY -->` 권장.

### 5.2 스키마

```json
{
  "schema_version": 1,
  "region_key": "부산광역시-금정구",
  "snapshots": [
    {
      "snapshot_id": "2026-05-01_20260719T001058Z",
      "metrics_as_of": "2026-05-01",
      "fetched_at": "2026-07-19T00:10:58.135Z",
      "source_as_of": "2026-07-19",
      "verification_status": "unverified",
      "metrics": {
        "sale_volume_3m": {
          "value": 435,
          "unit": "건",
          "as_of": "2026-05-01",
          "provider": "reb_rone_public_table",
          "source_id": "A_2024_00554",
          "verification": "unverified",
          "raw_hash": "<sha256>"
        },
        "housing_stock": {
          "value": 48544,
          "unit": "호",
          "as_of": "2025-09-01",
          "provider": "reb_stock",
          "source_id": "15106861",
          "verification": "unverified",
          "raw_hash": "<sha256>"
        },
        "sale_turnover_rate": {
          "value": 0.03584377,
          "unit": "ratio",
          "as_of": "2026-05-01",
          "provider": "derived",
          "source_id": "sale_volume_3m+housing_stock",
          "verification": "unverified",
          "raw_hash": "<sha256>"
        },
        "sale_price_change_yoy": {
          "value": -0.988757,
          "unit": "%",
          "as_of": "2026-05-01",
          "provider": "reb_rone_public_table",
          "source_id": "A_2024_00045",
          "verification": "unverified",
          "raw_hash": "<sha256>"
        },
        "jeonse_ratio": {
          "value": 69.96933,
          "unit": "%",
          "as_of": "2026-05-01",
          "provider": "reb_rone_public_table",
          "source_id": "A_2024_00073",
          "verification": "unverified",
          "raw_hash": "<sha256>"
        },
        "move_in_12m": {
          "value": 415,
          "unit": "세대",
          "as_of": "2025-12-01",
          "provider": "reb_supply",
          "source_id": "15111714",
          "verification": "unverified",
          "raw_hash": "<sha256>"
        },
        "move_in_24m": {
          "value": 1409,
          "unit": "세대",
          "as_of": "2025-12-01",
          "provider": "reb_supply",
          "source_id": "15111714",
          "verification": "unverified",
          "raw_hash": "<sha256>"
        },
        "households": {
          "value": 105378,
          "unit": "세대",
          "as_of": "2026-05-01",
          "provider": "mois_jumin_statmonth_csv",
          "source_id": "jumin_statmonth_csv",
          "verification": "unverified",
          "raw_hash": "<sha256>"
        },
        "household_change_yoy": {
          "value": 0.478661,
          "unit": "%",
          "as_of": "2026-05-01",
          "provider": "mois_jumin_statmonth_csv",
          "source_id": "jumin_statmonth_csv",
          "verification": "unverified",
          "raw_hash": "<sha256>"
        },
        "auction_bid_rate_6m": {
          "value": null,
          "unit": "%",
          "as_of": null,
          "provider": "court_auction",
          "source_id": null,
          "verification": "n/a",
          "raw_hash": null
        }
      }
    }
  ]
}
```

- 예제의 `"<sha256>"`는 축약 표기다. 실제 snapshot에는 64자리 lower-case SHA-256만 허용한다.
- `snapshots` 정렬: **`metrics_as_of` 내림차순**, 동일 시 `snapshot_id` 내림차순.
- 코어 키 전부 `metrics`에 키 존재 (값 null 허용).

### 5.3 `snapshot_id`

```text
{metrics_as_of}_{UTC 또는 수집시각 compact}
예: 2026-06-01_20260718T120000Z
```

### 5.4 중복 실행 방지

어댑터 실행 전:

1. 기존 히스토리 파싱.
2. **동일 `snapshot_id` 가 있으면** 해당 스냅샷 **교체(replace)** (append 중복 금지).
3. `snapshot_id`가 달라도 같은 `metrics_as_of` + 같은 전 지표 `raw_hash` 묶이면 **no-op**.
4. 새 `metrics_as_of` 이면 **배열 앞에** insert.
5. 과거 스냅샷 삭제·순서 임의 섞기 금지 (replace 대상 제외).

### 5.5 월간 job 원자성

한 실행에서 순서 고정:

1. raw 저장 + hash
2. 히스토리 JSON 갱신
3. FM canonical 패치
4. 본문 표시 표 재생성
5. (선택) FM vs 표 일치 assert

중도 실패 시 부분 커밋 남기지 않도록 구현 (임시 파일 후 rename 권장).

### 5.6 writer 실패 정책 (fail closed)

- 대상 파일은 이미 존재하는 `PARA/RESOURCES/Auction Regions/*.md`만 허용한다. writer가 실제 Object를 자동 생성하지 않는다.
- `type != auction_region`, 지역키 불일치, 필수 지표 누락, malformed Frontmatter/history, 자동 `verified` 입력은 write 전에 실패한다.
- 모든 지표가 포함된 하나의 snapshot package가 아니면 부분 갱신하지 않는다.
- 같은 `metrics_as_of`와 전 지표 `raw_hash` 묶음이 이미 있으면 **no-op**한다. 사람의 기존 검증 상태를 낮추지 않는다.
- 동일 `snapshot_id`의 원본이 달라진 경우 해당 snapshot을 교체하고, 다른 과거 snapshot은 보존한다.
- 전체 새 본문을 메모리에서 검증한 뒤 대상과 같은 디렉터리의 임시 파일을 `fsync`하고 rename한다. 실패 시 임시 파일을 제거하고 원본을 유지한다.

CLI:

```bash
node SYSTEM/SCRIPTS/region-metrics-apply.js \
  --snapshot SYSTEM/CACHE/region-metrics/{region_key}/{snapshot_id}/snapshot.json \
  --target "PARA/RESOURCES/Auction Regions/{region_key}.md" \
  --dry-run
```

`--dry-run` 확인 후 같은 명령에서 flag를 제거해야 실제 한 번의 write가 수행된다.

---

## 6. 템플릿 · fallback 일치

- Canonical 생성 경로: `SYSTEM/TEMPLATE/FORMAT/template_auction_region.md`
- `auction-region-core` fallback 본문은 **템플릿과 동일 구조·동일 FM 키·동일 한글 표 헤더·동일 HUMAN 마커**를 유지해야 한다.
- 히스토리 JSON `region_key` 는 생성 시 채운다.
  - 템플릿: `"region_key": "<% region_key %>"` + 생성기 치환
  - fallback: `regionKey(...)` 로 직접 기입
- 템플릿 파일 부재 시 fallback 사용하되, 가능하면 템플릿 로드 재시도 / Notice.

---

## 7. 역할

| 역할 | 책임 |
|------|------|
| Region Resource | FM 최신 + JSON 시계열 + 권역·임장 |
| Auction Case | 물건·동·입찰 |
| Adapter | 수집·산식·원자 갱신 |
| AI | Evidence only |
| Human | dry-run, verified, 판단 |

---

## 8. 월간 job (Freeze 이후)

`monthly_refresh` = §5.5 파이프라인.
HUMAN 구간 수정 금지.

---

## 9. Freeze 이후 개선

3개월 실사용 후 의사결정에 쓰인 항목만 추가.
dry-run 실패 항목 제외.

---

## 10. Research package writer (v1.4.0)

정성 조사 package는 metrics와 별개의 writer로 8개 marker 블록에만 반영된다.

### 10.1 canonical cache 경로

```text
SYSTEM/CACHE/region-research-packages/{region_key}/{researched_at}.json
```

- writer(`region-research-apply.js`)는 이 경로 아래의 파일만 허용한다. Vault 밖 `/tmp` 등은 거부한다.
- package는 writer가 자동 생성하거나 이동하지 않는다 (조사 에이전트가 작성).
- package는 적용 후에도 보존한다 (조사 근거 원본).

### 10.2 writer 소유 marker (8개)

```text
AI:PENDING:SUMMARY
AI:PENDING:ZONES
AI:PENDING:TRANSPORT_LIFE
AI:PENDING:RISKS
AI:PENDING:SITE_VISIT
AI:PENDING:SUPPLY_PIPELINE
AUTO:REGION_RESEARCH_SOURCES
AUTO:REGION_RESEARCH_LOG
```

`AI:PENDING:SUPPLY_PIPELINE`은 `AUTO:REGION_MARKET` 직후·`AI:PENDING:TRANSPORT_LIFE` 전에 위치한다. writer는 이 8개 marker 사이만 갱신한다. frontmatter, metrics, history, market, `AUTO:REGION_LAND_PRICE`, `AUTO:REGION_TRANSIT`, HUMAN 블록은 byte-for-byte 보존한다. 기존 내용이 있으면 fail-closed로 거부한다. atomic write (temp + fsync + rename) 만 사용한다.

### 10.3 Transit writer (v1.5)

`AUTO:REGION_TRANSIT`는 research writer와 완전히 분리된 transit writer(`region-transit-writer.js`)가 소유한다.

**marker 위치**: `## 교통·생활` 내에서 `AI:PENDING:TRANSPORT_LIFE:START` 바로 위. 정확히 하나의 START/END pair만 허용한다.

**package**: `SYSTEM/CACHE/region-transit-packages/{region_key}/{provider}_{map-sha12}.json`에 저장한다. `schema_version`, `region_key`, `provider`, `crosswalk_path`, `map_sha256`, `created`, `stations[]` 필드를 가진다.

**입력**: `SYSTEM/CACHE/region-transit/station-district-map.json` + `hashes.json`만 허용한다. crosswalk 파일명은 `station-district-map.json`으로 고정된다.

**검증**:
- map SHA-256을 crosswalk 파일과 대조한다.
- `hashes.json`은 필수이며 map hash + 모든 station raw hash를 포함해야 한다.
- raw file은 `realpathSync`로 검증하고 symlink/traversal을 차단한다.
- package station은 crosswalk의 역명·노선·region_key·raw_path·raw_sha256과 대조한다.
- `AUTO:REGION_TRANSIT:END`가 `AI:PENDING:TRANSPORT_LIFE:START`보다 뒤에 있으면 reject한다.

**적용 규칙**:
- `--execute` 없이 dry-run으로 동작한다. `--execute`가 명시돼야 실제 write를 수행한다.
- 같은 map hash면 no-op이다. 새 hash면 transit marker만 atomic 교체한다.
- frontmatter, metrics, land price, market, research, HUMAN, `AI:PENDING:TRANSPORT_LIFE`, `verification_status`는 byte-for-byte 보존한다.
- transit writer는 marker를 삽입하지 않는다. v1.5 migration(`region-contract-migrate-v1_5.js`)이 빈 marker를 추가한다.

**렌더링**: 각 역의 공식 URL(`source_url`)과 raw SHA-256을 출력에 포함한다. 역명은 crosswalk에서 다시 읽어 package text를 신뢰하지 않는다.

**지원 provider**: 승인된 provider만 허용한다. 현재 `incheon-metro`, `busan-metro`가 승인 상태다. 새 provider는 운영사·역별 원천·raw hash·공식 행정경계 point-in-polygon 검증을 provider 계약과 테스트로 갖춘 뒤에만 추가한다. 역이 0개인 지역은 package를 만들지 않고 빈 marker를 유지한다. 빈 marker는 "교통이 없다"는 의미가 아니다.

### 10.4 validator와 integrator 책임 분리

```text
validator (region-research-package-core.js):
  - JSON 구조 (strict schema, unknown 필드 거부)
  - HTTPS URL 파싱 (protocol, username/password, 공백/개행/angle-bracket, raw non-ASCII 거부; URL은 ASCII 또는 percent-encoded 직접 URL)
  - source_ids 참조 무결성
  - Markdown 구조 안전성 (표 cell |, backslash escape, 링크 label 파괴 문자 거부)
  - risks.kind enum
  - supply_pipeline: 공식 source_id, 25~60개월 예정월, 단계, 세대수, 중복 검증

integrator:
  - URL이 실제 공식 기관 도메인인지 (allowlist로 코드가 추측 차단하지 않음)
  - 페이지가 주장에 직접 근거를 제공하는지
  - official_fact 분류가 의미상 정확한지 (writer는 의미를 판별하지 못함)
  - source_type: official_primary가 작성자 선언과 일치하는지
```

worker는 공식성을 추정해 선언하면 안 된다. integrator가 공식성을 확인하기 전에는 package를 적용하지 않는다.

### 10.4 package 적용 전 필수

- 공식 출처 의미 검토 (integrator) 완료 — 각 URL을 실제로 열어 공식 기관·직접 근거·조회일을 확인한다. URL 형식 통과만으로 적용하지 않는다.
- 기존 조사 내용이 없거나 전부 비어 있을 것
- 대상 Region Object가 이미 존재할 것 (writer가 신규 생성하지 않음)
- dry-run으로 plan 확인 후 실제 apply

### 10.5 package 원본 보존

package JSON은 적용 후에도 cache에 보존한다. region의 조사 근거를 시간이 지나도 추적할 수 있도록 한다. writer가 package를 삭제하지 않는다.

## 11. 지가 package writer (v1.4.0)

공시지가는 별도 canonical package(`SYSTEM/CACHE/land-price-packages/{scope}/{target_id}/{as_of}.json`)만으로 반영한다. `scope: case`는 기존 `auction_case`의 `land_parcel_id`, `official_land_price_per_sqm`, `official_land_price_as_of`, `official_land_price_source`, `land_rights_area_sqm`만 갱신한다. `scope: region`은 기존 `auction_region`의 지가 추세 frontmatter와 `AUTO:REGION_LAND_PRICE` marker만 갱신한다.

- package는 기준일, 직접 HTTPS 공식 URL, 기관·제목·조회일, `official_primary` 출처를 요구한다.
- 공시지가 총액은 저장 금지다. 필요하면 View에서 `㎡당 공시지가 × 토지권 면적`으로만 계산한다.
- 지가 writer는 실재 Object를 생성하지 않으며, dry-run 후 명시 적용하고 같은 package 재적용은 no-op이다.
- 공시지가는 행정 기준값이므로 시세·감정가·최저가·낙찰가의 대체값 또는 투자 결론으로 사용하지 않는다.

## 12. 기존 Region Object v1.4 호환 마이그레이션

기존 부산 Region Object는 `region-contract-migrate-v1_4.js`로만 v1.4 구조를 추가한다. 기본 실행은 dry-run이며, 실제 쓰기는 `--execute`를 명시해야 한다.

```bash
node SYSTEM/SCRIPTS/region-contract-migrate-v1_4.js --all-busan
```

마이그레이션은 기존 수치·시장 AUTO 블록·HUMAN/HUMAN:LOCKED/HUMAN:OWNED 본문을 재작성하지 않는다. 누락된 36/48/60개월·지가 frontmatter, 표시 행, 접이식 지표 이력 wrapper, `AI:PENDING:SUPPLY_PIPELINE`, `AUTO:REGION_LAND_PRICE` marker만 추가한다. 중복 marker·부분 표시 행·파싱 불가 JSON·지역키 불일치는 fail-closed로 중단한다.

---

**Version:** 1.5.0
**Status:** Operational (v1.5: AUTO:REGION_TRANSIT transit writer contract added; 인천 1·2호선 crosswalk 등록)
**Next:** 83개 marker migration(--execute), production transit package 생성, 실제 transit writer apply
