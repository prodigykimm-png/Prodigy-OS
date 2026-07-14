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
created:         # Templater 자동
updated:         # Templater 또는 수동
```

### Case Info (사건 정보)

| Property | 목적 | 단위 |
|---|---|---|
| `source` | 경매 출처 (법원/컨설팅/공매) | 텍스트 |
| `case_number` | 사건번호 | 텍스트 |
| `court` | 담당 법원 | 텍스트 |
| `auction_dept` | 경매계 | 텍스트 |
| `auction_datetime` | 입찰일시 | ISO date/datetime |

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

### Investment (투자 및 시세 정보)

| Property | 목적 | 단위 |
|---|---|---|
| `appraisal_price` | 감정가 | 원 |
| `minimum_bid` | 최저입찰가 | 원 |
| `minimum_bid_rate` | 최저가율. 경매 원문 검증 및 정렬 보조용 공식 저장값 | 소수 (0.0~1.0) |
| `bid_deposit` | 입찰 보증금 | 원 |
| `expected_bid` | 예상 낙찰가 (내 예측) | 원 |
| `my_bid_price` | 내 입찰가 (실제 입찰액) | 원 |
| `winning_bid_price` | 최종 낙찰가 (실제 낙찰액) | 원 |
| `market_sale_price` | 매매 시세 | 원 |
| `market_jeonse_price` | 전세 시세 | 원 |
| `expected_deposit` | 예상 보증금 | 원 |
| `expected_monthly_rent` | 예상 월세 | 원 |
| `exit_price` | 매도 목표가 (출구 전략) | 원 |
| `market_price_basis` | 시세 판단 근거 | 텍스트 |
| `loan_ratio` | 대출비율 | 소수 (0.0~1.0) |
| `interest_rate` | 이자율 | 소수 (0.0~1.0) |

### Decision (의사 결정)

| Property | 목적 | 단위 |
|---|---|---|
| `site_visit_date` | 임장 기일 | ISO date |
| `decision_reason` | 결정 사유 | 텍스트 |
| `decision_date` | 의사결정 완료일 | ISO date |
| `review_date` | 복기 완료일 | ISO date |
| `auction_note` | 사용자 메모 (대시보드 표시용) | 텍스트 |
| `my_opinion` | 최종 투자 판단 관련 사용자 메모 (의사결정 사유 상세) | 텍스트 |

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
| `watching` | 검토 중인 물건 | `bidding`, `skipped` |
| `bidding` | 입찰 준비/진행 예정 | `won`, `lost`, `skipped` |
| `skipped` | 입찰 포기 | `archived` |
| `won` | 낙찰 | `reviewing` |
| `lost` | 패찰 | `reviewing` |
| `reviewing` | 복기 진행 중 | `archived` |
| `archived` | 복기 완료 및 사건 보관 | — |

### Status 전이 규칙

- `watching` 단계에서 임장 및 분석을 마친 후 `bidding` 상태로 전환하며 예상 입찰가를 등록합니다.
- `bidding` 상태에서 `won`(낙찰), `lost`(패찰), `skipped`(입찰포기)로 전환될 때 의사결정 수집 팝업(의사결정 사유 및 추가 메모)이 표시되며 본문의 `# Investment Decision` 영역이 자동으로 갱신됩니다.
- 낙찰(`won`) 및 패찰(`lost`) 이후에는 복기 단계(`reviewing`)로 진입하여 복기 완료 후 `archived` 상태로 사건을 보존합니다.
