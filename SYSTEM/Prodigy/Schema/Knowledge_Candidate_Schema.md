# Prodigy OS — Knowledge Candidate Schema

> 여러 Domain의 Evidence에서 나온 지식 제안을 사람이 검토·승인하기 전까지 보존하는 임시 Object 계약.
> Version: 1.0

---

## 저장 경계

- canonical 신규 저장 경로는 `PARA/RESOURCES/Knowledge/Candidates/`다.
- 기존 Reading 후보는 `PARA/RESOURCES/Reading/Candidates/`와 `ZETA/FLEETING/Knowledge Candidates/`에서 읽기 호환한다. 기존 파일을 이동·rewrite·migration하지 않는다.
- `knowledge_candidate`는 검증된 `knowledge`가 아니다. Knowledge Explorer에서는 별도 `검증 대기` Inbox로만 투영하며 Knowledge Domain/Topic count와 Brief signal에 포함하지 않는다.
- 새 Daily writer는 사용자 명시 저장 시 `status: saved`를 쓴다. 기존 Reading writer의 `status: proposed` 후보는 활성 상태로 계속 읽는다.
- AI는 후보를 제안할 수 있지만 자동 저장·승인·승격하지 않는다. promotion은 사람이 승인한 뒤의 별도 writer가 수행한다.

## 저장 Property

| Property | 형식 | 목적 |
|---|---|---|
| `type` | 고정값 `knowledge_candidate` | 임시 후보 Object 식별 |
| `candidate_id` | 안정적인 machine ID | 후보 식별 및 재시도 연결 |
| `status` | `proposed` \| `saved` \| `approved` \| `rejected` | 사람 검토 workflow 상태 |
| `title` | 텍스트 | 후보의 짧은 제목 |
| `statement` | 텍스트 | 검토할 지식 문장 |
| `reason` | 텍스트 | 제안 이유 |
| `source_type` | `daily_evidence` \| `reading_session` \| `manual_study` \| `study_material` \| `monthly_validation` | 출처의 계약 유형 |
| `source_evidence_ids` | stable Evidence ID YAML list | Daily Evidence provenance |
| `source_objects` | explicit wikilink YAML list | 출처 Object provenance |
| `source_note` | optional short text; `manual_study`에서는 필수 | 사람이 직접 학습한 출처 메모 |
| `application_trigger` | optional short text | 이 지식을 실제로 적용할 계기 |
| `application_contexts` | registry-backed 영어 snake_case YAML list | 적용할 Domain 또는 Domain/Topic 맥락 |
| `confidence` | `explicit` \| `inferred` \| `low` | 출처에서의 명시성 |
| `suggested_domain` | optional registry-backed 영어 snake_case scalar | 제안된 Explorer Domain; 승인 전 자동 분류 아님 |
| `suggested_topics` | registry-backed 영어 snake_case YAML list | 제안된 Explorer Topic; 승인 전 자동 분류 아님 |
| `approval_note` | 텍스트 | 인간 승인 또는 thin Evidence override의 근거 |
| `promotion_target` | optional canonical target path | 승인 writer가 Knowledge 생성 전 기록하는 대상 |
| `promoted_knowledge` | optional explicit wikilink | 생성 완료된 canonical Knowledge 링크 |
| `created` | ISO date/datetime | 생성 시점 |
| `updated` | ISO date/datetime | 마지막 수정 시점 |

`source_evidence_ids`, `source_objects`, `suggested_topics`, `application_contexts`의 canonical 저장 형식은 YAML list다. scalar/comma 형식은 새 writer가 저장하지 않는다. Candidate나 Knowledge에 Evidence 본문을 복사하지 않고 stable ID와 명시적 wikilink만 provenance로 저장한다.

## 신규 writer validation 및 Korean recovery contract

이 section은 Candidate의 `application_contexts`에 대한 canonical 정적 계약이다. Todo 1의 contract test는 이 Schema, Literature Source Schema, Knowledge Explorer registry를 읽어서 검증한다. 실제 저장 전 runtime enforcement와 persistence 차단은 Todo 2의 `knowledge-authoring-core.js`가 소유하므로, 이 문서는 기존 Candidate를 rewrite하거나 migration할 권한을 만들지 않는다.

