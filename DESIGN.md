# Prodigy OS UI Design Contract

Prodigy OS uses compact, Obsidian-native operational surfaces for fast review and low maintenance. Dashboard actions stay close to their evidence and workflows; this is an application design system, not a promotional page pattern.

## 1. Principles

- Use the active Obsidian theme as the only color source. The UI must remain legible in light, dark, and high-contrast themes without owning a separate palette.
- Favor dense, explicit controls and clear information hierarchy. Avoid decorative cards, nested containers, ornamental motion, and invented iconography.
- Dashboard surfaces perform actions; Object files preserve Evidence, Reality, Judgement, Learning, and Knowledge.
- Every repeated Explorer structure must be named in the primitive registry before a product View renders it.

## 2. Tokens

Explorer code may consume the following aliases. A color alias must resolve directly to an Obsidian theme variable; no raw hex or RGB color is permitted.

| Token | Value | Purpose |
|---|---|---|
| `--ke-color-surface` | `var(--background-primary)` | Main pane surface |
| `--ke-color-surface-secondary` | `var(--background-secondary)` | Grouped supporting surface |
| `--ke-color-hover` | `var(--background-modifier-hover)` | Hover and selected fill |
| `--ke-color-border` | `var(--background-modifier-border)` | Dividers and panel boundaries |
| `--ke-color-text` | `var(--text-normal)` | Primary text |
| `--ke-color-muted` | `var(--text-muted)` | Secondary text and counts |
| `--ke-color-accent` | `var(--text-accent)` | Links, focus, and selection accent |
| `--ke-color-error` | `var(--text-error)` | Recoverable error copy |
| `--ke-color-interactive` | `var(--interactive-accent)` | Primary action fill |
| `--ke-color-on-interactive` | `var(--text-on-accent)` | Primary action text |
| `--ke-space-1` | `2px` | Tight inline separation |
| `--ke-space-2` | `4px` | Compact control gap |
| `--ke-space-3` | `8px` | Row and section inset |
| `--ke-space-4` | `12px` | Pane separation |
| `--ke-space-5` | `16px` | Major section separation |
| `--ke-radius-control` | `4px` | Buttons and focusable rows |
| `--ke-radius-panel` | `8px` | Grouped information panels only |
| `--ke-type-label` | `0.72rem` | Navigation metadata and counts |
| `--ke-type-body` | `0.84rem` | Dense operational copy |
| `--ke-type-title` | `1.05rem` | Pane and asset titles |
| `--ke-leading-body` | `1.45` | Korean and Latin body copy |
| `--ke-touch-target` | `44px` | Minimum narrow/touch target |
| `--ke-motion-fast` | `150ms` | Meaningful hover/focus feedback only |
| `--ke-nav-min` | `12rem` | Domain navigation preferred floor |
| `--ke-nav-max` | `16rem` | Domain navigation preferred ceiling |
| `--ke-topic-min` | `14rem` | Topic navigation preferred floor |
| `--ke-detail-min` | `20rem` | Detail pane preferred floor |

Status uses semantic theme aliases rather than a fixed palette: active work uses `var(--ke-color-accent)`, errors or blocked work use `var(--ke-color-error)`, and archived or secondary status uses `var(--ke-color-muted)`. Text on primary actions uses `var(--ke-color-on-interactive)` over `var(--ke-color-interactive)`.

## 3. Layout Contract

### Knowledge Explorer shell

- `knowledge-explorer-shell` is a bounded list-detail application shell. Its host supplies an available block-size; the shell does not turn the whole note into a second scrolling document.
- Wide layout uses an overflow-safe three-track grid: Domain uses `minmax(min(var(--ke-nav-min), 100%), var(--ke-nav-max))`, Topic uses `minmax(min(var(--ke-topic-min), 100%), auto)`, and Detail uses `minmax(min(var(--ke-detail-min), 100%), 1fr)`.
- Every grid and flex child that contains content declares `min-inline-size: 0`; every pane participating in bounded vertical overflow declares `min-block-size: 0`.
- `constraint:min-inline-size-0`, `constraint:min-block-size-0`, and `constraint:overflow-safe-grid` are required implementation invariants. Long labels, paragraphs, and unbroken URLs must never force horizontal page scrolling.

