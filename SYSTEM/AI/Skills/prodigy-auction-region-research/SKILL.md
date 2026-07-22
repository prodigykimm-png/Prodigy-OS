---
name: prodigy-auction-region-research
description: >
  Research Region Resource evidence and operate the frozen official metrics pipeline.
  Metrics numbers come only from the Contract v1.4.0 collector and atomic writer;
  never invent or crawl statistics into frontmatter.
---

# Prodigy Region Research

계약: `SYSTEM/docs/Region_Property_Contract_v1.md` (**Version 1.4.0 Operational**)

## 숫자 경계

- AI는 공식 통계 숫자를 FM/히스토리에 넣지 않는다
- 숫자는 `region-metrics-refresh.js`가 만든 전체 snapshot만 입력으로 사용한다
- 기존 Region Object에 `region-metrics-apply.js --dry-run` 확인 후에만 원자 반영한다
- 자동 반영은 항상 `unverified`; `verified`는 사람만 승인한다
- writer는 Region Object를 자동 생성하지 않는다
- AI 역할: 권역·임장·호재 등 **본문 Evidence 초안** (pending), 출처 URL

## 본문 소유권

비워두지 말고 소유권에 따라 채운다.

- `AUTO:REGION_MARKET`: metrics writer 전용. AI가 직접 숫자를 쓰지 않는다.
- `AUTO:REGION_RESEARCH_SOURCES`: 공식 1차 출처 URL, 기관, 조회일.
- `AUTO:REGION_RESEARCH_LOG`: 조사일, 조사 범위, 한계.
- `AI:PENDING:SUMMARY`: 조사 결과의 한 줄 제안. 확정 판단 금지.
- `AI:PENDING:ZONES`: 행정동·교통·생활권 기반 권역 후보. HUMAN 표를 수정하지 않는다.
- `AI:PENDING:TRANSPORT_LIFE`: 공식 자료로 확인된 교통·생활 사실.
- `AI:PENDING:RISKS`: 공식 위험 신호와 현장 확인 필요 항목.
- `AI:PENDING:SITE_VISIT`: 관찰 체크리스트. 현장 결과를 미리 쓰지 않는다.
- `AI:PENDING:SUPPLY_PIPELINE`: 25~60개월 공식 사업 후보. 확정 입주물량이나 투자 결론으로 쓰지 않는다.
- `HUMAN`, `HUMAN:LOCKED`, `HUMAN:OWNED`: 절대 수정하지 않는다.

## evidence_draft 절차

1. 현재 snapshot과 Region Object의 지역키를 확인한다.
2. 교통·행정구역·공원·시장·정비사업·재해 등은 최신 **공식 1차 출처**를 우선 조사한다.
3. 모든 변동 가능 사실에 직접 URL과 조회일을 붙인다.
4. 사실과 해석을 분리한다. 해석은 `AI 제안 · 확인 필요`라고 표시한다.
5. 각 marker 사이만 교체하고 marker 밖 Content는 보존한다.
6. 임장으로만 알 수 있는 경사 체감·소음·냄새·주차·관리·보안·점유는 체크리스트로만 제안한다.
7. 완료 후 `AUTO:REGION_RESEARCH_LOG`에 조사일과 남은 미확인 항목을 기록한다.

## 수집 본경로 (사람/코드)

```text
공식 API/CSV → raw 보존 → 정규화 → 산식 → cache snapshot
→ dry-run → 히스토리 + FM + 표시 표 원자 갱신 → 사람 검증
```

브라우저 크롤은 v1 본경로 아님.

## Provider (참고)

`reb_rone_public_table`, `reb_stock`, `reb_supply`,
`mois_jumin_statmonth_csv`, `derived` — 상세는 계약 §3.

## 시군구 only

지역 노트에 `region_dong` 없음.

## job

- `evidence_draft`: 공식 사실은 AUTO source registry에, 해석·권역·임장 체크리스트는 AI:PENDING에 기록
- `monthly_refresh`: collector cache 생성 → writer `--dry-run` → 승인 후 실제 반영

```bash
node SYSTEM/SCRIPTS/region-metrics-apply.js \
  --snapshot SYSTEM/CACHE/region-metrics/{region_key}/{snapshot_id}/snapshot.json \
  --target "PARA/RESOURCES/Auction Regions/{region_key}.md" \
  --dry-run
```

실제 반영은 사용자가 대상 Object와 snapshot을 승인한 뒤 `--dry-run`만 제거한다.

## package mode (v1)

저비용 조사 에이전트는 Region Object를 직접 수정하지 않는다. 공식 1차 출처만 조사해 schema v1 JSON package를 제출한다.

- writer: `SYSTEM/SCRIPTS/region-research-apply.js`
- package schema: `SYSTEM/SCRIPTS/region-research-package-core.js`
- package canonical cache 경로: `SYSTEM/CACHE/region-research-packages/{region_key}/{researched_at}.json`
  - package는 writer가 자동 생성하거나 이동하지 않는다.
  - writer는 이 경로 아래에 있는 파일만 허용한다. Vault 밖 `/tmp` 등은 거부한다.
  - package는 적용 후에도 보존한다 (조사 근거 원본).
- package는 `schema_version: 1`만 허용
- 숫자 metrics, frontmatter, verification_status는 package에 절대 포함하지 않는다
- 인간 경험이 필요한 항목은 `unresolved` 또는 `site_visit`으로 남긴다

### validator와 integrator 책임 분리

- validator (`region-research-package-core.js`):
  - JSON 구조 (strict schema, unknown 필드 거부)
  - HTTPS URL 파싱 (protocol, username/password, 공백/개행/angle-bracket, raw non-ASCII 거부; ASCII 또는 percent-encoded 직접 URL만 허용)
  - source_ids 참조 무결성
  - Markdown 구조 안전성 (표 cell `|`, backslash escape, 링크 label 파괴 문자 거부)
  - `risks.kind` enum
- integrator:
  - URL이 실제 공식 기관 도메인인지 (allowlist로 코드가 추측 차단하지 않음)
  - 각 URL을 실제로 열어 페이지가 주장에 직접 근거를 제공하는지
  - `official_fact` 분류가 의미상 정확한지 (writer는 의미를 판별하지 못함)
  - `source_type: official_primary`가 작성자 선언과 일치하는지

worker는 공식성을 추정해 선언하면 안 된다. integrator가 공식성을 확인하기 전에는 package를 적용하지 않는다.

### package CLI

```bash
node SYSTEM/SCRIPTS/region-research-apply.js \
  --dry-run \
  --target "PARA/RESOURCES/Auction Regions/{region_key}.md" \
  --package "SYSTEM/CACHE/region-research-packages/{region_key}/{researched_at}.json"
```

writer는 8개 허용 marker 블록(`AI:PENDING:SUMMARY/ZONES/TRANSPORT_LIFE/RISKS/SITE_VISIT/SUPPLY_PIPELINE`, `AUTO:REGION_RESEARCH_SOURCES/LOG`)만 수정한다. `AI:PENDING:SUPPLY_PIPELINE`은 `AUTO:REGION_MARKET` 뒤·교통·생활 앞에 위치한다. frontmatter, metrics, history, market, `AUTO:REGION_LAND_PRICE`, HUMAN 블록은 byte-for-byte 보존한다. 기존 내용이 있으면 fail-closed로 거부한다.
