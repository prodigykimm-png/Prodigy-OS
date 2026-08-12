# Prodigy OS UI Design Contract

> **Authoritative alpha contract.** This document defines the shipped Apple-inspired,
> Obsidian-semantic presentation foundation. `SYSTEM/docs/Apple_Design_Analysis_v1.md`
> records the source analysis; `SYSTEM/Views/design-tokens.js` is the executable token
> authority. Behavior, storage, identity, approval, and accessibility contracts remain unchanged.

## 1. Principles

- Use Apple-like hierarchy: full-bleed product storytelling, restrained utility cards, generous whitespace, and clear configurator controls. This is operational UI, not promotional ornament.
- Obsidian semantic variables own canvases, ink, borders, and status colors. Action Blue is the only product accent family.
- No decorative gradients, chrome shadows, remote presentation assets, invented iconography, or local domain palettes.
- Image content alone may use the canonical imagery shadow. Shared and domain chrome uses no shadow.
- Every user-facing graph preserves visible focus, forced colors, reduced motion, Korean/CJK wrapping, 200% zoom reflow, one document scroll owner, and 44px controls.
- Dashboard actions stay adjacent to evidence; Object files continue to preserve Evidence, Reality, Judgement, Learning, and Knowledge.

## 2. Authoritative Foundation

### Color

The only product accents are the canonical Action, Focus, and On-dark Action roles defined exactly in `ProdigyTokens.ACCENTS`. All other color roles resolve through Obsidian semantic variables with documented fail-safe fallbacks in `ProdigyTokens.SEMANTIC_COLORS`. Status uses semantic success, warning, error, and muted roles. `ProdigyTokens.COLORS` is a compatibility-name object, not another palette.

### Type, spacing, radius, and controls

- Type uses SF Pro Display or SF Pro Text with system fallbacks. Canonical roles are `heroDisplay`, `displayLg`, `displayMd`, `lead`, `leadAiry`, `tagline`, `bodyStrong`, `body`, `denseLink`, `caption`, `captionStrong`, `buttonLarge`, `buttonUtility`, `finePrint`, `microLegal`, and `navLink`.
- Canonical spacing is `4 / 8 / 12 / 17 / 24 / 32 / 48 / 80px`.
- Canonical radii are `0 / 5 / 8 / 11 / 18 / 9999px`; pills are reserved for pill-shaped controls.
- Native controls, inputs, icon controls, and touch targets are at least `44px` high.
- Canonical responsive boundaries are `419 / 640 / 735 / 833 / 1023 / 1068 / 1440px`. Shared alpha presentation uses these boundaries only.

### Semantic role registry

| Role | Owner | Purpose |
|---|---|---|
| `--ke-color-accent` | shared tokens | Focus and selected emphasis |
| `--ke-color-error` | shared tokens | Recoverable error text |
| `--ke-type-title` | shared tokens | Workspace titles |
| `--ke-type-heading` | shared tokens | Section headings |
| `--ke-type-body` | shared tokens | Operational copy |
| `--ke-type-label` | shared tokens | Metadata and controls |
| `--ke-leading-body` | shared tokens | Korean/CJK body leading |
| `--ke-leading-control` | shared tokens | Control leading |
| `--ke-space-3` | shared tokens | Repeated compact gap |
| `--ke-radius-control` | shared tokens | Buttons and inputs |
| `--ke-touch-target` | shared tokens | Minimum interactive height |
| `--ke-nav-min` | Explorer contract | Domain navigation floor |
| `--ke-nav-max` | Explorer contract | Domain navigation ceiling |
| `--ke-topic-min` | Explorer contract | Topic navigation floor |
| `--ke-detail-min` | Explorer contract | Detail pane floor |

### Shared presentation primitives

