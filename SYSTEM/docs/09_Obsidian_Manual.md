# Prodigy OS Obsidian 사용 설명서 v1.0

> "Obsidian는 플랫폼일 뿐이다. Prodigy OS의 핵심은 데이터 구조와 시스템 설계이다."
> — Constitution Article 11, 12

---

## 이 문서의 목적

이 문서는 Prodigy OS를 **Obsidian으로 실제 사용하는 방법**을 설명한다.
개발자가 아니라 **사용자 관점**에서 읽는다.

---

## 1. Prodigy OS란?

Prodigy OS는 단순한 메모 앱이 아니다.
**나의 지식, 투자, 프로젝트, 건강, 경험, 기록을 하나의 시스템으로 연결하여 더 나은 의사결정을 지원하는 Personal Operating System**이다.

**핵심 개념:**
- 모든 정보는 **Object**로 관리한다
- Object는 **Property**(구조화 데이터) + **Content**(자유로운 내용)로 구성된다
- **Dashboard**는 Object를 사용자에게 표현하는 View이다
- 데이터는 한 곳에만 저장한다 (**Single Source of Truth**)

---

## 2. Obsidian에서의 기본 구조

### 2.1 폴더 구조

```
Dusk/
├── PARA/
│   ├── PROJECTS/     ← 진행 중인 프로젝트 (경매, 독서 등)
│   ├── RESOURCES/    ← 참고 자료
│   ├── AREAS/        ← 지속 관리 영역 (건강, 육아 등)
│   └── ARCHIVES/     ← 완료/보관
├── ZETA/
│   ├── FLEETING/     ← 일상적 기록
│   └── LITERATURE/   ← 참고 문헌
├── HUB/
│   ├── Home.md       ← 시작 화면 (Action Dashboard)
│   ├── Mail Box.md   ← 받은 편지
│   └── Map of Content.md ← 목차
├── SYSTEM/
│   ├── TEMPLATE/     ← 생성 템플릿
│   ├── VIEWS/        ← Dashboard 뷰
│   └── CODE/         ← 스크립트/자동화
├── DAILY/            ← 일일 노트
├── STICKY/           ← 중요 기록
├── docs/             ← 시스템 문서
└── README.md         ← 개요
```

### 2.2 Object 개념

Prodigy OS에서 **기본 단위는 Note가 아니다. Object이다.**

| Object Type | 설명 | 예시 |
|-------------|------|------|
| Auction Case | 경매 물건 | `인천-2025타경1144.md` |
| Knowledge | 지식/메모 | 개념, 법률, 용어 |
| Project | 프로젝트 | 투자 계획, 리서치 |
| Daily Note | 일일 기록 | 날짜별 일지 |
| Journal | 주간/월간 회고 | 성과, 패턴 |

---

## 3. Property (속성) 시스템

### 3.1 Property란?

Object를 설명하는 **구조화된 데이터**이다.
YAML frontmatter에 저장된다.

**예시 (경매 물건):**
```yaml
---
id: 인천-2025타경1144
type: auction_case
status: watching
region_sido: 인천광역시
region_sigungu: 남동구
region_dong: 구월동
property_type: 오피스텔
appraisal_price: 150000000
minimum_bid: 105000000
monthly_rent: 800000
---
```

### 3.2 Property 명명 규칙

**모든 Property 이름은 영어 snake_case를 사용한다.**

| Property | 설명 | 예시 값 |
|----------|------|---------|
| `id` | 고유 식별자 | `인천-2025타경1144` |
| `type` | Object 타입 | `auction_case` |
| `status` | 현재 상태 | `watching`, `ready_to_bid`, `won`, `lost` |
| `region_sido` | 시/도 | `인천광역시` |
| `region_sigungu` | 시/군/구 | `남동구` |
| `region_dong` | 동 | `구월동` |
| `property_type` | 물건 종류 | `오피스텔`, `아파트`, `상가` |
| `appraisal_price` | 감정가 (원) | `150000000` |
| `minimum_bid` | 최저입찰가 (원) | `105000000` |
| `expected_bid` | 예상 입찰가 (원) | `130000000` |
| `monthly_rent` | 월세 (원) | `800000` |
| `auction_date` | 입찰일 | `2025-03-15` |
| `recommend` | 추천 여부 | `true` / `false` |
| `recommend_level` | 추천 레벨 | `보통`, `추천`, `강추`, `강강추` |
| `risk_flags` | 리스크 요소 | `["권리 문제", "경쟁 심화"]` |

