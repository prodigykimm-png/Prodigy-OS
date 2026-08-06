# Architect Packet 1

## Metadata

- repo: Prodigy OS Vault at `/Users/prodigykim/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dusk`
- branch: `main`
- commit: `1ea96bb` (`외부 부동산 조사를 승인 가능한 원문 패키지로 격리`)
- packet date: 2026-08-01 Asia/Seoul
- previous packet: none for this topic; older LLMWiki topic is unrelated
- current goal: 경매 워크스페이스와 지역 워크스페이스를 사용자가 노트로 들어가지 않고 현재 Obsidian 창 안에서 조사·비교·판단·승인까지 끝낼 수 있게 효율화
- review gate: PLAN
- continuous execution: false
- terminal gate: PLAN
- execution authority: UX/정보 구조/상호작용의 최종 결론을 도출하고 보고하는 것
- excluded authority: 코드 구현, 실제 Object/Daily 변경, 외부 공급자 조회, 커밋, push, release, 권한 변경, 삭제
- stop conditions: 두 워크스페이스의 단일 사용자 흐름과 Phase 1 구현 경계가 합의되면 종료

## Approval Scope

- destination: ChatGPT Project `Prodigy OS Making`, 새 대화 제목 `경매·지역 워크스페이스 효율화 · 2026-08-01`
- transport: Oracle MCP browser
- data categories: 저장소 요약, 선택된 UI 파일 경로와 라벨, 현재 커밋, 테스트 결과, 아키텍처 질문
- excluded: `.env`, API 키, 자격증명, 실제 경매 Object 내용, Daily/개인 메모, 개인 식별자, unrelated dirty worktree
- redaction: 실제 주소·사건번호·파일 내용은 전송하지 않고 코드 계약과 화면 라벨만 전송

## User intent

현재 카드에는 `부동산 조사`, `결정 패킷`, 지역 판단·지역 정보 계열 진입점이 함께 있어 사용자가 어떤 버튼을 언제 눌러야 하는지 알기 어렵다. 목표는 노트를 열어 내용을 찾는 일을 없애고, 현재 Obsidian 창의 카드·패널·모달 안에서 다음을 한 흐름으로 해결하는 것이다.

1. 대상 경매의 현재 상태와 다음 행동을 즉시 이해한다.
2. 부동산 사실·공식 결과·비교 근거를 한 화면에서 확인한다.
3. 필요한 경우에만 사용자 승인으로 기존 Object 사실 필드를 반영한다.
4. 지역의 지표·근거·경매 판단·임장 경험을 해당 지역 문맥 안에서 확인한다.
5. 조사, 비교, 판단, 저장의 경계를 혼동하지 않는다.

## Existing repo contract

### Auction dashboard

- `HUB/10 Auction.md`는 스크립트를 동적으로 로드하고 `window.renderAuctionCard`로 카드를 표시한다.
- 현재 로더는 지역 팝업·판단 미러·결정 패킷·경매 학습·경매 결과 writer·부동산 조사 모듈을 함께 노출한다.
- `SYSTEM/Views/auction-card.js`의 action row는 상태 전이 외에 `부동산 조사`와 조건부 `결정 패킷`을 같은 수준의 chip으로 표시한다.
- `부동산 조사`는 `SYSTEM/Views/auction-real-estate-research.js`의 모달을 연다.

### Real-estate research modal

- 조사 패키지가 없으면 외부 조회를 실행하지 않고 CLI 명령을 복사하게 한다.
- 패키지가 있으면 조회 시각, 공급자 상태, 판단 근거, 기존 Object 사실 필드와 후보 값의 차이, 선택 반영을 표시한다.
- 원문 SHA-256 검증 후 기존 `AuctionSourceApprovalWriter`를 통해 선택한 사실 필드만 반영한다.
- `status`, 사용자 판단, 기존 Region Metrics는 자동 수정하지 않으며, 승인 영수증을 남긴다.
- 현재 정보 구조는 `부동산 조사`라는 작업명과 `Object 반영 후보`라는 내부 용어를 사용자에게 직접 노출한다.

### Region dashboard

- `HUB/15 Region.md`는 `RegionExplorerView`를 로드하여 필터·정렬·지역 선택·최대 3개 비교를 제공한다.
- 현재 주요 라벨은 `지역 비교`, `비교에 추가`, `선택 해제`, `선택 지역 비교`, `지역 경험 추가`다.
- `지역 경험 추가` 모달은 지역·경험일·세부 장소·분류·직접 관찰·인식 상태를 받고, `Evidence만 저장` 또는 `AI 분석`을 선택하게 한다.
- `RegionIntelligencePopupCore/View`는 현재 Region Object를 읽기 전용으로 투영하고 여러 탭과 `판단·결과` 탭을 제공한다.
- 지역 팝업은 Object를 수정하지 않으며, 경험 저장은 별도의 Evidence/Handoff 흐름이다.

## Current friction hypothesis

