# Obsidian QA Matrix

| Surface | Required scenario | Pass condition |
|---|---|---|
| Dashboard | Load, filter, open one Object | No Evaluation Error; cards remain readable |
| Card action | Execute the changed button | Exact Property or workflow transition only |
| Modal/Wizard | Open, edit, cancel, confirm | State preserved; duplicate submit blocked |
| Split pane | Open linked Object | Dashboard remains visible; target opens in requested pane |
| Korean UI | Inspect longest labels | No raw key, clipping, overlap, or duplicate number |
| Narrow layout | Reduce window width | Controls wrap deliberately; no horizontal loss |
| Error path | Trigger safe failure | Concise notice; user input and source file preserved |

## Current Surfaces

- Shared Dashboard: `SYSTEM/Views/shared-dashboard.js`
- Object Cards: `SYSTEM/Views/auction-card.js`, `project-card.js`, `reading-card.js`
- Auction Card and field flow: `SYSTEM/Views/auction-card.js`, `site-visit-workflow.js`
- Project Wizard: `SYSTEM/Views/project-wizard.js` and its service modules

Use the changed surface and its actual `HUB/` entry point. Do not infer an obsolete path from an older prompt.

## Evidence

- Capture a screenshot after the primary success path.
- Use the accessibility tree to confirm button names and both panes when applicable.
- Record static test result separately from visual verdict.
- Do not claim iPhone success from a resized Desktop window.
- Before retaining evidence, redact names, addresses, case numbers, IDs, API errors containing credentials, and unrelated personal content.
- Keep temporary screenshots outside the Vault and remove them after the verdict unless the user explicitly asks to preserve them.
- Never attach a full unredacted workspace screenshot when a cropped component proves the same result.
