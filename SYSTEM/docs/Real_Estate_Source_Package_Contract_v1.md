# 부동산 조사 패키지 계약 v1

이 계약은 k-skill 기반 외부 조회 결과를 Auction Object에 반영하기 전 보존하는 캐시 패키지의 형식을 정의한다.

## 경계

- k-skill은 교체 가능한 수집 계층이다.
- `SYSTEM/CACHE/real-estate-source-packages/`의 패키지가 조사 증거의 원본이다.
- Auction Object에는 사용자가 승인한 기존 사실 Property만 반영한다.
- 실거래가·공시가격·공시지가는 Region Metrics의 공식 시계열을 대체하지 않는다.
- `status`, 투찰 판단, 개인 의견은 수집기와 승인 writer가 변경하지 않는다.

## 패키지 위치

```text
SYSTEM/CACHE/real-estate-source-packages/{case_key}/{observed_at}/
├── package.json
└── raw/
    ├── court-auction.json
    ├── building-register.json
    ├── real-estate-transactions.json
    ├── housing-official-price.json
    └── land-price.json
```

`case_key`는 사건번호와 물건번호를 안전한 파일명으로 정규화한 값이며, `observed_at`은 UTC ISO 시각이다. 새 조회는 기존 폴더를 덮어쓰지 않는다.

## package.json

```json
{
  "schema_version": 1,
  "package_id": "string",
  "case_key": "string",
  "observed_at": "2026-08-01T00:00:00.000Z",
  "query_identity": {
    "object_path": "string",
    "case_number": "string",
    "court": "string",
    "address": "string"
  },
  "collector": {
    "k_skill_repository": "https://github.com/NomaDamas/k-skill",
    "k_skill_commit": "string",
    "package_version": "string",
    "selected_skills": ["string"]
  },
  "providers": {
    "court": { "status": "success", "source_url": "https://...", "fetched_at": "...", "raw_path": "...", "raw_sha256": "...", "warnings": [] }
  },
  "candidate_patch": {},
  "evidence": {},
  "errors": []
}
```

각 provider의 `status`는 `success`, `empty`, `failed`, `needs_identifier`, `needs_selection` 중 하나다. 성공·빈 응답도 원문과 SHA-256을 보존한다. 실패 시 안전하게 표시할 수 있는 오류 코드와 사용자용 메시지만 보존한다.
