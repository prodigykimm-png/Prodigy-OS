# 서울·경기 Transit v2 재구축 상태

갱신일: 2026-07-28

## 상태

서울·경기 v1 후보 crosswalk는 운영기관 혼입 및 시군구 중심점 최근접 배정 문제로 격리됐다. `AUTO:REGION_TRANSIT`의 서울·경기 후보 내용은 비워졌으며, v2 후보는 `candidate_not_publishable` 상태다.

## 기준 원천

- [국가철도공단 전국 도시광역철도 역사정보](https://data.kric.go.kr/rips/M_01_01/detail.do?id=32): 역번호, 역사명, 노선명, 운영기관명, 위도·경도, 도로명주소, 기준일을 포함한 국가 표준 XLSX.
- [서울교통공사 역주소 및 전화번호](https://www.data.go.kr/dataset/15003124/fileData.do): 서울교통공사 관할 289역의 주소·전화번호 데이터(2026년 2월 기준).
- [서울교통공사 역사운영 현황](https://www.data.go.kr/dataset/15003853/fileData.do): 1~8호선 276개 역사 운영 현황(2025-12-31 기준).

## 현재 QA gate

| provider 후보 | KRIC 서울·경기 후보 | 2차 원천 | 상태 |
|---|---:|---|---|
| 서울교통공사 | 274 | 주소 데이터 289역 / 운영 현황 276역 | 역명·노선·기준일 대조 전 보류 |
| 한국철도공사 | 198 | provider별 직접 역 목록 미대조 | 보류 |
| 서울시메트로9호선 | 25 + 13 | 1단계·2/3단계 분리 대조 필요 | 보류 |
| 기타 10개 운영기관 | 10~15 등 | 운영기관별 공식 역 목록·주소 대조 필요 | 보류 |

이 표의 모든 행은 `candidate_not_publishable`이다. Region Object writer는 v2 후보를 읽거나 적용하지 않는다.

## publish 전 필수 조건

1. 운영기관별 공식 2차 원천과 역명·노선·주소를 대조한다.
2. 동일 `(역번호, 노선번호)`의 상충 record는 사람이 canonical 명칭을 확정할 때까지 제외한다.
3. 공식 주소가 시·군·구를 직접 명시하면 `official_address_admin_parse`로 귀속한다.
4. 주소가 불완전하거나 행정구역 경계 검증이 필요한 경우에만 기준일·SHA가 고정된 공식 polygon의 `point_in_polygon`을 쓴다.
5. 원문 hash, 운영기관 증거, 주소 또는 polygon 배정이 모두 있는 역만 provider package로 publish한다.

## 금지

- 수도권 통합 노선도 `getLineData.do`로 운영기관을 판정하지 않는다.
- 시군구 중심점·최단거리·역명 접미사로 지역을 확정하지 않는다.
- 좌표·주소·원문 hash가 없는 수동 역을 추가하지 않는다.
