# Auction Living Evidence Contract v1

## 목적

공공·GIS 고정정보가 설명하지 못하는 실제 생활 체감을 옥션 판단에 사용한다. 개인 후기 하나를 동 전체의 사실로 일반화하지 않는다.

## 필수 필드

- `micro_zone`: 고정 프로파일의 미시권역명
- `property_types`: 적용 가능한 물건 유형
- `topic`: 보행·교통·장보기·병원·주차·소음·냄새·채광·습기·안전 중 하나
- `observation`: 개인 식별정보를 제거한 반복 관찰 요약
- `time_context`: 평일/주말, 낮/밤 등
- `sample_count`, `agreement_count`
- `counterpoints`: 반대 관찰
- `source_types`: 지도 리뷰·공개 거주후기·공개 영상·직접 임장 등
- `observed_from`, `observed_to`
- `confidence`: anecdotal / weak / medium / strong
- `bias_note`: 표본과 플랫폼 편향

## 신뢰도

- `anecdotal`: 독립 표본 1건
- `weak`: 독립 표본 2건
- `medium`: 독립 표본 3~5건, 동일 조건 반복
- `strong`: 서로 다른 출처 유형 5건 이상, 반대 의견 확인

## 금지

- 로그인·회원 전용 자료 우회 수집
- 이름·계정·연락처·정확한 거주지 저장
- 중개·분양 홍보를 생활자 표본으로 계산
- 같은 원문 재게시를 독립 표본으로 계산
- 아파트 후기를 저층주택 전체에 적용
- 행정동 의견을 특정 골목의 확정 사실로 적용

생활체감은 `stable_profile.complete` 조건이 아니며 별도 `living_evidence_status`로 표시한다.
