# Property Contract Precedence

1. Constitution and Core Concepts define ownership and universal principles.
2. `SYSTEM/docs/03_Object_Model.md` defines Object ownership and storage boundaries.
3. Schema documents define official Property names, meanings, types, and status values.
   Status and workflow changes also read `Object_Behavior_Standard.md` and `Object_Workflow_Standard.md`.
4. Canonical templates define concrete storage shape and defaults.
5. `SYSTEM/Views/display-registry.js` defines user-facing Korean labels only.
6. Dashboard and View code consume the contract and must not redefine it.

If two levels conflict, report both sources. Do not silently migrate files, rename Properties, or choose the newer modification time as authority.

## Change Checklist

- Search the key in templates, Views, Validators, Evidence projections, docs, samples, tests, and cache definitions.
- Preserve English `snake_case` internally.
- Add or update one Korean label in the central registry.
- Keep enum values unchanged when only display wording changes.
- Treat removal as a migration: report affected real Objects before editing them.

## Reserved Non-Prodigy Keys

These keys are owned by Obsidian or the Journals plugin. They may appear in templates, but they are not Prodigy official Properties.

- Obsidian: `tags`, `aliases`, `cssclasses`
- Journals: `journal`, `journal-date`, `journal-start-date`, `journal-end-date`, `journal-section`

The Property Contract auditor must skip snake_case, Display Registry, and Schema membership checks for these keys. Do not rename them to force Prodigy naming.

