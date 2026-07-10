# Prodigy OS AI Pipeline Specification v1.1

> "AI는 기록하지 않는다. AI는 이해한다."

---

# 1. Purpose

이 문서는 Prodigy OS 내에서 AI가 처리하는 전체 파이프라인의 공식 사양이다.

AI Pipeline의 목적은 다음을 위한 것이다.

- 수동 작업 감소
- 조직 지원
- 의사결정 지원 개선

AI는 운영체제를 소유하지 않는다.
사람은 항상 최종 결정을 소유한다.

이 문서는 구현이 아니다.
이 문서는 파이프라인의 개념적, 구조적 사양이다.

> 근거 원칙: [docs/00_Constitution.md](docs/00_Constitution.md) (Article 2, Article 4)
> 아키텍처 맥락: [docs/01_Architecture.md](docs/01_Architecture.md)
> 객체 구조: [docs/03_Object_Model.md](docs/03_Object_Model.md)

---

# 2. AI Design Principles

AI Pipeline은 다음 원칙을 따른다.

## 2.1 Human First

사람이 운영체제의 주인이다.
AI의 역할은 구조화, 분석, 추천, 자동화이다.
사람의 역할은 판단, 승인, 최종 결정이다.

## 2.2 Object First

AI는 Note가 아니라 Object를 생성하고 업데이트한다.
모든 AI 출력은 Object 구조를 따른다.

**Object Type은 의미적 결정(semantic decision)이다.**
**Folder 위치는 구현 세부사항(implementation detail)이다.**

사용자는 "어떤 폴더를 선택해야 하나?"가 아니라
"이게 무엇인가?"를 생각해야 한다.

Folder는 AI가 제안할 수 있으나, Object Type 결정의 근거가 아니다.
Folder는 검색, Property, View에 우선하지 않는다.

## 2.3 AI Assist

AI는 Object를 소비한다.
AI는 Architecture의 중심이 아니다.
AI는 의사결정을 보조하지만 최종 결정을 내리지 않는다.

## 2.4 Decision Support

AI는 데이터를 제시한다.
AI는 투자 결정, 입찰 여부, 리뷰 내용을 자동으로 작성하지 않는다.

## 2.5 Capture First

모든 것은 Capture에서 시작한다.
Capture는 가능한 한 단순하다.
AI가 나머지를 구조화한다.

## 2.6 Simplicity First

AI 파이프라인은 불필요한 복잡성을 도입하지 않는다.
기존 구조를 재사용하는 것을 우선한다.

## 2.7 Long-term Maintainability

AI 파이프라인은 특정 LLM이나 벤더에 종속되지 않는다.
기술이 바뀌어도 사양은 유지되어야 한다.

---

# 3. High-Level Pipeline

