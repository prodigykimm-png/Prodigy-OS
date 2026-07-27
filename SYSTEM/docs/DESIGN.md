# Prodigy OS Design System

## 색상 토큰

모든 View는 `SYSTEM/Views/design-tokens.js`의 `ProdigyTokens.COLORS`를 참조한다.
raw hex/rgb 직접 사용 금지.

### Semantic

| 토큰 | 값 | 용도 |
|------|-----|------|
| success | #22c55e | 완료·승인·활성·낙찰 |
| successDark | #16a34a | success 강조 텍스트 |
| error | #ef4444 | 실패·반려·패찰·차단 |
| warning | #f97316 | 주의·복기·중간 우선순위 |
| warningDark | #ea580c | warning 강조 텍스트 |
| caution | #eab308 | 증거 보강·일시정지 |
| info | #3b82f6 | 정보·계획·입찰 예정 |
| infoLight | #0ea5e9 | 정보 보조 |
| accent | #8b5cf6 | 아이디어·강조 |
| accentAlt | #a855f7 | 제안·보조 강조 |
| teal | #14b8a6 | 등록·캡처 |
| cyan | #06b6d4 | 완료·완독 |
| pink | #ec4899 | 특수 강조 |

### Neutral

| 토큰 | 값 | 용도 |
|------|-----|------|
| neutral500 | #8e8e93 | 비활성·대기·보관 |
| neutral600 | #6b7280 | 보조 텍스트 |
| neutral700 | #64748b | 예정·메타 |
| neutral800 | #555555 | 보관·비활성 진하게 |
| muted | #888888 | 관심·희미 |
| stone | #78716c | 등록·식별 |

### 그림자

| 토큰 | 값 | 용도 |
|------|-----|------|
| sm | 0 2px 4px rgba(0,0,0,0.06) | 카드 기본 |
| md | 0 2px 6px rgba(0,0,0,0.08) | 카드 강조 |
| card | 0 4px 6px rgba(0,0,0,0.15) | 표지·썸네일 |
| overlay | 0 12px 40px rgba(0,0,0,0.28) | 모달 |
| backdrop | rgba(0,0,0,0.45) | 모달 배경 |

## 사용법

```js
const T = root.ProdigyTokens;
style: `color: ${T.COLORS.success}; box-shadow: ${T.SHADOWS.sm};`
style: `background: ${T.badgeBg(T.COLORS.error)};`
```

## 로드 순서

`design-tokens.js` → `display-registry.js` → 각 View