- `.prodigy-full-bleed` owns primary, edge-to-edge narrative surfaces.
- `.prodigy-utility-card` owns bounded supporting information without decorative elevation.
- `.prodigy-configurator-chip` owns compact selectable configuration.
- `.prodigy-search-input`, `.prodigy-btn`, `.prodigy-status-line`, loader/error chrome, App Shell, and navigation consume the same semantic tokens and state grammar.
- Active feedback is `scale(.95)` only; reduced motion removes transforms and transitions.
- Backdrop blur is enhancement-only: an opaque semantic surface is always declared first.

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
| `journal-period-review` | Period-scoped journal surface | Keeps the selected month, quarter, or year visible while exposing previous/next/current navigation, read-only saved content, and the period-specific readiness or review surface. |
| `journal-period-history` | Saved period history | Lists stored Monthly, Quarterly, and Yearly notes in reverse chronological order and reopens each record in the same selected-period surface. |

<!-- explorer-composition:start -->
- `knowledge-explorer-shell` composes `domain-nav`, `topic-nav`, and `detail-pane`.
- `detail-pane` composes `brief-panel` and one or more `asset-section` instances.
- `drill-down` and `back` provide the same forward/reverse navigation model at every adaptive layout.
<!-- explorer-composition:end -->

Shared controls use the canonical 8px control radius, high contrast, visible hover/focus, and concise labels; grouped controls use the 11px configurator or 18px panel radius only when their relationship needs a boundary. Do not use emoji as icons. If an icon is necessary, use an Obsidian-provided icon with an accessible text name. Shared CSS consumes `--ke-*` semantic aliases with Obsidian variables as fallbacks; no primitive introduces a local palette.
### Shared visual rhythm
- Workspace titles use `--ke-type-title`; card and section headings use `--ke-type-heading`; operational copy uses `--ke-type-body`; metadata, filters, and button labels use `--ke-type-label`; fixed-height dock labels may use `--ke-type-chrome`.
- Korean body copy uses `--ke-leading-body`. Buttons, tabs, chips, and other controls use `--ke-leading-control` so glyphs do not touch their control edges.
- Repeated presentation spacing follows the canonical 4/8/12/17/24/32/48/80px `--ke-space-*` scale. Compatibility spacing aliases may be read only by code awaiting migration and must not define new presentation grammar.
- Letter spacing is neutral (`0`) for Korean workspace chrome and headings. Fixed-height controls must not compensate for narrow geometry with negative tracking.
- Collapsed navigation ends at 833px. Primary actions, tabs, context actions, and sheet close/more controls use `var(--ke-touch-target)` (44px from `CONTROL_HEIGHTS.touchTarget`) at every width.
- Controls wrap CJK and long labels with `word-break: keep-all`, `overflow-wrap: anywhere`, and `min-inline-size: 0`; labels are not made accessible by clipping or horizontal overflow.
- `.prodigy-app-shell-body` is the App Shell's only document scroll owner (`overflow: auto` with inline overflow clipped). Adaptive tabs wrap instead of creating a horizontal scroll owner; the sticky Action Bar does not scroll independently. Hidden secondary lanes remain non-scrollable.
- BottomSheet is a bounded overlay: its panel clips overflow, and `.prodigy-bottom-sheet-body` is its sole overlay scroll owner. Safe-area clearance is applied to the App Shell body, Action Bar, and sheet panel so the Obsidian toolbar and device inset do not cover the last action.
- A workspace that repaints on a data refresh restores the scroll offset of `.prodigy-app-shell-body` and updates rows in place. Rebuilding the subtree resets scroll position and caret even when the user never navigated.

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

`qa:device-limitation-accepted`: a resized Obsidian Desktop window may verify narrow-window reflow but is not evidence of iPhone or other real-device verification. Device-specific success remains unclaimed until a later real-device run; this limitation is accepted for this design-contract-only task.

## 8. Existing Shared Components

### Reliability and capture primitives

아래 이름은 Home, Workspace, Capture, Assistant가 같은 경계를 공유하기 위한 계약 참조다. 사용자에게 보이는 문구는 한글로 유지하고, 영어 이름은 테스트와 설계 참조에서만 사용한다.