> **주의:** Property 이름은 영어이지만, **값은 한국어/숫자/날짜**를 자유롭게 사용한다.

### 3.3 주요 상태 값

| status | 설명 |
|--------|------|
| `watching` | 관심 (초기) |
| `rights_analysis` | 권리 분석 중 |
| `market_analysis` | 시세 분석 중 |
| `profitability` | 수익성 검토 중 |
| `site_visit` | 임장 예정/완료 |
| `ready_to_bid` | 입찰 준비 완료 |
| `bid_submitted` | 입찰 완료 |
| `won` | 낙찰 |
| `lost` | 패찰 |
| `review_completed` | 복기 완료 |
| `archived` | 보관 |

---

## 4. Home (시작 화면)

Home.md은 Prodigy OS의 **출발점**이다.
Dashboard가 아니라 **Action Center**이다.

### 4.1 Home의 역할

- 5초 안에 오늘 해야 할 일 확인
- 진행 중인 Object 빠르게 파악
- 빠른 Capture 버튼 제공
- Review 알림 표시

### 4.2 Home 섹션 구성

| 섹션 | 기능 | 구현 |
|------|------|------|
| ☀️ Good Morning | 인사말 + 오늘 예정 Object | DataviewJS |
| 🔥 Today | 오늘 해야 할 일 (7일 이내) | DataviewJS |
| 📥 Capture | 새 Object 생성 버튼 | Templater + QuickAdd |
| ▶ Continue | 계속 진행 중인 Object | DataviewJS |
| 📊 Needs Review | 복기/검토 필요한 Object | Dataview |
| 📋 이번 주 경매 요약 | 주간 경매 현황 (입찰/복기/임박/추천) | DataviewJS |
| 🔍 Navigation | 주요 링크 | 마크다운 링크 |

### 4.3 빠른 생성 버튼

Home에서 버튼 클릭으로 새 Object 생성:
- **Auction** — 새 경매 물건 생성
- **Knowledge** — 지식 노트 생성
- **Project** — 프로젝트 생성
- **Journal** — 오늘 일지 열기

---

## 5. Auction Dashboard 사용법

Auction Dashboard (`HUB/10 Auction.md`)는 경매 물건을 한눈에 관리하는 화면이다.

### 5.1 섹션 구성

| 순서 | 섹션 | 기능 | 구현 |
|------|------|------|------|
| 1 | 필터 | 카드/집계 필터 | JS Engine |
| 2 | 차트 | 지역별/월별/가격대 분포 | Chart.js CDN |
| 3 | 진행중인 물건 | 카드 뷰 + 정렬 | DataviewJS + JS Engine |
| 4 | 집계 필터 | 집계 전용 필터 | JS Engine |
| 5 | 전체 집계 | 통계 요약 + 목록 | DataviewJS |
| 6 | 입찰 일정 | 월간 캘린더 | JS Engine |
| 7 | 입찰 전략 | 성공률/적정가 추천 | DataviewJS |
| 8 | 낙찰 성공 패턴 | 지역/종류/가격대별 성공률 | DataviewJS |
| 9 | 복기 필요한 물건 | 복기 대기 목록 | DataviewJS |

### 5.2 필터 사용법

**카드 필터** (섹션 1):
- 상태: 전체 / 진행중 / 낙찰 / 패찰
- 지역: 전체지역 / 서울 / 경기 / 인천 / 부산
- 종류: 전체종류 / 오피스텔 / 아파트 / 상가 / 지식산업센터
- 추천: 전체 / 추천만

**집계 필터** (섹션 4):
- 상태 / 시 / 구 / 동 / 종류