### Scroll ownership

- `scroll-owner:domain-nav`: `domain-nav` alone owns vertical overflow for the Domain pane. Its heading remains outside that pane's scrolling list.
- `scroll-owner:topic-nav`: `topic-nav` alone owns vertical overflow for the Topic/Resource pane. Groups do not create nested scroll containers.
- `scroll-owner:detail-pane`: `detail-pane` alone owns vertical overflow for Brief, asset sections, warnings, and provenance. `brief-panel` and `asset-section` expand within it and never acquire independent vertical scrollbars.
- In narrow layout, the active navigation or detail pane is the single visible scroll owner. Hidden panes retain selection state but do not retain active scrolling surfaces.

## 4. Explorer Primitive Registry

| Primitive | Responsibility | Composition and behavior |
|---|---|---|
| `knowledge-explorer-shell` | Bounded application frame | Owns the responsive grid, pane labels, and focus return points; it does not own pane scrolling. |
| `domain-nav` | Ordered Domain navigation | Renders one semantic list of buttons with counts; current Domain is exposed through selected semantics. |
| `topic-nav` | Grouped Topic and Resource navigation | Renders named groups, stable ordering, counts, and an empty group state without nested cards. |
| `detail-pane` | Selected context and related assets | Contains the Brief and asset sections; it is the only detail scroll owner. |
| `brief-panel` | Domain-local deterministic summary | Shows facts and citations first, then optional AI summary; provider failure leaves deterministic content intact. |
| `asset-section` | Repeated typed result group | Uses a heading, count, rows, provenance, and local empty/error copy; repeated instances share this primitive. |
| `drill-down` | Forward navigation control | Moves Domain to Topic/Resource to Detail, updates selected semantics, and transfers focus to the new pane heading. |
| `back` | Reverse navigation control | Returns Detail to Topic/Resource, then to Domain, preserving selection and restoring focus to the invoking control. |

<!-- explorer-composition:start -->
- `knowledge-explorer-shell` composes `domain-nav`, `topic-nav`, and `detail-pane`.
- `detail-pane` composes `brief-panel` and one or more `asset-section` instances.
- `drill-down` and `back` provide the same forward/reverse navigation model at every adaptive layout.
<!-- explorer-composition:end -->

Shared controls retain the existing compact Prodigy patterns: action buttons use 4px radius, high contrast, visible hover/focus, and concise labels; grouped controls use panels only when their relationship needs a boundary. Do not use emoji as icons. If an icon is necessary, use an Obsidian-provided icon with an accessible text name.

## 5. Component States

Every interactive primitive declares and can render these states before product wiring:

| State | Contract |
|---|---|
| `rest` | Uses surface, border, and text tokens with no implied selection. |
| `focus-visible` | Uses a two-pixel `var(--ke-color-accent)` outline with a visible offset; focus is never communicated by color alone. |
| `selected` | Combines selected semantics, accent border/text, and hover-surface fill; it remains distinguishable in forced/high-contrast themes. |
| `loading` | Keeps pane geometry stable, exposes busy semantics, and prevents duplicate activation without removing prior content. |
| `empty` | Names the empty scope and the safe next action; it does not render a blank panel. |
| `error` | Shows concise `var(--ke-color-error)` copy and recovery action while preserving selection and deterministic content. |
| `disabled` | Uses native disabled semantics, muted appearance, and no transform; a reason remains available in nearby text or an accessible description. |

Hover is additive and never the only indication of interactivity. Active feedback may use a one-pixel transform only when motion is allowed. Notices remain concise and never expose machine-owned IDs or provider errors containing secrets.

## 6. Input, Text, and Adaptive Behavior

