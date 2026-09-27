# LLM Wiki Hub 마무리 — 에이전트 인수인계 (2026-09-09)

## 목표
- 일반 Hub MD 입력부터 실제 Wiki 재사용까지 연결 마무리.
- 격리 Vault + 기존 A/B/C 자료 사용. 운영 Knowledge 임의 승인·쓰기·삭제 금지.
- Git stage/commit/push/release 금지. USER ACCEPTANCE는 확인 전까지 PENDING.

## 현재 상태
- 로컬 checkout 기준 작업 중. working tree에 LLM Wiki 관련 수정 다수 (SYSTEM/Views/llmwiki-*, prodigy-review tests, HUB/50 Knowledge.md 등).
- 기준 보고서: artifacts/llmwiki-vertical-recovery-20260909/REPORT.md (마지막 20:05 Mac UI+반복입력 절까지 확인됨).
- Hub 시험 설정: artifacts/llmwiki-productization-20260909/production-hub/setup.json (격리 Vault /tmp/Prodigy-Wiki-Hub-QA-*, entry HUB/50 Knowledge.md, 합성 A/B 케이스).
- 문서 결과: artifacts/llmwiki-productization-20260909/document-review-dogfood/B-after.md, finish-validation/mac-ui/ 이하 (A-applied.json, B-applied.json, conflict-blocked.png 등).
- 관련 회귀 마지막 기록: 329/329 PASS, 확장 984개 중 938 PASS / 45 FAIL / 1 SKIP (직전 45개와 동일, 새 실패 없음 — 재실행 필요).
- 실기기: Mac 격리 adapter UI는 PASS WITH LIMITATION, 일반 Hub 전체 ingest·재시작 미검증. iPad/iPhone NOT RUN.

## 모델 분담 (사용자 지정)
- 설계: Astra medium
- 리뷰: Astra low ("row"는 low로 해석, 확인 필요)
- 구현: muse-spark 1.3 (이 턴의 실행 모델)
- QA: omen-alpha
- 주의: 전체 히스토리 fork에서는 모델 override 불가. 서브에이전트에 모델 지정 시 fork_turns none 필요.

## 에이전트 상태
- /root/muse_hub_retry3: running → 파일 읽기 성공 후 "계속 진행함" 보고. Hub 마무리 담당.
- /root/muse_hub_resume, /root/muse_hub_plain_retry: unreadable_encrypted_agent_task 로 실패 (외부 provider가 암호화 작업 메시지 해독 불가).
- /root/muse_hub_finish, /root/omen_hub_qa: 구 kiro/gpt-5.6-sol 설정으로 실패. වැඩ스페이스 코드에 Kiro 잔재 없음 (.kiro/ 없음, 코드 매치는 wikiRow 오탐). 실패 원인은 실행 설정 쪽.
- Kiro 해제 후 재시도 1회는 running 진입 성공.

## 다음 할 일
1. muse_hub_retry3 상태 확인 후 일반 Hub 진입점(HUB/50 Knowledge.md → 정리 버튼)에서 A 신규 / B 보완 / B 재처리 no_change / C 상충 보존 흐름 검증.
2. 신규 문서 반복 입력 감소: 분석済み 제목·본문·조건·예외·출처 재사용, Domain/Topic 후보 제시, 빈값·미확인·보류는 계약 범위 내 처리.
3. 파이프라인 축소 확인: 대표 Source 1건 호출 순서 + provider 호출 수 기록.
4. 관련 회귀 재실행 + 확장 suite 실패 비교 (이름·내용 기준, 개수만으로 판단 금지).
5. Mac 실기 UI + iPad/iPhone 가능 범위 검증. 미검증은 NOT RUN, PASS로 기재 금지.

## 인수자 주의
- 운영 데이터 쓰기 시험은 격리 Vault에서만.
- provider 재호출 없는 검토 재시도, retry 부모 이력 보존 흐름 유지.
- 충돌(10분/20분) 임의 해결 금지. verified 주입 금지.
