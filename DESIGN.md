<!--memoge:html-->
<h1>Prodigy OS UI Design Contract</h1>
<blockquote>
<p><strong>Authoritative alpha contract.</strong> This document defines the shipped Apple-inspired,<br>Obsidian-semantic presentation foundation. <code>SYSTEM/docs/Apple_Design_Analysis_v1.md</code><br>records the source analysis; <code>SYSTEM/Views/design-tokens.js</code> is the executable token<br>authority. Behavior, storage, identity, approval, and accessibility contracts remain unchanged.</p>
</blockquote>
<h2>1. Principles</h2>
<ul>
<li>Use Apple built-in-app hierarchy: one window toolbar, a continuous source list, stable list/detail regions, grouped rows, and quiet utility controls. Product-page storytelling is not an application-shell primitive.</li>
<li>Obsidian semantic variables own canvases, ink, borders, and status colors. Action Blue is the only product accent family.</li>
<li>No decorative gradients, chrome shadows, remote presentation assets, invented iconography, or local domain palettes.</li>
<li>Image content alone may use the canonical imagery shadow. Shared and domain chrome uses no shadow.</li>
<li>Every user-facing graph preserves visible focus, forced colors, reduced motion, Korean/CJK wrapping, 200% zoom reflow, one document scroll owner, and 44px controls.</li>
<li>Dashboard actions stay adjacent to evidence; Object files continue to preserve Evidence, Reality, Judgement, Learning, and Knowledge.</li>
</ul>
<h2>2. Authoritative Foundation</h2>
<h3>Color</h3>
<p>The only product accents are the canonical Action, Focus, and On-dark Action roles defined exactly in <code>ProdigyTokens.ACCENTS</code>. All other color roles resolve through Obsidian semantic variables with documented fail-safe fallbacks in <code>ProdigyTokens.SEMANTIC_COLORS</code>. Status uses semantic success, warning, error, and muted roles. <code>ProdigyTokens.COLORS</code> is a compatibility-name object, not another palette.</p>
<h3>Type, spacing, radius, and controls</h3>
<ul>
<li>Type uses SF Pro Display or SF Pro Text with system fallbacks. Canonical roles are <code>heroDisplay</code>, <code>displayLg</code>, <code>displayMd</code>, <code>lead</code>, <code>leadAiry</code>, <code>tagline</code>, <code>bodyStrong</code>, <code>body</code>, <code>denseLink</code>, <code>caption</code>, <code>captionStrong</code>, <code>buttonLarge</code>, <code>buttonUtility</code>, <code>finePrint</code>, <code>microLegal</code>, and <code>navLink</code>.</li>
<li>Canonical spacing is <code>4 / 8 / 12 / 17 / 24 / 32 / 48 / 80px</code>.</li>
<li>Canonical radii are <code>0 / 5 / 8 / 11 / 18 / 9999px</code>; pills are reserved for pill-shaped controls.</li>
<li>Native controls, inputs, icon controls, and touch targets are at least <code>44px</code> high.</li>
<li>Canonical responsive boundaries are <code>419 / 640 / 735 / 833 / 1023 / 1068 / 1440px</code>. Shared alpha presentation uses these boundaries only.</li>
</ul>
<h3>Semantic role registry</h3>
<table>
<thead>
<tr>
<th>Role</th>
<th>Owner</th>
<th>Purpose</th>
</tr>
</thead>
<tbody><tr>
<td><code>--ke-color-accent</code></td>
<td>shared tokens</td>
<td>Focus and selected emphasis</td>
</tr>
<tr>
<td><code>--ke-color-error</code></td>
<td>shared tokens</td>
<td>Recoverable error text</td>
</tr>
<tr>
<td><code>--ke-type-title</code></td>
<td>shared tokens</td>
<td>Workspace titles</td>
</tr>
<tr>
<td><code>--ke-type-heading</code></td>
<td>shared tokens</td>
<td>Section headings</td>
</tr>
<tr>
<td><code>--ke-type-body</code></td>
<td>shared tokens</td>
<td>Operational copy</td>
</tr>
<tr>
<td><code>--ke-type-label</code></td>
<td>shared tokens</td>
<td>Metadata and controls</td>
</tr>
<tr>
<td><code>--ke-leading-body</code></td>
<td>shared tokens</td>
<td>Korean/CJK body leading</td>
</tr>
<tr>
<td><code>--ke-leading-control</code></td>
<td>shared tokens</td>
<td>Control leading</td>
</tr>
<tr>
<td><code>--ke-space-3</code></td>
<td>shared tokens</td>
<td>Repeated compact gap</td>
</tr>
<tr>
<td><code>--ke-radius-control</code></td>
<td>shared tokens</td>
<td>Buttons and inputs</td>
</tr>
<tr>
<td><code>--ke-touch-target</code></td>
<td>shared tokens</td>
<td>Minimum interactive height</td>
</tr>
<tr>
<td><code>--ke-nav-min</code></td>
<td>Explorer contract</td>
<td>Domain navigation floor</td>
</tr>
<tr>
<td><code>--ke-nav-max</code></td>
<td>Explorer contract</td>
<td>Domain navigation ceiling</td>
</tr>
<tr>
<td><code>--ke-topic-min</code></td>
<td>Explorer contract</td>
<td>Topic navigation floor</td>
</tr>
<tr>
<td><code>--ke-detail-min</code></td>
<td>Explorer contract</td>
<td>Detail pane floor</td>
</tr>
</tbody></table>
<h3>Shared presentation primitives</h3>
<ul>
<li><code>.prodigy-full-bleed</code> owns primary, edge-to-edge narrative surfaces.</li>
<li><code>.prodigy-utility-card</code> owns bounded supporting information without decorative elevation.</li>
<li><code>.prodigy-configurator-chip</code> owns compact selectable configuration.</li>
<li><code>.prodigy-search-input</code>, <code>.prodigy-btn</code>, <code>.prodigy-status-line</code>, loader/error chrome, App Shell, and navigation consume the same semantic tokens and state grammar.</li>
<li>Active feedback is <code>scale(.95)</code> only; reduced motion removes transforms and transitions.</li>
<li>Backdrop blur is enhancement-only: an opaque semantic surface is always declared first.</li>
</ul>
<h2>3. Layout Contract</h2>
<h3>Knowledge Explorer shell</h3>
<ul>
<li><code>knowledge-explorer-shell</code> is a bounded list-detail application shell. Its host supplies an available block-size; the shell does not turn the whole note into a second scrolling document.</li>
<li>Wide layout uses an overflow-safe three-track grid: Domain uses <code>minmax(min(var(--ke-nav-min), 100%), var(--ke-nav-max))</code>, Topic uses <code>minmax(min(var(--ke-topic-min), 100%), auto)</code>, and Detail uses <code>minmax(min(var(--ke-detail-min), 100%), 1fr)</code>.</li>
<li>Every grid and flex child that contains content declares <code>min-inline-size: 0</code>; every pane participating in bounded vertical overflow declares <code>min-block-size: 0</code>.</li>
<li><code>constraint:min-inline-size-0</code>, <code>constraint:min-block-size-0</code>, and <code>constraint:overflow-safe-grid</code> are required implementation invariants. Long labels, paragraphs, and unbroken URLs must never force horizontal page scrolling.</li>
</ul>
<h3>Scroll ownership</h3>
<ul>
<li><code>scroll-owner:domain-nav</code>: <code>domain-nav</code> alone owns vertical overflow for the Domain pane. Its heading remains outside that pane&#39;s scrolling list.</li>
<li><code>scroll-owner:topic-nav</code>: <code>topic-nav</code> alone owns vertical overflow for the Topic/Resource pane. Groups do not create nested scroll containers.</li>
<li><code>scroll-owner:detail-pane</code>: <code>detail-pane</code> alone owns vertical overflow for Brief, asset sections, warnings, and provenance. <code>brief-panel</code> and <code>asset-section</code> expand within it and never acquire independent vertical scrollbars.</li>
<li>In narrow layout, the active navigation or detail pane is the single visible scroll owner. Hidden panes retain selection state but do not retain active scrolling surfaces.</li>
</ul>
<h2>4. Explorer Primitive Registry</h2>
<table>
<thead>
<tr>
<th>Primitive</th>
<th>Responsibility</th>
<th>Composition and behavior</th>
</tr>
</thead>
<tbody><tr>
<td><code>knowledge-explorer-shell</code></td>
<td>Bounded application frame</td>
<td>Owns the responsive grid, pane labels, and focus return points; it does not own pane scrolling.</td>
</tr>
<tr>
<td><code>domain-nav</code></td>
<td>Ordered Domain navigation</td>
<td>Renders one semantic list of buttons with counts; current Domain is exposed through selected semantics.</td>
</tr>
<tr>
<td><code>topic-nav</code></td>
<td>Grouped Topic and Resource navigation</td>
<td>Renders named groups, stable ordering, counts, and an empty group state without nested cards.</td>
</tr>
<tr>
<td><code>detail-pane</code></td>
<td>Selected context and related assets</td>
<td>Contains the Brief and asset sections; it is the only detail scroll owner.</td>
</tr>
<tr>
<td><code>brief-panel</code></td>
<td>Domain-local deterministic summary</td>
<td>Shows facts and citations first, then optional AI summary; provider failure leaves deterministic content intact.</td>
</tr>
<tr>
<td><code>asset-section</code></td>
<td>Repeated typed result group</td>
<td>Uses a heading, count, rows, provenance, and local empty/error copy; repeated instances share this primitive.</td>
</tr>
<tr>
<td><code>drill-down</code></td>
<td>Forward navigation control</td>
<td>Moves Domain to Topic/Resource to Detail, updates selected semantics, and transfers focus to the new pane heading.</td>
</tr>
<tr>
<td><code>back</code></td>
<td>Reverse navigation control</td>
<td>Returns Detail to Topic/Resource, then to Domain, preserving selection and restoring focus to the invoking control.</td>
</tr>
<tr>
<td><code>journal-period-review</code></td>
<td>Period-scoped journal surface</td>
<td>Keeps the selected month, quarter, or year visible while exposing previous/next/current navigation, read-only saved content, and the period-specific readiness or review surface.</td>
</tr>
<tr>
<td><code>journal-period-history</code></td>
<td>Saved period history</td>
<td>Lists stored Monthly, Quarterly, and Yearly notes in reverse chronological order and reopens each record in the same selected-period surface.</td>
</tr>
</tbody></table>
<!-- explorer-composition:start -->
<ul>
<li><code>knowledge-explorer-shell</code> composes <code>domain-nav</code>, <code>topic-nav</code>, and <code>detail-pane</code>.</li>
<li><code>detail-pane</code> composes <code>brief-panel</code> and one or more <code>asset-section</code> instances.</li>
<li><code>drill-down</code> and <code>back</code> provide the same forward/reverse navigation model at every adaptive layout.</li>
</ul>
<!-- explorer-composition:end -->