| Primitive | 책임 | 가드레일 |
|---|---|---|
| `recoverable-hub-shell` | Home과 Workspace 진입면이 일부 데이터·제공자 실패에도 오늘 행동, 복구 안내, Workspace 이동을 유지한다. | 실패 상태도 `error`로 보이며, 한 화면 안의 `one scroll owner` 원칙을 깬 중첩 스크롤을 만들지 않는다. |
| `mobile-quick-stream` | 좁은 화면에서 같은 Home 흐름을 빠른 확인 → Workspace 진입 순서로 압축한다. | `single Home`, `no separate Mobile Home`, `44px` 터치 대상, `CJK` 줄바꿈, `reduced motion` 대응을 유지한다. |
| `micro-log-capture` | Home이나 Workspace에서 3초 안에 시작하는 최소 기록 입력이다. | 폴더·Property 선택을 요구하지 않으며, 길어진 정리는 Inbox 또는 해당 Workspace 검토로 넘긴다. |
| `vault-assistant` | Vault 안의 기존 문서와 상태를 읽어 다음 확인 지점을 제안하는 보조자다. | `read-only Assistant`이며 Object 생성, 저장, 승인, 상태 변경을 직접 수행하지 않는다. |
| `citation-bundle` | AI 제안이나 보조 요약 옆에 출처 경로, 수집 상태, 확인 시각 같은 최소 근거 묶음을 붙인다. | 개인 노트 본문을 불필요하게 복제하지 않고, 근거 없음은 숨기지 않고 빈 상태로 표시한다. |
| `ai-telemetry-status` | AI 제공자, 로컬 서버, 마지막 실패, 재시도 가능 여부를 작은 시스템 상태로 드러낸다. | 비밀값과 원문 오류를 노출하지 않으며, 어떤 상태도 `no automatic approval` 예외가 될 수 없다. |

Physical-device 성공은 `physical iPhone` 실기기에서 사용자가 직접 확인한 경우에만 `user-evidence-only gate`를 통과한다. 데스크톱 폭 조절, 시뮬레이터, 스크린샷 추정은 모바일 성공 근거가 아니다.

## 9. Responsive Workspace Shell

| Primitive | 책임 | 계약 |
|---|---|---|
| `AppShell` | Workspace bar, context, and one body scroll owner. | Canonical tiers use 419, 640, 735, 833, 1023, 1068, and 1440px boundaries. The body reserves mobile-toolbar and safe-area clearance; it is the only document scroll owner. |
| | | Breakpoints and `CONTROL_HEIGHTS.touchTarget` come from `SYSTEM/Views/design-tokens.js`; shared CSS maps them through `--ke-*` aliases. |
| `ContextBar` | Shows selection, filters, and sync context briefly. | Korean/CJK and long values wrap naturally; actions retain visible focus and reach the compact touch target. |
| `WorkspaceSwitcher` | Switches HUB by registry id/path/label. | It never creates a second list; the Obsidian Workspace API fallback remains. |
| `AdaptiveTabs` | Keeps tab meaning and keyboard order at each width. | Arrow, Home, End, selected semantics, wrapping labels, and no horizontal scroll owner. |
| `AdaptiveActionBar` | Splits compact primary/secondary work between the `52px` Action Bar and sheet. | Primary and More controls are at least `44px` in compact; sticky positioning does not create a scroll owner; safe-area padding is shared. |
| `BottomSheet` | Bounded overlay for compact secondary work and the Inspector shell. | Max height is `min(70vh, 560px)`; panel overflow is clipped and its body alone scrolls; Escape, focus return, visible focus, and safe-area clearance are explicit. |
| `StatusLine` | loading/동기화 상태를 비파괴적으로 알린다. | polite live region과 텍스트 상태를 사용한다. |
| `InlineError` | 문맥을 보존한 recoverable 오류를 표시한다. | concise Korean copy와 선택적 복구 작업을 제공한다. |
| `AIInspector` | Task 21이 채울 빈 Inspector frame이다. | compact는 bottom sheet, medium/wide는 `min(38%, 420px)` side panel이다. |