> 필터 변경 시 자동으로 Dashboard 전체가 리렌더링된다.

### 5.3 정렬 사용법

**카드 뷰 정렬** (섹션 3 상단):
- D-Day (입찰일 임박 순)
- 최저가율 (싼 순)
- 수익성 (수익성 높은 순)

**집계 정렬** (섹션 5 상단):
- D-Day / 최저가율 / 수익성

> 정렬 변경 시 해당 섹션만 리렌더링된다.

### 5.4 차트

**지역별 분포 (파이 차트):**
- 시도별 물건 수 시각화
- 차트 조각 클릭 → 해당 지역으로 필터 변경

**월별 추이 (라인 차트):**
- 월별 입찰 물건 수 추이

**가격대별 분포 (막대 차트):**
- 감정가 기준 0~1억, 1~3억, 3~5억, 5~10억, 10억+

> 차트는 인터넷 연결 시 Chart.js CDN에서 로드된다. 오프라인 시 차트가 표시되지 않는다.

### 5.5 입찰 일정 (캘린더)

- 월간 캘린더 (◀ ▶ 버튼으로 이동)
- 날짜에 입찰 물건 표시
- 색상 구분:
  - 노랑: 진행중
  - 초록: 낙찰
  - 빨강: 패찰
- 물건명 클릭 → 해당 파일 열기

### 5.6 입찰 전략 / 낙찰 성공 패턴

**입찰 전략 (섹션 7):**
- 전체 낙찰 성공률
- 낙찰 성공 평균 최저가율
- 낙찰 성공 평균 예상입찰가율
- 추천 입찰가 구간

**낙찰 성공 패턴 (섹션 8):**
- 지역별 성공률
- 종류별 성공률
- 최저가율별 성공률

> 이 데이터는 Property 기반으로 자동 계산된다. 새로고침 없이 자동 반영.

### 5.7 복기 필요한 물건

- 낙찰/패찰 후 복기 완료하지 않은 물건 목록
- 내 입찰가 / 낙찰가 / 차이 / Action 표시

---

## 6. 경매 물건 (Object) 사용법

### 6.1 경매 물건 생성

**방법 1: Home.md 버튼**
1. Home.md에서 `BUTTON[prodigy_auction_case]` 클릭
2. 새 파일 생성 (템플릿 적용)

**방법 2: 파일 직접 생성**
1. `PARA/PROJECTS/Auction/` 폴더에서 새 파일 생성
2. 파일명: `지역-사건번호.md` (예: `인천-2025타경1144.md`)
3. 템플릿 내용 붙여넣기

### 6.2 Property 입력 가이드

**필수 입력:**
- `region_sido` — 시/도 (예: 인천광역시)
- `region_sigungu` — 시/군/구 (예: 남동구)
- `region_dong` — 동 (예: 구월동)
- `property_type` — 오피스텔/아파트/상가/지식산업센터
- `appraisal_price` — 감정가 (원 단위 숫자)
- `minimum_bid` — 최저입찰가 (원 단위 숫자)
- `auction_date` — 입찰일 (YYYY-MM-DD)

**선택 입력:**
- `monthly_rent` — 월세 (원)
- `loan_ratio` — 대출 비율 (기본 0.8)
- `interest_rate` — 이자율 (기본 0.06)
- `recommend` — 추천 여부 (`true`/`false`)
- `recommend_level` — 추천 레벨 (`보통`/`추천`/`강추`/`강강추`)
- `risk_flags` — 리스크 (배열)

> **중요:** 가격은 반드시 **원 단위 숫자**로 입력한다. `"1억"`, `"정보 없음"` 같은 문자열은 오류를 유발한다.

### 6.3 추천/복기 워크플로우

```
1. 물건 생성 → Property 입력
2. Dashboard에서 필터/정렬로 탐색
3. 추천 여부 결정 → recommend: true/false
4. 입찰 실행 → bid_result: won/lost
5. 복기 실행 → review_status: completed
```

---

## 7. 주요 화면별 사용법

