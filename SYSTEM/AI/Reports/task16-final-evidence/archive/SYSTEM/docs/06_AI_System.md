# Prodigy OS AI System v2.1

> "AI는 기록하지 않는다. AI는 이해한다."

---

# Purpose

이 문서는 Prodigy OS에서 AI의 역할과 책임을 정의한다.

Prodigy OS는 AI를 단순한 챗봇으로 사용하지 않는다.
AI는 **사용자의 경험을 구조화된 Asset으로 성장시키는 엔진**이다.

> 상세 원칙: [00_Constitution.md](00_Constitution.md) (Article 2)

---

# AI Responsibilities

AI는 다음 역할을 수행한다.

## 1. Parse
입력된 정보를 이해한다.
예: PDF → 주소/사건번호 추출 → Property 생성

## 2. Structure
정보를 Object 형태로 변환한다.
예: 텍스트 → Auction Object

## 3. Enrich
추가 정보를 보완한다.
예: 경매 → 네이버 시세/과거 거래 → Dashboard 계산 설명

## 4. Connect
Object와 Object를 연결한다.
예: Auction → 세법/감정평가/투자 전략

## 5. Assist Decision
데이터를 제시한다.
- "이 물건의 예상 적정가: X억~Y억"
- "유사 물건 최저가율: 평균 X%"
- "당신의 낙찰 성공률이 가장 높은 구간: 최저가율 XX~YY%"

AI는 최종 결정을 내리지 않는다.

## 6. Review Support
일일 성찰을 증거(Evidence)로 수집하고, 다수의 증거에서 공통된 패턴(Pattern)을 감지하며, 주간 성찰 시 원칙 후보(Suggested Principles)를 제안합니다.
- "최저가율 80% 이상에서 패찰률 80% 패턴 발견"
- "행동 전 미리 준비를 해두는 것이 마찰력을 최소화했다는 반복적 증거 포착"

---

# AI Boundaries

## AI MAY
- Analyze
- Review
- Recommend
- Generate Properties
- Assist Organization
- Suggest principles based on patterns (패턴 기반 원칙 제안)

## AI MUST NOT
- Make final decisions
- Delete Objects automatically
- Rewrite important Object data without explicit approval
- Change system architecture
- Write Decision or Review content automatically
- Create personal principles autonomously (개인의 핵심 원칙 독단적 생성 금지)

---

# Human Responsibilities

사람은 항상 최종 책임을 가진다.
사람은 다음을 담당한다.
- 승인
- 수정
- 삭제
- 의사결정
- Review 작성
- 원칙 검증 및 최종 채택 (Validation)

---

# AI Pipeline

AI가 Object 변경을 제안할 때 Capture vocabulary는 `capture_started` → `ai_proposal` → `human_review` → `human_confirmed` → `object_committed`만 사용한다. Terminal outcome은 `rejected`, `cancelled`, `no_change`, `stale`, `conflict`, `error`다. AI는 첫 Review interaction이나 별도의 Confirm interaction을 대신할 수 없고, private authorization/locking metadata는 public state가 아니다.

```
Aside Capture
    ↓
Parse
    ↓
Structure
    ↓
Enrich
    ↓
Assist Decision
    ↓
Human Confirm
    ↓
Object Updated
    ↓
Review Support (Collect Evidence & Detect Patterns)
    ↓
Suggest Principle (AI Proposes Principle Candidates)
    ↓
Human Validation (User Confirms / Rejects Principles)
    ↓
Knowledge Asset (ZETA)
```

---

# AI Provider Policy

## 구독과 API는 별개입니다

소비자용 ChatGPT Plus, Google One AI Premium, GitHub Copilot 구독은 **API 자격증명이 아닙니다.**
구독 세션·쿠키·웹 UI 자동화를 Provider로 등록하거나 API처럼 감싸서 사용하는 행위는 해당 서비스의 약관을 위반합니다.

따라서 Prodigy OS는 API Provider와 별도로, 공식 로그인형 CLI를 호출하는 로컬 실행기를 지원합니다.

