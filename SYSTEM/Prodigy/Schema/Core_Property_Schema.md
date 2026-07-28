# Prodigy OS — Core Property Schema

> 모든 Prodigy Object가 공통으로 사용하는 최소 Property 정의.
> Version: 0.1 (Sprint 3)

---

## 필수 공통 Property

### `id`

| 항목 | 내용 |
|---|---|
| 목적 | Object의 고유 식별자. 파일명과 동일하게 사용. |
| 입력 주체 | 시스템 (Templater가 파일명에서 자동 추출) |
| Home 사용 | 아니오 |
| Dataview 조회 | 보조적으로 사용 (주로 file.link로 충분) |

### `type`

| 항목 | 내용 |
|---|---|
| 목적 | Object의 종류. 분류와 아이콘/색상 매핑의 기준. |
| 입력 주체 | 템플릿 (고정값) |
| Home 사용 | **예** — Type 라벨 + 아이콘 + 색상 |
| Dataview 조회 | **예** — 필터/그룹화의 1순위 |

허용값: `auction_case` · `auction_region` · `project` · `reading` · `workout` · `workout_program` · `exercise` · `journal` · `people` · `area_family` · `area_note` · `meeting` · `fleeting_note` · `knowledge_candidate` · `knowledge` · `permanent_note` · `literature_note` · `venue` · `workstation_note` · `documentation_note` · `wedding` · `study`

`auction_region`은 시군구 단위의 재사용 가능한 부동산 시장 근거·시계열 Resource다. 실행 사건인 `auction_case`와 분리하며, 상세 계약은 `SYSTEM/docs/Region_Property_Contract_v1.md`를 따른다.

레거시 읽기 호환(신규 생성 금지): `contact` · `project_note` · `project_family`

공식 관계 Object는 `people` (표시 라벨: 사람). `contact`는 기존 파일 읽기 전용이다.

Knowledge 계약에서 `knowledge_candidate`는 사람의 저장·승인을 기다리는 전 도메인 임시 후보이며, `knowledge`는 사람이 검증한 재사용 가능한 canonical Knowledge다. `permanent_note`는 legacy read-compatible Knowledge, `literature_note`는 supporting Resource, `fleeting_note`는 검증 전 capture다. `venue`는 전용 Resource type이며 범용 `resource` type을 만들지 않는다.

### `status`

| 항목 | 내용 |
|---|---|
| 목적 | Object의 현재 라이프사이클 단계. |
| 입력 주체 | 사용자 (Meta Bind 인라인 선택기) |
| Home 사용 | **예** — Status 텍스트 + dot |
| Dataview 조회 | **예** — 미완료 필터의 핵심 |

status는 Object type마다 별도의 enum을 가진다. (Auction Case enum은 `Auction_Case_Schema.md` 참조)

공통 규칙: `completed` / `review_completed` / `archived` 는 모든 type에서 "종료" 상태로 취급한다.

### `next_action`

| 항목 | 내용 |
|---|---|
| 목적 | "지금 당장 무엇을 해야 하는가"에 대한 한 줄 답. |
| 입력 주체 | 사용자 (자유 텍스트) |
| Home 사용 | **예** — "→ " 접두어로 표시 |
| Dataview 조회 | **예** — Today/Continue 필터의 핵심 |

원칙: `next_action`이 비어 있으면 Home의 실행 후보에 나타나지 않는다.

### `due_date`

| 항목 | 내용 |
|---|---|
| 목적 | 마감일. 시급성(D-N) 계산의 기준. |
| 입력 주체 | 사용자 (날짜 입력기) |
| Home 사용 | **예** — D-N 배지 |
| Dataview 조회 | **예** — Today 필터 (7일 이내) |

포맷: ISO date (`YYYY-MM-DD`). Dataview 날짜 연산 안정성을 위해.

### `priority`

| 항목 | 내용 |
|---|---|
| 목적 | 같은 due_date 안에서의 순위. |
| 입력 주체 | 사용자 (정수 1~5) |
| Home 사용 | 아니오 (정렬에만 사용) |
| Dataview 조회 | **예** — 정렬 키 |

