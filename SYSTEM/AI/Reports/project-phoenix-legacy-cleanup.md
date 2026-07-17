# Project Phoenix Legacy Cleanup Report

Generated: 2026-07-17

This report covers implementation assets only. User-owned Objects, Daily notes, runtime history, personal plugin state, and `.trash` content are excluded from deletion.

| Classification | Item | Location | Why it exists | Why it is obsolete or retained | Proposed action |
|---|---|---|---|---|---|
| DELETE | Dusk onboarding package | `SYSTEM/GETTING STARTED/` | Original Dusk installation and feature guide with screenshots | Describes Dusk Homepage, Page Tasks, mobile duplicates, and setup that no longer matches Prodigy OS; no active loader references it | Delete the complete folder and media bundle |
| DELETE | Separate mobile dashboards | `SYSTEM/MOBILE HUB/` | Dusk maintained separate desktop and mobile Home, Mail Box, and MOC files | Current Hub implementations are responsive; separate copies create two sources of truth | Disable separate mobile Home, remove stale shortcuts, and delete |
| DELETE | Legacy ObjectCards renderer | `SYSTEM/Views/ObjectCards/` | Original generic Homepage Object card implementation | No active Hub loads it; domain cards and `shared-dashboard.js` own current rendering | Delete and update internal skill/schema references |
| DELETE | Calendar Dataview component | `SYSTEM/TEMPLATE/CSS/Calendar/` | Dusk calendar demo/view | Referenced only by its own demo note; current Home reports calendar unavailable and no Workspace loads it | Delete |
| DELETE | Timeline task manager component | `SYSTEM/TEMPLATE/CSS/Timeline/` | Dusk Tasks Timeline demo/view | Referenced only by its own demo note; Todoist and current Home own execution | Delete |
| KEEP | Todo toggle template | `SYSTEM/TEMPLATE/CODE/toggle_todo.md` | Active Templater hotkey for task state changes | Still configured and operational | Keep until the user explicitly retires the hotkey |
| DELETE | Auction filter template snippets | `SYSTEM/TEMPLATE/CODE/filter_*.md` | Old Meta Bind filter fragments | Current Auction Dashboard owns filters and no active file references these snippets | Delete filter files |
| DELETE | Meeting todo helper templates | `SYSTEM/TEMPLATE/CODE/toggle_todo_meeting.md`, `toggle_todo_revert.md` | Dusk Page Task compatibility helpers | No active reference outside Dusk onboarding | Delete |
| DELETE | Dynamic form script | `SYSTEM/SCRIPTS/DynamicFormScript.js` | Dusk dynamic form experiment | No caller or configured script path | Delete |
| DELETE | Auction migration script | `SYSTEM/SCRIPTS/migrate_auction_cases.py` | One-time local migration with a hard-coded Dusk path | Migration is complete and the script is not reusable safely | Delete |
| KEEP | Auction validator | `SYSTEM/SCRIPTS/auction_validator.py` | Deterministic Auction contract validation | Active product-quality tool | Keep |
| DELETE | Duplicate Journal template | `SYSTEM/TEMPLATE/FORMAT/template_journal.md` | Early generic English Journal draft | `template_daily_note.md` is the configured operational Journal template | Delete |
| DELETE | Legacy project-note template | `SYSTEM/TEMPLATE/FORMAT/template_project_note.md` | Dusk folder-wide project note automation | Uses `project_note`, uppercase Properties, and conflicts with Project Wizard | Remove Templater/QuickAdd connections and delete |
| DELETE | Legacy Contact template | `template_contact.md` | Older person-record generation | `people` is the current ownership model | Point QuickAdd and Templater to `template_people.md`, then delete |
| KEEP | Official Workspace templates | `template_auction_case.md`, `template_reading.md`, `template_workout_program.md`, `template_exercise.md`, `template_project.md`, Daily/Weekly/Monthly templates | Canonical Object creation | Used by current Workspaces and pipelines | Keep |
| KEEP | Reading compatibility projection | `reading-memory-core.js` aliases | Reads mixed historical Reading formats | Compatibility is isolated, read-only, and prevents user-data migration | Keep until real Reading Objects are normalized by user action |
| KEEP | Legacy Object type readers | Home, Personal, Display Registry | Nine `project_note`/`project_family`, four `contact`, and other ZETA/PARA legacy Objects still contain user-owned data | Removing read compatibility would hide data without migrating it | Keep read-only compatibility; stop creating new legacy Objects |
| KEEP | Provider legacy secret aliases | `project-workflow-draft-service.js`, `morning-brief-service.js` | Reads previously configured SecretStorage names | Does not affect UI or duplicate data and prevents credential loss | Keep until a settings migration exists |
| REPLACE | Knowledge Workspace table UI | `HUB/50 Knowledge.md` | Early ZETA browser | Mixed terminology and table-first layout differs from current action Workspaces | Replace with a concise responsive list and Korean labels |
| REPLACE | Personal Workspace table UI | `HUB/60 Personal.md` | Early personal/area browser | Queries Daily for `fleeting_note`, mixes concerns, and has legacy table UX | Replace with People and Area lists using current types |
| REPLACE | Journal Workspace table UI | `HUB/70 Journal.md` | Early Daily list | Static instructions and table UI do not support current review rhythm | Replace with Today, recent Journal, and review navigation |
| KEEP | Home | `HUB/00 Home.md`, `SYSTEM/Views/home-view.js` | Current Mission Control | Already prioritizes focus, evidence, and Workspace navigation; Workout route was updated to Program Runner | Keep and regression-test |
| KEEP | Domain Workspace implementations | `HUB/10`, `20`, `30`, `40` and current domain Views | Current Auction, Reading, Workout, Project products | Active and covered by domain tests | Keep |
| DELETE | Generated Python caches and Finder metadata | `__pycache__/`, `.DS_Store` | Local runtime/editor artifacts | Rebuildable and not product assets | Remove and keep ignored |
| DELETE | Local backup files | `.obsidian/snippets/base.css.bak`, Iconic backup JSON files | Manual/plugin backups | Not loaded by Obsidian and duplicate current files | Remove from working tree; never commit |

## Deletion Gate

Only rows marked `DELETE` and not connected to a dirty user configuration are approved for immediate removal. `REPLACE` and `MERGE` rows require their active settings or user workflow to be migrated first.