### 1. Gemini API 키
- Google Cloud에서 별도 과금되며, 소비자 Google One 구독과는 결제 계정이 분리됩니다.
- [Gemini API 키 발급](https://ai.google.dev/gemini-api/docs/api-key) 및 [과금](https://ai.google.dev/gemini-api/docs/billing)을 참고하세요.
- 기본 모델: `gemini-3.5-flash` (채팅), `gemini-3.1-pro` (구조화된 제안)

### 2. 로컬 / OpenAI-compatible Endpoint
- LM Studio, Ollama, OpenCode Go 등 로컬에서 실행되는 추론 서버.
- 기본 URL: `http://127.0.0.1:1234/v1`
- 모델 ID는 설정에서 직접 입력해야 하며, 하드코딩된 기본값은 없습니다.

### 3. 공식 Codex CLI 실행기
- 설정의 `Codex 구독`은 API endpoint가 아니라 데스크톱에서 `codex exec`를 직접 실행합니다.
- Codex CLI가 관리하는 로그인 상태를 사용하므로 API 키·쿠키·웹 세션·`auth.json`을 Prodigy OS가 읽거나 전송하지 않습니다.
- 사용 전 터미널에서 `codex login`을 완료해야 하며, 구조화 분석은 일회성·읽기 전용 프로세스로 실행됩니다.

### 4. 공식 Antigravity CLI 실행기
- 설정의 `Antigravity 구독`은 API endpoint가 아니라 데스크톱에서 `agy --print`를 직접 실행합니다.
- Antigravity CLI가 관리하는 Google 로그인 상태를 사용하므로 API 키·쿠키·브라우저 세션을 Prodigy OS가 읽거나 전송하지 않습니다.
- 사용 전 터미널에서 `agy`를 한 번 실행해 로그인을 완료해야 하며, 모델은 설정 화면에서 선택할 수 있습니다.
- 저널 분석은 `--sandbox`와 구조화 JSON 스키마를 사용하고, 분석 프롬프트에는 파일 수정·명령 실행 금지 지시를 포함합니다.
- 모바일에서는 `agy`를 직접 실행할 수 없으므로, 맥미니의 공식 CLI 실행기를 Tailscale Serve 뒤의 `antigravity-relay`로 호출합니다. 중계 서버는 요청마다 `agy`를 한 번 실행하고 종료하며, 동시 실행은 하나로 제한합니다.
- 중계 URL은 `*.ts.net` HTTPS 주소만 허용하고, 중계 토큰은 Vault JSON이 아닌 각 기기의 `SecretStorage`에 저장합니다. 임의의 Antigravity 브리지나 공개/LAN 바인드는 허용하지 않습니다.

## Provider 보안 경계

### 바인드 정책

AI Provider는 반드시 **localhost 또는 사설 Tailnet 주소**에만 바인드됩니다.

- **허용:** `127.0.0.1`, `localhost`, `::1`, `*.ts.net` (Tailscale Serve)
- **거부:** `0.0.0.0`, `10.x.x.x`, `192.168.x.x`, `172.16-31.x.x` (공개/LAN 바인드)
- 공개·LAN 바인드는 보안상 허용되지 않으며, 원격 접근이 필요하면 [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)를 사용하세요.

### 거부되는 Provider 유형

- 공식 `antigravity-exec` 실행기와 Tailscale 릴레이가 아닌 임의의 `antigravity`·`agy` 브리지
- 소비자 OAuth 재사용 (`consumer-oauth`, `reuseConsumerOAuth`)
- 구독 세션·쿠키·웹 UI 자동화 (`subscription`, `consumer-session`, `chatgpt-login` 등). 단, `codex-exec`와 `antigravity-exec`는 각 공식 CLI 로그인만 허용합니다.
- 위 모든 항목은 네트워크 요청 전에 설정 단계에서 거부됩니다.

## API 키 관리

모든 API 키와 Antigravity 중계 토큰은 `secretStorage`를 통해 안전하게 저장되며, 설정 파일(JSON)이나 로그에 평문으로 기록되지 않습니다.
API 키가 설정되지 않은 경우 "설정 → AI → [Provider 이름] API 키가 없습니다"라는 한국어 오류가 표시되며, 다른 Provider로 자동 폴백되지 않습니다.

## 요청 시간 제한

- 채팅 요청: 30초
- 구조화된 제안: 60초
- 시간 초과 시 "AI 요청 시간이 초과되었습니다"라는 한국어 오류가 표시됩니다.

## 재시도 및 폴백

- 최대 2회 재시도 (총 3회 시도), 지연: 1초 → 2.5초
- 재시도 대상: 네트워크 오류, HTTP 429, 500, 502, 503, 504
- 400, 401, 403, 404는 재시도 없이 즉시 실패
- 폴백 순서: 설정된 기본 Provider → 설정된 보조 Provider → 인라인 오류
- 로컬 전용 구성에서는 Gemini로의 자동 폴백이 발생하지 않습니다.

## 진단 정보 보호

오류 메시지, 로그, 진단 정보에는 프롬프트, API 키, 인증 헤더, 시크릿 값이 절대 포함되지 않습니다.
모든 진단 정보는 `[redacted]`로 치환됩니다.

---

# Final Statement

Prodigy OS에서 AI는
사용자의 입력을 줄이고,
Object 생성을 지원하며,
Dashboard 계산을 설명하고,
의사결정을 보조한다.

최종 결정은 사람이 수행한다.

---

**Version:** 2.1
**Status:** Active
**Supersedes:** AI System v2.0
**Depends on:**
- 00_Constitution.md
- 01_Architecture.md