1. 카드의 버튼이 사용자 목적 기준이 아니라 구현 모듈 기준으로 나뉘어 있다.
2. `부동산 조사`, `결정 패킷`, `지역 판단`, `지역 정보`가 각각 무엇을 읽고 무엇을 바꾸는지 첫 화면에서 설명되지 않는다.
3. 조사 모달은 공급자·패키지·Object 반영을 한 번에 보여 주지만, 사용자가 `지금 볼 것`, `확인할 것`, `승인할 것`을 단계적으로 안내하지 않는다.
4. 지역 화면은 비교 탐색과 지역 경험 기록이 같은 상단 controls에 놓여 있지만, 사용자의 목적은 `비교`, `이 지역을 깊게 보기`, `현장 경험 남기기`로 다르다.
5. 정보가 없거나 오래된 상태에서 다음 가능한 행동이 명확한 CTA로 수렴되지 않는다.
6. 노트로 이동하지 않는 목표를 지키려면 각 모달이 새 문서 열기 대신 현재 문맥, 뒤로가기, return focus, 읽기 전용/저장 상태를 일관되게 제공해야 한다.

## Hard invariants

- Object writer·승인 절차·원문/해시/영수증 경계는 유지한다.
- `status`, `expected_bid`, `my_bid_price`, `decision_reason`, `my_opinion`은 자동 변경하지 않는다.
- 경매일 경과만으로 낙찰 결과를 만들지 않는다.
- Region Metrics와 사용자 경험/Evidence는 서로 다른 층으로 유지한다.
- 외부 네트워크 요청과 프로세스 실행은 Obsidian UI가 직접 수행하지 않는다.
- 읽기·비교·근거 보기와 승인·저장은 명확히 분리한다.
- 실제 사용자 노트·Object·Daily 내용은 아키텍처 검토 packet에 포함하지 않는다.
- 이번 교환은 PLAN만 다루며 코드 변경을 요청하지 않는다.

## Evidence index

- C1 / SRC: `SYSTEM/Views/auction-card.js` — 카드 action row가 `부동산 조사`와 `결정 패킷`을 동일한 action host에 렌더링한다.
- C2 / SRC: `SYSTEM/Views/auction-real-estate-research.js` — 공급자 상태, 판단 근거, `Object 반영 후보`, 선택 반영, 패키지 검증을 한 모달에서 처리한다.
- C3 / SRC: `SYSTEM/Views/region-explorer-view.js` — 필터, 정렬, `비교에 추가`, 최대 3개 비교, `지역 경험 추가`가 한 탐색 화면에 있다.
- C4 / SRC: `SYSTEM/Views/region-experience-modal.js` — 직접 관찰을 입력하고 Evidence 저장 또는 AI 분석을 선택하는 별도 저장 흐름이 있다.
- C5 / SRC: `SYSTEM/Views/region-intelligence-popup-core.js`, `SYSTEM/Views/region-intelligence-popup-view.js` — 읽기 전용 지역 팝업과 `판단·결과` 탭을 제공한다.
- C6 / AUT: `node --test SYSTEM/AI/Skills/prodigy-review/tests/auction/*.js` — 689 tests passed, 80 suites passed, 0 failed at commit `1ea96bb`.
- C7 / FSR: 실제 Obsidian desktop에서 카드의 `부동산 조사` 버튼과 패키지 부재 안내 모달을 확인했다. 실제 외부 조회와 사용자 Object 반영은 수행하지 않았다.

## Decision needed

다음 질문에 대해 현재 구현의 경계를 지키면서 하나의 실행 가능한 UX/정보 구조 결론을 내려라.

1. 경매 카드의 여러 모듈 버튼을 사용자 목표 중심의 1차 CTA와 2차 상세 패널로 어떻게 재구성할 것인가?
2. `부동산 조사` 모달을 조사 시작→근거 확인→차이 검토→선택 승인이라는 guided flow로 만들 때 최소 화면 상태와 명칭은 무엇인가?
3. 지역 워크스페이스에서 비교 탐색, 지역 상세, 판단·결과, 임장/Evidence 기록을 어떤 단일 문맥 흐름으로 연결할 것인가?
4. 노트 진입을 없애면서도 읽기 전용·승인·저장·실패·오래된 자료 상태를 사용자에게 어떻게 보여 줄 것인가?
5. 첫 구현에서 반드시 남겨야 할 기존 계약과, 과감히 숨기거나 통합할 수 있는 UI 중복은 무엇인가?
6. Phase 1을 과도하게 키우지 않도록 정확한 변경 파일/컴포넌트 경계, 테스트/시각 QA 기준, 비목표를 제시하라.

## Required response format

Return a compact but concrete architecture decision:

Decision: APPROVE | REVISE | BLOCK
Gate reviewed: PLAN
Rationale:
Proposed user journey:
Auction surface contract:
Region surface contract:
State and CTA naming:
Required changes with classification:
Non-goals and protected contracts:
Named implementation slices and tests:
Risks or evidence limitations:
Next packet request:

Do not implement code. Do not authorize commit, push, release, Object writes, or external data collection.
