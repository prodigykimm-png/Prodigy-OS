# Prodigy OS — Knowledge Explorer Schema

> 검증된 Knowledge와 supporting Resource를 탐색하기 위한 Knowledge 전용 계약.
> Version: 1.0

---

## Contract Summary

```yaml
canonical_knowledge_type: knowledge
canonical_knowledge_directory: ZETA/PERMANENT
legacy_knowledge_types: [permanent_note]
supporting_resource_types: [literature_note, venue, auction_region]
excluded_capture_types: [fleeting_note]
excluded_candidate_types: [knowledge_candidate]
knowledge_candidate_directory: PARA/RESOURCES/Knowledge/Candidates
knowledge_domain: scalar
knowledge_topics: yaml_list
missing_or_invalid_projection: unclassified
global_domain_architecture: inactive
```

- `knowledge`만 사람이 검증한 재사용 가능한 canonical Knowledge다.
- 신규 canonical `knowledge`는 기존 Knowledge writer와 serializer를 통해 `ZETA/PERMANENT/`에만 저장한다. `PARA/RESOURCES/Knowledge/`의 기존 파일은 이동·rewrite·자동 변환하지 않는다.
- `permanent_note`는 기존 파일을 읽기 위한 legacy Knowledge다. 자동으로 `knowledge`로 변경하지 않는다.
- `literature_note`는 출처를 보존하는 supporting Resource다.
- canonical 신규 `literature_note`는 `ZETA/LITERATURE/`에 저장한다. 세부 Source 계약과 기존 Literature read compatibility는 `Literature_Source_Schema.md`가 소유한다.
- `fleeting_note`는 빠른 capture이며 검증된 Knowledge 카운트에서 제외한다.
- `knowledge_candidate`는 아직 검증된 Knowledge가 아닌 별도 `검증 대기` Inbox Object다. Domain/Topic Knowledge 카운트, Brief signal, 기본 Knowledge 목록에 포함하지 않는다.
- 신규 `knowledge_candidate`는 `PARA/RESOURCES/Knowledge/Candidates/`에 저장하며 사람 승인 전에는 `ZETA/PERMANENT/` canonical Knowledge가 아니다.
- `venue`와 `auction_region`은 각자 전용 계약을 가진 Resource다. 범용 `resource` type은 없다.
- AI는 분류 후보를 제안할 수 있지만 Knowledge 승인과 최종 분류는 사람이 수행한다.

## Region 연결 계약

- Region 연결은 `connections`에 저장된 exact canonical Region wikilink로만 만든다. 본문 텍스트, 좌표만 있는 값, 모호한 동네 이름은 Region link를 만들지 않는다.
- canonical Region wikilink는 `[[PARA/RESOURCES/Auction Regions/<region_key>]]` 형태이며 `<region_key>`는 `시도-시군구` 형식의 canonical key다.
- `invalidation_conditions`는 이 Knowledge가 무효화되는 조건을 사람이 작성한 YAML list다. Region thesis/invalidation projection은 이 값과 `connections`의 exact Region link를 읽는다.
- `connections`와 `invalidation_conditions`는 Candidate에서 canonical Knowledge로 승격할 때 값을 바꾸거나 누락하지 않고 그대로 보존한다. 이 보존은 자동 승인이나 자동 Knowledge 생성이 아니다.
- `literature_note`와 `knowledge_candidate`는 verified Knowledge가 아니다. Region thesis projection에서 별도 material/pending group으로만 표시한다.

## Persisted Properties

### `knowledge_domain`

하나의 registry-backed 영어 snake_case scalar다. 한 Knowledge는 계산형 Domain 카운트 하나에만 귀속된다.

### `knowledge_topics`

registry-backed 영어 snake_case 값의 YAML list다. 하나의 Knowledge가 복수 Topic에서 탐색될 수 있다. canonical writer는 scalar 또는 comma-delimited 문자열을 저장하지 않는다.

### `application_trigger`

사람이 승인한 Knowledge를 실제로 적용해야 하는 조건 또는 계기다. Candidate에 저장된 값은 승인 writer가 변경하지 않고 canonical Knowledge로 승격한다.

### `application_contexts`

registry-backed 영어 snake_case YAML list다. 각 값은 등록된 `knowledge_domain` 또는 `knowledge_domain/knowledge_topic` 형식이며, Candidate에 저장된 list는 승인 writer가 변경하지 않고 canonical Knowledge로 승격한다.

### `connections`

explicit wikilink YAML list다. exact canonical Region link를 포함할 수 있으며, Region association의 유일한 source of truth다. 본문·좌표·모호한 지명에서 추론한 값은 저장하지 않는다.

### `invalidation_conditions`

사람이 작성한 조건 문장의 YAML list다. 이 Knowledge가 더 이상 유효하지 않게 되는 판단 기준을 기록한다. Candidate에 저장된 list는 승인 writer가 변경하지 않고 canonical Knowledge로 승격한다.

## Approved Registry

```yaml
domains:
  real_estate: [rights_analysis, site_visit, bidding, public_auction, tax, precedent]
  wedding: [shooting, lighting, editing, equipment]
  coding: [electron, react, typescript, python, ai, prompt_engineering, obsidian_plugin, claude_code, codex, gemini]
  workout: []
  reading: []
  business: []
  personal_growth: []
```

`workout`, `reading`, `business`, `personal_growth`의 빈 목록은 유효한 확장 지점이다. Topic을 추가하려면 이 Schema와 Display Registry를 함께 갱신한다. `venue`와 `auction_region`은 Topic이 아니라 Resource section이다.

## Projection and Compatibility

1. `knowledge_domain`이 누락되었거나 registry에 없으면 projection에서만 `unclassified`로 취급한다.
2. `knowledge_topics`의 누락값과 허용되지 않은 값도 projection에서만 `unclassified`로 취급한다.
3. `unclassified`는 저장 가능한 Domain/Topic enum이 아니다. UI 표시용 fallback이며 한국어 라벨은 Display Registry의 `미분류`다.
4. legacy `knowledge_topics` scalar/comma 값은 read-only projection에서 정규화할 수 있지만 원본 frontmatter를 rewrite하지 않는다.
5. validation, projection, Explorer count는 원본 Object를 수정하지 않는다. 실제 note migration은 별도 사용자 승인 없이는 금지한다.
6. Candidate Inbox projection은 `knowledge_candidate`와 그 상태를 별도로 읽을 수 있지만, 이를 Knowledge projection이나 count로 승격하지 않는다.
7. `knowledge_candidate`는 `source_type: manual_study` 또는 `study_material`이어도 Knowledge Domain/Topic count, Brief signal, 기본 Knowledge 목록에 포함하지 않는다.
8. Candidate의 `application_trigger`와 `application_contexts`는 인간 승인 후 canonical Knowledge에 그대로 승격한다. 그 전에는 Candidate metadata이며 Knowledge count를 바꾸지 않는다.

## Architecture Boundary

이 taxonomy는 Knowledge Explorer 전용이다. 전역 `domain` Property, generic Resource type, 저장된 count/brief signal을 만들지 않으며 `SYSTEM/docs/08_Domain_Architecture.md`의 **Not Active** 상태를 변경하지 않는다.
