/**
 * Prodigy OS Design Tokens
 * 중앙 색상·그림자 토큰. 모든 View는 이 파일의 토큰을 참조한다.
 * 로드 순서: display-registry.js보다 먼저 로드되어야 한다.
 */
(function (root) {
  "use strict";

  const COLORS = Object.freeze({
    // ── Semantic ──
    success: "#22c55e",
    successDark: "#16a34a",
    error: "#ef4444",
    errorDark: "#dc2626",
    warning: "#f97316",
    warningDark: "#ea580c",
    caution: "#eab308",
    info: "#3b82f6",
    infoLight: "#0ea5e9",
    accent: "#8b5cf6",
    accentAlt: "#a855f7",
    teal: "#14b8a6",
    cyan: "#06b6d4",
    pink: "#ec4899",

    // ── Neutral ──
    neutral100: "#f5f5f5",
    neutral200: "#e5e5e5",
    neutral300: "#d4d4d4",
    neutral400: "#a3a3a3",
    neutral500: "#8e8e93",
    neutral600: "#6b7280",
    neutral700: "#64748b",
    neutral800: "#555555",
    neutral900: "#333333",
    muted: "#888888",
    stone: "#78716c",

    // ── Text on color ──
    white: "#ffffff",
    black: "#000000",
  });

  const SHADOWS = Object.freeze({
    sm: "0 2px 4px rgba(0,0,0,0.06)",
    md: "0 2px 6px rgba(0,0,0,0.08)",
    lg: "0 4px 8px rgba(0,0,0,0.06)",
    xl: "0 8px 28px rgba(0,0,0,0.12)",
    card: "0 4px 6px rgba(0,0,0,0.15)",
    overlay: "0 12px 40px rgba(0,0,0,0.28)",
    backdrop: "rgba(0,0,0,0.45)",
  });

  const BREAKPOINTS = Object.freeze({
    medium: 768,
    wide: 1024,
  });

  const CONTROL_HEIGHTS = Object.freeze({
    workspaceBar: 48,
    actionBar: 52,
    touchTarget: 44,
    mobileToolbar: 56,
  });

  const TYPOGRAPHY = Object.freeze({
    chrome: "0.68rem",
    label: "0.72rem",
    body: "0.84rem",
    heading: "0.92rem",
    title: "1.05rem",
    bodyLeading: 1.45,
    controlLeading: 1.35,
  });

  const SPACING = Object.freeze({
    xs: 2,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
  });

  /** Semantic color at given alpha (0-1). Returns rgba() string. */
  function withAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /** Badge background from semantic color (10% opacity). */
  function badgeBg(hex) {
    return withAlpha(hex, 0.1);
  }

  const api = Object.freeze({
    COLORS,
    SHADOWS,
    BREAKPOINTS,
    CONTROL_HEIGHTS,
    TYPOGRAPHY,
    SPACING,
    withAlpha,
    badgeBg,
  });

  root.ProdigyTokens = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
