(function (root) {
  "use strict";

  var PERIODS = Object.freeze([
    Object.freeze({ id: "daily", label: "Daily", question: "오늘 무엇이 나를 변화시켰는가?" }),
    Object.freeze({ id: "weekly", label: "Weekly", question: "무엇이 반복되고 무엇을 배웠는가?" }),
    Object.freeze({ id: "monthly", label: "Monthly", question: "어떤 변화가 실제로 검증되었는가?" }),
    Object.freeze({ id: "quarterly", label: "Quarterly", question: "지금의 방향은 맞는가?" }),
    Object.freeze({ id: "yearly", label: "Yearly", question: "나는 어떤 사람이 되어가고 있는가?" })
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

  function readiness(periodId, counts) {
    var period = getPeriod(periodId);
    var data = counts || {};
    var messages = {
      monthly: "사람이 검토한 Weekly와 원칙 후보가 쌓이면 월간 검증을 엽니다.",
      quarterly: "완료된 Monthly Review가 쌓이면 전략 재정렬을 엽니다.",
      yearly: "완료된 Quarterly Review가 쌓이면 Identity Lens 성찰을 엽니다."
    };
    var inputs = {
      monthly: ["이번 달 Daily " + (data.daily || 0) + "개", "검토 저장된 Weekly " + (data.weekly || 0) + "개", "검증 대기 Principle " + (data.principles || 0) + "개"],
      quarterly: ["완료된 Monthly Review " + (data.monthly || 0) + "개", "이번 분기 Direction 기록 " + (data.directions || 0) + "개"],
      yearly: ["완료된 Quarterly Review " + (data.quarterly || 0) + "개", "올해 Direction 기록 " + (data.directions || 0) + "개"]
    };
    return Object.freeze({ period: period, message: messages[period.id] || "", inputs: inputs[period.id] || [] });
  }

  var api = Object.freeze({ PERIODS: PERIODS, getPeriod: getPeriod, monthPrefix: monthPrefix, quarterPrefix: quarterPrefix, yearPrefix: yearPrefix, readiness: readiness });
  root.JournalPeriodCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
