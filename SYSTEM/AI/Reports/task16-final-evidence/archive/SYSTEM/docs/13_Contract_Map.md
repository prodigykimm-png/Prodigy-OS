# Prodigy OS — Contract Map (전수 계약 맵)

이 문서는 Prodigy OS의 계약 우선순위와 9개 표면의 실제 소유 경로를 machine-readable 하게 고정한다.
`SYSTEM/SCRIPTS/prodigy-contract-audit.js`가 이 문서를 유일한 입력 맵으로 파싱한다.

## 계약 우선순위

상위 계층이 하위 계층을 지배한다. 충돌 시 항상 위쪽이 승리한다.

1. Constitution — `SYSTEM/docs/00_Constitution.md`
2. Schema — `SYSTEM/Prodigy/Schema/`
3. Template — `SYSTEM/TEMPLATE/FORMAT/`
4. Hub — `HUB/`
5. View — `SYSTEM/Views/`
6. Test — `SYSTEM/AI/Skills/prodigy-review/tests/`

## 표면 소유 경로 맵

`-`는 해당 표면에 그 계층의 소유 파일이 없음을 뜻한다. Home은 Object type이 아니라 workspace 진입점이므로 Template을 소유하지 않는다.

| Surface | WorkspaceId | Schema | Template | Hub | View | Test |
|---|---|---|---|---|---|---|
| Home | home | `SYSTEM/Prodigy/Schema/Core_Property_Schema.md` | - | `HUB/00 Home.md` | `SYSTEM/Views/home-view.js` | `SYSTEM/AI/Skills/prodigy-review/tests/home/test_workspace_launcher.js` |
| Auction | auction | `SYSTEM/Prodigy/Schema/Auction_Case_Schema.md` | `SYSTEM/TEMPLATE/FORMAT/template_auction_case.md` | `HUB/10 Auction.md` | `SYSTEM/Views/auction-card.js` | `SYSTEM/AI/Skills/prodigy-review/tests/auction/test_auction_day.js` |
| Region | region | `SYSTEM/Prodigy/Schema/Core_Property_Schema.md` | `SYSTEM/TEMPLATE/FORMAT/template_auction_region.md` | `HUB/15 Region.md` | `SYSTEM/Views/region-explorer-view.js` | `SYSTEM/AI/Skills/prodigy-review/tests/auction/test_region_explorer_view.js` |
| Reading | reading | `SYSTEM/Prodigy/Schema/Core_Property_Schema.md` | `SYSTEM/TEMPLATE/FORMAT/template_reading.md` | `HUB/20 Reading.md` | `SYSTEM/Views/reading-view.js` | `SYSTEM/AI/Skills/prodigy-review/tests/reading/test_reading_workspace.js` |
| Workout | workout | `SYSTEM/Prodigy/Schema/Core_Property_Schema.md` | `SYSTEM/TEMPLATE/FORMAT/template_workout.md` | `HUB/30 Workout.md` | `SYSTEM/Views/workout-view.js` | `SYSTEM/AI/Skills/prodigy-review/tests/workout/test_workout_workspace.js` |
| Project | project | `SYSTEM/Prodigy/Schema/Core_Property_Schema.md` | `SYSTEM/TEMPLATE/FORMAT/template_project.md` | `HUB/40 Project.md` | `SYSTEM/Views/project-wizard.js` | `SYSTEM/AI/Skills/prodigy-review/tests/project/test_project_responsive.js` |
| Knowledge | knowledge | `SYSTEM/Prodigy/Schema/Core_Property_Schema.md` | `SYSTEM/TEMPLATE/FORMAT/template_knowledge.md` | `HUB/50 Knowledge.md` | `SYSTEM/Views/knowledge-explorer-view.js` | `SYSTEM/AI/Skills/prodigy-review/tests/knowledge/test_knowledge_contract.js` |
| People | personal | `SYSTEM/Prodigy/Schema/Core_Property_Schema.md` | `SYSTEM/TEMPLATE/FORMAT/template_people.md` | `HUB/60 Personal.md` | `SYSTEM/Views/people-view.js` | `SYSTEM/AI/Skills/prodigy-review/tests/people/test_people_workspace.js` |
| Journal | journal | `SYSTEM/Prodigy/Schema/Core_Property_Schema.md` | `SYSTEM/TEMPLATE/FORMAT/template_daily_note.md` | `HUB/70 Journal.md` | `SYSTEM/Views/journal-view.js` | `SYSTEM/AI/Skills/prodigy-review/tests/journal/test_journal_core.js` |

## 감사 규칙

- 맵에 적힌 모든 경로는 실제로 존재해야 한다. (`missing_mapped_path`)
- `SYSTEM/docs/*.md`, `HUB/*.md`의 Markdown 내부 링크는 링크가 적힌 파일 기준 sibling-relative로 해석되어 실제 파일을 가리켜야 한다. (`broken_internal_link`)
- Template의 `type:` 값은 짝지어진 Schema 문서에 문서화되어 있어야 한다. (`schema_template_link_missing`)
- Hub의 `workspaceId` mount 값은 `SYSTEM/Views/workspace-registry.js`의 해당 Hub 경로 id와 정확히 일치해야 한다. (`workspace_id_mismatch`)
- legacy alias allowlist는 빈 배열이다. 예외를 추가해 결함을 은폐하지 않는다.