Workspace UI 상태는 schema `v1`로 분리한다. `prodigy.ui.workspace-state.v1`에는 active workspace/tab, filters, sort, density만 저장하고, scroll position은 session 전용 `prodigy.ui.scroll-state.v1`에 저장한다. AI transcript는 `prodigy.ai.chat-session.v1` sessionStorage 또는 memory fallback에만 존재하며 두 UI key에 복제하지 않는다. 저장값을 해석할 수 없으면 폐기하고 first-run 상태로 복구한다. 모든 primitive는 visible focus, reduced motion, CJK wrapping, compact `44px` touch target 계약을 공유한다.

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

### Region decision popup

- `region-collection-health` is a compact status band, not a score. It shows canonical Region coverage, the selected Region's latest metrics month and run count, and explicit missing, stale, or repeated-month warnings without changing any Region Object.
- `region-decision-outcome` places the current Auction's human-authored judgement beside canonical `auction_outcome` history for the exact same 시군구. `region_dong` remains item context; district-only values are labeled `구 기준`.
- Lifecycle-only `won` / `lost` / `skipped` records are labeled as pending legacy results and never enter outcome counts or bid-rate calculations. Small samples are identified explicitly, and the surface never emits a region score, recommendation, forecast, or suggested bid.
- At widths up to 640px fields and actions become one column; review-footer controls use a one-column grid with `var(--ke-space-3)` visible gaps and at least `var(--ke-touch-target)` height. Korean text uses the shared CJK wrapping contract, focus remains visibly outlined, and reduced-motion users receive no nonessential transition.

### Region source command guide

- `region-source-command` is the full-width, read-only command surface for preparing an official source collection. It requires an explicit reference period and provider-published UTC timestamp, never infers either value, and only exposes the command after validation.
- The command surface remains secondary to Region comparison, uses the existing Explorer control tokens, and spans the compact panel width so an absolute Vault path remains reviewable. Its `focus-visible` outline and `is-error` status use the shared accent/error aliases.
- The Hub action only prepares or copies a command. Network dispatch, process execution, raw-ledger writes, and Region Object changes remain outside the Obsidian view.
- `region-source-evidence` is a compact provenance badge on each covered Region row. It reports only a verified, projection-ready ledger generation and keeps source values out of the existing Region metric cards.

### Auction–Region decision surfaces

- `auction-decision-board` is the single card-level entry point for regional context. It keeps the Auction card's address, price, status, and user judgement out of the board when they are already visible on the card; the board adds only the four neutral questions `거래·가격`, `임대·수요`, `공급·생활환경`, and `경매 사례·미시 입지`, with at most three traceable facts per question.
- `auction-research-attention` is conditional chrome. A healthy source package stays quiet on the card; missing, stale, failed, identifier-required, or selection-required research exposes a compact `조사 자료` action. The action reports provider state and never invents an auction outcome from an elapsed date.
- `region-detail-groups` is a fixed three-group detail surface: `판단 맥락`, `지역 근거`, and `사례·임장`. Existing evidence sections remain nested under their responsible group, and connected Auction rows remain read-only drill-downs with exact source paths.
- `region-comparison` groups comparison fields by decision question and retains each selected Region as a column. Wide layouts use side-by-side columns; compact layouts preserve the columns inside a local horizontal scroller. Each column carries its own 기준일 and 검증 상태, and the surface does not calculate rank, delta, score, baseline, or recommendation.
- `auction-region-focus-handoff` carries a selected Auction path for one session only. The Auction Hub consumes it once, applies the existing district filter, opens a collapsed status section if needed, and focuses the exact card; if no matching card is rendered, it shows a Korean recovery notice and clears the request.

### Workout health tabs

