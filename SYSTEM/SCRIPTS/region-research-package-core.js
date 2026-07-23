"use strict";

const SUPPORTED_SCHEMA_VERSION = 1;
const ALLOWED_RISK_KINDS = new Set(["official_fact", "ai_pending", "site_check"]);
const ALLOWED_SOURCE_TYPES = new Set(["official_primary"]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REGION_KEY_RE = /^.+-.+$/;

const SEARCH_URL_NEEDLES = Object.freeze([
  "google.com/search",
  "search.naver.com",
  "bing.com/search",
  "duckduckgo.com",
  "youtube.com/results",
  "/search?"
]);
// Query-string search-parameter detector.
// Match only when `q` is a real query key (start-of-query, preceded by `?`, `&`, or `#`),
// not a substring inside another key name like `lsiSeq` or `land_seq`.
// Anchored on `?[...&]q=` or `#[...&]q=` or `&q=`. Trailing value boundary is optional.
const SEARCH_PARAM_Q_RE = /[?&#]q=/iu;

// Top-level allowed keys
const PACKAGE_TOP_KEYS = Object.freeze(new Set([
  "schema_version",
  "region_key",
  "researched_at",
  "summary_pending",
  "zones_pending",
  "transport_life",
  "risks",
  "site_visit",
  "supply_pipeline",
  "sources",
  "unresolved",
  "research_log"
]));

const SUMMARY_KEYS = Object.freeze(new Set(["text", "source_ids"]));
const ZONE_KEYS = Object.freeze(new Set(["name", "character", "caution", "source_ids"]));
const TRANSPORT_KEYS = Object.freeze(new Set(["fact", "source_ids"]));
const RISK_KEYS = Object.freeze(new Set(["fact", "kind", "source_ids"]));
const SITE_KEYS = Object.freeze(new Set(["check", "reason", "source_ids"]));
const SUPPLY_PIPELINE_KEYS = Object.freeze(new Set(["project_name", "stage", "units", "expected_month", "source_ids"]));
const SOURCE_KEYS = Object.freeze(new Set(["source_id", "institution", "title", "url", "accessed_at", "source_type"]));
const RESEARCH_LOG_KEYS = Object.freeze(new Set(["scope", "limitations"]));
const SUPPLY_STAGES = Object.freeze({
  planned: { label: "계획", confidence: "낮음" },
  approved: { label: "승인", confidence: "보통" },
  under_construction: { label: "공사 중", confidence: "높음" }
});

// Markdown/HTML control needles that must never appear in any string field
const STRUCTURAL_NEEDLES = Object.freeze([
  "<script",
  "</script>",
  "<!--",
  "-->",
  "AI:PENDING:",
  "AUTO:REGION_",
  "HUMAN:",
  "PRODIGY_REGION_METRICS_",
  "<%",
  "%>",
  "```",
  "<!DOCTYPE",
  "<html",
  "<body",
  "<iframe"
]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function rejectUnknownKeys(obj, allowedSet, label) {
  if (!obj || typeof obj !== "object") throw new Error(`${label}가 객체가 아닙니다.`);
  for (const k of Object.keys(obj)) {
    if (!allowedSet.has(k)) {
      throw new Error(`${label}에 알 수 없는 필드가 있습니다: ${k}`);
    }
  }
  return true;
}

function validateNonEmptyString(value, label) {
  if (!isNonEmptyString(value)) throw new Error(`${label}은(는) 비어 있지 않은 문자열이어야 합니다.`);
  return true;
}

function rejectCRLF(value, label) {
  if (typeof value !== "string") return true;
  if (/[\r\n]/.test(value)) {
    throw new Error(`${label}에 CR/LF가 포함되어 있어 단일 행이 아닙니다.`);
  }
  return true;
}

function validateCalendarDate(value, label) {
  if (!isNonEmptyString(value) || !DATE_RE.test(value)) {
    throw new Error(`${label}은(는) YYYY-MM-DD 형식이어야 합니다: ${value}`);
  }
  const [y, m, d] = value.split("-").map((s) => Number(s));
  if (m < 1 || m > 12) throw new Error(`${label}이(가) 존재하지 않는 월입니다: ${value}`);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d < 1 || d > daysInMonth) {
    throw new Error(`${label}이(가) 존재하지 않는 날짜입니다: ${value}`);
  }
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
    throw new Error(`${label}이(가) 존재하지 않는 날짜입니다: ${value}`);
  }
  return true;
}

function validateRegionKey(value) {
  if (!isNonEmptyString(value) || !REGION_KEY_RE.test(value)) {
    throw new Error(`region_key 형식이 올바르지 않습니다: ${value}`);
  }
  return true;
}

function validateUrl(url, label) {
  if (!isNonEmptyString(url)) throw new Error(`${label} URL이 비어 있습니다.`);
  rejectCRLF(url, `${label} URL`);
  if (/[\s<>]/.test(url)) {
    throw new Error(`${label} URL에 공백/angle-bracket이 포함되어 있습니다: ${url}`);
  }
  let parsed;
  try { parsed = new URL(url); }
  catch { throw new Error(`${label} URL이 올바른 URL이 아닙니다: ${url}`); }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} URL은 https: 프로토콜이어야 합니다: ${url}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} URL에 username/password가 포함되어 있습니다: ${url}`);
  }
  const lower = url.toLowerCase();
  for (const needle of SEARCH_URL_NEEDLES) {
    if (lower.includes(needle)) throw new Error(`${label} URL이 검색 결과 URL로 보입니다: ${url}`);
  }
  if (SEARCH_PARAM_Q_RE.test(url)) {
    throw new Error(`${label} URL이 검색 결과 URL로 보입니다: ${url}`);
  }
  if (/[^\x00-\x7F]/.test(url)) {
    throw new Error(`${label} URL은 ASCII 직접 URL 또는 percent-encoded URL이어야 합니다: ${url}`);
  }
  return true;
}

function scanStructural(text, label) {
  if (typeof text !== "string") return true;
  const lower = text.toLowerCase();
  for (const needle of STRUCTURAL_NEEDLES) {
    if (lower.includes(needle.toLowerCase())) {
      throw new Error(`${label}에 금지된 구조 문자열이 감지됐습니다: ${needle}`);
    }
  }
  return true;
}

function escapeTableCell(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ");
}

function escapeInlineText(text) {
  // For prose lines (list items, blockquote lines). Disallow CR/LF — caller enforces single line.
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|");
}

function escapeProse(text) {
  // For prose lines (list items, blockquote lines). Disallow CR/LF — caller enforces single line.
  return String(text)
    .replace(/\r/g, " ")
    .replace(/\n/g, " ");
}

function validateSourceIdsNonEmpty(arr, label) {
  if (!Array.isArray(arr)) throw new Error(`${label}은(는) 배열이어야 합니다.`);
  if (arr.length < 1) throw new Error(`${label}은(는) 최소 1개의 source_id가 필요합니다.`);
  return true;
}

function validateSourceIds(references, sources, label) {
  validateSourceIdsNonEmpty(references, label);
  const validIds = new Set(sources.map((s) => s.source_id));
  for (const ref of references) {
    if (!isNonEmptyString(ref)) throw new Error(`${label}에 빈 source_id 참조가 있습니다.`);
    if (!validIds.has(ref)) throw new Error(`${label}이(가) 존재하지 않는 source_id를 참조합니다: ${ref}`);
  }
  return true;
}

function validateSource(source, index, sources) {
  if (!source || typeof source !== "object") throw new Error(`sources[${index}]가 객체가 아닙니다.`);
  rejectUnknownKeys(source, SOURCE_KEYS, `sources[${index}]`);
  validateNonEmptyString(source.source_id, `sources[${index}].source_id`);
  if (!/^S\d+$/.test(source.source_id)) throw new Error(`sources[${index}].source_id는 S1, S2 형식이어야 합니다: ${source.source_id}`);
  validateNonEmptyString(source.institution, `sources[${index}].institution`);
  validateNonEmptyString(source.title, `sources[${index}].title`);
  validateUrl(source.url, `sources[${index}].url`);
  validateCalendarDate(source.accessed_at, `sources[${index}].accessed_at`);
  if (!ALLOWED_SOURCE_TYPES.has(source.source_type)) {
    throw new Error(`sources[${index}].source_type은 v1에서 official_primary만 허용합니다: ${source.source_type}`);
  }
  rejectCRLF(source.institution, `sources[${index}].institution`);
  rejectCRLF(source.title, `sources[${index}].title`);
  scanStructural(source.institution, `sources[${index}].institution`);
  scanStructural(source.title, `sources[${index}].title`);
  scanStructural(source.url, `sources[${index}].url`);
  // title must not contain link-breaking sequences
  if (/]\(|]|\[|\(|\)/.test(source.title)) {
    throw new Error(`sources[${index}].title에 Markdown 링크 구조 파괴 문자가 포함되어 있습니다: ${source.title}`);
  }
  return true;
}

function validateZone(zone, index, sources) {
  if (!zone || typeof zone !== "object") throw new Error(`zones_pending[${index}]가 객체가 아닙니다.`);
  rejectUnknownKeys(zone, ZONE_KEYS, `zones_pending[${index}]`);
  validateNonEmptyString(zone.name, `zones_pending[${index}].name`);
  validateNonEmptyString(zone.character, `zones_pending[${index}].character`);
  validateNonEmptyString(zone.caution, `zones_pending[${index}].caution`);
  validateSourceIds(zone.source_ids, sources, `zones_pending[${index}].source_ids`);
  rejectCRLF(zone.name, `zones_pending[${index}].name`);
  rejectCRLF(zone.character, `zones_pending[${index}].character`);
  rejectCRLF(zone.caution, `zones_pending[${index}].caution`);
  scanStructural(zone.name, `zones_pending[${index}].name`);
  scanStructural(zone.character, `zones_pending[${index}].character`);
  scanStructural(zone.caution, `zones_pending[${index}].caution`);
  return true;
}

function validateTransportLife(item, index, sources) {
  if (!item || typeof item !== "object") throw new Error(`transport_life[${index}]가 객체가 아닙니다.`);
  rejectUnknownKeys(item, TRANSPORT_KEYS, `transport_life[${index}]`);
  validateNonEmptyString(item.fact, `transport_life[${index}].fact`);
  validateSourceIds(item.source_ids, sources, `transport_life[${index}].source_ids`);
  rejectCRLF(item.fact, `transport_life[${index}].fact`);
  scanStructural(item.fact, `transport_life[${index}].fact`);
  return true;
}

function validateRisk(risk, index, sources) {
  if (!risk || typeof risk !== "object") throw new Error(`risks[${index}]가 객체가 아닙니다.`);
  rejectUnknownKeys(risk, RISK_KEYS, `risks[${index}]`);
  validateNonEmptyString(risk.fact, `risks[${index}].fact`);
  if (!ALLOWED_RISK_KINDS.has(risk.kind)) {
    throw new Error(`risks[${index}].kind가 허용값이 아닙니다: ${risk.kind} (허용: ${[...ALLOWED_RISK_KINDS].join(", ")})`);
  }
  validateSourceIds(risk.source_ids, sources, `risks[${index}].source_ids`);
  rejectCRLF(risk.fact, `risks[${index}].fact`);
  scanStructural(risk.fact, `risks[${index}].fact`);
  return true;
}

function validateSiteVisit(item, index, sources) {
  if (!item || typeof item !== "object") throw new Error(`site_visit[${index}]가 객체가 아닙니다.`);
  rejectUnknownKeys(item, SITE_KEYS, `site_visit[${index}]`);
  validateNonEmptyString(item.check, `site_visit[${index}].check`);
  validateNonEmptyString(item.reason, `site_visit[${index}].reason`);
  validateSourceIds(item.source_ids, sources, `site_visit[${index}].source_ids`);
  rejectCRLF(item.check, `site_visit[${index}].check`);
  rejectCRLF(item.reason, `site_visit[${index}].reason`);
  scanStructural(item.check, `site_visit[${index}].check`);
  scanStructural(item.reason, `site_visit[${index}].reason`);
  return true;
}

function monthOffset(fromDate, toMonth) {
  const [fromYear, fromMonth] = fromDate.slice(0, 7).split("-").map(Number);
  const [toYear, toMonthNumber] = toMonth.split("-").map(Number);
  return (toYear - fromYear) * 12 + toMonthNumber - fromMonth;
}

function validateSupplyPipeline(items, pkg) {
  if (items === undefined) return true;
  if (!Array.isArray(items)) throw new Error("supply_pipeline은 배열이어야 합니다.");
  const seen = new Set();
  items.forEach((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`supply_pipeline[${index}]가 객체가 아닙니다.`);
    rejectUnknownKeys(item, SUPPLY_PIPELINE_KEYS, `supply_pipeline[${index}]`);
    validateNonEmptyString(item.project_name, `supply_pipeline[${index}].project_name`);
    rejectCRLF(item.project_name, `supply_pipeline[${index}].project_name`);
    scanStructural(item.project_name, `supply_pipeline[${index}].project_name`);
    if (!Object.hasOwn(SUPPLY_STAGES, item.stage)) throw new Error(`supply_pipeline[${index}].stage 단계가 허용값이 아닙니다.`);
    if (!Number.isInteger(item.units) || item.units <= 0) throw new Error(`supply_pipeline[${index}].units는 양의 정수여야 합니다.`);
    if (!/^\d{4}-\d{2}$/.test(item.expected_month) || Number(item.expected_month.slice(5, 7)) < 1 || Number(item.expected_month.slice(5, 7)) > 12) {
      throw new Error(`supply_pipeline[${index}].expected_month는 YYYY-MM 형식이어야 합니다.`);
    }
    const offset = monthOffset(pkg.researched_at, item.expected_month);
    if (offset < 25 || offset > 60) throw new Error(`supply_pipeline[${index}]은 조사일 기준 25~60개월 범위여야 합니다.`);
    validateSourceIds(item.source_ids, pkg.sources, `supply_pipeline[${index}].source_ids`);
    const duplicateKey = `${item.project_name}\u0000${item.expected_month}`;
    if (seen.has(duplicateKey)) throw new Error(`supply_pipeline 중복 사업/예정월: ${item.project_name}`);
    seen.add(duplicateKey);
  });
  return true;
}

function validatePackage(pkg) {
  if (!pkg || typeof pkg !== "object") throw new Error("package가 객체가 아닙니다.");
  rejectUnknownKeys(pkg, PACKAGE_TOP_KEYS, "package");
  if (pkg.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`지원하지 않는 schema_version: ${pkg.schema_version} (지원: ${SUPPORTED_SCHEMA_VERSION})`);
  }
  validateRegionKey(pkg.region_key);
  validateCalendarDate(pkg.researched_at, "researched_at");

  if (!Array.isArray(pkg.sources)) throw new Error("sources는 배열이어야 합니다.");
  if (pkg.sources.length < 1) throw new Error("sources는 최소 1개 필요합니다.");
  if (pkg.sources.length > 8) throw new Error("sources는 최대 8개 권장 (v1 허용 한도 초과).");
  const seenIds = new Set();
  pkg.sources.forEach((s, i) => {
    validateSource(s, i, pkg.sources);
    if (seenIds.has(s.source_id)) throw new Error(`source_id 중복: ${s.source_id}`);
    seenIds.add(s.source_id);
  });

  if (!pkg.summary_pending || typeof pkg.summary_pending !== "object") throw new Error("summary_pending이 객체가 아닙니다.");
  rejectUnknownKeys(pkg.summary_pending, SUMMARY_KEYS, "summary_pending");
  validateNonEmptyString(pkg.summary_pending.text, "summary_pending.text");
  validateSourceIds(pkg.summary_pending.source_ids, pkg.sources, "summary_pending.source_ids");
  rejectCRLF(pkg.summary_pending.text, "summary_pending.text");
  scanStructural(pkg.summary_pending.text, "summary_pending.text");

  if (!Array.isArray(pkg.zones_pending)) throw new Error("zones_pending은 배열이어야 합니다.");
  if (pkg.zones_pending.length < 3 || pkg.zones_pending.length > 6) {
    throw new Error(`zones_pending은 3~6개여야 합니다: ${pkg.zones_pending.length}`);
  }
  pkg.zones_pending.forEach((z, i) => validateZone(z, i, pkg.sources));

  if (!Array.isArray(pkg.transport_life)) throw new Error("transport_life는 배열이어야 합니다.");
  if (pkg.transport_life.length < 1) throw new Error("transport_life는 최소 1개 필요합니다.");
  pkg.transport_life.forEach((t, i) => validateTransportLife(t, i, pkg.sources));

  if (!Array.isArray(pkg.risks)) throw new Error("risks는 배열이어야 합니다.");
  if (pkg.risks.length < 1) throw new Error("risks는 최소 1개 필요합니다.");
  pkg.risks.forEach((r, i) => validateRisk(r, i, pkg.sources));

  if (!Array.isArray(pkg.site_visit)) throw new Error("site_visit은 배열이어야 합니다.");
  if (pkg.site_visit.length < 1) throw new Error("site_visit은 최소 1개 필요합니다.");
  pkg.site_visit.forEach((s, i) => validateSiteVisit(s, i, pkg.sources));
  validateSupplyPipeline(pkg.supply_pipeline, pkg);

  if (!Array.isArray(pkg.unresolved)) throw new Error("unresolved는 배열이어야 합니다.");
  pkg.unresolved.forEach((u, i) => {
    validateNonEmptyString(u, `unresolved[${i}]`);
    rejectCRLF(u, `unresolved[${i}]`);
    scanStructural(u, `unresolved[${i}]`);
  });

  if (!pkg.research_log || typeof pkg.research_log !== "object") throw new Error("research_log가 객체가 아닙니다.");
  rejectUnknownKeys(pkg.research_log, RESEARCH_LOG_KEYS, "research_log");
  validateNonEmptyString(pkg.research_log.scope, "research_log.scope");
  validateNonEmptyString(pkg.research_log.limitations, "research_log.limitations");
  rejectCRLF(pkg.research_log.scope, "research_log.scope");
  rejectCRLF(pkg.research_log.limitations, "research_log.limitations");
  scanStructural(pkg.research_log.scope, "research_log.scope");
  scanStructural(pkg.research_log.limitations, "research_log.limitations");

  // unused sources detection (v1: reject)
  const referenced = new Set();
  const collect = (arr) => { if (Array.isArray(arr)) arr.forEach((o) => (o.source_ids || []).forEach((id) => referenced.add(id))); };
  collect([pkg.summary_pending]);
  collect(pkg.zones_pending);
  collect(pkg.transport_life);
  collect(pkg.risks);
  collect(pkg.site_visit);
  collect(pkg.supply_pipeline);
  for (const s of pkg.sources) {
    if (!referenced.has(s.source_id)) {
      throw new Error(`사용되지 않는 source가 있습니다: ${s.source_id} (${s.title})`);
    }
  }

  // forbidden metrics/verification/frontmatter fields — already rejected by PACKAGE_TOP_KEYS,
  // but double-check defensively for the common names.
  const forbiddenKeys = ["metrics", "sale_volume_3m", "housing_stock", "verification_status", "metrics_as_of", "frontmatter"];
  for (const k of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(pkg, k)) {
      throw new Error(`금지된 필드가 package에 있습니다: ${k} (research package는 metrics/verification/frontmatter를 다루지 않습니다)`);
    }
  }

  return true;
}

function renderSourcesBlock(sources) {
  const lines = sources.map((s) => {
    const inst = escapeInlineText(s.institution);
    const title = escapeInlineText(s.title);
    return `- **${s.source_id} · ${inst}** — ${title} · <${s.url}> · 조회 ${s.accessed_at}`;
  });
  return lines.join("\n");
}

function renderSummaryBlock(pkg) {
  const ids = pkg.summary_pending.source_ids.map((id) => `[${id}]`).join("");
  const text = escapeProse(pkg.summary_pending.text);
  return `> **AI 제안 · 확인 필요:** ${text} ${ids}`.trimEnd();
}

function renderZonesBlock(pkg) {
  const header = "> **AI 권역 후보 · 확인 필요:** 공식 행정동·교통·생활권 기반 후보. HUMAN 표로 승인되기 전에는 확정 권역이 아니다.";
  const rows = pkg.zones_pending.map((z) => {
    const ids = z.source_ids.map((id) => `[${id}]`).join("");
    const name = escapeTableCell(z.name);
    const character = escapeTableCell(z.character);
    const caution = escapeTableCell(z.caution) + " " + ids;
    return `| ${name} | ${character} | ${caution} |`;
  });
  return [header, "", "| 후보 권역 | 성격 후보 | 주의 · 확인 필요 |", "|---|---|---|", ...rows].join("\n");
}

function renderTransportLifeBlock(pkg) {
  const lines = pkg.transport_life.map((t) => {
    const ids = t.source_ids.map((id) => `[${id}]`).join("");
    const fact = escapeProse(t.fact);
    return `- ${fact} ${ids}`;
  });
  return ["> 공식 자료 확인 · 조사일 " + pkg.researched_at, "", ...lines].join("\n");
}

function renderRisksBlock(pkg) {
  const official = pkg.risks.filter((r) => r.kind === "official_fact");
  const pending = pkg.risks.filter((r) => r.kind === "ai_pending");
  const siteCheck = pkg.risks.filter((r) => r.kind === "site_check");
  const lines = [];
  if (official.length) {
    lines.push("> **공식 확인 사실 (validator는 구조만 검증; 의미 검토는 통합 검토 담당)**:");
    for (const r of official) {
      const ids = r.source_ids.map((id) => `[${id}]`).join("");
      const fact = escapeProse(r.fact);
      lines.push(`- ${fact} ${ids}`);
    }
  }
  if (pending.length) {
    lines.push("> **AI 제안 · 확인 필요**:");
    for (const r of pending) {
      const ids = r.source_ids.map((id) => `[${id}]`).join("");
      const fact = escapeProse(r.fact);
      lines.push(`- ${fact} ${ids}`);
    }
  }
  if (siteCheck.length) {
    lines.push("> **현장 확인 필요**:");
    for (const r of siteCheck) {
      const ids = r.source_ids.map((id) => `[${id}]`).join("");
      const fact = escapeProse(r.fact);
      lines.push(`- ${fact} ${ids}`);
    }
  }
  return lines.join("\n");
}

function renderSiteVisitBlock(pkg) {
  const lines = pkg.site_visit.map((s) => {
    const ids = s.source_ids.map((id) => `[${id}]`).join("");
    const check = escapeProse(s.check);
    const reason = escapeProse(s.reason);
    return `- [ ] ${check} — ${reason} ${ids}`;
  });
  return lines.join("\n");
}

function renderSupplyPipelineBlock(pkg) {
  const items = pkg.supply_pipeline ?? [];
  if (items.length === 0) return "> **AI 제안 · 확인 필요:** 25~60개월 공식 사업 파이프라인은 별도 검증 전이다.";
  const bucket = (item) => {
    const offset = monthOffset(pkg.researched_at, item.expected_month);
    if (offset <= 36) return "25~36개월";
    if (offset <= 48) return "37~48개월";
    return "49~60개월";
  };
  const rows = items.slice().sort((left, right) => left.expected_month.localeCompare(right.expected_month)).map((item) => {
    const stage = SUPPLY_STAGES[item.stage];
    const ids = item.source_ids.map((id) => `[${id}]`).join("");
    return `| ${bucket(item)} | ${escapeTableCell(item.project_name)} | ${item.expected_month} | ${new Intl.NumberFormat("ko-KR").format(item.units)}세대 | ${stage.label} · 확정도 ${stage.confidence} ${ids} |`;
  });
  return ["> **AI 제안 · 확인 필요:** 확정 입주물량과 분리된 25~60개월 공식 사업 후보다.", "", "| 기간 | 사업 | 예정월 | 세대수 | 단계 · 확정도 |", "|---|---|---|---:|---|", ...rows].join("\n");
}

function renderResearchLogBlock(pkg) {
  const unresolvedLines = pkg.unresolved.map((u) => `  - 미확인: ${escapeProse(u)}`);
  return [
    `- ${pkg.researched_at} · 공식 1차 출처 기반 사전조사`,
    `  - 범위: ${escapeProse(pkg.research_log.scope)}`,
    `  - 한계: ${escapeProse(pkg.research_log.limitations)}`,
    ...(unresolvedLines.length ? unresolvedLines : [])
  ].join("\n");
}

function renderAllBlocks(pkg) {
  return {
    "AI:PENDING:SUMMARY": renderSummaryBlock(pkg),
    "AI:PENDING:ZONES": renderZonesBlock(pkg),
    "AI:PENDING:TRANSPORT_LIFE": renderTransportLifeBlock(pkg),
    "AI:PENDING:RISKS": renderRisksBlock(pkg),
    "AI:PENDING:SITE_VISIT": renderSiteVisitBlock(pkg),
    "AI:PENDING:SUPPLY_PIPELINE": renderSupplyPipelineBlock(pkg),
    "AUTO:REGION_RESEARCH_SOURCES": renderSourcesBlock(pkg.sources),
    "AUTO:REGION_RESEARCH_LOG": renderResearchLogBlock(pkg)
  };
}

const BLOCK_START_MARKERS = Object.freeze({
  "AI:PENDING:SUMMARY": "<!-- AI:PENDING:SUMMARY:START -->",
  "AI:PENDING:ZONES": "<!-- AI:PENDING:ZONES:START -->",
  "AI:PENDING:TRANSPORT_LIFE": "<!-- AI:PENDING:TRANSPORT_LIFE:START -->",
  "AI:PENDING:RISKS": "<!-- AI:PENDING:RISKS:START -->",
  "AI:PENDING:SITE_VISIT": "<!-- AI:PENDING:SITE_VISIT:START -->",
  "AI:PENDING:SUPPLY_PIPELINE": "<!-- AI:PENDING:SUPPLY_PIPELINE:START -->",
  "AUTO:REGION_RESEARCH_SOURCES": "<!-- AUTO:REGION_RESEARCH_SOURCES:START -->",
  "AUTO:REGION_RESEARCH_LOG": "<!-- AUTO:REGION_RESEARCH_LOG:START -->"
});

const BLOCK_END_MARKERS = Object.freeze({
  "AI:PENDING:SUMMARY": "<!-- AI:PENDING:SUMMARY:END -->",
  "AI:PENDING:ZONES": "<!-- AI:PENDING:ZONES:END -->",
  "AI:PENDING:TRANSPORT_LIFE": "<!-- AI:PENDING:TRANSPORT_LIFE:END -->",
  "AI:PENDING:RISKS": "<!-- AI:PENDING:RISKS:END -->",
  "AI:PENDING:SITE_VISIT": "<!-- AI:PENDING:SITE_VISIT:END -->",
  "AI:PENDING:SUPPLY_PIPELINE": "<!-- AI:PENDING:SUPPLY_PIPELINE:END -->",
  "AUTO:REGION_RESEARCH_SOURCES": "<!-- AUTO:REGION_RESEARCH_SOURCES:END -->",
  "AUTO:REGION_RESEARCH_LOG": "<!-- AUTO:REGION_RESEARCH_LOG:END -->"
});

const BLOCK_ORDER = Object.freeze([
  "AI:PENDING:SUMMARY",
  "AI:PENDING:ZONES",
  "AI:PENDING:TRANSPORT_LIFE",
  "AI:PENDING:RISKS",
  "AI:PENDING:SITE_VISIT",
  "AI:PENDING:SUPPLY_PIPELINE",
  "AUTO:REGION_RESEARCH_SOURCES",
  "AUTO:REGION_RESEARCH_LOG"
]);

module.exports = Object.freeze({
  SUPPORTED_SCHEMA_VERSION,
  ALLOWED_RISK_KINDS,
  ALLOWED_SOURCE_TYPES,
  BLOCK_ORDER,
  BLOCK_START_MARKERS,
  BLOCK_END_MARKERS,
  PACKAGE_TOP_KEYS,
  SUMMARY_KEYS,
  ZONE_KEYS,
  TRANSPORT_KEYS,
  RISK_KEYS,
  SITE_KEYS,
  SUPPLY_PIPELINE_KEYS,
  SUPPLY_STAGES,
  SOURCE_KEYS,
  RESEARCH_LOG_KEYS,
  validatePackage,
  validateCalendarDate,
  validateUrl,
  validateSupplyPipeline,
  rejectUnknownKeys,
  escapeTableCell,
  escapeInlineText,
  escapeProse,
  renderAllBlocks,
  renderSourcesBlock,
  renderSummaryBlock,
  renderZonesBlock,
  renderTransportLifeBlock,
  renderRisksBlock,
  renderSiteVisitBlock,
  renderSupplyPipelineBlock,
  renderResearchLogBlock
});
