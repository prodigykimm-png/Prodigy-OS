"use strict";

const PROJECT_TOKENS = /(재건축|재개발|정비사업|정비구역|사업시행|관리처분|주택재개발|도시정비|아파트)/;
const NEGATIVE_NEAR = /(세대당|비율|평균|이상|이하|기준|이상인|미만)/;

function clean(html) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function nearby(text, index, radius) {
  return text.slice(Math.max(0, index - radius), index + radius);
}

function candidates(body) {
  const found = [];
  for (const match of body.matchAll(/([0-9][0-9,]{1,6})\s*세대/g)) {
    const units = Number(match[1].replace(/,/g, ""));
    found.push({
      units,
      index: match.index,
      raw: match[0],
      lead: nearby(body, match.index, 18),
      window: nearby(body, match.index, 220)
    });
  }
  return found;
}

function extractScale(html, options = {}) {
  const body = clean(html);
  if (body.length < 20) return { units: null, reason: "body_too_short" };
  const windowRadius = Number(options.windowRadius ?? 220);
  const list = candidates(body).map((item) => {
    const lead = nearby(body, item.index, 18);
    const window = nearby(body, item.index, windowRadius);
    if (NEGATIVE_NEAR.test(lead)) return { ...item, verdict: "rejected_near_negative", window };
    if (item.units < 20 || item.units > 20000) return { ...item, verdict: "rejected_range", window };
    if (!PROJECT_TOKENS.test(window)) return { ...item, verdict: "rejected_no_project_context", window };
    return { ...item, verdict: "accepted", window };
  });
  const accepted = list.filter((item) => item.verdict === "accepted");
  if (accepted.length === 0) {
    return {
      units: null,
      reason: list.length > 0 ? list[0].verdict : "no_units_pattern",
      inspected: list.length,
      samples: list.slice(0, 3).map((item) => ({ raw: item.raw, verdict: item.verdict, window: item.window.slice(0, 90) }))
    };
  }
  const distinct = [...new Set(accepted.map((item) => item.units))];
  if (distinct.length > 1 && options.requireUnique !== true) {
    const best = accepted[0];
    return {
      units: best.units,
      confidence: "ambiguous_multiple_projects",
      candidates: distinct.slice(0, 6),
      evidence: best.window.slice(0, 160),
      note: "같은 페이지에 여러 사업 규모가 있습니다. 대표값만 기록했습니다."
    };
  }
  const best = accepted[0];
  return {
    units: best.units,
    confidence: distinct.length > 1 ? "single" : "unique",
    candidates: distinct,
    evidence: best.window.slice(0, 160)
  };
}

function extractArea(html, options = {}) {
  const body = clean(html);
  const windowRadius = Number(options.windowRadius ?? 220);
  const out = {};
  const rules = {
    gross: /연\s*면\s*적\s*[:：]?\s*([0-9][0-9,.]*)\s*(?:[㎡m²])/,
    site: /대지면적\s*[:：]?\s*([0-9][0-9,.]*)\s*(?:[㎡m²])/,
    floorArea: /건축면적\s*[:：]?\s*([0-9][0-9,.]*)\s*(?:[㎡m²])/
  };
  for (const [key, re] of Object.entries(rules)) {
    const m = re.exec(body);
    if (!m) continue;
    const window = nearby(body, m.index, windowRadius);
    if (!PROJECT_TOKENS.test(window)) continue;
    const value = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) out[key] = value;
  }
  return out;
}

module.exports = Object.freeze({ clean, extractScale, extractArea, candidates, PROJECT_TOKENS: PROJECT_TOKENS.source, NEGATIVE_NEAR: NEGATIVE_NEAR.source });
