# Prodigy OS Operating Guide v1.0

> "폴더를 고민하지 말고, '이게 무엇인가?'를 생각하라."

---

# 1. Purpose

이 문서는 Prodigy OS를 실제로 어떻게 사용하는지 설명한다.

Prodigy OS는 단순한 폴더 시스템이 아니다.
Prodigy OS는 매일 사용하는 개인 운영체제이다.

이 가이드는 다음을 돕는다:
- 매일 아침 무엇을 해야 하는지
- 정보가 들어왔을 때 어디에 두어야 하는지
- Object, Capture, Journal, Knowledge, Project의 차이
- AI를 언제, 어떻게 활용해야 하는지

> 시스템 구조: [docs/01_Architecture.md](docs/01_Architecture.md)
> 핵심 개념: [docs/02_Core_Concepts.md](docs/02_Core_Concepts.md)

---

# 2. Core Usage Rules

## 2.1 Start from Home

Home은 시작점이다.
Home을 열면 오늘 해야 할 일, 진행 중인 Object, Capture, Review가 보인다.
폴더부터 열지 않는다. Home을 먼저 연다.

## 2.2 Capture is Temporary

Capture는 임시 보관함이다.
입력한 정보는 가능한 빨리 Object로 변환한다.
Capture가 쌓이면 검토한다.

## 2.3 Object is the Source of Truth

모든 정보는 Object에 저장한다.
Property는 구조화된 데이터, Content는 사람이 읽는 내용.
계산은 Dashboard가 한다. Object는 저장만 한다.

## 2.4 Journal Records Reflection, Not All Work

Journal은 하루를 돌아보는 기록이다.
업무 로그가 아니다.
무엇을 했는지보다 무엇을 배웠는지, 어떻게 느꼈는지를 기록한다.

## 2.5 Knowledge Grows Over Time

Knowledge Object는 한 번에 완성되지 않는다.
시간이 지나며 Content가 추가되고, 연결이 확장된다.
새 Knowledge를 만들기 전에 기존 Knowledge를 업데이트할 수 있는지 확인한다.

## 2.6 Projects Have an End

Project Object는 끝이 있는 작업이다.
완료되면 Archive한다.
Project가 계속되면 Knowledge Object로 전환을 고려한다.

## 2.7 Investment Objects Require Human Decision

Investment Object는 사람이 최종 결정을 내린다.
AI는 분석하고 추천하지만, 입찰 여부는 사람이 결정한다.

## 2.8 AI Assists But Does Not Decide

AI는 분류, 요약, 연결, 제안을 한다.
AI는 최종 결정, 삭제, 중요한 데이터 변경을 하지 않는다.

---

# 3. Daily Operating Flow

```text
아침
  │
  ▼
Home 열기
  │
  ▼
🔥 Today 확인 (오늘 해야 할 일)
  │
  ▼
▶ Continue 확인 (진행 중인 Object)
  │
  ▼
📥 Capture 확인 (처리되지 않은 입력)
  │
  ▼
Object 작업 (읽기, 업데이트, 결정)
  │
  ▼
새 입력 발생 → Capture
  │
  ▼
저녁
  │
  ▼
🔁 Review (오늘 업데이트된 Object 검토)
  │
  ▼
Journal (하루 돌아보기)
  │
  ▼
next_action 설정
```

---

# 4. When to Create What

| 상황 | 생성 / 업데이트 |
|------|----------------|
| 경매 물건 발견 | Investment Object 생성 |
| 글, 개념, 아이디어 발견 | Knowledge Object 생성 또는 업데이트 |
| 끝이 있는 작업 시작 | Project Object 생성 |
| 운동, 건강 데이터 기록 | Personal Object 업데이트 |
| 하루 돌아보기 | Journal 생성 |
| 아직 분류되지 않은 정보 저장 | Capture |
| 기존 주제의 새로운 내용 | 기존 Object 업데이트 |

---

# 5. Scenario-Based Workflows

## Scenario 1 — 경매 물건을 발견했다

```text
1. Capture: URL 또는 PDF를 Capture에 저장
2. AI가 Investment Object 자동 생성
3. Property 검토 (감정가, 주소, 입찰일 등)
4. 권리분석: Knowledge Object 참조
5. 현장 방문 (선택)
6. 의사결정: 입찰 / 포기
7. 입찰 실행
8. Review: 결과 복기, 패턴 축적
```

- Investment Object는 하나의 경매 건을 관리한다.
- Knowledge Object는 권리분석, 법정지상권 등 재사용 가능한 지식이다.
- AI는 Property를 생성하지만, 입찰 여부는 사람이 결정한다.

