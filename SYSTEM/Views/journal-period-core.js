(function (root) {
  "use strict";

  var PERIODS = Object.freeze([
    { id: "daily", label: "일간", question: "오늘 남기고 싶은 일이나 마음이 있나요?", role: "오늘의 경험과 마음을 편하게 남깁니다." },
    { id: "weekly", label: "주간", question: "이 중 내게 가장 중요했던 것은 무엇이고, 빠진 이야기는 없나요?", role: "한 주의 흐름을 돌아보고, 다음 주에 가져갈 것을 고릅니다." },
    { id: "monthly", label: "월간", question: "해본 것 중 실제로 나에게 맞았던 것은 무엇이며, 어떤 조건에서 그랬나요?", role: "여러 주에 걸쳐 해본 방식과 변화를 비교하고, 나에게 맞는 것을 정리합니다." },
    { id: "quarterly", label: "분기", question: "무엇을 계속하고, 무엇을 줄이거나 바꿀까요?", role: "지난 세 달을 바탕으로, 어디에 힘을 쓰고 무엇을 줄일지 정합니다." },
    { id: "yearly", label: "연간", question: "이 한 해는 내게 어떤 의미였고, 앞으로 무엇을 중요하게 보고 싶나요?", role: "한 해의 경험과 선택을 돌아보며, 앞으로 중요하게 여길 삶의 기준을 정리합니다." }
  ].map(Object.freeze));

  function getPeriod(id) {
    var key = String(id || "").trim().toLowerCase();
    return PERIODS.find(function (period) { return period.id === key; }) || PERIODS[0];
  }

  function isoDate(value) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    var date = value instanceof Date ? value : new Date(value || Date.now());
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    function part(type) { return parts.find(function (p) { return p.type === type; }).value; }
    return part("year") + "-" + part("month") + "-" + part("day");
  }
  function calendarDate(year, month, day) { return new Date(Date.UTC(year, month, day, 12)); }
  function monthPrefix(value) { return isoDate(value).slice(0, 7); }
  function quarterPrefix(value) { var day = isoDate(value); return day.slice(0, 4) + "-Q" + (Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1); }
  function yearPrefix(value) { return isoDate(value).slice(0, 4); }

  function periodKey(periodId, value) {
    var id = getPeriod(periodId).id;
    var raw = String(value || "").trim();
    if (id === "monthly" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
    if (id === "quarterly" && /^\d{4}-Q[1-4]$/i.test(raw)) return raw.toUpperCase();
    if (id === "yearly" && /^\d{4}$/.test(raw)) return raw;
    var date = value instanceof Date ? value : new Date(value || Date.now());
    if (!Number.isFinite(date.getTime())) throw new Error("유효하지 않은 기간입니다.");
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
    if (id === "quarterly" && /^\d{4}-\d{2}$/.test(raw)) return quarterPrefix(calendarDate(Number(raw.slice(0, 4)), Number(raw.slice(5, 7)) - 1, 1));
    return "";
  }

  function shiftPeriod(periodId, key, amount) {
    var id = getPeriod(periodId).id;
    var normalized = periodKey(id, key);
    var delta = Number(amount) || 0;
    if (id === "monthly") {
      var month = calendarDate(Number(normalized.slice(0, 4)), Number(normalized.slice(5, 7)) - 1 + delta, 1);
      return monthPrefix(month);
    }
    if (id === "quarterly") {
      var quarter = /^(\d{4})-Q([1-4])$/.exec(normalized);
      var quarterDate = calendarDate(Number(quarter[1]), (Number(quarter[2]) - 1) * 3 + delta * 3, 1);
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
      start = calendarDate(Number(normalized.slice(0, 4)), Number(normalized.slice(5, 7)) - 1, 1);
      end = calendarDate(Number(normalized.slice(0, 4)), Number(normalized.slice(5, 7)), 0);
    } else if (id === "quarterly") {
      var quarter = /^(\d{4})-Q([1-4])$/.exec(normalized);
      start = calendarDate(Number(quarter[1]), (Number(quarter[2]) - 1) * 3, 1);
      end = calendarDate(Number(quarter[1]), (Number(quarter[2]) - 1) * 3 + 3, 0);
    } else {
      start = calendarDate(Number(normalized), 0, 1);
      end = calendarDate(Number(normalized), 12, 0);
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
  function recordName(file) {
    return String(file && (file.name || file.path || "")).split("/").pop().replace(/\.md$/i, "");
  }

  function recordFrontmatter(file) {
    if (!file || typeof file !== "object") return {};
    if (file.frontmatter && typeof file.frontmatter === "object") return file.frontmatter;
    if (file.metadata && file.metadata.frontmatter && typeof file.metadata.frontmatter === "object") return file.metadata.frontmatter;
    if (file.cache && file.cache.frontmatter && typeof file.cache.frontmatter === "object") return file.cache.frontmatter;
    return {};
  }

  function recordKeyFromFile(periodId, file) {
    var id = getPeriod(periodId).id;
    var frontmatter = recordFrontmatter(file);
    var start = frontmatter["journal-start-date"] || frontmatter.date || frontmatter.created;
    if (start) return periodKey(id, start);
    var name = recordName(file);
    var pattern = id === "monthly" ? /(\d{4}-\d{2})/ : id === "quarterly" ? /(\d{4}-Q[1-4])/i : /(?:^|\/)(\d{4})(?:\.md)?$/i;
    var match = name.match(pattern);
    return match ? periodKey(id, match[1]) : "";
  }

  function isCompletedRecord(file) {
    var frontmatter = recordFrontmatter(file);
    var status = frontmatter.status;
    if (status === undefined || status === null || String(status).trim() === "") return false;
    return ["completed", "complete", "validated", "approved", "saved", "done"].indexOf(String(status).trim().toLowerCase()) >= 0;
  }

  function directionValue(file) {
    var frontmatter = recordFrontmatter(file);
    var frontmatterKeys = ["direction", "next_direction", "next-month-direction", "next_month_direction", "next-quarter-direction", "next_quarter_direction", "next-year-direction", "next_year_direction"];
    for (var i = 0; i < frontmatterKeys.length; i++) {
      var value = frontmatter[frontmatterKeys[i]];
      if (value !== undefined) return String(value || "").trim();
    }
    var content = file && (file.content || file.text);
    if (typeof content !== "string") return null;
    var match = content.match(/^##\s+Next[^#\n]*Direction\s*\n([\s\S]*?)(?=^##\s+|\s*$)/im);
    if (!match) return "";
    var body = match[1].trim();
    return body && body !== "- 기록 없음" ? body : "";
  }

  function countRecordsInBounds(files, periodId, bounds, options) {
    var id = getPeriod(periodId).id;
    var folder = periodFolder(id);
    if (!folder || !bounds) return 0;
    var config = options || {};
    return (Array.isArray(files) ? files : []).filter(function (file) {
      if (!file || (file.extension && String(file.extension).toLowerCase() !== "md") || String(file.path || "").indexOf(folder + "/") !== 0) return false;
      var key = recordKeyFromFile(id, file);
      if (!key) return false;
      var recordBounds = periodBounds(id, key);
      if (recordBounds.end < bounds.start || recordBounds.start > bounds.end) return false;
      if (config.completed !== false && !isCompletedRecord(file)) return false;
      if (config.direction === true && directionValue(file) === "") return false;
      return true;
    }).length;
  }

  function directionSourcePeriod(periodId) {
    var id = getPeriod(periodId).id;
    return id === "quarterly" ? "monthly" : id === "yearly" ? "quarterly" : id;
  }

  function countDirectionRecords(files, periodId, bounds) {
    return countRecordsInBounds(files, directionSourcePeriod(periodId), bounds, { completed: true, direction: true });
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
    recordKeyFromFile: recordKeyFromFile,
    isCompletedRecord: isCompletedRecord,
    countRecordsInBounds: countRecordsInBounds,
    directionSourcePeriod: directionSourcePeriod,
    countDirectionRecords: countDirectionRecords,
    readiness: readiness
  });
  root.JournalPeriodCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
