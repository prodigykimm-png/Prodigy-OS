# Region Property Contract v1

**표시 명칭:** 부동산 지역 분석 (Real Estate Region Resource)
**내부 type:** `auction_region` (리네임 보류 · Registry 라벨: 부동산 지역)
**경로:** `PARA/RESOURCES/Auction Regions/{시도}-{시군구}.md`
**Version:** 1.2.3
**Status:** Draft — format + dry-run judgment locked; 수치 기입 금지

Object(`auction_case`) = 사건·입찰 판단.
Resource(지역 노트) = 재사용 가능한 시장 근거 + 시계열.

**파일명 `Region_Property_Contract_v1.md` 유지. 개정은 Version 필드만.**

### 공식 상태 (금정 1차 탐색 후)

```text
Contract: 1.2.3 Draft
Dry-run (금정구): BLOCKED
Numeric write: prohibited
Adapter Freeze: not allowed
Next gate: official raw reproduction for Geumjeong-gu
  (원계약 source → 금정 행·단위·합산·SHA-256)
```

탐색(데이터셋·컬럼 발견) 성공 ≠ dry-run PASS.

---

## 0. Freeze 순서

```text
1) 계약 Draft + 형식·판정 규칙 고정   ← 1.2.3
2) 금정구 dry-run (원본 재현)
3) 문제 Property 수정 또는 제외
4) 어댑터 계약 Freeze
5) 이후에만 실제 숫자 기입
```

- 출처 ID 확인 ≠ 수집 가능.
- dry-run overall PASS 전 FM 시장 지표 **기입 금지**.
- **AI는 숫자 수집·산식 금지.** AI = 본문 Evidence 요약 only.

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
제공 horizon < 24개월 → move_in_24m = null (부분 합산 금지)
```

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

- v1 본경로에 R-ONE 화면 크롤 금지.
- 2차 가공 사이트 1차 출처 금지.

### 2.1 Provider 코드

| code | 역할 |
|------|------|
| `reb_statistics` | OpenAPI 거래 등 |
| `reb_price_file` | 매매가격지수 파일 |
| `reb_jeonse_ratio_file` | 중위 매매 대비 전세 |
| `reb_stock` | 단지 식별 → 아파트 합산 |
| `reb_supply` | 입주예정물량 |
| `mois_households` | 주민등록 세대 |
| `court_auction` | 경매 (v1 미수집) |
| `derived` | 파생 지표 |

### 2.2 원본 보존

```text
경로: SYSTEM/CACHE/region-metrics/{region_key}/{snapshot_id}/
  raw.*          # 응답·CSV 원본
  meta.json      # source_id, fetched_at, http/etag 등
해시: SHA-256 (hex lower-case), 필드 raw_hash
region_key: normalize 된 {시도}-{시군구} (파일명과 동일)
```

캐시는 git 커밋 대상 아님 (로컬/운영 산출물).

---

## 3. 출처 초안 (dry-run 전 · 기입 금지)

| Property | source_id | provider | 규칙 |
|----------|-----------|----------|------|
| `sale_volume_3m` | `15134761` | `reb_statistics` | 확정 3개월 합. 코드 dry-run 고정 |
| `housing_stock` | `15106861` | `reb_stock` | 아파트만 시군구 합, 연 1회 |
| `sale_turnover_rate` | — | `derived` | `(vol*4)/stock`, 소수 4자리 |
| `sale_price_change_yoy` | `15069821` | `reb_price_file` | 원지수 YoY. 월간 변동률 직접 저장 금지 |
| `jeonse_ratio` | `15143751` | `reb_jeonse_ratio_file` | 중위 매매 대비 전세. 전세지수 대체 금지 |
| `move_in_12m` | `15111714` | `reb_supply` | §0.4: 1~12개월 합 (30세대+ 공동주택) |
| `move_in_24m` | `15111714` | `reb_supply` | §0.4: **1~24개월 누적**(12 포함). horizon < 24m → null |
| `households` | `15108071` | `mois_households` | 시군구 5자리 코드 세대수 (**등** 금지, 이 ID만 v1 후보) |
| `household_change_yoy` | `15108071` | `mois_households` | 전년 동월 대비 % |
| `auction_bid_rate_6m` | — | `court_auction` | **v1 null** |

### 3.1 정의 요약

- `housing_stock_basis: reb_public_price_apartment_units`
- turnover: 비율 0.xxxx / UI %; vol·stock 없으면 null
- 시군구 코드 5자리; 법정동·행정동 혼칭 금지

### 3.2 시점

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

### 4.1 Frontmatter 키

정체성: `type`, `region_sido`, `region_sigungu`, `status`, `updated`

메타: `metrics_as_of`, `metrics_scope`, `metrics_source`, `source_as_of`,
`verification_status`, `housing_stock_basis`, `sale_price_change_basis`

코어: `sale_volume_3m`, `housing_stock`, `sale_turnover_rate`,
`sale_price_change_yoy`, `jeonse_ratio`, `move_in_12m`, `move_in_24m`,
`households`, `household_change_yoy`

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
| households | 세대수 |
| household_change_yoy | 세대수 변동 YoY |
| auction_bid_rate_6m | 경매 낙찰가율(6개월) |

---

## 5. 히스토리 형식 (고정)

### 5.1 위치

노트 본문:

```markdown
## 지표 히스토리

```json
{ ...snapshots... }
```
```

- 언어 태그 **`json` 필수**.
- 이 코드펜스 **하나만** 히스토리 canonical (추가 서술 블록 금지).
- 마커: 펜스 직전 HTML 주석 `<!-- PRODIGY_REGION_METRICS_HISTORY -->` 권장.

### 5.2 스키마

```json
{
  "schema_version": 1,
  "region_key": "부산광역시-금정구",
  "snapshots": [
    {
      "snapshot_id": "2026-06-01_20260718T120000Z",
      "metrics_as_of": "2026-06-01",
      "source_as_of": "2026-07-18",
      "verification_status": "unverified",
      "metrics": {
        "sale_volume_3m": {
          "value": null,
          "unit": "count",
          "as_of": null,
          "provider": "reb_statistics",
          "source_id": "15134761",
          "series_code": null,
          "verification": "unverified",
          "raw_hash": null,
          "raw_path": null
        },
        "sale_turnover_rate": {
          "value": null,
          "unit": "ratio",
          "as_of": null,
          "provider": "derived",
          "source_id": null,
          "formula": "vol3m*4/stock",
          "verification": "unverified",
          "raw_hash": null,
          "raw_path": null
        }
      }
    }
  ]
}
```

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
3. **`snapshot_id` 없이** 같은 `metrics_as_of` + 같은 전 지표 `raw_hash` 묶이면 no-op 또는 replace.
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

**Version:** 1.2.3
**Status:** Draft (format + dry-run judgment locked; overall dry-run BLOCKED until raw reproduction)
**Next:** 금정구 공식 raw 재현 (행·단위·합산·SHA-256) → 개별 PASS → Adapter Freeze → 수치 기입