- `workout-health-shell` is the three-tab container (`근력 | 식단 | 러닝`) inside the single Workout workspace entry. It uses semantic `tablist/tab/tabpanel`, roving tabindex with ArrowLeft/ArrowRight/Home/End, Enter/Space activation, and `sessionStorage['prodigy.workout.activeTab.v1']` persistence. Default and invalid-state fallback is `strength`. Programmatic entry via `renderDashboard(..., { initialTab })` and `WorkoutView.openTab(tabId)` is supported; URL hash/query is never a contract.
- `workout-session-bar` is a sticky progress surface shown during an active draft session. It displays the current exercise name, completed/total sets, a compact progress track, and an accessible rest timer with `-30초`, `+30초`, `건너뛰기` controls. Rest duration prefers the prescribed set rest; otherwise defaults to 90 seconds. The bar never overlaps content below it and remains reachable at narrow widths.
- `nutrition-day-summary` renders selected-date kcal/P/C/F totals as compact chips. `nutrition-meal-list` groups entries by meal (breakfast → lunch → dinner → snack → other). Goal display is explicit `미설정` when unset; no automatic targets are invented.
- `run-activity-summary` shows distance, duration, pace, and optional HR/elevation/calories for the latest activity. `run-split-table` is a bordered table with #, distance, time, pace columns. Summary-only records (Apple Health XML, legacy quick sessions) are labeled explicitly and never imply missing metrics are zero.
- `trend-strip` renders the nutrition 7-day daily totals/averages and the running 6-week distance/time grid plus 4-week distance-weighted average pace.
- `import-review` is the shared preview-before-confirm pattern for FatSecret CSV, TCX/GPX files, and Apple Health XML. It shows mapped columns or activity stats, first rows, create/update/skip/warning counts, and requires explicit confirm before writes. Raw file content is never persisted; only a receipt (basename, timestamp, counts) is stored.
- All Workout health primitives follow the shared contracts: Obsidian theme variables only (no raw hex/rgb), one scroll owner per panel, 44px minimum touch targets at narrow widths, CJK wrapping with `word-break: keep-all`, `overflow-wrap: anywhere`, reduced-motion compliance, and full state coverage (rest, focus-visible, selected, loading, empty, error, disabled).
- Privacy: latitude, longitude, route, track, and coordinate arrays are recursively stripped before any object reaches the health store. Original CSV/XML/FIT/TCX/GPX bytes are never copied into the Vault.

## 10. 구현 현실과 물리 기기 한계

이 문서는 2026-07-30 기준 실제 구현을 설명한다. 모든 반응형 검증은 headless logical-width harness로 수행되었으며, 실제 iPhone·iPad·Mac 기기 검증은 아직 수행되지 않았다. `.omo/evidence/evidence-manifest.json`은 `physical_device_success: false`, `physical_claim_status: "not_proven"`을 기록하고 있다. 물리 기기에서의 동작을 주장하지 않으며, 데스크톱 폭 조절과 시뮬레이터는 모바일 증명으로 인정하지 않는다.

## 11. AI 컨텍스트 봉투 (Context Envelope)

`ai-context-envelope.js`의 `buildContextEnvelope(input)`은 순수 함수로 동작하며, 정확히 6개의 필드(`workspace`, `tab`, `selection`, `snapshot`, `citations`, `locale`)만 허용한다. 직렬화 용량은 8 KiB로 제한되며, 초과 시 `snapshot`을 가장 오래된 항목부터 제거하고 `truncated: true`를 설정한다. 본문·비밀값·`selection`을 벗어난 DAILY-PARA 콘텐츠는 금지된다. Provider 바인드는 localhost 또는 private tailnet만 허용하며, `antigravity`, `agy`, 소비자 OAuth 재사용, 공용 바인드, LAN 바인드는 네트워크 호출 전에 차단된다. AI 제안 출력은 기존 도메인 승인 핸들러가 수락하기 전까지 비활성 상태다.

## 12. 정리 감사 (Cleanup Audit)

`SYSTEM/SCRIPTS/prodigy-cleanup-audit.js`는 기본적으로 dry-run 모드로 동작하며, 실제 삭제는 `--apply`와 함께 일치하는 receipt 해시가 필요하다. 드리프트가 감지되면 실패로 종료된다. 재고 조사는 52개 플러그인과 29개 템플릿을 대상으로 했으며, 미참조 템플릿은 0개였다. `password-protection`, `table-editor-obsidian`, `SYSTEM/TEMPLATE` 루트, `SYSTEM/CACHE`는 보존되었다.
