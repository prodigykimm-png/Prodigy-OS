# Prodigy OS — Auction Case Schema

> 경매/공매 물건 1건을 관리하는 Object의 스키마.
> 조사 → 분석 → 입찰 결정 → 결과 → 복기 전체 흐름을 관리한다.
> Version: 0.1 (Sprint 3)

---

## Auction Case 필수 Property

### Core (공통 스키마)

```yaml
id:              # 파일명과 동일 (Templater 자동)
type: auction_case
status:          # Auction Status Enum 참조
next_action:     # 당장 할 일 한 줄
due_date:        # 입찰 마감일 또는 다음 액션 기한
priority:        # 1~5
review_status:   # pending | done | null
connections:     # 관련 Object 링크
created:         # Templater 자동
updated:         # Templater 또는 수동
```

### Case Info (사건 정보)

| Property | 목적 | 단위 |
|---|---|---|
| `source` | 경매 출처 (법원/컨설팅/공매) | 텍스트 |
| `case_number` | 사건번호 | 텍스트 |
| `auction_date` | 입찰일 | ISO date |

### Location (위치)

| Property | 목적 |
|---|---|
| `region_sido` | 시/도 |
| `region_sigungu` | 시/군/구 |
| `region_dong` | 읍/면/동 |
| `address` | 상세 주소 |
| `property_type` | 오피스텔/아파트/상가/토지 등 |

### Building (건물)

| Property | 목적 | 단위 |
|---|---|---|
| `building_year` | 준공연도 | 정수 |
| `exclusive_area` | 전용면적 | m² |
| `supply_area` | 공급면적 | m² |

> `building_age`는 building_year에서 계산 (Derived Property Rule).

### Price (가격)

| Property | 목적 | 단위 |
|---|---|---|
| `appraisal_price` | 감정가 | 원 |
| `minimum_bid` | 최저입찰가 | 원 |
| `expected_bid` | 예상 낙찰가 (내 예측) | 원 |
| `actual_bid` | 실제 낙찰가 | 원 |
| `winning_bid` | 내 낙찰가 (입찰 시) | 원 |
| `bid_result` | 입찰 결과 | won/lost/null |

> `bid_rate`, `my_bid_rate`, `bid_gap` 등은 계산값이므로 저장하지 않는다.

### Finance (재무)

| Property | 목적 | 단위 |
|---|---|---|
| `monthly_rent` | 월세 | 원/월 |
| `loan_ratio` | 대출비율 | 소수 (0.0~1.0) |
| `interest_rate` | 이자율 | 소수 (0.0~1.0) |

> `annual_rent`는 monthly_rent × 12로 계산.
> `annual_interest`는 loan_amount × interest_rate로 계산.

### Review (복기)

| Property | 목적 |
|---|---|
| `failure_reason` | 실패 원인 (lost일 때) |
| `lesson_learned` | 배운 점 |
| `review_summary` | 복기 요약 |

### Attachments (첨부)

```yaml
attachments:
  appraisal_report:   # 감정서 링크
  sale_statement:     # 매각명세서 링크
  field_report:       # 임장 보고서 링크
```

---

## Auction Status Enum

| Status | 의미 | 다음 상태 |
|---|---|---|
| `watching` | 관심만 갖고 있는 단계 | `rights_analysis` |
| `rights_analysis` | 권리분석 중 | `market_analysis` |
| `market_analysis` | 시세분석 중 | `profitability` |
| `profitability` | 수익성 분석 중 | `site_visit` 또는 `ready_to_bid` |
| `site_visit` | 임장 예정/완료 | `ready_to_bid` |
| `ready_to_bid` | 입찰 준비 완료 | `bid_submitted` |
| `bid_submitted` | 입찰 제출 | `won` 또는 `lost` |
| `won` | 낙찰 | `review_completed` |
| `lost` | 패찰 | `review_completed` |
| `review_completed` | 복기 완료 | `archived` |
| `archived` | 보관 | — |

### Status 전이 규칙

- `won` / `lost`가 되면 `review_status`를 `pending`으로 설정 (복기 대상).
- `review_completed`가 되면 `review_status`를 `done`으로 설정.
- Homepage Needs Review 섹션: `review_status = "pending"` 또는 `status = won` 또는 `status = lost`.