```

## Stage Summary

| Stage | Purpose | Input | Output |
|-------|---------|-------|--------|
| Capture | 최소 입력으로 원본 정보 수집 | URL, PDF, Text, Image | 원본 입력 데이터 |
| Parse | 입력에서 구조화 가능한 정보 추출 | 원본 입력 데이터 | 구조화된 필드와 추정값 |
| Classify | Object Type 결정 | 추출된 필드와 의미 | Object Type, Folder 제안 |
| Context Search | 관련 기존 Object 검색 | Classified Object + Vault | Candidate Objects, Context |
| Duplicate Detection | 기존 Object와의 중복 여부 판단 | 새 추출 데이터 + Context | 생성/업데이트/병합 결정 |
| Object Generator / Updater | 실제 Object 생성 또는 업데이트 | 생성/업데이트 결정 + 추출 데이터 | 새 Object 파일 또는 수정된 Object |
| Property Generator | YAML Property 생성 | 추출 데이터 + Object Type | Property 세트 |
| Relationship Generator | 관련 Object 연결 | 새 Object + Vault 전체 | 연결 링크 세트 |
| Human Review | 사람의 검토 및 수정 | 제안된 Object | 승인된 Object |
| Vault Save | 검증된 Object 저장 | 승인된 Object | 저장된 Markdown 파일 |
| Dashboard Update | View 재렌더링 | 저장된 Object | 업데이트된 Dashboard |

---

# 4. Pipeline Stage Specification

## 4.1 Capture

**Purpose**
사용자가 정보를 입력하는 단계. 입력은 가능한 한 단순하고 빨라야 한다.

**Inputs**
- URL
- PDF
- Text
- Image

**Outputs**
- 원본 입력 데이터
- 소스 정보

**Responsibilities**
- 사용자의 최소 입력 수집
- 소스 정보 보존
- 입력 형식 무시하고 내용 수용

**AI MAY**
- 입력 형식 자동 감지
- 소스 타입 분류

**AI MUST NOT**
- Capture 단계에서 Property 요구
- 긴 Template 강제
- 폴더 선택 요구

---

## 4.2 Parse

**Purpose**
입력된 정보에서 구조화 가능한 데이터를 추출한다.

**Inputs**
- 원본 입력 데이터

**Outputs**
- 구조화된 필드
- 추정값
- 신뢰도 표시

**Responsibilities**
- 텍스트/PDF/이미지에서 핵심 정보 추출
- Property 매핑 후보 생성
- 불확실한 값에는 신뢰도 표시

**AI MAY**
- 주소, 날짜, 금액, 사건번호 등 구조화된 필드 추출
- 유사 항목 제안
- 자연어 요약 생성

**AI MUST NOT**
- 확인 불가능한 값을 사실로 기록
- 추론으로 Property 값 채우기
- 중요한 정보를 임의로 삭제

---

## 4.3 Classify

**Purpose**
의미적 의도에 기반하여 Object Type을 결정한다.

**Inputs**
- 추출된 필드와 의미

**Outputs**
- Object Type
- Folder 제안

**Responsibilities**
- 내용의 의미를 분석하여 적절한 Object Type 할당
- Folder는 구현 세부사항으로 제안만 제공

**AI MAY**
- 여러 후보 Type 제시
- 분류 근거 제공

**AI MUST NOT**
- 폴더 위치를 Type 결정의 근거로 사용
- 사용자 확인 없이 중요 분류 자동 확정

**Note**
분류는 의미적 의도(semantic intent) 기반이다.
폴더는 구현 세부사항(implementation detail)이다.

---

## 4.4 Context Search

**Purpose**
Classify 단계 이후, Vault에서 관련될 수 있는 기존 Object를 검색한다.
중복을 판단하기 전에 AI가 현재 Vault의 맥락을 이해할 수 있도록 한다.

**Inputs**
- Classified Object (Type, 추출 데이터)
- Vault 전체

**Outputs**
- Candidate Objects: 의미적으로 관련된 Object 목록
- Context Information: Vault의 관련 맥락 정보

**Responsibilities**
- 의미적으로 관련된 Object 검색
- 일치하는 식별자가 있는 Object 검색
- 이후 단계(Duplicate Detection, Relationship Generator)에 컨텍스트 제공

**AI MAY**
- Semantic Search: 의미적 유사성 기반 검색
- Embedding Search: Vector embedding 기반 검색
- Rule-based Search: 키워드, 패턴, 정규식 기반 검색
- Tag 기반 검색

**AI MUST NOT**
- Object 수정: Context Search는 읽기 전용이다.
- 중복 결정: 중복 여부는 Duplicate Detection 단계의 책임이다.
- Classification 재정의: Classify의 결정을 변경하지 않는다.

**Note**
Context Search는 정보만 검색한다.
중복 감지는 여전히 Duplicate Detection 단계가 소유한다.

---

## 4.5 Duplicate Detection

**Purpose**
새 Object가 생성되어야 할지, 기존 Object가 업데이트되어야 할지 판단한다.

**Inputs**
- 새 추출 데이터
- Context Search 결과 (Candidate Objects, Context)

**Outputs**
- 생성 결정
- 업데이트 결정
- 병합 제안

**Responsibilities**
- 핵심 식별자 기반 중복 판단
- 유사 항목 식별
- 생성/업데이트/무시 결정

**AI MAY**
- 유사 항목 목록 제시
- 중복 가능성 점수 제공
- 병합 제안

**AI MUST NOT**
- 사용자 확인 없이 기존 Object 덮어쓰기
- 유사 항목을 자동으로 동일 항목으로 간주

**Duplicate Detection Principles**

| 구분 | 판단 기준 |
|------|-----------|
| Auction Case | 사건번호 기반 |
| Book | ISBN 또는 제목+저자 |
| Project | 프로젝트명 기반 |
| Daily Journal | 날짜 기반 |
| Contact | 고유 식별자(이메일, 전화) 기반 |
| Knowledge | 의미적 내용 기반 (아래 4.5.1 참조) |

### 4.5.1 Knowledge Object Growth

Knowledge Object는 다른 Object Type과 다르게 동작한다.

**Knowledge 생성 규칙:**
- 새로운 Knowledge Object는 기존 Knowledge Object로 확장할 수 없는 새로운 개념일 때만 생성한다.
- 기존 Knowledge Object의 하위 주제, 확장, 사례는 새로운 Object가 아니라 기존 Object의 Content로 추가한다.

**Knowledge 성장 vs Knowledge 생성:**

| 상황 | 판단 | 조치 |
|------|------|------|
| 기존 Knowledge Object의 직접적인 확장 | 성장 | 기존 Object에 Content 추가 |
| 기존 Knowledge Object의 새로운 사례/응용 | 성장 | 기존 Object에 Content 추가 |
| 독립적인 새로운 개념 | 생성 | 새 Knowledge Object 생성 |
| 기존 개념과의 관련성이 불확실한 경우 | 사람 확인 | 후보 목록 제시 |

**Knowledge Growth Principle:**
Knowledge Object는 시간이 지남에 따라 발전한다.
Knowledge Object는 완성되는 것이 아니라 성장한다.
Content는 추가되고, Property는 정제되고, 연결은 확장된다.
하나의 Knowledge Object는 하나의 뚜렷한 개념(concept)을 나타낸다.

---

## 4.6 Object Generator / Object Updater

**Purpose**
새 Object를 생성하거나 기존 Object를 업데이트한다.

**Inputs**
- 생성/업데이트 결정
- 추출 데이터
- Context Search 결과

**Outputs**
- 새 Object 파일
- 수정된 Object

**Responsibilities**
- Template 또는 구조에 맞춰 Object 생성
- 기존 Object에 새 정보 병합
- 변경 이력 보존

**Update Strategies**

AI는 상황에 따라 적절한 전략을 선택한다.

| 전략 | 설명 | 사용 조건 |
|------|------|-----------|
| **Create** | 완전히 새로운 Object 생성 | 명확한 신규 항목, 중복 없음 |
| **Append** | 기존 Object의 Content에 새 섹션 추가 | Knowledge Object 성장, 새로운 사례/참고 |
| **Update** | 기존 Object의 Property 또는 Content 변경 | 정보 정정, 상태 변경, Property 업데이트 |
| **Merge** | 두 개 이상의 Object를 하나로 결합 | 명확한 중복, 동일 항목의 분할 사본 |
| **Patch** | 특정 Property 또는 섹션만 선택적 수정 | 부분적 정보 보완, 오타 수정, 작은 변경 |

**AI MAY**
- Template 기반 Object 생성
- 기존 Content에 새 섹션 추가
- Property 업데이트 제안
- 적절한 Update Strategy 선택

**AI MUST NOT**
- 사용자 승인 없이 기존 Object의 핵심 데이터 삭제
- Review 또는 Decision 섹션 자동 덮어쓰기
- 중요한 비즈니스 값 임의 변경
- Merge 또는 Update를 사용자 확인 없이 자동 실행

---

## 4.7 Property Generator

**Purpose**
Object의 YAML Property를 생성하거나 업데이트한다.

**Inputs**
- 추출 데이터
- Object Type

**Outputs**
- Property 세트

**Responsibilities**
- 구조화된 데이터를 Property로 변환
- 계산 가능한 값은 Property로 저장하지 않음
- 확인 불가능한 값은 비워둠

**AI MAY**
- Property 제안
- 기존 Property 정제
- 자동 생성 가능한 Property 생성

**AI MUST NOT**
- 추론으로 Property 값 채우기
- 계산 가능한 값을 Property로 저장
- 기존 Property를 임의로 삭제

**Property Ownership**

| Property 유형 | 책임 소재 |
|---------------|-----------|
| AI 자동 생성 | AI 제안, 사람 검토 |
| 사람 입력 | 사람 책임 |
| 계산 가능한 값 | View/Dashboard에서 계산 |
| 비즈니스 핵심 값 | 사람 책임 |

---

## 4.8 Relationship Generator

**Purpose**
Object 간의 연결을 발견하고 생성한다.

**Inputs**
- 새 Object
- Vault 전체
- Context Search 결과

**Outputs**
- 연결 링크 세트

**Responsibilities**
- 참조 가능한 관련 Object 식별
- 의미적 유사성 기반 연결 제안
- Zettelkasten 방식 연결 지원

**Relationship Purpose**

관계는 단순한 링크가 아니다.
관계는 Object 간의 **의미적 연결 이유**를 설명한다.

관계는 다음 목적으로 존재한다:

| 관계 흐름 | 설명 | 예시 |
|-----------|------|------|
| Knowledge → Knowledge | 개념 간의 연결 | 권리분석 → 감정평가 |
| Investment → Knowledge | 투자 결정과 지식의 연결 | 경매 → 법정지상권 |
| Project → Knowledge | 프로젝트와 배경 지식의 연결 | 우주관광 → 궤도역학 |
| Investment → Investment | 유사 투자 사례 간의 연결 | 인천 아파트 → 부산 아파트 |
| Personal → Knowledge | 개인 경험과 지식의 연결 | 운동 기록 → 운동생리학 |
| Journal → Project | 일일 기록과 프로젝트의 연결 | 회의록 → 우주관광 프로젝트 |

**AI MAY**
- 참조 Object 제안
- 연결 근거 제공
- 관계 유형 분류
- 태그 제안

**AI MUST NOT**
- 확인되지 않은 연결 강제 삽입
- 사용자 확인 없이 기존 연결 삭제
- 과도한 연결로 Graph 오염

**Relationship Types**

| 유형 | 설명 |
|------|------|
| references | 직접 참조 |
| supporting | 지식적 지원 |
| related | 주제적 연관 |
| historical | 과거 컨텍스트 |

---

## 4.9 Human Review

**Purpose**
사람이 AI 제안을 검토하고 승인한다.

**Inputs**
- 제안된 Object

**Outputs**
- 승인된 Object
- 수정된 Object
- 거부된 Object

**Responsibilities**
- AI 제안의 정확성 검증
- 중요한 값의 책임 소유
- Object의 최종 형태 결정

**AI MAY**
- 요약 제공
- 분류 제안
- 연결 제안
- 수정 초안 생성

**AI MUST NOT**
- 가역적이지 않은 결정 자동 실행
- Object 자동 삭제
- 중요한 정보 임의 덮어쓰기
- 투자 결정 자동 실행
- Decision 또는 Review 내용 자동 작성

**Human Responsibilities**

| 작업 | 책임 |
|------|------|
| 승인 | 사람 |
| 수정 | 사람 |
| 삭제 | 사람 |
| 의사결정 | 사람 |
| Review 작성 | 사람 |

---

## 4.10 Vault Save

**Purpose**
승인된 Object를 Vault에 저장한다.

**Inputs**
- 승인된 Object

**Outputs**
- 저장된 Markdown 파일

**Responsibilities**
- YAML frontmatter 유지
- 파일 명명 규칙 준수
- 변경 이력 보존

**AI MAY**
- 파일명 제안

**AI MUST NOT**
- 저장 전 검토 단계 건너뛰기
- 기존 파일 무단 덮어쓰기

---

## 4.11 Dashboard Update

**Purpose**
새 Object 저장 후 View를 업데이트한다.

**Inputs**
- 저장된 Object

**Outputs**
- 업데이트된 Dashboard, Cards, Tables, Charts

**Responsibilities**
- Property 기반 계산
- View 재렌더링
- 캐시 무효화

**AI MAY**
- Dashboard 계산 설명 제공

**AI MUST NOT**
- Property 직접 수정
- Business Logic 임의 변경
- AI Parsing 수행

---

# 5. Object Classification

## 5.1 Object Types

Prodigy OS에서 AI가 인식하는 대표 Object Type:

- Investment: 경매, 주식, 부동산
- Knowledge: 개념, 지식 노트
- Project: 프로젝트, 작업
- Personal: Workout, Reading, Journal
- Capture: 임시 입력, 번역 필요 항목

## 5.2 Classification Basis

분류는 **의미적 의도(semantic intent)** 기반이다.

**Object Type은 의미적 결정(semantic decision)이다.**
**Folder 위치는 구현 세부사항(implementation detail)이다.**

AI는 다음을 분석하여 분류한다:
- 내용의 주제
- 작성자의 명시적 의도
- 포함된 데이터 유형
- 예상 사용 패턴

## 5.3 Folder Role

Folder는 구현 세부사항(implementation detail)이다.
Folder는 분류의 근거가 아니다.
Folder는 검색, Property, View에 우선하지 않는다.

사용자는 "어떤 폴더를 선택해야 하나?"를 고민하지 않는다.
사용자는 "이게 무엇인가?"를 생각한다.
AI가 분류하고, Folder는 제안한다.

AI는 Folder를 제안할 수 있으나,
Object Type 결정의 근거로 사용하지 않는다.

---

# 6. Duplicate Detection

## 6.1 Principles

1. **식별자 우선**: 고유 식별자가 있는 경우 이를 우선한다.
2. **의미적 비교**: 식별자가 없는 경우 의미적 유사성으로 판단한다.
3. **사람 확인**: 중복이 의심되는 경우 사람이 최종 판단한다.
4. **보존 우선**: 중복이 불확실한 경우 기존 Object를 보존한다.

## 6.2 Duplicate Detection Rules by Type

| Object Type | 식별자 | 판단 기준 |
|-------------|--------|-----------|
| Auction Case | 사건번호 | 사건번호 일치 |
| Book | ISBN 또는 제목+저자 | ISBN 우선, 없으면 제목+저자 |
| Project | 프로젝트명 | 프로젝트명 일치 |
| Daily Journal | 날짜 | 날짜 일치 |
| Contact | 고유 식별자 | 이메일 또는 전화번호 일치 |
| Knowledge | 의미적 내용 | 기존 개념의 확장인지 새로운 개념인지 판단 |

## 6.3 Actions

| 판단 결과 | 조치 |
|-----------|------|
| 명확한 중복 | 업데이트 또는 병합 제안 |
| 유사 항목 | 목록 제시 후 사람 확인 |
| 신규 항목 | 새 Object 생성 |
| 불확실 | 생성하지 않고 사람에게 위임 |

## 6.4 Knowledge Growth Rules

Knowledge Object는 다른 Object Type과 다르게 동작한다.

**Knowledge 생성 조건:**
- 기존 Knowledge Object로 확장할 수 없는 새로운 개념일 때만 생성한다.
- 기존 Knowledge Object의 하위 주제, 확장, 사례는 새로운 Object가 아니라 기존 Object의 Content로 추가한다.

**Knowledge 성장 조건:**
- 동일 개념의 새로운 정보, 사례, 참고자료
- 기존 개념의 업데이트된 내용
- 기존 Knowledge Object의 자연스러운 확장

**Knowledge Object Growth Principle:**
Knowledge Object는 시간이 지남에 따라 발전한다.
Knowledge Object는 완성되는 것이 아니라 성장한다.
Content는 추가되고, Property는 정제되고, 연결은 확장된다.
하나의 Knowledge Object는 하나의 뚜렷한 개념(concept)을 나타낸다.

---

# 7. Property Generation

## 7.1 Property Categories

| 구분 | 설명 | 예시 |
|------|------|------|
| 시스템 Property | AI가 자동 생성 | created, updated, source |
| 비즈니스 Property | 사람이 책임 | expected_bid, 입찰여부, 패찰이유 |
| 계산 Property | View에서 계산 | 최저가율, 수익성, D-Day |
| 연결 Property | AI 제안, 사람 검토 | related_objects, next_action |

## 7.2 AI Responsibilities

AI는 다음 Property를 생성한다:
- source: 입력 소스
- created: 생성 일시
- summary: 3~5문장 개요
- status: 현재 상태
- next_action: 다음 행동
- review_status: 복기 상태

AI는 다음 Property를 제안한다:
- related_objects: 연결 가능한 Object
- type: Object Type

## 7.3 Human Responsibilities

사람은 다음 Property를 책임진다:
- 비즈니스 핵심 값
- 투자 결정 관련 값
- 리뷰 및 의사결정 내용
- 수정이 필요한 모든 값

## 7.4 Rules

- Property는 Single Source of Truth이다.
- 동일한 데이터를 두 번 저장하지 않는다.
- 계산 가능한 값은 Property로 저장하지 않는다.
- 확인되지 않은 값은 비워둔다.
- 추론으로 값을 채우지 않는다.

---

# 8. Relationship Generation

## 8.1 Relationship Concept

Object는 서로 연결되어 지식 그래프를 형성한다.
이 연결은 개념적으로 Zettelkasten과 유사하다.
구현은 특정 도구에 의존하지 않는다.

관계는 단순한 링크가 아니다.
관계는 Object 간의 **의미적 연결 이유**를 설명한다.

## 8.2 Relationship Purpose by Flow

| 관계 흐름 | 설명 | 예시 |
|-----------|------|------|
| Knowledge → Knowledge | 개념 간의 연결 | 권리분석 → 감정평가 |
| Investment → Knowledge | 투자 결정과 지식의 연결 | 경매 → 법정지상권 |
| Project → Knowledge | 프로젝트와 배경 지식의 연결 | 우주관광 → 궤도역학 |
| Investment → Investment | 유사 투자 사례 간의 연결 | 인천 아파트 → 부산 아파트 |
| Personal → Knowledge | 개인 경험과 지식의 연결 | 운동 기록 → 운동생리학 |
| Journal → Project | 일일 기록과 프로젝트의 연결 | 회의록 → 우주관광 프로젝트 |

## 8.3 Relationship Types

| 유형 | 설명 | 예시 |
|------|------|------|
| references | 직접 참조 | Auction → 관련 법령 |
| supporting | 지식적 지원 | Auction → 감정평가 개념 |
| related | 주제적 연관 | Project → 관련 Article |
| historical | 과거 컨텍스트 | Auction → 과거 낙찰 사례 |

## 8.4 AI Responsibilities

AI는 다음을 수행한다:
- 의미적 유사성 기반 연결 제안
- 관계 유형 분류
- 연결 근거 설명
- 태그 기반 연결 식별
- 시간적 연결 식별

## 8.5 AI Boundaries

AI는 다음을 수행하지 않는다:
- 확인되지 않은 연결 강제 삽입
- 사용자 확인 없이 기존 연결 삭제
- 과도한 연결 생성

## 8.6 Human Review

사람은 다음을 결정한다:
- 연결 수락/거부/수정
- 중요 연결의 최종 확인
- 연결 그래프의 품질 관리

---

# 9. Human Review

## 9.1 Ownership

Human Review는 AI 파이프라인의 필수 단계이다.
AI 출력은 자동으로 저장되지 않는다.
모든 중요한 변경은 사람의 검토를 거친다.

## 9.2 AI MAY

AI는 다음을 할 수 있다:
- 추천
- 요약
- 분류
- 연결
- 초안 생성

## 9.3 AI MUST NOT

AI는 다음을 해서는 안 된다:
- 가역적이지 않은 결정 자동 실행
- Object 자동 삭제
- 중요한 정보 임의 덮어쓰기
- 투자 결정 자동 실행
- Decision 또는 Review 내용 자동 작성

## 9.4 Human Decision Points

| 결정 항목 | 사람 필수 여부 |
|-----------|---------------|
| Object 생성 | 필수 검토 |
| Property 비즈니스 값 | 필수 확인 |
| 연결 승인 | 권장 검토 |
| 삭제 | 필수 승인 |
| View 계산 | AI 자동 |

---

# 10. AI Boundaries

## 10.1 Allowed

AI는 다음을 할 수 있다:
- 분석
- 요약
- 분류
- 추천
- 초안 생성
- 조직 지원
- Property 생성 제안
- 연결 제안

## 10.2 Forbidden

AI는 다음을 해서는 안 된다:
- 아키텍처 결정
- 자동 삭제
- 자동 투자 결정
- 핵심 시스템 구조 수정
- Decision 또는 Review 자동 작성
- 확인 없는 중요 데이터 변경

## 10.3 Boundary Principles

1. AI는 Object를 소비한다. AI는 Architecture의 중심이 아니다.
2. AI는 제안한다. 사람이 결정한다.
3. AI는 이해한다. AI는 기록하지 않는다.
4. AI는 구조화를 돕는다. AI는 결정을 내리지 않는다.

---

# 11. Technology Independence

## 11.1 Principle

AI Pipeline 사양은 특정 LLM이나 구현에 종속되지 않는다.

## 11.2 Supported Technologies

이 파이프라인은 다음 기술로 구현될 수 있다:
- GPT
- Claude
- Gemini
- GLM
- Local LLMs
- Embedding Search
- Vector Databases
- Rule-based Engines
- LLM-WIKI
- Hybrid Approaches

## 11.3 Requirements

어떤 기술로 구현하든 다음을 만족해야 한다:
- Human First 원칙 준수
- Object Model 준수
- Property 구조 준수
- Human Review 단계 필수
- 아키텍처 변경 없이 구현 가능

---

# 12. Future Implementation

## 12.1 Non-normative Options

아래 접근 방식은 구현 옵션일 뿐, 아키텍처 요구사항이 아니다.

### Rule-based Classification
정규식, 키워드, 패턴 매칭 기반 분류.

### Embedding Search
Vector embedding 기반 유사성 검색.

### Vector Databases
faiss, Pinecone, Weaviate 등을 이용한 저장 및 검색.

### LLM Reasoning
자연어 이해와 추론 기반 분류, 추출, 연결.

### Hybrid Approaches
규칙 + LLM + embedding의 조합.

### LLM-WIKI Integration
사전 구축된 지식 베이스와의 통합.

## 12.2 Implementation Constraints

어떤 구현을 선택하든:
- Architecture를 변경하지 않는다.
- 

# Final Statement

Prodigy OS에서 AI는 사용자의 입력을 줄이고,
Object 생성을 지원하며,
Dashboard 계산을 설명하고,
의사결정을 보조한다.

최종 결정은 사람이 수행한다.

---

**Version:** 1.1
**Status:** Active
**Depends on:**
- docs/00_Constitution.md
- docs/01_Architecture.md
- docs/03_Object_Model.md
- docs/06_AI_System.md

**Note:** This document supersedes the pipeline description in docs/06_AI_System.md. For high-level responsibilities and boundaries, refer to docs/06_AI_System.md. This document provides the complete stage-by-stage specification.