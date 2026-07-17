# Prodigy OS UI Design Contract

This vault uses compact Obsidian-native operational dashboards. The design goal is fast review and low maintenance, not a marketing surface.

## Tokens

- Backgrounds: Obsidian theme variables only (`--background-primary`, `--background-secondary`, `--background-modifier-hover`).
- Text: Obsidian theme variables only (`--text-normal`, `--text-muted`, `--text-accent`).
- Borders: `--background-modifier-border`.
- Status colors:
  - idea: `#a855f7`
  - planning: `#3b82f6`
  - doing: `#22c55e`
  - blocked: `#ef4444`
  - completed: `#06b6d4`
  - reviewing: `#f97316`
  - archived: `#8e8e93`

## Layout

- Dashboard actions stay close to the relevant dashboard, above operational sections.
- Cards use tight spacing, 6-10px radius, and clear left status accents.
- Modals use dense two-column layouts only when the content remains readable; otherwise stack vertically.
- Avoid nested cards. Use panels only for grouped controls or repeated items.

## Components

- Action button: compact, high-contrast, 6px radius, clear hover state.
- Workflow row: stable row height, label input, up/down/delete controls.
- Provider controls: secondary controls near AI action, never dominant over workflow editing.
- Notices: concise success/failure text. Do not expose raw IDs unless debugging.

## Interaction

- Prefer explicit buttons over drag-and-drop for reliability in Obsidian.
- Disable long-running actions while they are active.
- Preserve form state on AI or Todoist failures.
- All generated IDs are machine-owned and not presented as normal user input.
