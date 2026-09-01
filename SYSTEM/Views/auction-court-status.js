(function (root) {
  "use strict";

  const VALID_STATUSES = Object.freeze([
    "scheduled",
    "failed",
    "changed",
    "suspended",
    "withdrawn",
    "sold",
    "unknown"
  ]);
  const LABELS = Object.freeze({
    scheduled: "예정",
    failed: "유찰",
    changed: "변경",
    suspended: "정지",
    withdrawn: "취하",
    sold: "매각",
    unknown: "결과 미확인"
  });
  const ALIASES = Object.freeze({
    예정: "scheduled",
    진행: "scheduled",
    유찰: "failed",
    변경: "changed",
    정지: "suspended",
    취하: "withdrawn",
    매각: "sold",
    낙찰: "sold",
    미확인: "unknown",
    "결과 미확인": "unknown"
  });

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function normalize(value) {
    const raw = clean(value);
    if (!raw) return "";
    const lowered = raw.toLowerCase();
    if (VALID_STATUSES.includes(lowered)) return lowered;
    return ALIASES[raw] || "unknown";
  }

  function dateOnly(value) {
    if (value && typeof value === "object" && typeof value.toISODate === "function") return value.toISODate();
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    }
    const match = /^(\d{4})[-/.](\d{2})[-/.](\d{2})/u.exec(clean(value));
    return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
  }

  function dayNumber(value) {
    const iso = dateOnly(value);
    if (!iso) return null;
    const [year, month, day] = iso.split("-").map(Number);
    const time = Date.UTC(year, month - 1, day);
    return Number.isFinite(time) ? Math.floor(time / 86400000) : null;
  }

  function scheduleLabels(isoDate, diffDays) {
    const md = isoDate.slice(5).replace("-", "/");
    if (diffDays === 0) return { label: `${md} (오늘)`, compact: "오늘" };
    if (diffDays > 0) return { label: `${md} (D-${diffDays})`, compact: `D-${diffDays}` };
    return { label: "결과 미확인", compact: "결과 미확인" };
  }

  function project(input) {
    const source = input || {};
    const status = normalize(source.courtStatus ?? source.court_status);
    const date = dateOnly(source.auctionDatetime ?? source.auction_datetime);
    const today = dateOnly(source.now) || dateOnly(new Date());
    const eventDay = dayNumber(date);
    const todayDay = dayNumber(today);
    const diffDays = eventDay === null || todayDay === null ? null : eventDay - todayDay;
    const isToday = diffDays === 0;
    const isPast = diffDays !== null && diffDays < 0;
    const schedule = diffDays === null ? null : scheduleLabels(date, diffDays);
    const officialLabel = LABELS[status] || "";
    let label = "-";
    let compactLabel = "-";

    if (["failed", "changed"].includes(status)) {
      const nextDateLabel = schedule && diffDays >= 0 ? schedule.compact : "";
      const qualifier = status === "failed" ? "다음 기일" : "새 기일";
      label = nextDateLabel ? `${officialLabel} · ${qualifier} ${nextDateLabel}` : officialLabel;
      compactLabel = officialLabel;
    } else if (["suspended", "withdrawn", "sold"].includes(status)) {
      label = officialLabel;
      compactLabel = officialLabel;
    } else if (schedule) {
      label = schedule.label;
      compactLabel = schedule.compact;
    } else if (status === "scheduled") {
      label = LABELS.scheduled;
      compactLabel = LABELS.scheduled;
    } else if (status === "unknown") {
      label = LABELS.unknown;
      compactLabel = LABELS.unknown;
    }

    return Object.freeze({
      status: status || (isPast ? "unknown" : ""),
      label,
      compact_label: compactLabel,
      date: date || "",
      is_urgent: Boolean(diffDays !== null && diffDays >= 0 && diffDays <= 3),
      is_today: isToday,
      is_past: isPast
    });
  }

  const api = Object.freeze({ VALID_STATUSES, LABELS, normalize, dateOnly, project });
  root.AuctionCourtStatus = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
