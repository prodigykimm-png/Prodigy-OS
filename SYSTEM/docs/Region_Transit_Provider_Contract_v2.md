# Region Transit Provider Contract v2

서울·경기·인천·부산처럼 여러 운영기관과 광역 구간이 섞이는 지역의 교통 crosswalk 계약이다.

## 목적

`AUTO:REGION_TRANSIT`에 표시되는 역은 역명 추정이나 시군구 중심점 거리로 배정하지 않는다. provider별 공식 원천과 행정경계 point-in-polygon 검증을 모두 통과한 역만 publish한다.

## 금지

- 수도권 전체 노선도에서 provider 또는 운영사를 추론하지 않는다.
- 500+ 역 전체를 서울교통공사로 라벨링하지 않는다.
- 시군구 중심점·최근접 폴리곤·역명 접미사로 `region_key`를 자동 확정하지 않는다.
- raw 원문 또는 SHA-256이 없는 수동 좌표를 publish하지 않는다.
- 한 provider의 페이지를 다른 운영기관의 역 증거로 사용하지 않는다.
- candidate 상태의 provider에서 network dispatch를 수행하지 않는다.
- candidate row를 Region input에 도달시키지 않는다.

## Provider 행렬

### accepted_legacy (승인된 기존 corpus)

| Provider | Operator | Status | Notes |
|----------|----------|--------|-------|
| `incheon-metro` | 인천교통공사 | accepted_legacy | 7 package hashes preserved; ICTR per-station official pages |
| `busan-metro` | 부산교통공사 | accepted_legacy | 15 package hashes preserved; HUMETRO per-station official pages |

### candidate (검증 대기 — zero network)

| Provider | Operator | Status | Missing Gate |
|----------|----------|--------|--------------|
| `seoul-metro` | 서울교통공사 | candidate | Seoul OpenAPI StationAdresTelno key placement/response fixture not frozen |
| `metro9-stage1` | 서울9호선운영(주) | candidate | Separate operator/address/raw fixture for stage1 |
| `metro9-stage23` | 서울교통공사 | candidate | Operator split evidence and station fixture for stages 2/3 |
| `korail-station-candidate` | 한국철도공사 | candidate | Row-level Korail operator evidence; KRIC alone insufficient |
| `kric-station-candidate` | cross-operator | candidate | Provider/address/boundary evidence quarantine |
| `arex` | 공항철도(주) | candidate | Station list/address/raw fixture and operator evidence |
| `shinbundang` | 네오트랜스(주) | candidate | 대지위치 address and operator evidence |
| `gimpo-goldline` | 김포골드라인운영(주) | candidate | Station-code/name uniqueness and address fixture |
| `ui-sinseol` | 우이신설경전철(주) | candidate | Exact detail URL fixture; current fetch blocked_runtime |
| `sillim` | 남서울경전철(주) | candidate | Station detail/address and operator evidence |
| `everline` | 용인경량전철(주) | candidate | Exact detail fixture |
| `uijeongbu-lrt` | 의정부경전철(주) | candidate | Official station detail not frozen |
| `seohae-rail` | 서해철도(주) | candidate | Exact station detail/operator fixture; line-map code alone forbidden |

## Operator 분리 규칙

1. 각 provider는 하나의 운영기관(operator)만 대표한다.
2. 9호선은 1단계(서울9호선운영)와 2·3단계(서울교통공사)를 반드시 분리한다.
3. KRIC 역 목록은 cross-operator 후보이며, KRIC 등재만으로 운영사를 확정하지 않는다.
4. Korail 역은 row-level Korail 운영 증거가 있을 때만 Korail provider에 귀속한다.
5. 서해철도는 운영 역만 포함하며, 노선도 코드만으로 역을 귀속시키지 않는다.
6. 모든 station의 `operator` 필드는 해당 provider map의 `operator`와 정확히 일치해야 한다.

## Quarantine 정책

- candidate provider는 network dispatch 0회, Region input 도달 0건을 유지한다.
- quarantine 대상: nearest-centroid 매칭 결과, operator 미검증 row, raw/evidence/hash 부재 row.
- quarantine 해제는 reviewed fixture + validator 통과 + 사람 승인 envelope을 모두 요구한다.
- `region-transit-quarantine.js`는 preflight → backup → atomic write → rollback 순서로 동작한다.
- dry-run이 기본이며 `--execute` 없이는 어떤 파일도 변경하지 않는다.

## Enablement gate

candidate provider가 enabled로 전환되려면:

1. 공식 원천의 exact request/response fixture가 reviewed amendment로 추가
2. operator 증거 URL이 각 역별로 존재
3. 역별 공식 도로명주소 또는 좌표 + 공식 경계 데이터 확보
4. `region-transit-v2-core.js` validator 통과
5. package dry-run → 사람 승인 → writer apply 순서 준수

## provider 등록 기준

provider는 다음을 모두 갖춰야 한다.

1. 운영기관과 노선 범위를 직접 확인하는 공식 URL
2. 역별 공식 목록 또는 주소·좌표가 담긴 공식 원문
3. raw 원문 보존 경로와 SHA-256
4. 다음 둘 중 하나의 재현 가능한 지역 귀속 근거
   - 원문에 직접 포함된 공식 도로명주소의 시·군·구를 엄격하게 파싱한 `official_address_admin_parse`
   - 기준일·SHA-256이 기록된 공식 시군구 경계와 EPSG:4326 좌표의 정확히 하나인 `point_in_polygon`

조건을 하나라도 충족하지 못하면 `candidate`로 보류하며, Region Object에 쓰지 않는다.

## Region assignment 규칙

Region assignment는 다음 두 방법만 허용한다:

### official_address_admin_parse

- 원문 공식 주소에 시·군·구가 직접 존재할 때만 허용
- 서울특별시, 경기도, 인천광역시, 부산광역시 패턴 매칭
- `source_field`은 반드시 `"official_address"`

### point_in_polygon

- `sigungu_code` (5자리) 필수
- `boundary_sha256` (64 hex) 필수
- 경계 데이터 CRS는 `EPSG:4326`만 허용
- **정확히 하나의 폴리곤**에만 매칭되어야 함 (다중 매칭 = reject)
- 매칭 실패 = reject

### 금지 방법

- `nearest_center` / `nearest_centroid` / `nearest_polygon`
- `line_map_inference` / `station_name_suffix` / `coordinate_guess`
- 기타 좌표 기반 추정 방법 일체

## v2 crosswalk station schema

```json
{
  "station_code": "...",
  "station_name": "...",
  "line_name": "...",
  "operator": "...",
  "operator_evidence_url": "https://...",
  "official_address": "...",
  "station_evidence_url": "https://...",
  "coordinate": { "lat": 37.0, "lng": 127.0, "source_url": "https://..." },
  "region_assignment": {
    "region_key": "서울특별시-종로구",
    "method": "official_address_admin_parse",
    "source_field": "official_address"
  },
  "raw_path": "raw/provider/file.json",
  "raw_sha256": "..."
}
```

`coordinate`와 `region_assignment`은 모두 필수다. `official_address_admin_parse`는 원문 주소에 시·군·구가 직접 존재할 때만 허용한다. `point_in_polygon`은 `sigungu_code`와 `boundary_sha256`을 추가로 요구하며, 경계선상 다중 매칭 또는 매칭 실패는 reject한다.

## Future authoritative-set membership

서울교통공사의 경우 `StationAdresTelno` 289역 authoritative set이 고정되면, 해당 set에 포함되지 않은 역은 서울교통공사 provider map에 진입할 수 없다. 이 membership check는 `validateProviderMap`의 `options.authoritativeSet`으로 수행한다.

## relocated-Vault 경로 지원

`validateProviderMap`과 `validateStation`은 `vaultRoot` 파라미터로 임의의 Vault 경로를接受한다. raw 파일 검증은 `vaultRoot/SYSTEM/CACHE/region-transit/raw`를 기준으로 realpath 확인한다.

## 서울·경기 재구축 순서

1. 서울교통공사 `StationAdresTelno` 289역을 authoritative set으로 수집한다.
2. 서울교통공사 1~8호선 후보는 이 set과 교집합일 때만 provider에 넣는다.
3. 9호선 1단계, 9호선 2·3단계, Korail, AREX, 신분당선, 각 경전철을 provider별로 독립 수집한다.
4. 국토교통부 또는 통계청의 기준일이 고정된 시군구 경계로 point-in-polygon을 수행한다.
5. provider별 validator → package dry-run → 사람 승인 → writer apply 순서로 진행한다.

## Grandfathered corpus 보존

22개 Incheon/Busan package(부산 15 + 인천 7)는 immutable input이다. `region-transit-approved-corpus-import.js`가 SHA-256을 검증하며, 불일치 시 fail-closed한다. 이 package들의 station row만 Region input에 도달할 수 있다.
