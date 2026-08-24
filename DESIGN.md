# Prodigy OS UI Design Contract

> **Authoritative alpha contract.** This document defines the shipped Apple-inspired,
> Obsidian-semantic presentation foundation. `SYSTEM/docs/Apple_Design_Analysis_v1.md`
> records the source analysis; `SYSTEM/Views/design-tokens.js` is the executable token
> authority. Behavior, storage, identity, approval, and accessibility contracts remain unchanged.

## 1. Principles

- Use Apple built-in-app hierarchy: one window toolbar, a continuous source list, stable list/detail regions, grouped rows, and quiet utility controls. Product-page storytelling is not an application-shell primitive.
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

### LLMWiki knowledge detail modal

- `llmwiki-knowledge-detail-modal` opens one read-only knowledge result from `LLMWiki 탐색` without replacing or duplicating the result list. The invoking result remains the focus-return target.
- The modal uses the native Obsidian dialog lifecycle: Escape, the native close control, backdrop dismissal, and the explicit `닫기` action all close the same surface. Result buttons expose `aria-haspopup="dialog"` and their expanded state.
- The modal header owns trust, domain, title, and source path. Its body is the sole modal scroll owner and renders loading, ready, empty, stale, and error states without enabling writes or provider calls.
- Wide and compact layouts reuse semantic surfaces, borders, type, spacing, the 44px touch target, Korean/CJK wrapping, visible focus, and reduced-motion rules. No inline detail pane remains beside the result list.

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

## 13. Apple 기본 앱 화면·기기 계약 (Apple UI Redesign)

> 이 계약은 Prodigy Hub 전용 Apple built-in-app 프레젠테이션의 단일 문서다. 실행 토큰은 `SYSTEM/Views/design-tokens.js`가 독점 공급한다. `SYSTEM/AI/Skills/prodigy-review/tests/shared/test_design_theme_contract.js`가 아래 값을 정확히 잠근다. **공식 Apple 요구와 Prodigy 프로젝트 기본값은 명확히 구분된다.**

### 13.0 Prodigy-first 우선순위

- **기능·정보 구조는 Prodigy OS이고, 시각 언어·레이아웃·컨트롤·상호작용은 가능한 한 Apple 기본 앱에 가깝게 구현한다.** Apple은 단순 참고나 마지막 polish가 아니라 UI 품질의 직접적인 목표다.
- 둘이 충돌하면 Prodigy OS의 정보 구조, 사용자 흐름, 도메인 의미는 보존하되, 그것을 표현하는 화면은 macOS/iOS/iPadOS 기본 앱의 toolbar, source list, grouped rows, pane transition, typography, spacing, color, selection, button hierarchy를 최대한 충실하게 사용한다.
- Apple 유사성을 높인다는 이유로 Morning Brief, Focus, 승인 흐름, Object 근거, Evidence·Reality·Judgement·Learning·Knowledge 연결, 다음 행동을 숨기거나 축소하거나 제거하지 않는다.
- 화면 단순화는 핵심 정보를 없애는 작업이 아니라, Prodigy OS의 핵심 브리핑 → 판단 대상 → 근거 → 다음 행동 순서를 더 빠르게 읽게 만드는 작업이다.
- Auction에서는 `주요 브리핑`, canonical Auction Card, Bid Calendar가 모두 핵심이다. 카드 가시성을 높이더라도 브리핑을 접거나 밀어내지 않고, 브리핑을 강조하더라도 카드와 달력의 판단·실행 기능을 약화하지 않는다.
- 최종 시각 검토는 두 질문을 모두 통과해야 한다. 먼저 “이 화면만 보고 오늘 무엇을 판단하고 무엇을 해야 하는지 알 수 있는가”를 확인하고, 이어서 “custom Obsidian dashboard가 아니라 Apple 기본 앱처럼 보이고 작동하는가”를 독립적으로 확인한다. 어느 하나만 통과하면 실패다.

### 13.1 공식 Apple 요구 vs Prodigy 프로젝트 기본값

**공식 Apple 사실 (`ProdigyTokens.APPLE_SPEC`)** — Apple HIG와 기기 스펙에서 직접 가져온 값:

- iPhone/iPad 기본 터치/클릭 hit target은 `44×44pt`이며 절대 최소는 `28×28pt`다.
- macOS 네이티브 컨트롤 기본 크기는 `28×28pt`, 절대 최소는 `20×20pt`다.
- safe area를 존중하고 `200%` 텍스트 확대(`textEnlargement: 2`)를 지원한다. iOS/iPadOS는 시스템 텍스트 확대, macOS는 브라우저 zoom을 통한다.
- Apple은 custom button 높이/측면 여백을 단일 수치로 규정하지 않는다.

**Prodigy 프로젝트 기본값 (`ProdigyTokens.DEVICE_TABLE`)** — 위 원칙을 세 기기 계열에 적용한 설계 결정:

