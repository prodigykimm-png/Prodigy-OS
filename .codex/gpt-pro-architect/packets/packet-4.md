# GPT Pro Architect Packet 4

- topic: auction-region-workspace-20260801
- gate: FINAL_PHASE_EXECUTION_PLAN
- date: 2026-08-02 Asia/Seoul
- destination: existing ChatGPT Project `Prodigy OS Making`, exact conversation retained in `thread.md`
- transmission scope: redacted repository architecture, contracts, implementation summary, and automated evidence only

## User authority

사용자는 이번 라운드에서 GPT와 마지막 페이즈까지 계속 논의한 뒤, 중간에 사용자에게 다시 묻지 말고 Codex가 승인된 범위를 전부 구현·검증하라고 명시적으로 승인했다. 이 패킷은 새 제품 범위나 새 데이터 권한을 요청하지 않는다. GPT는 외부 조언자이며 로컬 저장소가 정본이다.

## Protected constraints

- Region Metrics와 Region Object는 읽기 전용 projection으로 유지한다.
- Auction Object schema, existing lifecycle enum, `auction-source-approval-writer`, outcome writer, DecisionPacket 경계를 유지한다.
- `status`, `expected_bid`, `my_bid_price`, `decision_reason`, `my_opinion`은 자동 변경하지 않는다.
- 경매일 경과만으로 낙찰·outcome을 만들지 않는다.
- 외부 자료는 원문·해시·정규화 후보·근거로만 저장하고, 명시적 사용자 선택·승인 뒤 기존 writer를 통해서만 반영한다.
- 실거래·공시가격·공시지가는 Region Metrics 공식 시계열이나 사용자 판단 필드를 덮어쓰지 않는다.
- Obsidian 내부에서 네트워크 요청이나 프로세스 실행을 하지 않는다. 수집은 명시적 CLI, UI는 캐시 패키지의 읽기·승인만 담당한다.
- k-skill은 고정 commit/package lock과 skill 파일 해시 검증을 거치는 교체 가능한 수집 계층이다. 공식 출처가 기본이며 proxy는 명시적 환경변수 opt-in이다.
- 새 Object, 새 전역 data engine, PRE/Memory, 자동 추천·랭킹·판단은 추가하지 않는다.
- 사용자 데이터·실제 사건번호·주소·API 키·환경변수·개인 노트는 패킷에 포함하지 않았다.
- 커밋·push·release는 이번 실행 범위가 아니다.

## Current implementation after PHASE_2_PLAN_FINAL

### Completed and tested locally

1. `SYSTEM/Views/auction-region-core.js`
   - Existing Dataview query contract is frozen.
   - Added `getRegionAuctionSnapshot(regionSido, regionSigungu, rows, options)`.
   - Adapter normalizes exact Sido/Sigungu identity, projects read-only auction fields, supports Dataview `file.path`, returns frozen `empty|ready|stale` snapshots, and performs no writes.
2. `SYSTEM/SCRIPTS/knowledge-explorer-audit-registry.js`
   - Runtime `knowledge-explorer-registry.js` is the audit source of truth; Schema remains documentation/reference.
3. Fixture and lifecycle coverage
   - Actual Region Experience lazy modules and Workout Hub are represented by tests.
   - Edge tests cover ended `watching` without official result, price-only result without official outcome, approved official result tuple preserving lifecycle `status`, and no postponed/withdrawn enum.
4. Real-estate source bridge already present
   - `SYSTEM/SCRIPTS/real-estate-source-collect.js`
   - `SYSTEM/SCRIPTS/real-estate-source-package-core.js`
   - `SYSTEM/CONFIG/k-skill-real-estate-lock.json`
   - `SYSTEM/Views/auction-real-estate-research-core.js`
   - `SYSTEM/Views/auction-real-estate-research.js`
   - `SYSTEM/Views/auction-source-approval-writer.js`
   - `SYSTEM/docs/Real_Estate_Source_Package_Contract_v1.md`
   - The bridge creates timestamped raw packages, records provider status/source/hash, supports partial failure, verifies raw hashes before approval, and writes approval receipts.