---

## Scenario 2 — 유용한 글을 읽었다

```text
1. Capture: 링크 또는 요약을 Capture에 저장
2. AI가 기존 Knowledge Object와의 중복 확인
3. 기존 Knowledge가 있으면 → Content에 추가 (업데이트)
4. 기존 Knowledge가 없으면 → 새 Knowledge Object 생성
5. 관련 Object와 연결
6. 나중에 Project 또는 Investment에서 재사용
```

- Knowledge Object는 시간이 지나며 성장한다.
- 새로운 Knowledge를 만들기 전에 기존 Knowledge를 확인한다.
- Knowledge는 재사용 가능해야 한다.

---

## Scenario 3 — 오늘 운동했다

```text
1. Personal Object 열기 (Workout)
2. Property 업데이트: 운동 종류, 시간, 강도
3. 특별한 감정이나 깨달음이 있다면 Journal에 기록
4. 추세는 Dashboard에서 확인
```

- Personal Object는 장기적인 데이터를 저장한다.
- Journal은 운동 기록이 아니라 감정, 깨달음, 회고를 위한 공간이다.

**Personal vs Journal:**
- Personal = 장기 추적 데이터 (운동 기록, 체중, 루틴)
- Journal = 하루 회고, 감정, 깨달음

---

## Scenario 4 — 새로운 프로젝트 아이디어가 떠올랐다

```text
1. Capture: 아이디어를 Capture에 저장
2. Project Object 생성 (끝이 있는 작업)
3. 관련 Knowledge Object 연결
4. next_action 설정
5. Home에서 추적
6. 완료되면 Archive
```

- 프로젝트는 끝이 있다. 완료 조건을 명확히 한다.
- 프로젝트가 지속적인 활동이라면 Knowledge Object로 전환한다.
- 프로젝트 결과물 중 재사용 가능한 지식은 Knowledge Object로 남긴다.

**Knowledge vs Project:**
- Knowledge = 재사용 가능한 개념 (끝이 없음)
- Project = 끝이 있는 작업 (완료 → Archive)

---

## Scenario 5 — 공부한 내용을 정리한다

```text
1. Knowledge Object 생성 (새 개념인 경우)
2. 또는 기존 Knowledge Object 업데이트 (기존 개념 확장)
3. Content에 학습 내용 추가
4. 관련 Knowledge Object와 연결
5. Project나 Investment에서 활용
```

- 하나의 Knowledge Object는 하나의 개념을 나타낸다.
- 같은 개념의 새로운 내용은 기존 Object에 추가한다.
- 연결은 단순한 링크가 아니라, "왜 연결되었는지"를 설명한다.

---

## Scenario 6 — 사진 촬영을 했다

```text
1. Project Object 생성 (이번 촬영 건)
2. Knowledge Object로 촬영 팁, 노하우 저장 (재사용 가능)
3. Journal에 촬영 후기, 감정 기록 (회고)
```

- 유한한 촬영 작업 → Project Object
- 재사용 가능한 촬영 팁 → Knowledge Object
- 개인적인 감정, 깨달음 → Journal

---

## Scenario 7 — 하루를 돌아보고 싶다

```text
1. Home 열기
2. 🔁 Review: 오늘 업데이트된 Object 확인
3. 오늘의 Capture 처리
4. Journal 작성: 오늘 배운 점, 느낀 점, 내일 할 일
5. next_action 설정
6. Home에서 내일 확인
```

- Journal은 매일 쓸 필요는 없다.
- 중요한 날, 배움이 있었던 날, 결정을 내린 날에 쓴다.
- next_action을 설정하면 다음날 Home에서 바로 확인할 수 있다.

---

# 6. Folder Usage

폴더는 저장 위치일 뿐, 사용자 인터페이스가 아니다.
사용자는 폴더를 고민하지 않고, "이게 무엇인가?"를 생각한다.

| 폴더 | 용도 |
|------|------|
| HUB | 시작 화면. Home, Dashboard, Mail Box |
| CAPTURE | 임시 보관함. 아직 처리되지 않은 입력 |
| OBJECTS/Investment | 실제 투자 대상과 결정 |
| OBJECTS/Knowledge | 재사용 가능한 개념과 지식 |
| OBJECTS/Projects | 끝이 있는 작업 |
| OBJECTS/Personal | 장기 개인 데이터 (운동, 건강) |
| JOURNAL | 하루 회고와 감정 기록 |
| SYSTEM | Template, View, Script. 평소에 건드리지 않음 |
| ARCHIVE | 완료된 Object. 삭제하지 않고 보관 |

