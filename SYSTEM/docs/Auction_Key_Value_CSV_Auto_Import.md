# 전국 경매 키값 CSV 자동 적용

## 사용 방법

1. 데스크톱 Obsidian의 Dusk Vault를 연다.
2. CSV 파일을 `INBOX/Auction CSV/`에 넣는다.
3. 적용 완료 알림을 확인한다.
4. 이후 열거나 생성하는 경매 카드에서 최신 키값을 사용한다.

AI 또는 외부 API를 호출하지 않는다. CSV 파싱, 중복 제거, 키값 계산과
스냅샷 갱신은 지정 Mac의 Obsidian 안에서 로컬로 실행된다.

## 입력 계약

CSV에는 다음 열이 필요하다.

- `물건종류`
- `소재지`
- `건물면적`
- `낙찰가`
- `매각기일`

토지 물건의 키값을 계산하려면 `대지권` 값도 필요하다. 지역은 별도 목록으로
제한하지 않고 `소재지`에서 시도·시군구·법정동을 읽으므로 전국 데이터를
동일한 방식으로 처리한다.

지원 물건종류는 아파트, 오피스텔, 다가구, 다세대(빌라), 주택(단독주택 포함), 근린상가, 근린주택, 근린시설, 숙박(콘도등·숙박시설), 노유자시설, 지식산업센터, 공장과 토지 계열이다. 비부동산(차량·선박·중장비 등)은 제외된다.
동일한 낙찰 건은 결정적 `record_id`로 중복 제거한다.

## 적용 결과

- 누적 정규 레코드:
  `SYSTEM/CACHE/auction-key-value/current/normalized.json`
- 계산 스냅샷:
  `SYSTEM/CACHE/auction-key-value/current/snapshot.json`
- 처리 감사 기록:
  `SYSTEM/CACHE/auction-key-value/current/audit.json`
- 카드가 읽는 스냅샷:
  `SYSTEM/Views/auction-key-value-snapshot.js`
- 처리 완료 CSV:
  `INBOX/Auction CSV/Processed/YYYY-MM/`

새 CSV는 기존 정규 레코드와 병합하므로 지역을 여러 파일로 나누어 넣어도 된다.
기존 스냅샷의 원본 정규 레코드도 최초 실행 시 자동으로 승계한다.

## 실패 처리

필수 열 누락이나 잘못된 값 때문에 적용에 실패하면 스냅샷을 갱신하지 않고
CSV를 입력 폴더에 남긴다. Obsidian 알림에 표시된 문제를 수정한 뒤 같은 파일을
다시 저장하면 자동으로 재처리된다.