<p>Shared controls use the canonical 8px control radius, high contrast, visible hover/focus, and concise labels; grouped controls use the 11px configurator or 18px panel radius only when their relationship needs a boundary. Do not use emoji as icons. If an icon is necessary, use an Obsidian-provided icon with an accessible text name. Shared CSS consumes <code>--ke-*</code> semantic aliases with Obsidian variables as fallbacks; no primitive introduces a local palette.</p>
<h3>Shared visual rhythm</h3>
<ul>
<li>Workspace titles use <code>--ke-type-title</code>; card and section headings use <code>--ke-type-heading</code>; operational copy uses <code>--ke-type-body</code>; metadata, filters, and button labels use <code>--ke-type-label</code>; fixed-height dock labels may use <code>--ke-type-chrome</code>.</li>
<li>Korean body copy uses <code>--ke-leading-body</code>. Buttons, tabs, chips, and other controls use <code>--ke-leading-control</code> so glyphs do not touch their control edges.</li>
<li>Repeated presentation spacing follows the canonical 4/8/12/17/24/32/48/80px <code>--ke-space-*</code> scale. Compatibility spacing aliases may be read only by code awaiting migration and must not define new presentation grammar.</li>
<li>Letter spacing is neutral (<code>0</code>) for Korean workspace chrome and headings. Fixed-height controls must not compensate for narrow geometry with negative tracking.</li>
<li>Collapsed navigation ends at 833px. Primary actions, tabs, context actions, and sheet close/more controls use <code>var(--ke-touch-target)</code> (44px from <code>CONTROL_HEIGHTS.touchTarget</code>) at every width.</li>
<li>Controls wrap CJK and long labels with <code>word-break: keep-all</code>, <code>overflow-wrap: anywhere</code>, and <code>min-inline-size: 0</code>; labels are not made accessible by clipping or horizontal overflow.</li>
<li><code>.prodigy-app-shell-body</code> is the App Shell&#39;s only document scroll owner (<code>overflow: auto</code> with inline overflow clipped). Adaptive tabs wrap instead of creating a horizontal scroll owner; the sticky Action Bar does not scroll independently. Hidden secondary lanes remain non-scrollable.</li>
<li>BottomSheet is a bounded overlay: its panel clips overflow, and <code>.prodigy-bottom-sheet-body</code> is its sole overlay scroll owner. Safe-area clearance is applied to the App Shell body, Action Bar, and sheet panel so the Obsidian toolbar and device inset do not cover the last action.</li>
<li>A workspace that repaints on a data refresh restores the scroll offset of <code>.prodigy-app-shell-body</code> and updates rows in place. Rebuilding the subtree resets scroll position and caret even when the user never navigated.</li>
</ul>
<h2>5. Component States</h2>
<p>Every interactive primitive declares and can render these states before product wiring:</p>
<table>
<thead>
<tr>
<th>State</th>
<th>Contract</th>
</tr>
</thead>
<tbody><tr>
<td><code>rest</code></td>
<td>Uses surface, border, and text tokens with no implied selection.</td>
</tr>
<tr>
<td><code>focus-visible</code></td>
<td>Uses a two-pixel <code>var(--ke-color-accent)</code> outline with a visible offset; focus is never communicated by color alone.</td>
</tr>
<tr>
<td><code>selected</code></td>
<td>Combines selected semantics, accent border/text, and hover-surface fill; it remains distinguishable in forced/high-contrast themes.</td>
</tr>
<tr>
<td><code>loading</code></td>
<td>Keeps pane geometry stable, exposes busy semantics, and prevents duplicate activation without removing prior content.</td>
</tr>
<tr>
<td><code>empty</code></td>
<td>Names the empty scope and the safe next action; it does not render a blank panel.</td>
</tr>
<tr>
<td><code>error</code></td>
<td>Shows concise <code>var(--ke-color-error)</code> copy and recovery action while preserving selection and deterministic content.</td>
</tr>
<tr>
<td><code>disabled</code></td>
<td>Uses native disabled semantics, muted appearance, and no transform; a reason remains available in nearby text or an accessible description.</td>
</tr>
</tbody></table>
<p>Hover is additive and never the only indication of interactivity. Active feedback may use a one-pixel transform only when motion is allowed. Notices remain concise and never expose machine-owned IDs or provider errors containing secrets.</p>
<h2>6. Input, Text, and Adaptive Behavior</h2>
<ul>
<li><code>input:keyboard</code>: Domain, Topic/Resource, asset titles, <code>drill-down</code>, and <code>back</code> are reachable in logical DOM order. Enter and Space activate buttons; links retain native Enter behavior. Focus moves on pane transitions and returns to the exact invoking control on Back.</li>
<li><code>input:touch</code>: Narrow layouts use at least <code>var(--ke-touch-target)</code> for primary navigation and Back/forward controls, maintain spacing between adjacent targets, and never require hover or drag-and-drop.</li>
<li><code>text:korean-cjk-wrap</code>: Korean labels use natural line breaking with <code>word-break: keep-all</code>, <code>overflow-wrap: anywhere</code>, <code>min-inline-size: 0</code>, and line-height from <code>var(--ke-leading-body)</code>. A long unbroken URL may break anywhere; no critical label is ellipsized without an accessible full name.</li>
<li><code>motion:reduced</code>: Under reduced-motion preference, nonessential transitions and active transforms are removed. Selection, focus, loading, and pane changes remain immediately perceivable without animation.</li>
<li>Large text and narrow containers reflow the three panes into a progressive single-pane drill-down. Primary content never requires two-dimensional scrolling, and actions wrap deliberately rather than overlap.</li>
</ul>
<h2>7. Verification and Accepted Limitation</h2>
<p>The primitive/state harness must cover rest, focus-visible, selected, loading, empty, error, disabled, 40-character Korean labels, long prose, unbroken URLs, empty sections, and desktop/narrow containers before the Hub adapter is wired. The final Explorer surface must later be exercised in actual Obsidian for load, navigation, open-beside, focus return, safe failure, and both panes in the accessibility tree.</p>
<p><code>qa:device-limitation-accepted</code>: a resized Obsidian Desktop window may verify narrow-window reflow but is not evidence of iPhone or other real-device verification. Device-specific success remains unclaimed until a later real-device run; this limitation is accepted for this design-contract-only task.</p>
<h2>8. Existing Shared Components</h2>
<h3>Reliability and capture primitives</h3>
<p>아래 이름은 Home, Workspace, Capture, Assistant가 같은 경계를 공유하기 위한 계약 참조다. 사용자에게 보이는 문구는 한글로 유지하고, 영어 이름은 테스트와 설계 참조에서만 사용한다.</p>
<table>
<thead>
<tr>
<th>Primitive</th>
<th>책임</th>
<th>가드레일</th>
</tr>
</thead>
<tbody><tr>
<td><code>recoverable-hub-shell</code></td>
<td>Home과 Workspace 진입면이 일부 데이터·제공자 실패에도 오늘 행동, 복구 안내, Workspace 이동을 유지한다.</td>
<td>실패 상태도 <code>error</code>로 보이며, 한 화면 안의 <code>one scroll owner</code> 원칙을 깬 중첩 스크롤을 만들지 않는다.</td>
</tr>
<tr>
<td><code>mobile-quick-stream</code></td>
<td>좁은 화면에서 같은 Home 흐름을 빠른 확인 → Workspace 진입 순서로 압축한다.</td>
<td><code>single Home</code>, <code>no separate Mobile Home</code>, <code>44px</code> 터치 대상, <code>CJK</code> 줄바꿈, <code>reduced motion</code> 대응을 유지한다.</td>
</tr>
<tr>
<td><code>micro-log-capture</code></td>
<td>Home이나 Workspace에서 3초 안에 시작하는 최소 기록 입력이다.</td>
<td>폴더·Property 선택을 요구하지 않으며, 길어진 정리는 Inbox 또는 해당 Workspace 검토로 넘긴다.</td>
</tr>
<tr>
<td><code>vault-assistant</code></td>
<td>Vault 안의 기존 문서와 상태를 읽어 다음 확인 지점을 제안하는 보조자다.</td>
<td><code>read-only Assistant</code>이며 Object 생성, 저장, 승인, 상태 변경을 직접 수행하지 않는다.</td>
</tr>
<tr>
<td><code>citation-bundle</code></td>
<td>AI 제안이나 보조 요약 옆에 출처 경로, 수집 상태, 확인 시각 같은 최소 근거 묶음을 붙인다.</td>
<td>개인 노트 본문을 불필요하게 복제하지 않고, 근거 없음은 숨기지 않고 빈 상태로 표시한다.</td>
</tr>
<tr>
<td><code>ai-telemetry-status</code></td>
<td>AI 제공자, 로컬 서버, 마지막 실패, 재시도 가능 여부를 작은 시스템 상태로 드러낸다.</td>
<td>비밀값과 원문 오류를 노출하지 않으며, 어떤 상태도 <code>no automatic approval</code> 예외가 될 수 없다.</td>
</tr>
</tbody></table>
<p>Physical-device 성공은 <code>physical iPhone</code> 실기기에서 사용자가 직접 확인한 경우에만 <code>user-evidence-only gate</code>를 통과한다. 데스크톱 폭 조절, 시뮬레이터, 스크린샷 추정은 모바일 성공 근거가 아니다.</p>
<h3>Vault Assistant-specific contract</h3>
<ul>
<li>근거 선택은 파일 읽기 성공과 구분한다. <code>현재 문서</code>와 지정 문서는 8 KiB 전송 예산 안에서 전체 근거를 우선하고, 일부만 선택하면 기존 warning 상태로 선택 조각 수와 범위 제한을 표시한다. 변경·삭제된 출처를 가진 과거 답변도 warning으로 표시한다. 반복 질문의 일관성은 동일 입력의 결정적 근거 선택과 최신 문서 재검색으로 보장하며 모델 문구의 완전한 동일성을 약속하지 않는다.</li>
<li>이 절은 <code>vault-assistant</code> 소비자에만 적용한다. 질문 범위는 <code>현재 문서</code>와 <code>전체 Vault</code> 두 가지이며, <code>현재 문서</code>는 활성 Markdown 편집 버퍼를 우선하고 <code>전체 Vault</code>는 아래 경계 안의 개인 Markdown을 로컬에서 검색한다. 사용자가 선택한 구조화된 <code>@문서</code> mention은 표시 질문과 분리된 정규화 Vault-relative path로 보존하며, 여러 선택을 허용하고 중복을 제거한다. 선택되지 않은 <code>@text</code>는 일반 질문 텍스트다.</li>
<li><code>전체 Vault</code>의 eligible corpus는 모든 사용자 작성 Markdown이다. People, Journal, PARA, ZETA, DAILY, INBOX, HUB, root note, venue record, 향후 사용자 폴더를 포함하며 개인 분류, 파일명, tag, <code>privacy</code> frontmatter로 제외하지 않는다. machine-path exclusion은 정확히 <code>.trash/</code>, 모든 dot-prefixed root, <code>artifacts/</code>, <code>SYSTEM/PRIVATE/</code>, <code>SYSTEM/CACHE/</code>, <code>SYSTEM/Views/</code>, <code>SYSTEM/SCRIPTS/</code>, <code>SYSTEM/AI/</code>, <code>SYSTEM/CI/</code>뿐이다.</li>
<li>Assistant가 provider에 전달하는 근거는 이 소비자 전용 evidence envelope 하나이며 최대 <code>8 KiB</code>다. 인용은 provider가 경로나 링크를 작성하는 방식이 아니라 frozen retrieval map의 opaque citation id만 반환하고, Assistant가 id, normalized path, heading, line range, source revision을 로컬 검증한 뒤 클릭 가능한 Obsidian source link로 해석한다. 알 수 없거나 누락된 인용은 fail closed하며, 변경·삭제된 source는 각각 stale·missing으로 표시하고 다른 문서로 조용히 remap하지 않는다.</li>
<li>최근 대화는 versioned vault identity 아래 기기별 local history로 저장되어 같은 기기에서 다시 열 수 있다. 저장된 질문, 검증된 답변, source locator/revision, 시각, 범위, 현재 문서 경로, inherited provider/model label은 follow-up 문맥일 뿐 factual evidence가 아니다. 모든 사실 질문은 현재 Vault에서 근거를 다시 찾으며 history만으로 답하지 않는다.</li>
<li>Provider와 model은 global AI runtime 설정을 상속하는 읽기 전용 표시다. Assistant 전용 picker, credential, route override, fallback은 없다. 사용자의 명시적 submit만 retrieval 뒤 provider call을 시작하며 background call, 자동 retry/resume, 두 번째 model call은 없다.</li>
<li>macOS와 iPad에서는 같은 Assistant view를 오른쪽 sidebar에 열고, iPhone에서는 editor area를 소유하는 full view로 연다. 상태는 <code>idle</code>, <code>retrieving</code>, <code>answering</code>, <code>answered</code>, <code>no_evidence</code>, <code>partial</code>, <code>error</code>, <code>cancelled</code>의 typed state로 드러내며, 근거가 없으면 provider를 호출하지 않는다.</li>
<li>Assistant는 read-only다. Vault 쓰기·생성·수정·삭제·이름 변경, 승인/apply, shell·CLI·Git·Omo·ACP·MCP 같은 tool 실행, 직접 network dispatch를 제공하지 않는다. 한 화면에는 transcript의 one scroll owner만 두고, 모든 interactive target은 최소 <code>44px</code>, keyboard operation과 visible focus를 유지한다. Korean/CJK와 긴 문자열은 자연스럽게 감싸며 safe-area clearance, reduced motion, forced colors, <code>200%</code> reflow를 보장한다.</li>
<li>이 전용 계약은 다른 소비자의 공용 계약을 넓히거나 대체하지 않는다. 아래 <code>ai-context-envelope.js</code> 규칙, <code>prodigy.ai.chat-session.v1</code> 규칙, <code>AIInspector</code> 배치·동작 규칙은 다른 모든 소비자에 대해 그대로 유지된다. Assistant의 Whole Vault evidence, 기기-local reopenable history, iPhone editor-area 배치는 해당 공용 primitive의 새 기본값이 아니다.</li>
<li>실제 물리 기기 receipt 없이 iPhone·iPad·Mac 성공을 주장하지 않는다. logical-width harness, desktop resize, simulator, screenshot 추정만 있으면 <code>physical_claim_status: not_proven</code>이다.</li>
</ul>
<h3>LLM Wiki batch action status</h3>
<ul>
<li><code>llmwiki-batch-status</code> is a grouped-row status primitive inside the existing Knowledge body scroll owner. It uses the StyleGallery <code>cluster</code> contract for wrapping actions (<code>display:flex</code>, <code>flex-wrap</code>, shared token gap) and never creates an internal scroll container.</li>
<li>Pending priority is deterministic: <code>none</code> at 0, <code>subtle</code> at 1-2, <code>emphasized</code> at 3-9, and <code>backlog</code> at 10+. Home projects the same action only from 3 pending items; it never starts analysis.</li>
<li>The provider row is inherited and read-only. Provider key, model, and readiness are exposed as machine attributes; provider mutation remains in global AI settings. Local analysis and the future <code>mobile_remote</code> display variant remain distinct state labels, but remote triggering is not implemented here.</li>
<li><code>protected-source-disclosure</code> may expose only filename and a local typed exclusion reason. Source bodies, override-to-send controls, and protected-item analysis actions are forbidden.</li>
<li>Pack progress and review readiness use native <code>progress</code>/status semantics plus typed <code>data-*</code> values. Rendering, disclosure, review, and mount keep <code>provider_calls=0</code>; only the explicit Analyze control may cross the provider boundary.</li>
<li>Recovery controls are rendered only from the strict variants <code>config | auth | quota | provider | outcome_unknown | stale | repacket | blocked</code>. They may emit only <code>open_ai_settings | retry_analysis | repacket | later</code>; labels never determine behavior and no retry is automatic. Config/auth/provider place <code>AI 설정 열기</code> first and primary with retry secondary; quota places retry first and primary; outcome-unknown and generic blocked keep the minimal retry/later decision; stale/repacket place repacket first and primary.</li>
<li>Recovery status copy keeps the sentence fluid. The fixed system tail <code>대기 자료는 그대로 유지됩니다.</code> is one semantic inline atomic span, selected before any shorter fallback match, with a normal line-break opportunity before it; the whole sentence must never receive <code>nowrap</code>.</li>
<li>Approval intro, document previews, summary, risk, and provenance use the shared Korean-safe prose primitive (<code>word-break: keep-all</code>, <code>text-wrap: pretty</code>, and <code>overflow-wrap: anywhere</code>). Risk reasons render as a wrapping structured cluster without detachable separator glyphs; no proposal sentence or full risk line is forced to <code>nowrap</code>.</li>
<li>Emphasis uses existing semantic surface, border, warning, error, and Action Blue tokens. Controls retain 44px targets, visible focus, natural Korean wrapping, immediate state changes, and the existing reduced-motion press fallback. Accepted debt: physical mobile-device behavior remains unproven and Tasks 15-17 remain out of scope.</li>
</ul>
<h2>9. Responsive Workspace Shell</h2>
<table>
<thead>
<tr>
<th>Primitive</th>
<th>책임</th>
<th>계약</th>
</tr>
</thead>
<tbody><tr>
<td><code>AppShell</code></td>
<td>Workspace bar, context, and one body scroll owner.</td>
<td>Canonical tiers use 419, 640, 735, 833, 1023, 1068, and 1440px boundaries. The body reserves mobile-toolbar and safe-area clearance; it is the only document scroll owner.</td>
</tr>
<tr>
<td></td>
<td></td>
<td>Breakpoints and <code>CONTROL_HEIGHTS.touchTarget</code> come from <code>SYSTEM/Views/design-tokens.js</code>; shared CSS maps them through <code>--ke-*</code> aliases.</td>
</tr>
<tr>
<td><code>ContextBar</code></td>
<td>Shows selection, filters, and sync context briefly.</td>
<td>Korean/CJK and long values wrap naturally; actions retain visible focus and reach the compact touch target.</td>
</tr>
<tr>
<td><code>WorkspaceSwitcher</code></td>
<td>Switches HUB by registry id/path/label.</td>
<td>It never creates a second list; the Obsidian Workspace API fallback remains.</td>
</tr>
<tr>
<td><code>AdaptiveTabs</code></td>
<td>Keeps tab meaning and keyboard order at each width.</td>
<td>Arrow, Home, End, selected semantics, wrapping labels, and no horizontal scroll owner.</td>
</tr>
<tr>
<td><code>AdaptiveActionBar</code></td>
<td>Splits compact primary/secondary work between the <code>52px</code> Action Bar and sheet.</td>
<td>Primary and More controls are at least <code>44px</code> in compact; sticky positioning does not create a scroll owner; safe-area padding is shared.</td>
</tr>
<tr>
<td><code>BottomSheet</code></td>
<td>Bounded overlay for compact secondary work and the Inspector shell.</td>
<td>Max height is <code>min(70vh, 560px)</code>; panel overflow is clipped and its body alone scrolls; Escape, focus return, visible focus, and safe-area clearance are explicit.</td>
</tr>
<tr>
<td><code>StatusLine</code></td>
<td>loading/동기화 상태를 비파괴적으로 알린다.</td>
<td>polite live region과 텍스트 상태를 사용한다.</td>
</tr>
<tr>
<td><code>InlineError</code></td>
<td>문맥을 보존한 recoverable 오류를 표시한다.</td>
<td>concise Korean copy와 선택적 복구 작업을 제공한다.</td>
</tr>
<tr>
<td><code>AIInspector</code></td>
<td>Task 21이 채울 빈 Inspector frame이다.</td>
<td>compact는 bottom sheet, medium/wide는 <code>min(38%, 420px)</code> side panel이다.</td>
</tr>
</tbody></table>
<p>Workspace UI 상태는 schema <code>v1</code>로 분리한다. <code>prodigy.ui.workspace-state.v1</code>에는 active workspace/tab, filters, sort, density만 저장하고, scroll position은 session 전용 <code>prodigy.ui.scroll-state.v1</code>에 저장한다. AI transcript는 <code>prodigy.ai.chat-session.v1</code> sessionStorage 또는 memory fallback에만 존재하며 두 UI key에 복제하지 않는다. 저장값을 해석할 수 없으면 폐기하고 first-run 상태로 복구한다. 모든 primitive는 visible focus, reduced motion, CJK wrapping, compact <code>44px</code> touch target 계약을 공유한다.</p>
<ul>
<li>Workflow rows keep stable row height with labeled input and explicit up/down/delete controls.</li>
<li>Provider controls remain secondary to the workflow action they support.</li>
<li>Long-running actions disable repeat submission while preserving form state on AI or Todoist failure.</li>
<li>Generated IDs remain machine-owned and are not presented as ordinary user input.</li>
</ul>
<h3>Auction bid sheet</h3>
<ul>
<li><code>auction-bid-sheet</code> is the single-auction execution surface opened from an Auction Card. It mirrors the paper bid form&#39;s information order without copying its visual skin: court/date, case context, exact won amounts, verification checks, then one confirmation action.</li>
<li>The sheet is one bordered surface with divider rows, not nested court/card/packet containers. It never renders the Decision Packet or result capture inside the bid-entry flow.</li>
<li><code>my_bid_price</code> prefers an existing actual bid and otherwise starts from <code>expected_bid</code>; <code>bid_deposit</code> prefers the stored value and otherwise starts from <code>minimum_bid / 10</code>. Both remain editable and render with thousands separators while storing numeric won values.</li>
<li>Wide layout may pair fields in two columns. Narrow layout uses one readable column, 44px inputs and actions, no horizontal scrolling, and a footer action that remains reachable without overlapping content.</li>
<li>The bidder address is an editable user preference loaded from <code>SYSTEM/PRIVATE/auction-bidder-profile.local.json</code>; it never reuses the Auction Object&#39;s property address. Other bidder identity fields are not inferred.</li>
</ul>
<h3>Auction today list</h3>
<ul>
<li><code>auction-today-list</code> opens from the Bid Calendar&#39;s <code>오늘 입찰 목록</code> action and always uses the device&#39;s current local date, independent of the calendar&#39;s browsed month or selected date.</li>
<li>It renders only <code>auction_case</code> Objects whose <code>status</code> is <code>bidding</code> and whose <code>auction_datetime</code> date is today. It never mixes site visits, reviews, past cases, or future cases into the list.</li>
<li>The list reuses the canonical Auction Card. Its case action is labeled <code>입찰표 열기</code> and opens the single-case <code>auction-bid-sheet</code>; the former multi-case Day Runner is not nested in this route.</li>
<li>Empty state copy names the scope explicitly: <code>오늘 예정된 입찰이 없습니다.</code> Narrow controls retain the 44px touch target and wrap without horizontal overflow.</li>
</ul>
<h3>Region experience intake modal</h3>
<ul>
<li><code>region-experience-modal</code> is the reusable, Obsidian-native intake primitive for one already-existing <code>auction_region</code>. It preserves a caller&#39;s focus-return control and opens and cancels without provider or vault work. It selects an available canonical Region by default; Korean invalid-region recovery appears only after an invalid action.</li>
<li>Its review shell owns the body scroll. <code>region-experience-review-footer</code> remains sticky at the modal bottom and contains the explicit <code>Evidence 승인·반영</code> action; it is disabled while busy or without selected Evidence. After Evidence is saved, Region reflection and Knowledge candidate saving remain separate, explicit approvals and never run automatically.</li>
</ul>
<h3>LLMWiki knowledge detail modal</h3>
<ul>
<li><code>llmwiki-knowledge-detail-modal</code> opens one read-only knowledge result from <code>LLMWiki 탐색</code> without replacing or duplicating the result list. The invoking result remains the focus-return target.</li>
<li>The modal uses the native Obsidian dialog lifecycle: Escape, the native close control, backdrop dismissal, and the explicit <code>닫기</code> action all close the same surface. Result buttons expose <code>aria-haspopup=&quot;dialog&quot;</code> and their expanded state.</li>
<li>The modal header owns trust, domain, title, and source path. Its body is the sole modal scroll owner and renders loading, ready, empty, stale, and error states without enabling writes or provider calls.</li>
<li>Wide and compact layouts reuse semantic surfaces, borders, type, spacing, the 44px touch target, Korean/CJK wrapping, visible focus, and reduced-motion rules. No inline detail pane remains beside the result list.</li>
</ul>
<h3>Region decision popup</h3>
<ul>
<li><code>region-collection-health</code> is a compact status band, not a score. It shows canonical Region coverage, the selected Region&#39;s latest metrics month and run count, and explicit missing, stale, or repeated-month warnings without changing any Region Object.</li>
<li><code>region-decision-outcome</code> places the current Auction&#39;s human-authored judgement beside canonical <code>auction_outcome</code> history for the exact same 시군구. <code>region_dong</code> remains item context; district-only values are labeled <code>구 기준</code>.</li>
<li>Lifecycle-only <code>won</code> / <code>lost</code> / <code>skipped</code> records are labeled as pending legacy results and never enter outcome counts or bid-rate calculations. Small samples are identified explicitly, and the surface never emits a region score, recommendation, forecast, or suggested bid.</li>
<li>At widths up to 640px fields and actions become one column; review-footer controls use a one-column grid with <code>var(--ke-space-3)</code> visible gaps and at least <code>var(--ke-touch-target)</code> height. Korean text uses the shared CJK wrapping contract, focus remains visibly outlined, and reduced-motion users receive no nonessential transition.</li>
</ul>
<h3>Region source command guide</h3>
<ul>
<li><code>region-source-command</code> is the full-width, read-only command surface for preparing an official source collection. It requires an explicit reference period and provider-published UTC timestamp, never infers either value, and only exposes the command after validation.</li>
<li>The command surface remains secondary to Region comparison, uses the existing Explorer control tokens, and spans the compact panel width so an absolute Vault path remains reviewable. Its <code>focus-visible</code> outline and <code>is-error</code> status use the shared accent/error aliases.</li>
<li>The Hub action only prepares or copies a command. Network dispatch, process execution, raw-ledger writes, and Region Object changes remain outside the Obsidian view.</li>
<li><code>region-source-evidence</code> is a compact provenance badge on each covered Region row. It reports only a verified, projection-ready ledger generation and keeps source values out of the existing Region metric cards.</li>
</ul>
<h3>Auction–Region decision surfaces</h3>
<ul>
<li><code>auction-decision-board</code> is the single card-level entry point for regional context. It keeps the Auction card&#39;s address, price, status, and user judgement out of the board when they are already visible on the card; the board adds only the four neutral questions <code>거래·가격</code>, <code>임대·수요</code>, <code>공급·생활환경</code>, and <code>경매 사례·미시 입지</code>, with at most three traceable facts per question.</li>
<li><code>auction-research-attention</code> is conditional chrome. A healthy source package stays quiet on the card; missing, stale, failed, identifier-required, or selection-required research exposes a compact <code>조사 자료</code> action. The action reports provider state and never invents an auction outcome from an elapsed date.</li>
<li><code>region-detail-groups</code> is a fixed three-group detail surface: <code>판단 맥락</code>, <code>지역 근거</code>, and <code>사례·임장</code>. Existing evidence sections remain nested under their responsible group, and connected Auction rows remain read-only drill-downs with exact source paths.</li>
<li><code>region-comparison</code> groups comparison fields by decision question and retains each selected Region as a column. Wide layouts use side-by-side columns; compact layouts preserve the columns inside a local horizontal scroller. Each column carries its own 기준일 and 검증 상태, and the surface does not calculate rank, delta, score, baseline, or recommendation.</li>
<li><code>auction-region-focus-handoff</code> carries a selected Auction path for one session only. The Auction Hub consumes it once, applies the existing district filter, opens a collapsed status section if needed, and focuses the exact card; if no matching card is rendered, it shows a Korean recovery notice and clears the request.</li>
</ul>
<h3>Workout health tabs</h3>
<ul>
<li><code>workout-health-shell</code> is the three-tab container (<code>근력 | 식단 | 러닝</code>) inside the single Workout workspace entry. It uses semantic <code>tablist/tab/tabpanel</code>, roving tabindex with ArrowLeft/ArrowRight/Home/End, Enter/Space activation, and <code>sessionStorage[&#39;prodigy.workout.activeTab.v1&#39;]</code> persistence. Default and invalid-state fallback is <code>strength</code>. Programmatic entry via <code>renderDashboard(..., { initialTab })</code> and <code>WorkoutView.openTab(tabId)</code> is supported; URL hash/query is never a contract.</li>
<li><code>workout-session-bar</code> is a sticky progress surface shown during an active draft session. It displays the current exercise name, completed/total sets, a compact progress track, and an accessible rest timer with <code>-30초</code>, <code>+30초</code>, <code>건너뛰기</code> controls. Rest duration prefers the prescribed set rest; otherwise defaults to 90 seconds. The bar never overlaps content below it and remains reachable at narrow widths.</li>
<li><code>nutrition-day-summary</code> renders selected-date kcal/P/C/F totals as compact chips. <code>nutrition-meal-list</code> groups entries by meal (breakfast → lunch → dinner → snack → other). Goal display is explicit <code>미설정</code> when unset; no automatic targets are invented.</li>
<li><code>run-activity-summary</code> shows distance, duration, pace, and optional HR/elevation/calories for the latest activity. <code>run-split-table</code> is a bordered table with #, distance, time, pace columns. Summary-only records (Apple Health XML, legacy quick sessions) are labeled explicitly and never imply missing metrics are zero.</li>
<li><code>trend-strip</code> renders the nutrition 7-day daily totals/averages and the running 6-week distance/time grid plus 4-week distance-weighted average pace.</li>
<li><code>import-review</code> is the shared preview-before-confirm pattern for FatSecret CSV, TCX/GPX files, and Apple Health XML. It shows mapped columns or activity stats, first rows, create/update/skip/warning counts, and requires explicit confirm before writes. Raw file content is never persisted; only a receipt (basename, timestamp, counts) is stored.</li>
<li>All Workout health primitives follow the shared contracts: Obsidian theme variables only (no raw hex/rgb), one scroll owner per panel, 44px minimum touch targets at narrow widths, CJK wrapping with <code>word-break: keep-all</code>, <code>overflow-wrap: anywhere</code>, reduced-motion compliance, and full state coverage (rest, focus-visible, selected, loading, empty, error, disabled).</li>
<li>Privacy: latitude, longitude, route, track, and coordinate arrays are recursively stripped before any object reaches the health store. Original CSV/XML/FIT/TCX/GPX bytes are never copied into the Vault.</li>
</ul>
<h2>10. 구현 현실과 물리 기기 한계</h2>
<p>이 문서는 2026-07-30 기준 실제 구현을 설명한다. 모든 반응형 검증은 headless logical-width harness로 수행되었으며, 실제 iPhone·iPad·Mac 기기 검증은 아직 수행되지 않았다. <code>.omo/evidence/evidence-manifest.json</code>은 <code>physical_device_success: false</code>, <code>physical_claim_status: &quot;not_proven&quot;</code>을 기록하고 있다. 물리 기기에서의 동작을 주장하지 않으며, 데스크톱 폭 조절과 시뮬레이터는 모바일 증명으로 인정하지 않는다.</p>
<h2>11. AI 컨텍스트 봉투 (Context Envelope)</h2>
<p><code>ai-context-envelope.js</code>의 <code>buildContextEnvelope(input)</code>은 순수 함수로 동작하며, 정확히 6개의 필드(<code>workspace</code>, <code>tab</code>, <code>selection</code>, <code>snapshot</code>, <code>citations</code>, <code>locale</code>)만 허용한다. 직렬화 용량은 8 KiB로 제한되며, 초과 시 <code>snapshot</code>을 가장 오래된 항목부터 제거하고 <code>truncated: true</code>를 설정한다. 본문·비밀값·<code>selection</code>을 벗어난 DAILY-PARA 콘텐츠는 금지된다. Provider 바인드는 localhost 또는 private tailnet만 허용하며, <code>antigravity</code>, <code>agy</code>, 소비자 OAuth 재사용, 공용 바인드, LAN 바인드는 네트워크 호출 전에 차단된다. AI 제안 출력은 기존 도메인 승인 핸들러가 수락하기 전까지 비활성 상태다.</p>
<h2>12. 정리 감사 (Cleanup Audit)</h2>
<p><code>SYSTEM/SCRIPTS/prodigy-cleanup-audit.js</code>는 기본적으로 dry-run 모드로 동작하며, 실제 삭제는 <code>--apply</code>와 함께 일치하는 receipt 해시가 필요하다. 드리프트가 감지되면 실패로 종료된다. 재고 조사는 52개 플러그인과 29개 템플릿을 대상으로 했으며, 미참조 템플릿은 0개였다. <code>password-protection</code>, <code>table-editor-obsidian</code>, <code>SYSTEM/TEMPLATE</code> 루트, <code>SYSTEM/CACHE</code>는 보존되었다.</p>
<h2>13. Apple 기본 앱 화면·기기 계약 (Apple UI Redesign)</h2>
<blockquote>
<p>이 계약은 Prodigy Hub 전용 Apple built-in-app 프레젠테이션의 단일 문서다. 실행 토큰은 <code>SYSTEM/Views/design-tokens.js</code>가 독점 공급한다. <code>SYSTEM/AI/Skills/prodigy-review/tests/shared/test_design_theme_contract.js</code>가 아래 값을 정확히 잠근다. **공식 Apple 요구와 Prodigy 프로젝트 기본값은 명확히 구분된다.**</p>
</blockquote>
<h3>13.0 Prodigy-first 우선순위</h3>
<ul>
<li><strong>기능·정보 구조는 Prodigy OS이고, 시각 언어·레이아웃·컨트롤·상호작용은 가능한 한 Apple 기본 앱에 가깝게 구현한다.</strong> Apple은 단순 참고나 마지막 polish가 아니라 UI 품질의 직접적인 목표다.</li>
<li>둘이 충돌하면 Prodigy OS의 정보 구조, 사용자 흐름, 도메인 의미는 보존하되, 그것을 표현하는 화면은 macOS/iOS/iPadOS 기본 앱의 toolbar, source list, grouped rows, pane transition, typography, spacing, color, selection, button hierarchy를 최대한 충실하게 사용한다.</li>
<li>Apple 유사성을 높인다는 이유로 Morning Brief, Focus, 승인 흐름, Object 근거, Evidence·Reality·Judgement·Learning·Knowledge 연결, 다음 행동을 숨기거나 축소하거나 제거하지 않는다.</li>
<li>화면 단순화는 핵심 정보를 없애는 작업이 아니라, Prodigy OS의 핵심 브리핑 → 판단 대상 → 근거 → 다음 행동 순서를 더 빠르게 읽게 만드는 작업이다.</li>
<li>Auction에서는 <code>주요 브리핑</code>, canonical Auction Card, Bid Calendar가 모두 핵심이다. 카드 가시성을 높이더라도 브리핑을 접거나 밀어내지 않고, 브리핑을 강조하더라도 카드와 달력의 판단·실행 기능을 약화하지 않는다.</li>
<li>최종 시각 검토는 두 질문을 모두 통과해야 한다. 먼저 “이 화면만 보고 오늘 무엇을 판단하고 무엇을 해야 하는지 알 수 있는가”를 확인하고, 이어서 “custom Obsidian dashboard가 아니라 Apple 기본 앱처럼 보이고 작동하는가”를 독립적으로 확인한다. 어느 하나만 통과하면 실패다.</li>
</ul>
<h3>13.1 공식 Apple 요구 vs Prodigy 프로젝트 기본값</h3>
<p>**공식 Apple 사실 (<code>ProdigyTokens.APPLE_SPEC</code>)** — Apple HIG와 기기 스펙에서 직접 가져온 값:</p>
<ul>
<li>iPhone/iPad 기본 터치/클릭 hit target은 <code>44×44pt</code>이며 절대 최소는 <code>28×28pt</code>다.</li>
<li>macOS 네이티브 컨트롤 기본 크기는 <code>28×28pt</code>, 절대 최소는 <code>20×20pt</code>다.</li>
<li>safe area를 존중하고 <code>200%</code> 텍스트 확대(<code>textEnlargement: 2</code>)를 지원한다. iOS/iPadOS는 시스템 텍스트 확대, macOS는 브라우저 zoom을 통한다.</li>
<li>Apple은 custom button 높이/측면 여백을 단일 수치로 규정하지 않는다.</li>
</ul>
<p>**Prodigy 프로젝트 기본값 (<code>ProdigyTokens.DEVICE_TABLE</code>)** — 위 원칙을 세 기기 계열에 적용한 설계 결정:</p>
<ul>
<li>접근성과 cross-device consistency를 위해 모든 컨트롤은 기기와 무관하게 비중첩 <code>44px</code> hit wrapper를 갖는다. Mac의 작은 visual control(32/36px)도 44px wrapper 안에 둔다.</li>
<li><code>visualHeight</code>/<code>visualSize</code>와 <code>hitTarget</code>/<code>hitSize</code>는 분리된 token이며, Mac wrapper는 인접 hit area와 겹치지 않고 pointer hover는 inner visual에만, keyboard focus는 wrapper 전체의 2px outline으로 드러난다.</li>
<li>아래 기기 표의 CTA 높이·padding·gutter·radius는 Apple type/target 원칙을 Prodigy에 적용한 결정이다.</li>
</ul>
<h3>13.2 화면 문법</h3>
<ul>
<li>모든 Hub는 <strong>window toolbar → continuous source list → list/detail content</strong> 순서로 읽힌다. Markdown 제목, AppShell 제목, 화면 본문 제목을 중복하지 않으며 AppShell만 workspace title과 toolbar action을 소유한다.</li>
<li><strong>Home</strong>은 macOS Home·Reminders 계열의 <strong>source list + grouped rows</strong> 문법이다. Morning Brief→승인된 Focus→한 개 primary action의 단일 서사를 유지하되, 반복 콘텐츠는 rounded card가 아니라 separator가 있는 row/group으로 렌더링한다.</li>
<li><strong>Auction</strong>은 Reminders·Notes 계열의 <strong>source list + auction list + selected detail</strong> 문법이다. Today source list는 현재 범위를 선택하고, canonical Auction Card는 독립 list item 경계를 유지하며, 선택된 판단과 작업만 detail pane에 나타난다.</li>
<li>Auction의 <strong>목록과 달력은 동일 문서의 위아래 목적지가 아니라 서로 배타적인 pane scene</strong>이다. <code>홈 | 달력</code> 선택은 active scene을 바꾸고, sidebar·필터·선택 상태는 유지하며, 모바일에서는 scene이 전체 content region을 소유한다.</li>
<li>장면 안에서 surface 경계는 정보 책임을 따라야 한다. source list는 하나의 연속 material, 반복 정보는 row separator, 입력·오류·독립 Auction Card만 bounded container를 사용한다. 카드 안에 다시 일반 카드를 중첩하지 않는다.</li>
<li>Hub는 Obsidian Default theme를 repository baseline으로 하며, Action Blue만 product accent family다. raw hex는 <code>design-tokens.js</code>와 이 문서에서만 선언한다.</li>
</ul>
<h3>13.3 기기별 metric 표 (Prodigy 기본값)</h3>
<table>
<thead>
<tr>
<th>역할</th>
<th>iPhone 15 Pro Max</th>
<th>iPad Pro 13-inch</th>
<th>Mac</th>
</tr>
</thead>
<tbody><tr>
<td>Primary CTA</td>
<td>50px 높이, 17px/600, line-height 1.24, 좌우 20px, radius 25px</td>
<td>48px, 17px/600, 좌우 20px, radius 24px</td>
<td>44px, 15px/600, 좌우 18px, radius 22px</td>
</tr>
<tr>
<td>Secondary CTA</td>
<td>44px, 15px/600, 좌우 16px, radius 22px</td>
<td>44px, 15px/600, 좌우 16px, radius 22px</td>
<td>36px visual / 44px hit, 14px/600, 좌우 14px, radius 18px</td>
</tr>
<tr>
<td>Filter/utility</td>
<td>44px, 15px/500, 좌우 16px</td>
<td>44px, 14px/500, 좌우 16px</td>
<td>32px visual / 44px hit, 13px/500, 좌우 12px</td>
</tr>
<tr>
<td>Icon control</td>
<td>44×44px visual/hit, 18px glyph</td>
<td>44×44px, 18px glyph</td>
<td>32×32px visual / 44×44px hit, 16px glyph</td>
</tr>
<tr>
<td>Search/input</td>
<td>48px, 17px/400, 좌우 17px</td>
<td>44px, 17px/400, 좌우 17px</td>
<td>36px visual / 44px hit, 13px/400, 좌우 12px</td>
</tr>
<tr>
<td>Focus</td>
<td>2px Action Blue outline + 2px offset</td>
<td>동일</td>
<td>동일</td>
</tr>
<tr>
<td>Body / metadata</td>
<td>17px/400/1.47, 14px/400/1.43</td>
<td>동일</td>
<td>editorial 17px, dense 13px/400/1.23, metadata 12–13px</td>
</tr>
<tr>
<td>Hero</td>
<td>34px/600/1.12</td>
<td>portrait 40px/600/1.10, landscape 48px/600/1.08</td>
<td>56px/600/1.07</td>
</tr>
<tr>
<td>Section / card title</td>
<td>28px/600, 21px/600</td>
<td>32px/600, 21px/600</td>
<td>40px/600, 24px/600</td>
</tr>
<tr>
<td>Page gutter</td>
<td>20px</td>
<td>portrait 32px, landscape 48px</td>
<td>48px, 1440px 이상 80px</td>
</tr>
<tr>
<td>Auction Card gap</td>
<td>12px</td>
<td>17px</td>
<td>17px</td>
</tr>
</tbody></table>
<h3>13.4 컨테이너 tier와 safe area</h3>
<ul>
<li>layout tier는 viewport가 아니라 **측정된 <code>.prodigy-app-shell-body</code> 폭**으로 정한다. <code>window.innerWidth</code>는 layout source of truth가 아니고 private breakpoint를 추가하지 않는다.</li>
<li>tier 구간(<code>ProdigyTokens.CONTAINER_TIERS</code>): <code>compact ≤ 640</code>, <code>medium 641–1068</code>, <code>wide ≥ 1069</code>, content max <code>1440</code>.</li>
<li>공용 canonical 반응형 경계는 <code>419 / 640 / 735 / 833 / 1023 / 1068 / 1440px</code>이며 tier는 이 경계에서 파생된다.</li>
<li>iPhone safe area·모바일 toolbar·action bar clearance를 유지해 마지막 action이 tool overlay에 덮이지 않는다. iPad split view, Mac 좁은 창, 단일 scroll owner를 유지한다.</li>
</ul>
<h3>13.5 card boundary·typography·contrast·motion·accessibility</h3>
<ul>
<li><strong>Auction Card boundary</strong>: 기본 1px semantic boundary. light/dark 값은 <code>ProdigyTokens.CARD_BOUNDARY</code>를 사용한다. card surface와 바탕은 각각 <code>SEMANTIC_COLORS.surface</code>와 <code>SEMANTIC_COLORS.surfaceSecondary</code>, dark graphite 계열은 대응 dark semantic token을 사용한다. hover는 fill/border만, focus는 2px Action Blue + offset, selected/urgent는 card separation을 대체하지 않는다.</li>
<li><strong>Containment budget</strong>: Home의 일반 정보는 card를 사용하지 않는다. Morning Brief, Focus, Continue, Micro Log는 grouped row 또는 detail section이며 separator와 spacing이 경계를 만든다. Auction Card는 사용자가 요청한 case별 구분을 위해 유일한 반복 card primitive로 남는다.</li>
<li><strong>Action Blue family</strong> (<code>ProdigyTokens.ACCENTS</code>): primary/focus, body link, dark-surface action/link, on-action 색상은 각각 <code>ACCENTS.primary</code>, <code>ACCENTS.link</code>, <code>ACCENTS.darkLink</code>, <code>ACCENTS.onAction</code>을 사용한다. 옛 alpha alias는 철회되어 두 blue family가 공존하지 않는다.</li>
<li><strong>Mac native control hierarchy</strong>: Action Blue fill은 화면의 현재 결정에 해당하는 한 개 primary action에만 사용한다. Toolbar utility는 transparent rest + neutral hover, toolbar add/navigation은 accent text, selected source-list row는 저채도 accent tint + normal ink를 사용한다. Selection은 persistent focus outline을 사용하지 않으며, 2px outline은 <code>:focus-visible</code>일 때만 나타난다.</li>
<li><strong>Mac native material cadence</strong>: source-list는 <code>--background-secondary</code>의 연속 면이고 내부 요약은 중첩된 흰 카드 대신 separator와 spacing으로 나눈다. Detail pane은 <code>--background-primary</code>, 보조 control은 theme hover/surface 역할을 사용한다. Raw blue alpha나 별도 회색 palette는 만들지 않고 <code>color-mix()</code>와 Obsidian semantic variables로 파생한다.</li>
<li><strong>typography</strong>: SF Pro Display/Text system stack (원격 다운로드 없음). workspace title은 한 번만 나타나고, Mac은 window title 20–24px, section title 17–20px, body 14–15px, sidebar row 14–15px, toolbar label 13px의 계층을 사용한다. Korean/CJK 제목·버튼은 <strong>negative tracking을 사용하지 않고</strong> neutral tracking(<code>ProdigyTokens.KOREAN_TYPE.tracking === 0</code>) + <code>word-break: keep-all</code> + <code>overflow-wrap: anywhere</code>로 자연 줄바꿈한다.</li>
<li><strong>contrast</strong>: text <code>≥ 4.5:1</code>, large text <code>≥ 3:1</code> (WCAG 1.4.3). <code>test_design_theme_contract.js</code>가 대비 쌍을 잠근다.</li>
<li><strong>motion</strong>: nonessential transition/scale은 <code>prefers-reduced-motion</code>에서 제거된다. forced colors 환경에서 상태는 색상 단독이 아닌 경계·outline으로 구분된다.</li>
<li><strong>accessibility</strong>: 모든 인터랙션 hit target은 <code>≥ 44px</code>, keyboard focus는 명시적 2px outline, Korean 자연 줄바꿈, 200% reflow, 단일 문서 scroll owner.</li>
</ul>
<h3>13.6 Mac native pilot acceptance</h3>
<ul>
<li>Home 첫 화면은 실제 AppShell content bounds 안에서 full-height source list와 grouped content를 구성한다. 본문 속 floating sidebar card, 중복 <code>홈</code> 제목, 반복 rounded information card가 보이면 실패다.</li>
<li>Auction 첫 화면은 full-height Today source list와 list/detail content를 구성한다. case별 Auction Card 경계와 기존 콘텐츠·순서·동작은 유지하되 카드 내부의 보조 정보는 row hierarchy를 사용한다.</li>
<li><code>달력</code>은 scroll-to action이 아니라 active pane scene을 바꾸는 segmented navigation이다. Calendar renderer의 월간·주간·오늘 동작은 변경하지 않는다.</li>
<li>Hub 범위에서 Obsidian inline title, properties, 불필요한 Markdown heading은 시각적으로 억제한다. Obsidian 전역 chrome은 전역 설정을 변경하지 않고 해당 Hub leaf 안에서만 조용하게 만든다.</li>
<li>Mac 파일럿은 실제 Obsidian clone 1440px light 화면에서 Home, Auction list/detail, Auction calendar의 fresh screenshot을 만들고, 해당 세 화면이 문서형 dashboard보다 built-in productivity app으로 먼저 읽힐 때만 통과한다.</li>
</ul>
<h3>13.7 물리 기기 증거 한계</h3>
<p>물리 iPhone/iPad 실기기 검증은 <code>user-evidence-only gate</code>를 통과해야만 성공으로 주장할 수 있다. 데스크톱 폭 조절, headless logical-width harness, 스크린샷 추정은 모바일 증명으로 인정하지 않는다. 기기 성공은 실제 기기 사용자 증거가 있을 때까지 <code>physical_claim_status: not_proven</code>으로 유지된다. 다만 iOS/iPadOS <code>200%</code> 텍스트 확대와 macOS browser zoom을 통한 <code>200%</code> reflow 재검증은 각 플랫폼 입력 방식에 맞추어 수행한다.</p>
