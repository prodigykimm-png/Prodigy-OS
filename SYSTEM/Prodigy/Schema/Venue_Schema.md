# Prodigy OS — Venue Schema

> 반복 방문하는 장소의 재사용 가능한 현장 지식을 보존하는 전용 Resource 계약.
> Version: 1.1

---

## 저장 계약

Venue Object의 frontmatter는 다음 여섯 Property만 저장한다.

| Property | 형식 | 목적 |
|---|---|---|
| `type` | `venue` | Venue Object의 고정 type |
| `venue_category` | 영어 snake_case scalar | 장소의 짧은 분류 |
| `address` | 텍스트 | 장소 주소 |
| `connections` | wikilink YAML list | 다른 Object(저널 등)와의 명시적 관계 |
| `created` | ISO date/datetime | 생성 시점 |
| `updated` | ISO date/datetime | 마지막 수정 시점 |

- `venue_category`는 Knowledge Domain이나 Topic이 아니며 Venue 내부 분류만 소유한다.
- `connections`에는 실제 Object 링크만 저장한다. 연결된 Object의 본문을 복사하지 않는다.
- Property key는 영어 snake_case를 사용하고 사용자 표시 제목은 한국어로 둔다.
- Venue는 어떤 특정 용도(예: 촬영·웨딩)에 국한되지 않는다. 관리하는 모든 장소를 저장한다.

## 본문 계약

다음 정보는 비어 있을 수 있는 설명형 Content이므로 frontmatter에 저장하지 않고 한국어 본문 섹션에서 관리한다.

1. 소개
2. 방문 정보
3. 메모
4. 관련 지식
5. 관련 저널

`description`, `visit_info`, `notes`, `related_knowledge`, `related_journal` 같은 nullable 또는 파생 Property를 만들지 않는다. 관련 지식과 관련 저널은 wikilink, `connections`, outlink/backlink로 계산하며 원문 내용을 Venue에 복제하지 않는다.

## Resource 경계

- Venue의 type은 `venue` only다.
- 범용 `resource` type을 만들지 않는다.
- 범용 Resource 분류 Property를 만들지 않는다.
- `knowledge_domain`이나 `knowledge_topics`를 저장하지 않는다.
- `auction_region`의 계약, 파일, writer에는 영향을 주지 않는다.