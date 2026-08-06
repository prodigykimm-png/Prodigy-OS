# 경매·지역 워크스페이스 효율화 - 최종 PLAN 응답

Decision: REVISE
Gate reviewed: PLAN

Rationale

이번 설계는 방향은 정확하지만, 아직 PLAN으로 승인하기에는 두 가지 핵심이 부족하다:

상태 → 행동(CTA) 매핑이 완전히 명시되지 않았다
→ 특히 경매 lifecycle별 분기가 불완전

AuctionDecisionPacket의 역할은 유지했지만 UI에서의 “참조 레이어”로서의 위치가 더 명확히 고정되어야 한다

또한 패킷 기준 핵심 요구였던:

“노트 없이 조사 → 판단 → 승인 완료”

“읽기 / 판단 / 승인 경계 명확화”

“Region / Evidence / Approval 분리 유지”

는 대부분 충족되었으나, CTA와 상태 설계가 부족하면 실제 제품에서 바로 무너질 수 있는 수준이다.

따라서 소규모 수정 후 승인 가능한 상태다.

Proposed user journey
카드 확인
↓

현재 상태 + 다음 행동 즉시 이해

↓

Primary CTA 실행

↓

[단일 패널]

① 근거 확인 (읽기 전용)
② 판단 작성 (사용자 입력)
③ 선택 반영 (승인)

핵심 기준:

사용자는 노트를 열지 않고
“확인 → 판단 → 반영”을 한 화면에서 끝낸다 

packet-1

Auction surface contract
1. Primary CTA (상태 기반 확정)

패킷 요구사항에 따라 단일 CTA 금지 / 상태 기반 분기 필수

상태	Primary CTA	의미
active / open (분석 진행 중)	분석 계속하기	현재 분석 흐름 이어가기
watching (관심 단계)	분석 시작	조사 진입
package 없음 / stale / hash mismatch	자료 갱신 확인	패키지 재검증 필요
판단 없음	판단 작성	사용자 판단 입력
판단 있음 + 반영 미완료	선택 반영	승인 단계
종료 + 공식 낙찰가 있음	결과 복기 작성	리뷰
종료 + 결과 없음	결과 확인 필요	상태 점검
postponed / 변경 / 취소	일정 재확인	변경 대응

👉 핵심:
모든 상태는 “지금 해야 할 행동”으로 수렴해야 한다

2. 단일 패널 구조 (고정)
[ 상단 ]
물건 요약
현재 상태
다음 행동

────────────────

[ 근거 확인 ] (읽기 전용)

- 조사 결과 (AuctionRealEstateResearch)
- 지역 정보 (읽기 전용 projection)
- 결정 요약 (AuctionDecisionPacket) ⭐

────────────────

[ 판단 작성 ]

- 내 판단
- decision_reason
- my_opinion

────────────────

[ 선택 반영 ]

- 반영 후보
- 승인 실행 (AuctionSourceApprovalWriter)
3. AuctionDecisionPacket 처리 (최종 확정)
위치: 근거 확인 내부 "결정 요약" 섹션
성격: 읽기 전용 Reference Layer

금지:

Evidence와 통합 ❌

수정 가능 ❌

Writer 직접 연결 ❌

유지 이유:

“결정 요약은 근거가 아니라 판단을 위한 참조”
→ Evidence와 구분되어야 한다

Region surface contract
역할 정의 (패킷 기준 유지)
Region Metrics → 읽기 전용
RegionIntelligencePopup → 읽기 전용 projection
Region Experience → 사용자 입력
Auction 승인 → 완전 분리
Auction에서의 사용
근거 확인 내부

↓

[ 지역 정보 (읽기 전용) ]

Region Workspace 이동 없이 사용 가능

Object 수정 없음

판단 보조 컨텍스트만 제공

Region Workspace 구조 (Phase 1 최소)
Region Explorer

↓

리스트

↓

상세 패널

① 지역 지표 (읽기 전용)
② 근거 정보
③ 경매 맥락 ⭐
④ 임장 기록
⑤ 액션
State and CTA naming (최종 확정)
Primary CTA
라벨	의미
분석 시작	조사 진입
분석 계속하기	진행 유지
자료 갱신 확인	패키지 문제
판단 작성	판단 입력
선택 반영	승인
결과 복기 작성	리뷰
결과 확인 필요	상태 점검
일정 재확인	변경 대응
섹션 라벨
내부 개념	사용자 표시
Evidence	근거 확인
DecisionPacket	결정 요약
Approval	선택 반영
Region Projection	지역 정보
User Judgement	판단 작성
Required changes with classification
1. 상태 → CTA 완전 매핑

→ IMPLEMENTATION_DEFECT
(현재 가장 큰 UX 결함)

2. DecisionPacket UI 위치 명확화

→ REPORT_INTEGRITY
(Reference Layer 유지 필요)

3. Region 통합 방식 제한

→ SCOPE_RISK 방지
(읽기 전용 유지)

4. 패널 3단 구조 고정

→ IMPLEMENTATION_DEFECT
(현재 혼합 구조 문제 해결)

5. 노트 미사용 흐름 검증 부족

→ EVIDENCE_GAP
(실사용 검증 필요)

Non-goals and protected contracts
유지

AuctionSourceApprovalWriter

SHA 검증

Object 승인 구조

Region 분리 구조

Evidence 패키지

제외

PRE / Memory / Review Engine

새로운 Object

새로운 Schema

자동 판단

자동 승인

Named implementation slices and tests
Slice 1 — CTA 상태 매핑

테스트:

모든 상태에서 CTA 1개만 표시

Next Action과 일치

Slice 2 — 단일 패널 구조

테스트:

읽기/판단/승인 분리

노트 없이 완료 가능

Slice 3 — DecisionPacket 유지

테스트:

수정 불가

Writer 연결 없음

Slice 4 — Region embed

테스트:

Region 없이 동작

읽기 전용 유지

UI 시나리오 테스트
Desktop

카드 → 패널 → 승인까지 1분 내 완료

Mobile

스크롤 2~3번 내 모든 단계 접근

Risks or evidence limitations

CTA 분기 누락 시 UX 붕괴

패널 과밀 → Collapse 필요

Region 과정보다 정보 과다

DecisionPacket 오용 위험

실제 “노트 없이 완료” 검증 없음

Next packet request

다음 단계에서 반드시 검증:

실제 물건 1건 기준
→ 분석 → 판단 → 반영까지 노트 없이 가능한가

상태별 CTA가 직관적인가

DecisionPacket이 실제 판단에 쓰이는가

Region 정보가 과한가 부족한가

Final Verdict

REVISE (소규모 수정 후 승인 가능)

현재 설계는 방향과 구조는 매우 적절하다.
다만 상태 기반 CTA 설계가 완전히 확정되지 않았기 때문에 PLAN 승인 기준에는 미달이다.

이 부분만 보완되면 Phase 1 바로 구현 가능한 수준이다.
