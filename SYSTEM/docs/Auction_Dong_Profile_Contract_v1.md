# Auction Dong Profile Contract v1

**목적:** 옥션카드의 법정동·행정동을 부산 206개 읍·면·동 입지 프로파일에 연결한다.

## 식별 필드

- `region_sido`: 시·도. 부산 자료는 `부산광역시`.
- `region_sigungu`: 구·군.
- `region_dong`: 경매 원주소에서 확인된 법정동·읍·면. 기존 필드이며 의미를 바꾸지 않는다.
- `region_admin_dong`: 행정동·읍·면. 확인된 경우에만 기록한다. 법정동만으로 여러 행정동 중 하나를 추측하지 않는다.
- 프로파일 키: `{region_sido}-{region_sigungu}-{admin_dong}`.

## 조회 우선순위

1. `region_admin_dong` 정확 일치
2. `region_dong`이 단 하나의 행정동 프로파일에만 대응하면 자동 일치
3. 여러 행정동에 대응하면 법정동 공통 결과와 후보 행정동을 표시하고 사용자 확인 요청
4. 일치하지 않으면 시군구 자료만 표시

## 프로파일 필드

- `admin_dong`: 부산시 공식 행정동·읍·면 명칭
- `legal_dong_aliases`: 자동 조회 가능한 법정동 별칭. 확정할 수 없는 별칭은 넣지 않는다.
- `character`: 공식 행정구역·교통·정비사업 근거에서 확인되는 입지 성격
- `transport_life`: 공식 자료로 확인된 교통·생활 사실
- `development`: 공식 자료로 확인된 개발·정비 변수
- `auction_cautions`: 개별 물건에서 확인할 위험
- `site_visit`: 현장에서 확인할 항목
- `evidence_level`: `official_fact`, `official_area_inference`, `site_check_required` 중 하나
- `source_refs`: 상위 시군구 Resource의 출처 ID
- `researched_at`: 조사일

## 근거 규칙

- 인구·유동·가격 등 숫자는 기존 Region metrics writer 또는 별도 공식 수집기만 기록한다.
- 권역 공식 사실을 개별 동에 적용한 해석은 `official_area_inference`로 표시한다.
- 경사 체감, 소음, 냄새, 주차, 공실, 실제 유동, 건물 상태는 관찰 전 단정하지 않는다.
- 법정동과 행정동이 일대일이 아니면 `region_admin_dong`을 자동 생성하지 않는다.
- 프로파일은 입찰 추천이 아니며 최종 판단 권한은 사용자에게 있다.

## 공식 기준

- 부산광역시 행정 읍·면·동 현황, 2025-01-01 기준, 최근 업데이트 2025-01-08
- <https://www.busan.go.kr/bhaddis02>