### 7.1 Dashboard 접근

**경로:** `HUB/10 Auction.md`

- 브라우저 사이드바에서 `HUB → 10 Auction` 클릭
- 또는 검색 (`Cmd+O`)에서 `10 Auction` 검색

### 7.2 Home 접근

**경로:** `HUB/Home.md`

- 브라우저 상단 탭에서 `Home` 클릭
- 또는 홈 아이콘 클릭

### 7.3 물건 상세 페이지

**경로:** `PARA/PROJECTS/Auction/인천-2025타경1144.md`

- Dashboard 카드에서 파일명 클릭 → 해당 물건 페이지로 이동
- 뒤로가기 (`Alt+←`)로 Dashboard로 복귀

---

## 8. 자동화 기능

### 8.1 Aside 자동 데이터 입력

- 입찰 마감일 저녁에 자동으로 결과 데이터 입력
- `actual_bid`, `winning_bid`, `bid_result` 자동 업데이트

### 8.2 Dashboard 자동 갱신

- Property 변경 시 Dashboard 자동 리렌더링
- 필터/정렬 변경 시 즉시 반영
- 별도 새로고침 불필요

### 8.3 주간 리포트

- Home.md 상단에 자동 생성
- 이번 주 입찰 예정 / 복기 필요 / D-7 임박 / 추천 매물 건수 표시

---

## 9. 자주 묻는 질문

### Q1. 필터가 변경되지 않아요
- Dashboard를 다시 열어본다
- `Cmd+Shift+R`로 캐시 클리어 후 다시 열기

### Q2. 차트가 보이지 않아요
- 인터넷 연결 확인 (Chart.js CDN 필요)
- 오프라인 상태에서는 차트가 표시되지 않음

### Q3. 가격율 계산이 `NaN`으로 나와요
- `appraisal_price` 또는 `minimum_bid`가 비어있거나 문자열인 경우
- 해당 물건의 Property를 원 단위 숫자로 입력

### Q4. 물건을 어디에 생성해야 하나요?
- `PARA/PROJECTS/Auction/` 폴더
- 파일명: `지역-사건번호.md`

### Q5. Home.md이 이상해요
- Home.md은 시스템 파일이므로 직접 수정하지 않는다
- 카드 문제 발생 시 해당 Workspace의 `SYSTEM/Views/*-card.js`와 `shared-dashboard.js`를 확인

---

## 10. 용어 사전

| 용어 | 설명 |
|------|------|
| Object | Prodigy OS의 기본 단위 (Note가 아니다) |
| Property | Object를 설명하는 구조화된 데이터 (YAML frontmatter) |
| Dashboard | Object를 사용자에게 표현하는 화면 |
| Home | Action Dashboard (오늘 할 일 중심) |
| Capture | 정보 입력 (가장 빠르고 단순하게) |
| Review | 낙찰/패찰 후 분석 |
| 복기 | 결과 분석 및 다음 전략 수립 |
| D-Day | 입찰일까지 남은 날짜 |
| 최저가율 | 최저입찰가 / 감정가 × 100 |
| 예상입찰가율 | 예상입찰가 / 감정가 × 100 |

---

## 11. 시스템 문서 참조

| 문서 | 설명 |
|------|------|
| `docs/00_Constitution.md` | Prodigy OS 최상위 원칙 |
| `docs/01_Architecture.md` | 시스템 구조 및 정보 흐름 |
| `docs/02_Core_Concepts.md` | 핵심 개념 |
| `docs/03_Object_Model.md` | Object 정의 및 구조 |
| `docs/04_Capture_System.md` | 정보 입력 시스템 |
| `docs/05_Home.md` | Home 설계 원칙 |
| `docs/06_AI_System.md` | AI 역할 및 책임 |
| `docs/07_Implementation_Guide.md` | 구현 규칙 |
| `docs/08_Domain_Architecture.md` | 도메인 구조 |

---

*이 문서는 Prodigy OS의 실제 사용법을 설명한다. 시스템 설계는 `docs/`를 참조한다.*
