# Region Transit Provider Contract v2

서울·경기처럼 여러 운영기관과 광역 구간이 섞이는 지역의 교통 crosswalk 계약이다.

## 목적

`AUTO:REGION_TRANSIT`에 표시되는 역은 역명 추정이나 시군구 중심점 거리로 배정하지 않는다. provider별 공식 원천과 행정경계 point-in-polygon 검증을 모두 통과한 역만 publish한다.

## 금지

- 수도권 전체 노선도에서 provider 또는 운영사를 추론하지 않는다.
- 시군구 중심점·최근접 폴리곤·역명 접미사로 `region_key`를 자동 확정하지 않는다.
- raw 원문 또는 SHA-256이 없는 수동 좌표를 publish하지 않는다.
- 한 provider의 페이지를 다른 운영기관의 역 증거로 사용하지 않는다.

## provider 등록 기준

provider는 다음을 모두 갖춰야 한다.

1. 운영기관과 노선 범위를 직접 확인하는 공식 URL
2. 역별 공식 목록 또는 주소·좌표가 담긴 공식 원문
3. raw 원문 보존 경로와 SHA-256
4. 다음 둘 중 하나의 재현 가능한 지역 귀속 근거
   - 원문에 직접 포함된 공식 도로명주소의 시·군·구를 엄격하게 파싱한 `official_address_admin_parse`
   - 기준일·SHA-256이 기록된 공식 시군구 경계와 EPSG:4326 좌표의 정확히 하나인 `point_in_polygon`

조건을 하나라도 충족하지 못하면 `not_collected`로 보류하며, Region Object에 쓰지 않는다.

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

## 서울·경기 재구축 순서

1. 서울교통공사 `StationAdresTelno` 289역을 authoritative set으로 수집한다.
2. 서울교통공사 1~8호선 후보는 이 set과 교집합일 때만 provider에 넣는다.
3. 9호선 1단계, 9호선 2·3단계, Korail, AREX, 신분당선, 각 경전철을 provider별로 독립 수집한다.
4. 국토교통부 또는 통계청의 기준일이 고정된 시군구 경계로 point-in-polygon을 수행한다.
5. provider별 validator → package dry-run → 사람 승인 → writer apply 순서로 진행한다.