- 접근성과 cross-device consistency를 위해 모든 컨트롤은 기기와 무관하게 비중첩 `44px` hit wrapper를 갖는다. Mac의 작은 visual control(32/36px)도 44px wrapper 안에 둔다.
- `visualHeight`/`visualSize`와 `hitTarget`/`hitSize`는 분리된 token이며, Mac wrapper는 인접 hit area와 겹치지 않고 pointer hover는 inner visual에만, keyboard focus는 wrapper 전체의 2px outline으로 드러난다.
- 아래 기기 표의 CTA 높이·padding·gutter·radius는 Apple type/target 원칙을 Prodigy에 적용한 결정이다.

### 13.2 화면 문법

- 모든 Hub는 **window toolbar → continuous source list → list/detail content** 순서로 읽힌다. Markdown 제목, AppShell 제목, 화면 본문 제목을 중복하지 않으며 AppShell만 workspace title과 toolbar action을 소유한다.
- **Home**은 macOS Home·Reminders 계열의 **source list + grouped rows** 문법이다. Morning Brief→승인된 Focus→한 개 primary action의 단일 서사를 유지하되, 반복 콘텐츠는 rounded card가 아니라 separator가 있는 row/group으로 렌더링한다.
- **Auction**은 Reminders·Notes 계열의 **source list + auction list + selected detail** 문법이다. Today source list는 현재 범위를 선택하고, canonical Auction Card는 독립 list item 경계를 유지하며, 선택된 판단과 작업만 detail pane에 나타난다.
- Auction의 **목록과 달력은 동일 문서의 위아래 목적지가 아니라 서로 배타적인 pane scene**이다. `홈 | 달력` 선택은 active scene을 바꾸고, sidebar·필터·선택 상태는 유지하며, 모바일에서는 scene이 전체 content region을 소유한다.
- 장면 안에서 surface 경계는 정보 책임을 따라야 한다. source list는 하나의 연속 material, 반복 정보는 row separator, 입력·오류·독립 Auction Card만 bounded container를 사용한다. 카드 안에 다시 일반 카드를 중첩하지 않는다.
- Hub는 Obsidian Default theme를 repository baseline으로 하며, Action Blue만 product accent family다. raw hex는 `design-tokens.js`와 이 문서에서만 선언한다.

### 13.3 기기별 metric 표 (Prodigy 기본값)

| 역할 | iPhone 15 Pro Max | iPad Pro 13-inch | Mac |
| --- | --- | --- | --- |
| Primary CTA | 50px 높이, 17px/600, line-height 1.24, 좌우 20px, radius 25px | 48px, 17px/600, 좌우 20px, radius 24px | 44px, 15px/600, 좌우 18px, radius 22px |
| Secondary CTA | 44px, 15px/600, 좌우 16px, radius 22px | 44px, 15px/600, 좌우 16px, radius 22px | 36px visual / 44px hit, 14px/600, 좌우 14px, radius 18px |
| Filter/utility | 44px, 15px/500, 좌우 16px | 44px, 14px/500, 좌우 16px | 32px visual / 44px hit, 13px/500, 좌우 12px |
| Icon control | 44×44px visual/hit, 18px glyph | 44×44px, 18px glyph | 32×32px visual / 44×44px hit, 16px glyph |
| Search/input | 48px, 17px/400, 좌우 17px | 44px, 17px/400, 좌우 17px | 36px visual / 44px hit, 13px/400, 좌우 12px |
| Focus | 2px Action Blue outline + 2px offset | 동일 | 동일 |
| Body / metadata | 17px/400/1.47, 14px/400/1.43 | 동일 | editorial 17px, dense 13px/400/1.23, metadata 12–13px |
| Hero | 34px/600/1.12 | portrait 40px/600/1.10, landscape 48px/600/1.08 | 56px/600/1.07 |
| Section / card title | 28px/600, 21px/600 | 32px/600, 21px/600 | 40px/600, 24px/600 |
| Page gutter | 20px | portrait 32px, landscape 48px | 48px, 1440px 이상 80px |
| Auction Card gap | 12px | 17px | 17px |

### 13.4 컨테이너 tier와 safe area

- layout tier는 viewport가 아니라 **측정된 `.prodigy-app-shell-body` 폭**으로 정한다. `window.innerWidth`는 layout source of truth가 아니고 private breakpoint를 추가하지 않는다.
- tier 구간(`ProdigyTokens.CONTAINER_TIERS`): `compact ≤ 640`, `medium 641–1068`, `wide ≥ 1069`, content max `1440`.
- 공용 canonical 반응형 경계는 `419 / 640 / 735 / 833 / 1023 / 1068 / 1440px`이며 tier는 이 경계에서 파생된다.
- iPhone safe area·모바일 toolbar·action bar clearance를 유지해 마지막 action이 tool overlay에 덮이지 않는다. iPad split view, Mac 좁은 창, 단일 scroll owner를 유지한다.

### 13.5 card boundary·typography·contrast·motion·accessibility

