# Region Source Snapshot Contract v1

## 목적

이 계약은 외부 부동산·지역 자료를 Region 의사결정에 사용하기 전에 원문, 시점, 결측 사유, 지역 식별자를 보존하는 경계를 정의한다. 이 단계의 산출물은 사실 후보와 조사 근거이며, 기존 Region Object나 사용자의 판단을 자동으로 덮어쓰지 않는다.

기계 계약은 다음 파일에 있다.

- `SYSTEM/SCRIPTS/region-geography-registry.json` — Phase 0 서울·부산 41개 시군구 식별자
- `SYSTEM/SCRIPTS/region-provider-support-matrix.json` — 공급자별 readiness와 차단 사유
- `SYSTEM/SCRIPTS/region-source-snapshot.schema.json` — 한 번의 원문 관측 계약
- `SYSTEM/SCRIPTS/region-source-ledger.schema.json` — append-only 관측 목록 계약
- `SYSTEM/SCRIPTS/region-source-snapshot-core.js` — 시점·결측·원문 해시 검증
- `SYSTEM/SCRIPTS/region-source-ledger-core.js` — 세대 추가와 현재 표시 projection

## 공급자 readiness

`official_available`, `adapter_ready`, `fixture_ready`, `network_allowed`, `projection_ready`는 서로 다른 게이트다. 다섯 값이 모두 참일 때만 `canDispatch()`가 참이 된다. 따라서 공식 사이트가 존재한다는 사실만으로 자동 조회나 Region 투영이 활성화되지 않는다.

현재 Phase 0에서 유일하게 `projection_ready`인 공급자는 기존 검증을 통과한 MOIS 주민등록 통계 pilot이다. 실거래가, 건축물대장, 공동주택 공시가격, 개별공시지가, 법원경매 등은 공식 출처와 목표 범위를 기록했지만, 요청·응답 fixture와 대상 매칭 계약이 완료되기 전까지 `blocked_*`로 남는다. 차단된 행을 편집해 ready로 바꾸는 것만으로는 검증을 통과할 수 없다.

API 키와 비밀값은 이 매트릭스·스냅샷·원장·로그·명령행에 저장하지 않는다. 실제 인증은 기존 Obsidian secret storage 경계에서만 처리한다.

## 스냅샷

각 관측은 `schema_version: 1`과 고유 `snapshot_id`를 갖는다. 다음 시간을 모두 보존한다.

- `valid_time` — 자료가 설명하는 기준일 또는 기준 시점
- `published_at` — 공급자가 공표한 시점
- `first_seen_at` — Prodigy가 해당 세대를 처음 확인한 시점
- `collected_at` — 이번 수집 실행이 원문을 가져온 시점

`raw_payload_hash`는 원문 payload의 소문자 SHA-256이며 `raw_path`는 `raw/` 하위 경로만 허용한다. `revision_type`은 최초 공표, 정정, 취소, 재공표를 구분한다.

`missingness_code: none`일 때는 숫자 measure가 하나 이상 있어야 하고 null을 허용하지 않는다. 그 외에는 숫자 0을 “자료 없음”으로 사용하지 않으며, measure는 null 또는 빈 객체로 남긴다. 예를 들어 `not_published`, `sample_suppressed`, `not_available`은 서로 다른 조사 결과다.

지역 식별자는 `mois_sigungu`를 기본으로 하며, release 당시 이름과 현재 이름을 함께 기록한다. 행정구역 유효일을 아직 공식 fixture로 확인하지 못한 행은 `effective_date_pending`과 null 날짜를 유지한다. 날짜를 추정하여 보충하지 않는다.

## append-only 원장과 표시 projection

원문 세대는 다음과 같이 저장하는 것을 목표로 한다.

```text
SYSTEM/CACHE/region-source-ledger/{provider_id}/{source_dataset_id}/{snapshot_id}/
├── snapshot.json
└── raw/
    └── 원문 파일
```

동일한 `projectionKey`에 새 수집 세대가 생기면 이전 세대를 삭제하거나 교체하지 않고 `snapshots`에 추가한다. 같은 `snapshot_id`가 다른 원문 해시로 다시 들어오면 충돌로 중단한다. `selectCurrentProjection()`은 가장 최근 `collected_at` 세대만 화면용으로 선택할 뿐 원문 원장을 변경하지 않는다.