| Rule | 신규 writer validation | Korean recovery |
|---|---|---|
| `allowed_properties` | `저장 Property` 표의 key만 저장한다. 그 밖의 key는 unknown Property다. | `지원하지 않는 속성입니다. 저장하지 않았습니다.` |
| `source_type` | `저장 Property` 표에 선언된 enum 중 하나여야 한다. 기존 `daily_evidence`와 `reading_session`은 계속 읽고 신규 writer도 지원한다. | `유효하지 않은 지식 출처 유형입니다. 다시 선택해 주세요.` |
| `source_note` | `source_type: manual_study`이면 공백만으로 이루어지지 않은 텍스트가 필수다. 다른 source type에서는 선택값이다. | `직접 학습 출처 메모를 입력해 주세요.` |
| `source_objects` | `source_type: study_material`이면 canonical `ZETA/LITERATURE/` Literature Source Object를 가리키는 explicit wikilink YAML list가 정확히 하나여야 한다. 다른 source type에서는 기존 provenance list 계약을 유지한다. | `학습 자료 출처를 하나만 선택해 주세요.` |
| `application_contexts` | YAML list여야 하며 각 값은 Knowledge Explorer registry에 등록된 영어 snake_case `knowledge_domain` 또는 `knowledge_domain/knowledge_topic` 형식이어야 한다. scalar/comma 값, 빈 segment(예: `coding/`), 미등록 Domain/Topic, 세 segment 이상 path는 저장하지 않는다. | `유효하지 않은 적용 맥락입니다. 다시 선택해 주세요.` |

검증 실패 시 신규 writer는 입력 fixture, 기존 Candidate, 또는 다른 저장 대상의 값을 변경하지 않고 위 recovery를 반환한다. Candidate의 `application_trigger`와 유효한 `application_contexts`는 승인 writer가 값 변경 없이 canonical Knowledge로 승격한다.

`manual_study`는 비어 있지 않은 `source_note`로 직접 학습의 출처를 남기며 Object/Evidence 링크를 요구하지 않는다. `study_material`은 정확히 하나의 canonical Literature Source Object wikilink를 `source_objects`에 남긴다. `monthly_validation`은 Monthly Validation에서 검증된 Principle이 Knowledge Candidate로 저장될 때 사용하며, `source_objects`에 Monthly Note wikilink, `source_evidence_ids`에 선택된 Weekly들이 참조한 stable Evidence ID 합집합을 보존한다. 세 새 source type도 기존 `daily_evidence`와 `reading_session` 후보의 읽기 호환을 변경하지 않는다.

## 본문 및 승격 계약

- Candidate 본문은 `지식 문장`, `제안 이유`, `출처 메모`, `적용 조건`, `승인 메모`를 분리한다. 직접 학습의 장문 기록은 본문에 보존할 수 있지만, 자료 원문 전문을 Candidate에 복사하지 않는다.
- 사람이 승인해 canonical Knowledge를 생성할 때 `application_trigger`와 `application_contexts`는 값을 바꾸거나 누락하지 않고 그대로 승격한다. 이 승격은 자동 승인이나 자동 Knowledge 생성이 아니다.

## 상태 전이

| 현재 상태 | 허용 전이 | 의미 |
|---|---|---|
| `proposed` | `saved` \| `rejected` | legacy Reading 제안 또는 아직 저장되지 않은 제안 |
| `saved` | `approved` \| `rejected` | 사람이 저장하여 검토 대기 중인 후보 |
| `approved` | terminal | canonical Knowledge가 존재하고 `promoted_knowledge`가 기록된 종료 상태 |
| `rejected` | terminal | 사람이 반려한 종료 상태 |

- `approved`는 `promoted_knowledge` 없이 기록하지 않는다. `promotion_target`은 생성 전 기록하며 재시도 시 같은 Candidate provenance를 가진 대상만 채택한다.
- `approved`와 `rejected`는 terminal이다. 자동 전이나 자동 Knowledge 생성은 없다.
- 이 Schema는 전역 `domain` Property를 만들거나 Domain Architecture를 활성화하지 않는다. 범용 `resource` type도 만들지 않는다.
