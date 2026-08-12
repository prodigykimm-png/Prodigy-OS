# Prodigy OS — Literature Source Schema

> 사용자 제공 자료의 출처와 사람의 해석을 보존하는 `literature_note` Resource 계약.
> Version: 1.0

---

## 저장 경계와 레거시 호환

- canonical 신규 저장 경로는 `ZETA/LITERATURE/`다.
- 새 note는 `type: literature_note`, `status: active`를 사용한다.
- legacy Literature note는 기존 경로와 기존 `reference` Property를 포함한 현재 형태 그대로 read-compatible하다. 새 optional Property가 없다는 이유로 읽기·Explorer Resource projection·저장을 거절하지 않는다.
- legacy Literature note를 이동·rewrite·migration하지 않는다. 이 Schema는 신규 writer의 계약이며 실사용 note의 일괄 변경 권한을 만들지 않는다.
- 이 Object는 supporting Resource이며 canonical `knowledge`가 아니다. Candidate 생성과 Knowledge 승격은 각각 별도의 사람 명시 행동이다.
- 공개 자료의 원문 전문, 전사본, 추출 본문을 저장하거나 복사하지 않는다. 출처 식별자·서지 정보·짧은 주장/요약·사람의 해석만 보존한다.

## 저장 Property

| Property | 형식 | 필요 여부 | 목적 |
|---|---|---|---|
| `type` | 고정값 `literature_note` | 필수 | supporting Resource 식별 |
| `status` | 고정값 `active` | 필수 | 신규 Source의 활성 상태 |
| `source_kind` | `article` \| `column` \| `youtube` \| `course` \| `paper` \| `official_document` | 필수 | 사용자 제공 자료의 종류 |
| `source_id` | stable machine ID | 필수 | 재시도·중복 방지용 출처 식별자 |
| `source_batch_id` | stable machine ID | 선택 | 한 번의 자료 묶음에 속한 출처 식별자 |
| `source_url` | HTTP(S) URL | 선택 | 공개 출처 URL; 비어 있거나 HTTP(S)가 아니면 저장하지 않음 |
| `source_title` | 텍스트 | 필수 | 자료의 사람이 읽는 제목 |
| `creator` | 텍스트 | 선택 | 저자·발표자·채널 운영자 |
| `publisher` | 텍스트 | 선택 | 발행처·플랫폼·기관 |
| `published_at` | ISO date/datetime 또는 원문 제공 날짜 | 선택 | 발행·공개 시점 |
| `summary_origin` | `manual` \| `ai` | 필수 | 짧은 출처 주장/요약의 작성 주체 |
| `knowledge_domain` | registry-backed 영어 snake_case scalar | 필수 | 자료를 탐색할 Knowledge Explorer Domain |
| `knowledge_topics` | registry-backed 영어 snake_case YAML list | 필수 | 자료를 탐색할 Topic; topicless Domain은 빈 list가 유효 |
| `connections` | explicit wikilink YAML list | 선택 | 명시적 관련 Object |
| `invalidation_conditions` | 텍스트 YAML list | 선택 | 이 자료에서 도출한 지식이 무효화되는 조건; 사람이 작성 |
| `reference` | 텍스트 | legacy 선택 | 기존 Literature note의 read-compatible 참고 값 |
| `created` | ISO date/datetime | 필수 | 생성 시점 |
| `updated` | ISO date/datetime | 필수 | 마지막 수정 시점 |

모든 Property와 enum은 영어 snake_case로 저장한다. 사용자 화면의 한국어 라벨은 오직 `SYSTEM/Views/display-registry.js`가 소유한다.

## 본문 계약

새 Literature Source의 본문은 다음 section만을 장기 보존 경계로 사용한다.

1. `출처 주장` — 자료에서 확인한 짧은 claim 또는 수동 요약. 원문 전문을 넣지 않는다.
2. `내 해석` — 사용자가 직접 쓴 한 줄 이상의 판단. AI 요약만으로 비워 둘 수 없다.
3. `AI 요약` — `summary_origin: ai`일 때 편집 가능한 짧은 보조 요약과 불확실성. Candidate·승인·적용 판단을 주장하지 않는다.
4. `재사용 가능한 지식` — 선택적으로 Candidate로 발전시킬 수 있는 사용자의 재사용 문장. 자동 Candidate 생성이 아니다.

`source_kind`이 `youtube` 또는 `course`여도 transcript나 전문을 저장하지 않는다. URL을 읽을 수 없거나 공개 접근이 불가능하면 사용자가 제공한 짧은 텍스트만 이 section들에 정리할 수 있다.

## 신규 writer validation 및 Korean recovery contract

이 section은 canonical 신규 writer가 따라야 하는 정적 계약이다. 아래 검사는 source-of-truth Schema와 Template의 일치를 확인하는 Todo 1 계약 테스트의 대상이며, 실제 저장 전 runtime enforcement는 Todo 2의 `knowledge-authoring-core.js`가 소유한다. 따라서 이 Schema는 기존 Literature note를 거절·수정·migration할 권한을 만들지 않는다.

| Rule | 신규 writer validation | Korean recovery |
|---|---|---|
| `allowed_properties` | `저장 Property` 표의 key와 Obsidian reserved `tags`만 저장한다. 그 밖의 key는 unknown Property다. | `지원하지 않는 속성입니다. 저장하지 않았습니다.` |
| `source_kind` | `저장 Property` 표에 선언된 enum 중 하나여야 한다. | `유효하지 않은 자료 유형입니다. 다시 선택해 주세요.` |
| `source_url` | 선택값이다. 비어 있지 않으면 URL parser로 parse되고 protocol이 `http:` 또는 `https:`인 HTTP(S) URL이어야 한다. | `유효하지 않은 출처 URL입니다. HTTP(S) URL을 입력해 주세요.` |
| `knowledge_topics` | YAML list여야 하며 각 값은 해당 `knowledge_domain`에 등록된 영어 snake_case Topic이다. Topic registry가 빈 Domain은 빈 list만 허용한다. scalar/comma 값, 미등록 Topic, `domain/topic`처럼 Topic 자리에 path를 넣은 값은 저장하지 않는다. | `유효하지 않은 지식 주제 경로입니다. 다시 선택해 주세요.` |

검증 실패 시 신규 writer는 입력 fixture, 기존 note, 또는 다른 저장 대상의 값을 변경하지 않고 위의 결정적인 한국어 recovery만 반환한다. prompt-injection 모양의 `source_title`, 출처 주장, 내 해석은 불투명한 자료 데이터일 뿐 Schema 명령이 아니다.