- **Auction Card boundary**: 기본 1px semantic boundary. light/dark 값은 `ProdigyTokens.CARD_BOUNDARY`를 사용한다. card surface와 바탕은 각각 `SEMANTIC_COLORS.surface`와 `SEMANTIC_COLORS.surfaceSecondary`, dark graphite 계열은 대응 dark semantic token을 사용한다. hover는 fill/border만, focus는 2px Action Blue + offset, selected/urgent는 card separation을 대체하지 않는다.
- **Containment budget**: Home의 일반 정보는 card를 사용하지 않는다. Morning Brief, Focus, Continue, Micro Log는 grouped row 또는 detail section이며 separator와 spacing이 경계를 만든다. Auction Card는 사용자가 요청한 case별 구분을 위해 유일한 반복 card primitive로 남는다.
- **Action Blue family** (`ProdigyTokens.ACCENTS`): primary/focus, body link, dark-surface action/link, on-action 색상은 각각 `ACCENTS.primary`, `ACCENTS.link`, `ACCENTS.darkLink`, `ACCENTS.onAction`을 사용한다. 옛 alpha alias는 철회되어 두 blue family가 공존하지 않는다.
- **Mac native control hierarchy**: Action Blue fill은 화면의 현재 결정에 해당하는 한 개 primary action에만 사용한다. Toolbar utility는 transparent rest + neutral hover, toolbar add/navigation은 accent text, selected source-list row는 저채도 accent tint + normal ink를 사용한다. Selection은 persistent focus outline을 사용하지 않으며, 2px outline은 `:focus-visible`일 때만 나타난다.
- **Mac native material cadence**: source-list는 `--background-secondary`의 연속 면이고 내부 요약은 중첩된 흰 카드 대신 separator와 spacing으로 나눈다. Detail pane은 `--background-primary`, 보조 control은 theme hover/surface 역할을 사용한다. Raw blue alpha나 별도 회색 palette는 만들지 않고 `color-mix()`와 Obsidian semantic variables로 파생한다.
- **typography**: SF Pro Display/Text system stack (원격 다운로드 없음). workspace title은 한 번만 나타나고, Mac은 window title 20–24px, section title 17–20px, body 14–15px, sidebar row 14–15px, toolbar label 13px의 계층을 사용한다. Korean/CJK 제목·버튼은 **negative tracking을 사용하지 않고** neutral tracking(`ProdigyTokens.KOREAN_TYPE.tracking === 0`) + `word-break: keep-all` + `overflow-wrap: anywhere`로 자연 줄바꿈한다.
- **contrast**: text `≥ 4.5:1`, large text `≥ 3:1` (WCAG 1.4.3). `test_design_theme_contract.js`가 대비 쌍을 잠근다.
- **motion**: nonessential transition/scale은 `prefers-reduced-motion`에서 제거된다. forced colors 환경에서 상태는 색상 단독이 아닌 경계·outline으로 구분된다.
- **accessibility**: 모든 인터랙션 hit target은 `≥ 44px`, keyboard focus는 명시적 2px outline, Korean 자연 줄바꿈, 200% reflow, 단일 문서 scroll owner.

### 13.6 Mac native pilot acceptance

- Home 첫 화면은 실제 AppShell content bounds 안에서 full-height source list와 grouped content를 구성한다. 본문 속 floating sidebar card, 중복 `홈` 제목, 반복 rounded information card가 보이면 실패다.
- Auction 첫 화면은 full-height Today source list와 list/detail content를 구성한다. case별 Auction Card 경계와 기존 콘텐츠·순서·동작은 유지하되 카드 내부의 보조 정보는 row hierarchy를 사용한다.
- `달력`은 scroll-to action이 아니라 active pane scene을 바꾸는 segmented navigation이다. Calendar renderer의 월간·주간·오늘 동작은 변경하지 않는다.
- Hub 범위에서 Obsidian inline title, properties, 불필요한 Markdown heading은 시각적으로 억제한다. Obsidian 전역 chrome은 전역 설정을 변경하지 않고 해당 Hub leaf 안에서만 조용하게 만든다.
- Mac 파일럿은 실제 Obsidian clone 1440px light 화면에서 Home, Auction list/detail, Auction calendar의 fresh screenshot을 만들고, 해당 세 화면이 문서형 dashboard보다 built-in productivity app으로 먼저 읽힐 때만 통과한다.

### 13.7 물리 기기 증거 한계

물리 iPhone/iPad 실기기 검증은 `user-evidence-only gate`를 통과해야만 성공으로 주장할 수 있다. 데스크톱 폭 조절, headless logical-width harness, 스크린샷 추정은 모바일 증명으로 인정하지 않는다. 기기 성공은 실제 기기 사용자 증거가 있을 때까지 `physical_claim_status: not_proven`으로 유지된다. 다만 iOS/iPadOS `200%` 텍스트 확대와 macOS browser zoom을 통한 `200%` reflow 재검증은 각 플랫폼 입력 방식에 맞추어 수행한다.