---

# 7. AI Usage

## AI MAY

AI는 다음을 할 수 있다:
- 분류: 입력된 정보의 Object Type 결정
- 요약: 3~5문장 요약 생성
- Property 제안: 구조화된 데이터 생성
- 연결 제안: 관련 Object 발견
- 품질 검토: Object 완전성 확인
- next_action 추천: 다음 행동 제안

## AI MUST NOT

AI는 다음을 해서는 안 된다:
- 최종 투자 결정
- Object 자동 삭제
- 중요한 데이터 임의 변경
- Decision 또는 Review 자동 작성

---

# 8. Common Confusions

## Personal vs Journal

| 구분 | Personal | Journal |
|------|----------|---------|
| 목적 | 장기 데이터 추적 | 하루 회고 |
| 예시 | 운동 기록, 체중, 루틴 | 오늘 느낀 점, 배운 점 |
| 업데이트 | 매일 또는 정기적 | 필요할 때만 |
| 조회 | Dashboard에서 추세 확인 | 시간순으로 읽기 |

**쉬운 규칙:** 측정 가능한 데이터는 Personal. 느낌과 생각은 Journal.

---

## Knowledge vs Project

| 구분 | Knowledge | Project |
|------|-----------|---------|
| 목적 | 재사용 가능한 지식 | 끝이 있는 작업 |
| 생명주기 | 계속 성장 | 생성 → 완료 → Archive |
| 예시 | 권리분석, 운동생리학 | 우주관광 프로젝트, 촬영 |

**쉬운 규칙:** 끝이 있고 결과물이 있다면 Project. 계속 재사용된다면 Knowledge.

---

## Investment vs Knowledge

| 구분 | Investment | Knowledge |
|------|------------|-----------|
| 목적 | 실제 투자 대상 | 의사결정 지원 |
| 예시 | 인천 아파트 경매 | 법정지상권 개념 |
| 결정 | 사람이 입찰 여부 결정 | AI가 요약, 연결 |

**쉬운 규칙:** 돈이 오가는 실제 대상이라면 Investment. 참고 개념이라면 Knowledge.

---

## Capture vs Object

| 구분 | Capture | Object |
|------|---------|--------|
| 상태 | 임시, 미처리 | 영구, 구조화 |
| 위치 | CAPTURE 폴더 | Type별 폴더 |
| AI 역할 | 구조화 대기 | Property, 연결, 요약 |

**쉬운 규칙:** 아직 무엇인지 모르겠다면 Capture. 무엇인지 알겠다면 Object.

---

# 9. Best Practices

1. **Capture를 비워두거나 작게 유지한다.**
   Capture가 쌓이면 정기적으로 검토하고 Object로 변환한다.

2. **새 Object를 만들기 전에 기존 Object를 먼저 확인한다.**
   특히 Knowledge Object는 업데이트가 우선이다.

3. **next_action을 일관되게 설정한다.**
   Home에서 바로 오늘 할 일을 확인할 수 있다.

4. **Home에서 시작한다.**
   폴더부터 열지 않는다. Home이 모든 시작점이다.

5. **Knowledge를 과도하게 생성하지 않는다.**
   하나의 Knowledge Object는 하나의 개념. 같은 개념은 업데이트로 처리한다.

6. **Knowledge는 성장하게 둔다.**
   한 번에 완벽할 필요 없다. 시간이 지나며 Content를 추가한다.

7. **완료된 Project는 Archive한다.**
   삭제하지 않는다. Historical 상태로 보관한다.

8. **AI 제안은 검토 후 수용한다.**
   AI는 틀릴 수 있다. Property, 연결, 분류는 사람이 최종 확인한다.

9. **Journal은 억지로 쓰지 않는다.**
   중요한 날, 배움이 있었던 날, 결정을 내린 날에만 쓴다.

10. **폴더를 고민하지 않는다.**
    "이게 무엇인가?"를 생각한다. AI가 폴더를 제안한다.

---

# Final Statement

Prodigy OS는 폴더 시스템이 아니다.
Prodigy OS는 매일 사용하는 개인 운영체제이다.

Home에서 시작한다.
Object를 중심으로 작업한다.
Capture를 거쳐 Object로 만든다.
AI의 도움을 받되, 최종 결정은 사람이 내린다.

---

**Version:** 1.0
**Status:** Active
**Depends on:**
- docs/00_Constitution.md
- docs/01_Architecture.md
- docs/02_Core_Concepts.md
- docs/03_Object_Model.md
- docs/04_Capture_System.md
- docs/05_Home.md