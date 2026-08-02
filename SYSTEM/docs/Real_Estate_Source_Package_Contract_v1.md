# 부동산 조사 패키지 계약 v1

이 계약은 k-skill 기반 외부 조회 결과를 Auction Object에 반영하기 전 보존하는 캐시 패키지의 형식을 정의한다.

## 경계

- k-skill은 교체 가능한 수집 계층이다.
- `SYSTEM/CACHE/real-estate-source-packages/`의 패키지가 조사 증거의 원본이다.
- Auction Object에는 사용자가 승인한 기존 사실 Property만 반영한다.
- 실거래가·공시가격·공시지가는 Region Metrics의 공식 시계열을 대체하지 않는다.
- `status`, 투찰 판단, 개인 의견은 수집기와 승인 writer가 변경하지 않는다.
- 첫 릴리스의 선택 skill은 다음 5개로 고정한다: `court-auction-notice-search`, `building-register-search`, `real-estate-search`, `housing-official-price`, `gongsijiga-search`.
- `collector.selected_skills`는 provider 별칭이 아니라 위 skill 이름과 정확히 일치해야 한다.
- 승인 직전에 `package.json` 자체와 성공·빈 응답 raw 파일의 SHA-256을 다시 검증한다. 해시 불일치·패키지 경로 이탈·schema 불일치는 승인을 차단한다.
- 공식 출처 직접 조회가 기본이며, k-skill 호스팅 프록시는 `PRODIGY_REAL_ESTATE_ALLOW_PROXY=1`일 때만 허용한다. API key는 환경변수에서만 읽고 패키지·로그에 저장하지 않는다.
- 후보 반영은 전체 공급자 성공 여부가 아니라 후보 필드별 exact identity 검증으로 결정한다. 일부 공급자가 실패해도 원문·근거·성공한 후보는 보존하지만, `candidate_sources`에 기록된 공급자 중 하나라도 `match_verified: true`가 아니면 그 필드는 승인할 수 없다.
- `query_identity.object_fingerprint`는 조사 시작 시점의 Auction Object 사실 식별자다. 승인 시 현재 Object에서 다시 계산한 fingerprint와 다르면 패키지가 오래된 것으로 보고 반영을 차단한다.
- k-skill 업데이트는 자동 반영하지 않는다. 새 commit·패키지 버전을 검증하고 fixture·계약 테스트를 통과시킨 뒤 `SYSTEM/CONFIG/k-skill-real-estate-lock.json`의 commit, package version, skill 파일 해시를 함께 변경한다.
- Auction 카드의 `부동산 조사`는 Obsidian 데스크톱에서만 저장소에 포함된 고정 수집기(`SYSTEM/SCRIPTS/real-estate-source-collect.js`)를 직접 실행할 수 있다. 실행 대상, provider 목록, Vault 경로는 코드로 제한하고 임의 명령이나 AI 명령 실행으로 대체하지 않는다.
- Codex·Antigravity는 수집된 정규화 사실을 한국어로 요약하는 읽기 전용 계층으로만 사용한다. AI 요약 실패는 패키지 생성·원문 보존·사용자 승인 흐름을 막지 않으며, AI 응답은 Object나 package.json에 저장하지 않는다.
- 모바일이나 로컬 프로세스 실행이 불가능한 환경에서는 조사 명령 복사만 제공한다. Obsidian 화면에서 외부 조회를 임의로 실행하지 않으며, 데스크톱 수집기가 API key를 환경변수 밖으로 기록하지 않는다.

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
    "object_fingerprint": "sha256",
    "case_number": "string",
    "court": "string",
    "court_code": "string",
    "address": "string",
    "normalized_address": "string",
    "road_address": "string",
    "lot_address": "string",
    "lot_number": "string",
    "pnu": "string",
    "region_sido": "string",
    "region_sigungu": "string",
    "region_dong": "string",
    "lawd_cd": "string",
    "property_type": "string",
    "building_name": "string",
    "building_dong": "string",
    "unit_number": "string",
    "apt_code": "string",
    "apt_notice_date": "string",
    "dong_code": "string",
    "ho_code": "string"
  },
  "collector": {
    "k_skill_repository": "https://github.com/NomaDamas/k-skill",
    "k_skill_commit": "string",
    "package_version": "string",
    "selected_skills": [
      "court-auction-notice-search",
      "building-register-search",
      "real-estate-search",
      "housing-official-price",
      "gongsijiga-search"
    ]
  },
  "providers": {
    "court": { "status": "success", "source_url": "https://...", "fetched_at": "...", "raw_path": "...", "raw_sha256": "...", "warnings": [] }
  },
  "match_resolution": {
    "schema_version": 1,
    "resolution_method": "canonical_identity_preflight",
    "normalized_input": {},
    "selected_identity": {
      "case": { "court_code": "string", "case_number": "string" },
      "parcel": { "pnu": "string", "lot_address": "string", "lot_number": "string" },
      "building": { "complex_name": "string", "apt_code": "string", "building_dong": "string" },
      "unit": { "unit_number": "string", "dong_code": "string", "ho_code": "string" }
    },
    "provider_query_identity": {},
    "query_fingerprint": "sha256",
    "match_verified": false,
    "candidate_sources": {
      "minimum_bid": ["court"]
    },
    "evidence_refs": [],
    "providers": {
      "court": {
        "status": "resolved",
        "method": "unique_court_name",
        "query": { "court_code": "string", "case_number": "string" },
        "selected": {},
        "candidates": [],
        "match_verified": true,
        "scope": "case",
        "reason": "case_identity_exact"
      }
    }
  },
  "candidate_patch": {},
  "evidence": {},
  "errors": []
}
```

각 provider의 `status`는 `success`, `empty`, `failed`, `needs_identifier`, `needs_selection` 중 하나다. 성공·빈 응답도 원문과 SHA-256을 보존한다. 실패 시 안전하게 표시할 수 있는 오류 코드와 사용자용 메시지만 보존한다.

## 매칭 계약

수집은 다음 순서로 동작한다.

`Auction Object → canonical identity → provider query identity → 공급자 반환 식별자 검증 → package`

- 사건은 `court_code + case_number`, 필지는 `PNU 또는 지번`, 건물은 `단지·건물`, 호실은 `동·호`를 별도 identity로 다룬다.
- 정확하고 유일한 매칭만 자동 확정한다. 법원 후보, 필지, 공동주택 단지·동·호가 여러 개이면 `needs_selection`으로 남기고 첫 결과를 선택하지 않는다.
- 공급자가 반환한 사건번호·PNU·주소·단지·동·호가 선택 identity와 다르면 원문은 보존하되 `failed`와 `IDENTITY_MISMATCH`를 기록하고 `candidate_patch` 생성을 차단한다.
- 사건은 반환된 사건번호와 법원 코드가 모두 있어야 하고, PNU를 선택한 필지는 반환 PNU가 반드시 일치해야 한다. 공동주택 공시가격은 단지 코드·단지명·동·호를 코드 또는 이름으로 모두 확인해야 한다. 반환 식별자가 생략된 응답은 주소가 같아 보여도 매칭하지 않는다.
- `1905호` 같은 호실 suffix는 항상 unit identity다. 필지 조회용 `lot_address`와 `lot_number`에 넣지 않는다. 도로명 주소만 있는 경우 개별공시지가는 지번 선택 전까지 실행하지 않는다.
- 실거래가는 현재 k-skill 계약상 개별 물건의 exact identity가 아니라 `시·군·구·법정동·물건 유형` 기반 비교 범위다. 패키지에는 `scope: region`과 비교 조회임을 남기며 Auction 사실 필드의 근거로 자동 덮어쓰지 않는다.
- 건축물대장·개별주택 공시가격은 직접 조회에 PNU가 필요하다. 주소 기반 프록시는 명시적 `PRODIGY_REAL_ESTATE_ALLOW_PROXY=1` 실행에서만 허용한다.

## 선택 재실행

Obsidian의 매칭 영역은 공급자 상태, 후보, 부족한 식별자를 보여주고 다음 CLI 선택값을 포함한 명령을 복사한다.

`--court-code`, `--pnu`, `--lot-address`, `--building-name`, `--building-dong`, `--unit-number`, `--apt-code`, `--apt-notice-date`, `--dong-code`, `--ho-code`, `--lawd-cd`

프록시 허용은 선택한 한 번의 데스크톱 실행에만 환경변수로 전달한다. 선택값·API key·환경변수 값은 패키지, 영수증, 로그에 저장하지 않는다. 조사 패키지가 매칭 확정되지 않은 경우에도 원문과 실패 이유는 보존되지만 사용자는 해당 공급자의 후보를 반영할 수 없다. UI와 writer는 exact identity가 검증된 후보 필드만 승인한다.