이 경계는 기존 `SYSTEM/CACHE/region-metrics`와 다르다. 기존 Region metrics writer는 동일한 표시 `snapshot_id`를 현재 projection에서 교체할 수 있으며, 그 동작은 기존 계약으로 유지한다. 새 source ledger만 append-only 원장으로 취급한다.

## Phase 1 MOIS 파일럿 브리지

`SYSTEM/SCRIPTS/region-source-fixture-bridge-core.js`는 검증된 MOIS fixture를 읽어 서울·부산 41개 시군구 snapshot으로 변환한다. 이 모듈은 네트워크 요청이나 Vault 파일 쓰기를 하지 않는다.

```js
const bridge = require("./SYSTEM/SCRIPTS/region-source-fixture-bridge-core.js");

const result = bridge.appendMoisFixtureSnapshots(
  { schema_version: 1, snapshots: [] },
  {
    fixture_path: ".../2026-05-households.csv",
    expected_sha256: "검토된 fixture SHA-256",
    period: "2026-05",
    published_at: "2026-06-20T00:00:00.000Z",
    first_seen_at: "2026-08-03T00:00:00.000Z",
    collected_at: "2026-08-03T00:00:01.000Z"
  }
);
```

fixture 해시가 다르면 변환을 중단한다. 같은 기간·원문을 다른 수집 시각에 다시 읽으면 snapshot 세대를 추가하고, `selectCurrentProjection()`은 최신 세대만 반환한다. 서울·부산 밖의 42개 기존 Region은 이 파일럿에 포함되지 않으며, 다른 공급자는 각각 fixture와 매칭 계약을 통과한 뒤 같은 브리지 경계를 사용해야 한다.

원장에 보존된 자료를 화면에 투영할 때는 `SYSTEM/SCRIPTS/region-source-projection-gate-core.js`의 `selectReadyProjection()`을 통과시킨다. 이 gate는 support matrix의 `projection_ready`만 허용하므로, 차단된 실거래가나 parser seed가 원문 원장에 존재해도 Region 화면에 섞이지 않는다.

## Phase 2 R-ONE 원문 브리지

`SYSTEM/SCRIPTS/region-source-rone-fixture-bridge-core.js`는 기존 R-ONE parser fixture를 검증된 raw source snapshot으로 변환한다. 현재는 부산 사하구의 가격지수·전세가율·거래량 fixture만 연결하며, 행의 지역 라벨에 시도 alias와 시군구명이 모두 정확히 존재할 때만 `mois_sigungu` 식별자를 확정한다. 권역명만 있거나 시도 정보가 빠진 행은 `unmatched` 경고로 남기고 snapshot을 만들지 않는다.

이 단계에서 R-ONE의 support matrix 상태는 여전히 `blocked_coverage`이고 `projection_ready: false`다. 따라서 원문 원장에 R-ONE 세대가 보존되어도 `selectReadyProjection()` 결과에는 포함되지 않는다. 서울·경기·인천·부산 전체의 공식 동일 기간 fixture와 대상 매칭을 추가로 검토한 뒤에만 공급자 readiness를 승격할 수 있다.

## 변경 금지 범위

- 새로운 Auction frontmatter Property를 추가하지 않는다.
- `status`, `expected_bid`, `my_bid_price`, `decision_reason`, `my_opinion`을 자동 변경하지 않는다.
- 경매일 경과만으로 낙찰·패찰을 생성하지 않는다.
- 실거래가·공시가격·공시지가를 기존 Region 공식 시계열에 직접 기록하지 않는다.
- 네트워크 요청과 프로세스 실행은 Obsidian 카드 화면이 아니라 승인된 수집 경계에서만 수행한다.

## 다음 단계 게이트

각 공급자는 공식 요청/응답 fixture, 파서 계약 테스트, 대상 사건·지역 매칭, 원문 해시, projection 필드의 순서로 승격한다. 하나라도 빠지면 원문 또는 실패 사유만 남기고, 기존 Object에는 반영하지 않는다.