값: `1`(최우선) ~ `5`(최후순). 숫자가 작을수록 우선.

### `review_status`

| 항목 | 내용 |
|---|---|
| 목적 | 복기 필요 여부. |
| 입력 주체 | 사용자 또는 시스템 (status 전이 시 자동) |
| Home 사용 | 아니오 (복기 필요 섹션에서 사용) |
| Dataview 조회 | **예** — Needs Review 필터 |

허용값: `pending` · `done` · null

`pending`이면 Needs Review 섹션에 표시. `won`/`lost` status와 조합하여 사용.

### `connections`

| 항목 | 내용 |
|---|---|
| 목적 | 다른 Object와의 명시적 관계. 백링크 대체. People 연결의 단일 공유 필드. |
| 입력 주체 | 사용자 (Meta Bind inlineListSuggester 또는 wikilink) |
| Home 사용 | 아니오 |
| Dataview 조회 | **예** — 역방향 관계 조회 |

원칙: 명시적 연결만 저장한다. Project / Auction / Journal / Reading이 사건·작업을 소유하고, People는 관계 맥락을 소유한다. 원본 본문을 People에 복사하지 않는다.

People 링크 예:

```yaml
connections:
  - "[[홍길동]]"
```

### `knowledge_domain`

| 항목 | 내용 |
|---|---|
| 목적 | Knowledge Explorer에서 Knowledge가 귀속되는 하나의 주 Domain. |
| 형식 | registry-backed 영어 snake_case scalar |
| 입력 주체 | 사용자 검토·승인 |
| Home 사용 | 아니오 |
| Dataview 조회 | **예** — Explorer Domain 귀속과 계산형 카운트 |

canonical `knowledge`, legacy `permanent_note`, `knowledge_candidate`, 그리고 새 `literature_note`에만 계약 범위 안에서 저장한다. 누락되거나 허용되지 않은 값은 기존 Object의 저장값을 수정하지 않고 Explorer projection에서만 `unclassified`로 취급한다. 허용값은 `Knowledge_Explorer_Schema.md`가 소유한다.

### `knowledge_topics`

| 항목 | 내용 |
|---|---|
| 목적 | Knowledge가 연결되는 복수의 승인된 Topic. |
| 형식 | registry-backed 영어 snake_case 값의 YAML list |
| 입력 주체 | 사용자 검토·승인 |
| Home 사용 | 아니오 |
| Dataview 조회 | **예** — Explorer Topic 탐색 |

canonical 저장 형식은 YAML list다. legacy scalar/comma 형식은 read-only projection에서만 호환하며 자동 rewrite하지 않는다. 누락되거나 허용되지 않은 값은 원본을 변경하지 않고 projection에서만 `unclassified`로 취급한다.

### `application_trigger`

| 항목 | 내용 |
|---|---|
| 목적 | 이 지식을 실제로 꺼내 적용해야 하는 조건 또는 계기. |
| 형식 | 짧은 텍스트 |
| 입력 주체 | 사용자 |
| Home 사용 | 아니오 |
| Dataview 조회 | 승인된 Knowledge의 적용 맥락 조회에 사용 가능 |

`knowledge_candidate`와 canonical `knowledge`만 저장한다. Candidate의 인간 승인·승격은 이 값을 삭제·재해석하지 않고 canonical Knowledge로 그대로 보존한다.

### `application_contexts`

| 항목 | 내용 |
|---|---|
| 목적 | 적용할 Domain 또는 Domain/Topic 맥락의 명시 목록. |
| 형식 | registry-backed 영어 snake_case YAML list (`knowledge_domain` 또는 `knowledge_domain/knowledge_topic`) |
| 입력 주체 | 사용자 |
| Home 사용 | 아니오 |
| Dataview 조회 | 승인된 Knowledge의 적용 맥락 조회에 사용 가능 |

`knowledge_candidate`와 canonical `knowledge`만 저장한다. Candidate의 인간 승인·승격은 이 YAML list를 canonical Knowledge로 그대로 보존한다. 이 Property는 전역 Domain Architecture를 만들지 않으며, 유효성은 Knowledge Explorer registry 범위에서만 판단한다.

