# Prodigy OS Repository Map

## Contract Order

1. `SYSTEM/docs/00_Constitution.md`
2. `SYSTEM/docs/02_Core_Concepts.md`
3. `SYSTEM/docs/03_Object_Model.md`
4. `SYSTEM/Prodigy/Schema/Core_Property_Schema.md`
5. `SYSTEM/Prodigy/Schema/Object_Behavior_Standard.md`
6. `SYSTEM/Prodigy/Schema/Object_Workflow_Standard.md`
7. Domain Schema under `SYSTEM/Prodigy/Schema/`
8. `SYSTEM/TEMPLATE/FORMAT/`
9. `SYSTEM/Views/` and `HUB/`
10. `SYSTEM/SCRIPTS/` and `SYSTEM/AI/Skills/prodigy-review/scripts/`
11. Direct tests under `SYSTEM/AI/Skills/prodigy-review/tests/`

## Domain Map

| Domain | Primary implementation | Direct tests |
|---|---|---|
| Shared UI | `SYSTEM/Views/display-registry.js`, `SYSTEM/Views/shared-dashboard.js`, domain card Views | Direct affected domain test |
| Auction | `HUB/10 Auction.md`, `SYSTEM/Views/auction-card.js`, `site-visit-workflow.js` | `tests/auction/` |
| Reading | `HUB/20 Reading.md`, `SYSTEM/Views/reading-card.js` | `tests/reading/` |
| Project | `HUB/40 Project.md`, `SYSTEM/Views/project-wizard.js` and its service modules | `tests/project/` |
| Weekly AI | `SYSTEM/AI/Skills/prodigy-review/scripts/` | `tests/weekly/` |
| Operation | `operation_core.py`, `runner_core.py` | `tests/operation/`, `tests/pipeline/` |

## Cheap Checks

- JavaScript: `node --check <changed-file>`
- Auction: run only the directly affected test file in `tests/auction/`.
- Reading: `python3 .../tests/reading/test_reading_simplification.py`
- Project: `python3 .../tests/project/test_project_wizard.py`
- Weekly pipeline: run the Evidence, PRE, Formatter tests only when their contracts change.

Escalate to the full relevant suite only for shared helpers, schemas, or cross-domain behavior.
