---
name: prodigy-auction-region-research
description: >
  Region Resource evidence research only. Metrics numbers come from official
  data adapters after Contract v1.2 dry-run Freeze — never invent or crawl
  statistics into frontmatter.
---

# Prodigy Region Research

계약: `SYSTEM/docs/Region_Property_Contract_v1.md` (**Version 1.2.3 Draft**)

## 숫자 금지 (현재 단계)

- dry-run → Adapter Freeze 전: **시장 지표 Property 기입 금지**
- AI는 공식 통계 숫자를 FM/히스토리에 넣지 않는다
- AI 역할: 권역·임장·호재 등 **본문 Evidence 초안** (pending), 출처 URL

## 수집 본경로 (사람/코드)

```text
공식 API/CSV → raw 보존 → 정규화 → 산식 → 히스토리 append → FM 최신
```

브라우저 크롤은 v1 본경로 아님.

## Provider (참고)

`reb_statistics`, `reb_price_file`, `reb_jeonse_ratio_file`, `reb_stock`,
`reb_supply`, `mois_households` — 상세는 계약 §3.

## 시군구 only

지역 노트에 `region_dong` 없음.

## job

- `evidence_draft`: pending 서술만
- `monthly_refresh`: **Freeze 이후** 어댑터 결과 패치만 (AI 산식 금지)