### `created`

| 항목 | 내용 |
|---|---|
| 목적 | 생성 시점. |
| 입력 주체 | 시스템 (Templater 자동) |
| Home 사용 | 아니오 |
| Dataview 조회 | 보조 (정렬용) |

### `updated`

| 항목 | 내용 |
|---|---|
| 목적 | 최종 수정 시점. |
| 입력 주체 | 시스템 (Templater 또는 수동) |
| Home 사용 | 아니오 |
| Dataview 조회 | 보조 |

### `completed_at`

| 항목 | 내용 |
|---|---|
| 목적 | 사람이 명시적으로 완료한 시각. |
| 입력 주체 | 사용자 완료 동작 또는 해당 Workflow. |
| Home 사용 | 아니오 |
| Dataview 조회 | 완료 기록 정렬·감사에 사용 가능 |

완료 여부를 추정하는 계산값이 아니다. Daily에서는 사람이 `작성 완료`를 누를 때만 `status: completed`와 함께 기록한다. 기존 템플릿의 `status: completed`만으로는 완료를 선언하지 않는다.

---

## Consolidation Optional Properties (Region·Auction·Knowledge·Reading)

> Todo 8–12에서 도입된 선택 Property. 내부 키는 영어 snake_case, UI는 한국어 라벨.
> 기존 Object를 일괄 migration하지 않으며, 누락값은 projection에서 fallback으로 취급한다.

### `auction_outcome`

| 항목 | 내용 |
|---|---|
| 목적 | 경매 사건의 정규 결과. 학습·shadow portfolio·집중도 분석의 source of truth. |
| 형식 | enum: `won` · `lost` · `skipped` |
| 입력 주체 | 사용자 (Outcome writer 경유) |
| Home 사용 | 아니오 |
| Dataview 조회 | **예** — 결과 필터·집중도 계산 |

`auction_result_date`, 조건부 `winning_bid_price`와 원자 tuple로 기록·수정·삭제된다. lifecycle `status`로부터 독립적이다.

### `auction_result_date`

| 항목 | 내용 |
|---|---|
| 목적 | 경매 결과 확정일. |
| 형식 | ISO date (`YYYY-MM-DD`) |
| 입력 주체 | 사용자 (Outcome writer 경유) |
| Home 사용 | 아니오 |
| Dataview 조회 | **예** — 결과 시계열 정렬 |

`auction_datetime` 날짜 이후(당일 포함)여야 하며, `as_of` 기준 미래일 수 없다.

### `winning_bid_price`

| 항목 | 내용 |
|---|---|
| 목적 | 최종 낙찰가 (실제 낙찰액). |
| 형식 | 정수 (원) |
| 입력 주체 | 사용자 (Outcome writer 경유) |
| Home 사용 | 아니오 |
| Dataview 조회 | **예** — shadow portfolio·낙찰가율 계산 |

`won`/`lost`는 `> 0` 필수, `skipped`는 생략 가능. `Auction_Case_Schema.md`의 Investment 섹션과 동일한 계약이다.

### `invalidation_conditions`

| 항목 | 내용 |
|---|---|
| 목적 | Knowledge가 무효화되는 조건 목록. Region thesis/invalidation projection의 source. |
| 형식 | YAML list (자유 텍스트 문장) |
| 입력 주체 | 사용자 |
| Home 사용 | 아니오 |
| Dataview 조회 | **예** — Region thesis projection |

canonical 저장 형식은 YAML list다. `connections`의 exact Region link와 함께 Region thesis를 구성한다. Candidate에서 canonical Knowledge로 승격할 때 값을 바꾸지 않는다.

### `reading_format`

| 항목 | 내용 |
|---|---|
| 목적 | Reading 자료의 물리·디지털 형식 분류. |
| 형식 | enum: `book` · `ebook` · `paper` · `document` · `audiobook` · `미분류` |
| 입력 주체 | 사용자 (수동 등록 또는 검색) |
| Home 사용 | 아니오 |
| Dataview 조회 | **예** — 형식별 필터 |

