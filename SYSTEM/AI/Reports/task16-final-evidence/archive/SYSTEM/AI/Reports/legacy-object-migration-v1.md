# Legacy Object Migration v1

Generated: 2026-07-18

## Decision

People only.

- Official person Object type: `people`
- Display label: 사람
- Storage: `PARA/RESOURCES/CONTACTS`
- Operating surface: `HUB/60 Personal.md`
- `contact` is legacy read-only compatibility only
- Do **not** merge Areas + People into a Contact Object

```text
People  = relationship memory
Areas   = long-lived themes / responsibility domains
Contact = deprecated legacy type name
```

## Why not Contact unification

1. People and Areas answer different questions.
2. Properties conflict (`last_contact` vs `area_category`).
3. Dashboard actions differ.
4. Link semantics become ambiguous.
5. Current Operating Guide and Object Model already treat People as the person source of truth.

## Current inventory (operational, excluding tests/fixtures)

| type | count | notes |
|---|---:|---|
| `people` | 6 | live person notes under CONTACTS |
| `contact` | 0 | nothing to convert now |
| `project` | template-only | no live project Objects found in scan |
| `project_note` | 0 operational | only fixtures/tests previously |
| `project_family` | 0 | none |
| `area_family` | 3 | demo-like sample areas |
| `area_note` | 14 | demo-like sample notes |

### Live People

- `PARA/RESOURCES/CONTACTS/민지선.md`
- `PARA/RESOURCES/CONTACTS/윤채연.md`
- `PARA/RESOURCES/CONTACTS/전태현.md`
- `PARA/RESOURCES/CONTACTS/정신현.md`
- `PARA/RESOURCES/CONTACTS/정정애.md`
- `PARA/RESOURCES/CONTACTS/정호성.md`

## Mapping

### Contact → People

```text
type: contact → type: people
```

Preserve:

- filename / display name
- relationship, company, role
- phone, email
- last_contact, birthday, first_met
- body sections and connections

Rules:

- preferred folder: `PARA/RESOURCES/CONTACTS`
- never create new `contact`
- keep read compatibility until count remains zero for a stable period

Status: **no live conversion needed**

### Project Note/Family → Project

```text
type: project_note → type: project
type: project_family → type: project
```

Preserve:

- title, status, due/next action
- body, workflow, connections
- Todoist linkage if present

Rules:

- create only through Project Wizard / `template_project.md`
- do not restore deleted legacy templates

Status: **no live conversion needed**

### Areas

Areas are **not** migrated into People/Contact.

They remain a separate axis:

```text
Areas = sustained themes / domains
People = persons and relationship memory
```

## Areas sample classification

All current AREAS content looks like vault demo samples, not active personal operating data.

| Area | Classification | Reason |
|---|---|---|
| Autonomous Vehicle AI Ethics | ARCHIVE candidate | generic demo theme pack, not personal life domain |
| Green Data Center Initiative | ARCHIVE candidate | generic demo theme pack |
| Space Tourism Initiatives | ARCHIVE candidate | generic demo theme pack |

Recommended action:

1. Keep Areas type/contract available.
2. Do **not** auto-delete these notes.
3. Treat current three area packs as archive/delete candidates pending explicit user approval.
4. Personal Hub keeps Areas as a collapsed supporting section only.

## Already completed

- stop creating `contact` / `project_note`
- delete legacy templates (`template_contact`, `template_project_note`)
- Personal Hub People-first UX
- read compatibility for legacy types
- Display Registry labels for legacy type keys

## Remaining work

1. Keep People-only contract documented and enforced.
2. Decide archive vs delete for the three demo Area packs with explicit approval.
3. If any live `contact` or `project_note` reappears, convert only after dry-run + approval.
4. Shrink compatibility readers only after live legacy counts stay at zero.

## Execution protocol

```text
inventory
→ mapping freeze
→ dry-run preview
→ human approval
→ convert minimum fields
→ verify Hub/Home/Project/People
→ optional compatibility shrinkage
```

Hard stops:

- no bulk edit of Daily/Auction/Reading/Workout
- no silent type flips
- no Areas→People merge
- no compatibility removal before live legacy = 0

## Recommendation

Current system should operate as:

```text
Person Object   = people
Theme Object    = area_* (optional, supporting)
Legacy names    = contact / project_note / project_family (read only)
```

No large migration is required right now.
The important work is contract freeze + Areas sample disposition.
