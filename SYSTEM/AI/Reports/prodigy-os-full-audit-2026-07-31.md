# Prodigy OS 전체 감사 및 개선 보고서

작성일: 2026-07-31
감사 브랜치: `codex/prodigy-os-full-audit-improvement`
기준 점수: **78.1 / 100 (B+)**
현재 자동검증 기준 점수: **86.6 / 100 (A-)**

## 결론

Prodigy OS는 강한 Object-first 구조, 명시적 사람 승인 경계, 폭넓은 직접 테스트를 가진 성숙한 개인 운영체계다. 이번 감사에서는 Home의 Focus/Continue 중복, 모바일 마지막 콘텐츠 가림, Home 수명주기 누수 가능성, Personal의 무변경 재실행 상태 보존, Reading 후보 계약, Journal→People 자동 반영의 불투명성과 중복 쓰기, Monthly Validation 문서 의미 드리프트를 닫았다.

86.6점은 자동 검증과 코드·문서 계약을 기준으로 한 점수다. 수정 후 실제 Obsidian 전체 화면 matrix와 physical iPhone 검증은 수행되지 않았으므로 Runtime과 UI의 실제 화면 항목에는 점수를 주지 않았다. 사용자가 제공한 iPhone 사진은 원본 Vault의 수정 전 화면이며, 감사 브랜치가 원본 Vault에 아직 반영되지 않았기 때문에 Focus/Continue 중복과 하단 toolbar 가림이 계속 보인다.

## 주요 개선

- Home 흐름을 Brief → Focus → Continue → Micro Log → secondary fold의 단일 축으로 고정했다.
- Focus에 이미 있는 Object/제목을 Continue에서 제거하고 Creator 중복을 줄였다.
- Continue를 native semantic control로 만들고 keydown/ResizeObserver teardown과 editable shortcut 예외를 추가했다.
- compact Home의 scroll end가 Action Bar, floating toolbar, safe area, 공통 여백을 모두 포함하도록 수정했다.
- Personal은 189명 fixture에서 2.5초 간격 6회 재실행 중 query/filter/sort/selection/scroll/focus를 보존하고 무변경 repaint와 index touch를 하지 않는다.
- Reading Candidate lifecycle의 source/provenance 및 validated Knowledge 제외 경계를 맞췄다.
- Journal 승인 footer가 선택된 사람 Evidence 수와 자동 반영 결과를 클릭 전에 고지한다.
- 동일 사람 통찰은 normalized 한 줄로 한 번만 남고, 불변 CONTACTS 파일은 `vault.modify`를 호출하지 않는다. handoff 실패는 저장된 Daily를 보존한다.
- `monthly_validation`을 Monthly Validation Note를 명시적 source Object로 가진 사람 승인 Candidate로 문서화했다.
- stability smoke에 Home 상호작용·모바일 기하, Personal refresh loop, Journal→People handoff 회귀를 추가했다.

## 자동 검증 결과

| 영역 | 결과 |
|---|---:|
| Workout | 20 / 20 |
| Project | 2 / 2 |
| Journal | 19 / 19 + People handoff 신규 회귀 |
| People 핵심 | 4 / 4 + refresh loop |
| Auction / Region | 66 / 69 |
| Knowledge | 38 / 39 |
| Stability smoke | 25 suites + Property baseline |
| Home | lifecycle, flow dedupe, mobile geometry 320/375/390/430, horizontal fit, daily loop 통과 |
| Reading | candidate lifecycle 및 store loop 통과 |
| 문서·계약 | CI contract, capability, color, workspace consistency, visual rhythm 통과 |

## Known-Red와 검증 한계

다음 4건은 제품 회귀가 아니라 현재 실행 환경·fixture 의존으로 남았다.

- `test_region_cache_root.js`
- `test_region_source_contract.js`
- `test_region_transit_approved_corpus.js`
- Knowledge의 `.omo/frontend-design/state.md` 부재 의존 테스트 1건

추가 한계:

- 원본 Vault에는 이번 감사 브랜치가 아직 반영되지 않았다.
- 실제 Obsidian의 final-SHA 전체 화면 matrix를 새로 실행하지 않았다.
- physical iPhone receipt가 없으므로 `physical_device_success: false`, `physical_claim_status: not_proven`이다.
- line/branch coverage threshold, 자동 WCAG rendered audit, 정적 타입 검사, release 자동화는 이번 범위 밖이며 점수에 반영하지 않았다.

## 점수 산정

동일 rubric을 사용했다. 자동 검증으로 증명되지 않은 항목은 부분 점수를 주지 않았다.

| 차원 | 가중치 | 기준 | 현재 | 판단 |
|---|---:|---:|---:|---|
| Architecture & design | 15% | 88 | 100 | 계약 맵, 승인 경계, Workspace identity 정합화 |
| Documentation | 12% | 78 | 100 | DESIGN 권위, Home/Monthly/People 운영 의미 정정 |
| Data contracts | 15% | 82 | 92 | source 의미 정합화, migration/version gate는 미구축 |
| Tests & CI | 20% | 82 | 82 | 회귀 smoke 강화, coverage·rendered accessibility는 미구축 |
| Runtime & release | 10% | 76 | 76 | 실패 시 데이터 보존은 확인했으나 final-SHA 실제 runtime matrix 미수행 |
| UI/UX | 12% | 72 | 86 | Home 회귀는 자동 검증했으나 final-SHA 실제 Obsidian visual matrix 미수행 |
| Mobile & accessibility | 8% | 62 | 74 | 논리 폭 기하 통과, physical iPhone·WCAG audit 미증명 |
| Maintainability | 8% | 70 | 70 | 직접 회귀는 강화했으나 hotspot/type/dependency gate는 그대로 |
| **가중 합계** | **100%** | **78.1** | **86.6** | **자동검증 기준 A-** |

final-SHA 실제 Obsidian matrix와 physical iPhone receipt까지 모두 통과하면 계획 rubric의 최대 **90.8 / 100**에 도달할 수 있다. 현재는 목표치일 뿐 달성 점수가 아니다.

## 권장 다음 순서

1. 감사 브랜치를 원본 Vault에 안전하게 반영한다.
2. Obsidian을 완전히 다시 열고 Home과 Personal을 확인한다.
3. iPhone에서 Home 최하단까지 스크롤해 Micro Log 전체와 `더 보기` summary가 toolbar 위에 놓이는지 확인한다.
4. Daily Reflection에서 사람 Evidence 선택 수와 자동 반영 고지를 확인하고 같은 승인을 두 번 실행해 중복이 없는지 확인한다.
5. Known-Red 4건은 제품 코드 수정이 아니라 hermetic fixture 정비 작업으로 별도 처리한다.