누락되거나 알 수 없는 legacy 값은 projection에서 `미분류`로 취급한다. 원본 frontmatter를 rewrite하지 않는다.

### `identifier`

| 항목 | 내용 |
|---|---|
| 목적 | Reading 자료의 외부 식별자 (ISBN, DOI, ISSN 등). |
| 형식 | 텍스트 |
| 입력 주체 | 사용자 |
| Home 사용 | 아니오 |
| Dataview 조회 | 보조 (중복 감지) |

### `publisher`

| 항목 | 내용 |
|---|---|
| 목적 | Reading 자료의 발행처·플랫폼·기관. |
| 형식 | 텍스트 |
| 입력 주체 | 사용자 |
| Home 사용 | 아니오 |
| Dataview 조회 | 보조 |

`Literature_Source_Schema.md`의 `publisher`와 동일한 계약이다.

### `source_url`

| 항목 | 내용 |
|---|---|
| 목적 | Reading 자료의 공개 출처 URL. |
| 형식 | HTTP(S) URL |
| 입력 주체 | 사용자 |
| Home 사용 | 아니오 |
| Dataview 조회 | 보조 |

비어 있지 않으면 `http:` 또는 `https:` protocol이어야 한다. `Literature_Source_Schema.md`의 `source_url`과 동일한 계약이다.

---

## Property 원칙

### 1. Property First

분류는 태그가 아니라 Property로 한다.

**예:**
```yaml
region_sido: 인천          # ✅ Property
property_type: 오피스텔     # ✅ Property
```

태그(`#region/인천`)는 상태/분류용으로 사용하지 않는다. 태그는 보조 메타데이터(예: `auction_case`)로만 제한적으로 사용한다.

### 2. Derived Property Rule

계산 가능한 값은 저장하지 않는다.

**저장하지 않는 것:**
- `building_age` (building_year로 계산)
- `annual_rent` (monthly_rent × 12로 계산)
- `annual_interest` (loan_amount × interest_rate로 계산)
- `bid_gap` (minimum_bid / appraisal_price로 계산)
- `my_bid_rate` (expected_bid / appraisal_price로 계산)
- `winning_rate` (actual_bid / minimum_bid로 계산)

이 값들은 DataviewJS에서 실시간 계산한다.

### 3. Single Source of Truth

같은 데이터는 한 번만 저장한다.

**예:**
- `building_year`가 있으면 `building_age`는 저장하지 않는다.
- `auction_date`가 있으면 `days_until_auction`은 저장하지 않는다.
- `appraisal_price`와 `minimum_bid`가 있으면 `bid_rate`는 저장하지 않는다.

---

## 4. Internal / Display Layer 분리

Prodigy OS는 Internal Property(영어 snake_case)와 Display Label(한국어 자연어)을 분리한다.

**원칙:**
- Property는 영어 snake_case로 저장한다. (시스템·AI가 이해)
- UI는 한국어 자연어로 표시한다. (사람이 이해)
- 이 매핑은 `view.js`의 Display Layer에서 처리한다. Property 자체는 변경하지 않는다.

**구현 위치:** `SYSTEM/Views/display-registry.js`
- `TYPE_INFO` — type → { icon, label(한국어), color }
- `STATUS_INFO` — status → { icon, label(한국어), color }

사용자 UI에서 Internal Enum(`auction_case`, `market_analysis`)은 절대 노출하지 않는다.

---

## 5. Status는 State Engine

`status`는 단순한 표시값이 아니다. Prodigy OS 전체(Home, Dashboard, AI)가 공유하는 핵심 State Engine이다.

**State Engine 원칙:**
1. Status는 OS 전체가 공유하는 State Engine이다.
2. Status는 UI를 위해 변경하지 않는다. UI 변경은 Display Layer에서 처리한다.
3. Status Enum의 추가/변경은 Workflow Pattern을 따라야 한다.
4. Home, Dashboard, AI는 동일한 Status를 참조한다.
