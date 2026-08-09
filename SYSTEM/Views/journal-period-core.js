(function (root) {
  "use strict";

  var PERIODS = Object.freeze([
    Object.freeze({ id: "daily", label: "Daily", question: "오늘 무엇이 나를 변화시켰는가?", role: "오늘 무엇이 나를 변화시켰는지 기록합니다." }),
    Object.freeze({ id: "weekly", label: "Weekly", question: "무엇이 반복되고 무엇을 배웠는가?", role: "이번 주에 무엇이 반복되었고 무엇을 배웠는지 살펴봅니다." }),
    Object.freeze({ id: "monthly", label: "Monthly", question: "어떤 변화가 실제로 검증되었는가?", role: "이번 달의 변화가 반복된 근거로 검증되는지 확인합니다." }),
    Object.freeze({ id: "quarterly", label: "Quarterly", question: "지금의 방향은 맞는가?", role: "검증된 변화와 결과를 바탕으로 지금의 방향이 맞는지 점검합니다." }),
    Object.freeze({ id: "yearly", label: "Yearly", question: "나는 어떤 사람이 되어가고 있는가?", role: "분기별 방향과 변화를 돌아보며 내가 어떤 사람이 되어가는지 성찰합니다." })
  ]);

  function getPeriod(id) {
    var key = String(id || "").trim().toLowerCase();
    return PERIODS.find(function (period) { return period.id === key; }) || PERIODS[0];
  }

  function isoDate(value) {
    var date = value instanceof Date ? value : new Date(value || Date.now());
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function monthPrefix(value) { return isoDate(value).slice(0, 7); }

  function quarterPrefix(value) {
    var date = value instanceof Date ? value : new Date(value || Date.now());
    return date.getFullYear() + "-Q" + (Math.floor(date.getMonth() / 3) + 1);
  }

  function yearPrefix(value) {
    var date = value instanceof Date ? value : new Date(value || Date.now());
    return String(date.getFullYear());
  }

  function periodKey(periodId, value) {
    var id = getPeriod(periodId).id;
    var raw = String(value || "").trim();
    if (id === "monthly" && /^\d{4}-\d{2}$/.test(raw)) return raw;
    if (id === "quarterly" && /^\d{4}-Q[1-4]$/i.test(raw)) return raw.toUpperCase();
    if (id === "yearly" && /^\d{4}$/.test(raw)) return raw;
    var date = value instanceof Date ? value : new Date(value || Date.now());
    if (!Number.isFinite(date.getTime())) date = new Date();
    if (id === "monthly") return monthPrefix(date);
    if (id === "quarterly") return quarterPrefix(date);
    if (id === "yearly") return yearPrefix(date);
    return isoDate(date);
  }

  function periodInputValue(periodId, key) {
    var id = getPeriod(periodId).id;
    var normalized = periodKey(id, key);
    if (id === "quarterly") {
      var quarterMatch = /^(\d{4})-Q([1-4])$/.exec(normalized);
      return quarterMatch ? quarterMatch[1] + "-" + String((Number(quarterMatch[2]) - 1) * 3 + 1).padStart(2, "0") : normalized;
    }
    return normalized;
  }

  function periodKeyFromInput(periodId, value) {
    var id = getPeriod(periodId).id;
    var raw = String(value || "").trim();
    if (id === "quarterly" && /^\d{4}-Q[1-4]$/i.test(raw)) return periodKey(id, raw);
    if (id === "yearly" && /^\d{4}$/.test(raw)) return raw;
    if (id === "monthly" && /^\d{4}-\d{2}$/.test(raw)) return raw;
    if (id === "quarterly" && /^\d{4}-\d{2}$/.test(raw)) return quarterPrefix(new Date(Number(raw.slice(0, 4)), Number(raw.slice(5, 7)) - 1, 1));
    return "";
  }

  function shiftPeriod(periodId, key, amount) {
    var id = getPeriod(periodId).id;
    var normalized = periodKey(id, key);
    var delta = Number(amount) || 0;
    if (id === "monthly") {
      var month = new Date(Number(normalized.slice(0, 4)), Number(normalized.slice(5, 7)) - 1 + delta, 1);
      return monthPrefix(month);
    }
    if (id === "quarterly") {
      var quarter = /^(\d{4})-Q([1-4])$/.exec(normalized);
      var quarterDate = new Date(Number(quarter[1]), (Number(quarter[2]) - 1) * 3 + delta * 3, 1);
      return quarterPrefix(quarterDate);
    }
    if (id === "yearly") return String(Number(normalized) + delta);
    return normalized;
  }

  function periodBounds(periodId, key) {
    var id = getPeriod(periodId).id;
    var normalized = periodKey(id, key);
    var start;
    var end;
    if (id === "monthly") {
      start = new Date(Number(normalized.slice(0, 4)), Number(normalized.slice(5, 7)) - 1, 1);
      end = new Date(Number(normalized.slice(0, 4)), Number(normalized.slice(5, 7)), 0);
    } else if (id === "quarterly") {
      var quarter = /^(\d{4})-Q([1-4])$/.exec(normalized);
      start = new Date(Number(quarter[1]), (Number(quarter[2]) - 1) * 3, 1);
      end = new Date(Number(quarter[1]), (Number(quarter[2]) - 1) * 3 + 3, 0);
    } else {
      start = new Date(Number(normalized), 0, 1);
      end = new Date(Number(normalized), 12, 0);
    }
    return Object.freeze({ start: isoDate(start), end: isoDate(end) });
  }

  function periodDisplay(periodId, key) {
    var id = getPeriod(periodId).id;
    var normalized = periodKey(id, key);
    if (id === "monthly") return normalized.slice(0, 4) + "년 " + normalized.slice(5, 7) + "월";
    if (id === "quarterly") return normalized.slice(0, 4) + "년 " + normalized.slice(6) + "분기";
    if (id === "yearly") return normalized + "년";
    return normalized;
  }

  function periodFolder(periodId) {
    var id = getPeriod(periodId).id;
    return id === "monthly" ? "DAILY/MONTHLY" : id === "quarterly" ? "DAILY/QUARTERLY" : id === "yearly" ? "DAILY/YEARLY" : "";
  }

  function periodPath(periodId, key) {
    var folder = periodFolder(periodId);
    if (!folder) return "";
    return folder + "/" + periodKey(periodId, key) + ".md";
  }

  function readiness(periodId, counts) {
    var period = getPeriod(periodId);
    var data = counts || {};
    var messages = {
      monthly: "Weekly가 부족하면 관찰 질문 모드로 기록할 수 있고, 반복 Principle이 쌓이면 사람의 검증을 엽니다.",
      quarterly: "완료된 Monthly Review가 부족하면 확인할 질문을 남기고, 충분히 쌓이면 전략 재정렬을 엽니다.",
      yearly: "완료된 Quarterly Review가 부족하면 확인할 질문을 남기고, 충분히 쌓이면 연간 성찰(Identity Lens)을 엽니다."
    };
    var inputs = {
      monthly: ["이번 달 Daily " + (data.daily || 0) + "개", "검토 저장된 Weekly " + (data.weekly || 0) + "개", "검증 대기 Principle " + (data.principles || 0) + "개"],
      quarterly: ["완료된 Monthly Review " + (data.monthly || 0) + "개", "이번 분기 Direction 기록 " + (data.directions || 0) + "개"],
      yearly: ["완료된 Quarterly Review " + (data.quarterly || 0) + "개", "올해 Direction 기록 " + (data.directions || 0) + "개"]
    };
    return Object.freeze({ period: period, message: messages[period.id] || "", inputs: inputs[period.id] || [] });
  }

  var api = Object.freeze({
    PERIODS: PERIODS,
    getPeriod: getPeriod,
    monthPrefix: monthPrefix,
    quarterPrefix: quarterPrefix,
    yearPrefix: yearPrefix,
    periodKey: periodKey,
    periodInputValue: periodInputValue,
    periodKeyFromInput: periodKeyFromInput,
    shiftPeriod: shiftPeriod,
    periodBounds: periodBounds,
    periodDisplay: periodDisplay,
    periodFolder: periodFolder,
    periodPath: periodPath,
    readiness: readiness
  });
  root.JournalPeriodCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