- `input:keyboard`: Domain, Topic/Resource, asset titles, `drill-down`, and `back` are reachable in logical DOM order. Enter and Space activate buttons; links retain native Enter behavior. Focus moves on pane transitions and returns to the exact invoking control on Back.
- `input:touch`: Narrow layouts use at least `var(--ke-touch-target)` for primary navigation and Back/forward controls, maintain spacing between adjacent targets, and never require hover or drag-and-drop.
- `text:korean-cjk-wrap`: Korean labels use natural line breaking with `word-break: keep-all`, `overflow-wrap: anywhere`, `min-inline-size: 0`, and line-height from `var(--ke-leading-body)`. A long unbroken URL may break anywhere; no critical label is ellipsized without an accessible full name.
- `motion:reduced`: Under reduced-motion preference, nonessential transitions and active transforms are removed. Selection, focus, loading, and pane changes remain immediately perceivable without animation.
- Large text and narrow containers reflow the three panes into a progressive single-pane drill-down. Primary content never requires two-dimensional scrolling, and actions wrap deliberately rather than overlap.

## 7. Verification and Accepted Limitation

The primitive/state harness must cover rest, focus-visible, selected, loading, empty, error, disabled, 40-character Korean labels, long prose, unbroken URLs, empty sections, and desktop/narrow containers before the Hub adapter is wired. The final Explorer surface must later be exercised in actual Obsidian for load, navigation, open-beside, focus return, safe failure, and both panes in the accessibility tree.

`qa:device-limitation-accepted`: a resized Obsidian Desktop window may verify narrow-window reflow but is not evidence of iPhone or other physical-device success. Device-specific success remains unclaimed until a later real-device run; this limitation is accepted for this design-contract-only task.

## 8. Existing Shared Components

- Workflow rows keep stable row height with labeled input and explicit up/down/delete controls.
- Provider controls remain secondary to the workflow action they support.
- Long-running actions disable repeat submission while preserving form state on AI or Todoist failure.
- Generated IDs remain machine-owned and are not presented as ordinary user input.

### Auction bid sheet

- `auction-bid-sheet` is the single-auction execution surface opened from an Auction Card. It mirrors the paper bid form's information order without copying its visual skin: court/date, case context, exact won amounts, verification checks, then one confirmation action.
- The sheet is one bordered surface with divider rows, not nested court/card/packet containers. It never renders the Decision Packet or result capture inside the bid-entry flow.
- `my_bid_price` prefers an existing actual bid and otherwise starts from `expected_bid`; `bid_deposit` prefers the stored value and otherwise starts from `minimum_bid / 10`. Both remain editable and render with thousands separators while storing numeric won values.
- Wide layout may pair fields in two columns. Narrow layout uses one readable column, 44px inputs and actions, no horizontal scrolling, and a footer action that remains reachable without overlapping content.
- The bidder address is an editable user preference loaded from `SYSTEM/PRIVATE/auction-bidder-profile.local.json`; it never reuses the Auction Object's property address. Other bidder identity fields are not inferred.

### Auction today list

- `auction-today-list` opens from the Bid Calendar's `오늘 입찰 목록` action and always uses the device's current local date, independent of the calendar's browsed month or selected date.
- It renders only `auction_case` Objects whose `status` is `bidding` and whose `auction_datetime` date is today. It never mixes site visits, reviews, past cases, or future cases into the list.
- The list reuses the canonical Auction Card. Its case action is labeled `입찰표 열기` and opens the single-case `auction-bid-sheet`; the former multi-case Day Runner is not nested in this route.
- Empty state copy names the scope explicitly: `오늘 예정된 입찰이 없습니다.` Narrow controls retain the 44px touch target and wrap without horizontal overflow.

### Region experience intake modal

- `region-experience-modal` is the reusable, Obsidian-native intake primitive for one already-existing `auction_region`. It preserves a caller's focus-return control and opens and cancels without provider or vault work. It selects an available canonical Region by default; Korean invalid-region recovery appears only after an invalid action.
- Its review shell owns the body scroll. `region-experience-review-footer` remains sticky at the modal bottom and contains the explicit `Evidence 승인·반영` action; it is disabled while busy or without selected Evidence. After Evidence is saved, Region reflection and Knowledge candidate saving remain separate, explicit approvals and never run automatically.
- At widths up to 599px fields and actions become one column; review-footer controls use a one-column grid with `var(--ke-space-3)` visible gaps and at least `var(--ke-touch-target)` height. Korean text uses the shared CJK wrapping contract, focus remains visibly outlined, and reduced-motion users receive no nonessential transition.