5. Region/Auction surface already present
   - Region Explorer has an existing region-to-Auction action and session scope.
   - Auction Hub consumes that scope through the existing Dashboard filtering contract.
   - Auction cards expose the existing `부동산 조사` action.

### Automated evidence already green

- Region Explorer hub, knowledge registry/audit, workspace consistency
- Region auction snapshot adapter and lifecycle edge tests
- Auction source package, source approval writer, outcome writer, real-estate wiring
- Region Explorer view compact 375px/599px contract checks
- Auction/Region integration, navigation, decision mirror, outcome feedback regressions
- Changed JavaScript syntax checks

Actual mobile device QA is not available in this environment; this remains an evidence limitation unless the available Obsidian surface can provide a real narrow pass.

## Remaining work to decide and execute

The following is a proposed bounded execution ladder, subject to your final correction:

### Phase 2-1 — Region Detail auction snapshot UI

- Render the existing read-only auction snapshot inside Region Detail/Explorer using the existing Dataview result or adapter.
- Show clear empty/stale/source states and a compact row summary: status, date, minimum bid, address/dong.
- Let the user select/open a case in the existing Auction panel/dashboard with the existing region scope. Do not create a second query engine or write an Object.
- Keep the existing Region→Auction scope action as the fallback and preserve exact filter semantics.

### Phase 2-2 — “노트 없이” Auction investigation surface

- Make `부동산 조사` self-explanatory: latest package time, provider status, source, stale/hash warning, and copyable CLI command when no package exists.
- Keep provider evidence in a modal/tabbed read-only view; show candidate diffs separately from evidence.
- Allow per-field selection, approval cancel, stale-package/hash-mismatch blocking, and atomic application through the existing writer.
- Keep evidence-only providers out of Auction frontmatter by default.

### Phase 2-3 — Outcome and lifecycle clarity

- In the card and investigation surface, show winning bid only when the verified official result tuple contains result date plus positive sale amount.
- Preserve lifecycle status for ended `watching` cases and for every approved outcome update.
- Present postponed/withdrawn/changed/failed states as warnings or facts only; do not add enum values or convert them to won/lost.
- Keep address display consistent as `시도 시군구 동` where fields are available; do not manufacture missing components.

### Phase 3 — Provider/package hardening

- Validate the lock manifest, selected skill hashes, package schema, raw path containment, raw SHA-256, timestamp identity, and package immutability.
- Confirm direct official source defaults and proxy opt-in behavior for every provider.
- Keep API keys environment-only and exclude them from package/log/receipt output.
- Add fixed fixtures and no-network tests for every provider and for partial failure/normalization failure.

### Phase 4 — End-to-end surface and QA

- Run the actual Obsidian flow: Region → snapshot row → Auction panel → card → investigation → candidate selection → approval → receipt → card update.
- Test desktop and compact/mobile-width layout, keyboard/focus/scroll behavior, stale/hash mismatch, cancellation, and partial provider failure.
- Run the full relevant regression suite and record any untestable device/network gaps.

## Final decision request

Review the current implementation and the proposed ladder. Return a single final execution decision with:

1. `Decision` and `Gate reviewed`.
2. Exact phase ordering through the last phase, including any phase that must be narrowed or deferred.
3. Whether Phase 2-1 should render the snapshot inside Region Detail now, and the exact existing module/surface to use.
4. Any defects in the current k-skill bridge that must be fixed before UI wiring, especially direct-source defaults, package schema/hash verification, and provider fixture coverage.
5. The minimum complete “노트 없이” user flow and its acceptance criteria.
6. Protected contracts and explicit non-goals.
7. Exact files and tests Codex should change/run.
8. The final mobile QA verdict if physical mobile remains unavailable.
9. Whether Codex may continue directly through the final phase after your answer under the user’s standing authority.

Use the final line as exactly one of `APPROVE`, `REVISE`, or `BLOCK`.
