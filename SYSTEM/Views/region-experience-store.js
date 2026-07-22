(function (root) {
  "use strict";

  const TARGET_FOLDER = "PARA/RESOURCES/Auction Regions";
  const DAILY_FOLDER = "DAILY/DAILY";
  const PROVENANCE_PREFIX = "REGION_EXPERIENCE_PROVENANCE:";
  const contract = root.RegionExperienceContract || (typeof require === "function" ? require("./region-experience-contract.js") : null);
  const journalCore = root.JournalCore || (typeof require === "function" ? require("./journal-core.js") : null);
  const CATEGORY_SECTIONS = contract && contract.CATEGORY_SECTIONS;
  const CATEGORY_MARKERS = Object.freeze({
    transport_life: { heading: "교통·생활", marker: "<!-- HUMAN -->", pendingStart: "<!-- AI:PENDING:TRANSPORT_LIFE:START -->", pendingEnd: "<!-- AI:PENDING:TRANSPORT_LIFE:END -->" },
    risk: { heading: "리스크·주의", marker: "<!-- HUMAN -->", pendingStart: "<!-- AI:PENDING:RISKS:START -->", pendingEnd: "<!-- AI:PENDING:RISKS:END -->" },
    site_visit: { heading: "임장 포인트", marker: "<!-- HUMAN:OWNED -->", pendingStart: "<!-- AI:PENDING:SITE_VISIT:START -->", pendingEnd: "<!-- AI:PENDING:SITE_VISIT:END -->" },
    supply_observation: { heading: "임장 포인트", marker: "<!-- HUMAN:OWNED -->", pendingStart: "<!-- AI:PENDING:SITE_VISIT:START -->", pendingEnd: "<!-- AI:PENDING:SITE_VISIT:END -->" }
  });
  const REQUEST_KEYS = Object.freeze(["human_confirmed", "region", "candidate", "committed_daily_path", "committed_evidence_id"]);
  const REGION_KEYS = Object.freeze(["type", "region_key", "region_sido", "region_sigungu", "path", "wiki_link"]);
  const CANDIDATE_KEYS = Object.freeze(["category", "section", "text", "source_evidence_ids", "epistemic_status", "review_status", "inference_notice"]);

  function assertPlainObject(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`); }

  function assertExactKeys(value, allowed, label) {
    assertPlainObject(value, label);
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    const missing = allowed.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
    if (unknown.length || missing.length) throw new Error(`${label} has invalid keys.`);
  }

  function requiredText(value, label) { if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`); return value.trim(); }

  function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function exactLineMatches(content, line, start, end) {
    const matches = [];
    const expression = new RegExp(`^${escapeRegExp(line)}\\r?$`, "gm");
    let match;
    while ((match = expression.exec(content))) {
      if (match.index >= (start || 0) && match.index < (end === undefined ? content.length : end)) {
        matches.push({ start: match.index, end: match.index + match[0].length });
      }
    }
    return matches;
  }

  function isCalendarDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number), date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function normalizeDailyPath(value) {
    const path = requiredText(value, "committed_daily_path"), match = new RegExp(`^${escapeRegExp(DAILY_FOLDER)}/(\\d{4}-\\d{2}-\\d{2})\\.md$`).exec(path);
    if (!match || !isCalendarDate(match[1])) throw new Error("committed Daily path must be canonical.");
    return path;
  }

  function normalizeEvidenceId(value) {
    const evidenceId = requiredText(value, "committed_evidence_id");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(evidenceId)) throw new Error("committed evidence_id is invalid.");
    return evidenceId;
  }

  function normalizeRegion(region) {
    assertExactKeys(region, REGION_KEYS, "region");
    if (region.type !== "auction_region") throw new Error("region.type must be auction_region.");
    const regionKey = requiredText(region.region_key, "region.region_key");
    const sido = requiredText(region.region_sido, "region.region_sido");
    const sigungu = requiredText(region.region_sigungu, "region.region_sigungu");
    if (/[\\/\[\]<>`\r\n]/.test(regionKey) || regionKey !== `${sido}-${sigungu}` || regionKey.split("-").length !== 2) {
      throw new Error("region identity is invalid.");
    }
    const expectedPath = `${TARGET_FOLDER}/${regionKey}.md`;
    if (region.path !== expectedPath) throw new Error("region.path must be canonical.");
    const expectedWiki = `[[${expectedPath.slice(0, -3)}]]`;
    if (region.wiki_link !== expectedWiki) throw new Error("region.wiki_link must be canonical.");
    return Object.freeze({ type: "auction_region", region_key: regionKey, region_sido: sido, region_sigungu: sigungu, path: expectedPath, wiki_link: expectedWiki });
  }

  function assertNoOfficialSupplyFigure(text) {
    const quantity = "(?:\\d{1,3}(?:,\\d{3})*|\\d+|[영공일이삼사오육칠팔구십백천만억조]+)";
    const figure = new RegExp(`(?:공식|통계|공공)\\s*(?:공급|세대|입주)|(?:공급|입주)\\s*(?:예정|물량|계획)?\\s*[:：]?\\s*${quantity}\\s*(?:세대|가구|호|동)?|${quantity}\\s*(?:세대|가구|호|동)\\s*(?:(?:공급|입주)\\s*)?(?:예정|물량|계획)`, "i");
    if (figure.test(text)) throw new Error("candidate.text cannot contain official supply figures.");
  }

  function assertNoPromptInjection(text) {
    const promptInstruction = /(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|above|system|developer)\s+(?:instructions?|prompts?|rules?)|\b(?:system prompt|developer message)\b|이전\s*(?:지시|명령|규칙).{0,16}(?:무시|덮어)|(?:시스템|개발자)\s*(?:프롬프트|메시지)/i;
    if (promptInstruction.test(text)) throw new Error("candidate.text contains unsafe prompt-injection instructions.");
  }

  function normalizeCandidate(candidate, evidenceId) {
    assertExactKeys(candidate, CANDIDATE_KEYS, "candidate");
    const category = candidate.category;
    const rule = CATEGORY_MARKERS[category];
    if (!rule || !CATEGORY_SECTIONS || CATEGORY_SECTIONS[category] !== rule.heading || candidate.section !== rule.heading) {
      throw new Error("candidate category mapping is invalid.");
    }
    if (!Array.isArray(candidate.source_evidence_ids) || candidate.source_evidence_ids.length !== 1 || candidate.source_evidence_ids[0] !== evidenceId) {
      throw new Error("candidate source provenance must match committed evidence_id.");
    }
    if (!contract || typeof contract.safeProse !== "function") throw new Error("Region Experience contract is unavailable.");
    const text = contract.safeProse(candidate.text, "candidate.text", true).trim();
    if (/\r|\n/.test(text)) throw new Error("candidate.text contains unsafe line structure.");
    assertNoPromptInjection(text);
    assertNoOfficialSupplyFigure(text);
    const isInference = candidate.epistemic_status === "user_inference";
    if (!(candidate.epistemic_status === "direct_observation" || isInference)) throw new Error("candidate.epistemic_status is invalid.");
    if (candidate.review_status !== (isInference ? "pending" : "ready")) throw new Error("candidate.review_status is invalid.");
    if (candidate.inference_notice !== (isInference ? "사용자 해석 · 확인 필요" : "")) throw new Error("candidate.inference_notice is invalid.");
    return Object.freeze({ category, text, rule });
  }

  function normalizeAppendRequest(value) {
    assertExactKeys(value, REQUEST_KEYS, "Region Experience append request");
    if (value.human_confirmed !== true) throw new Error("human_confirmed must be true.");
    const dailyPath = normalizeDailyPath(value.committed_daily_path);
    const evidenceId = normalizeEvidenceId(value.committed_evidence_id);
    const normalized = {
      human_confirmed: true,
      region: normalizeRegion(value.region),
      candidate: normalizeCandidate(value.candidate, evidenceId),
      committed_daily_path: dailyPath,
      committed_evidence_id: evidenceId
    };
    return Object.freeze(normalized);
  }

  function isExistingTFile(file) {
    if (!file || typeof file.path !== "string" || file.extension !== "md" || Array.isArray(file.children)) return false;
    const TFile = root.obsidian && root.obsidian.TFile;
    return typeof TFile !== "function" || file instanceof TFile;
  }

  function requireTFile(app, path, label) {
    const file = app && app.vault && typeof app.vault.getAbstractFileByPath === "function" ? app.vault.getAbstractFileByPath(path) : null;
    if (!isExistingTFile(file) || file.path !== path) throw new Error(`${label} must resolve to an existing TFile.`);
    return file;
  }

  function frontmatterBlock(content) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
    if (!match) throw new Error("target frontmatter is malformed.");
    return match[1];
  }

  function frontmatterScalar(frontmatter, key) {
    const expression = new RegExp(`^${escapeRegExp(key)}:[\\t ]*([^\\r\\n]*)\\r?$`, "gm");
    const values = [];
    let match;
    while ((match = expression.exec(frontmatter))) values.push(match[1].trim());
    if (values.length !== 1 || !values[0]) throw new Error(`target frontmatter ${key} is malformed.`);
    const value = values[0];
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    if (value.startsWith("\"") || value.startsWith("'")) throw new Error(`target frontmatter ${key} is malformed.`);
    return value;
  }

  function optionalFrontmatterScalar(frontmatter, key) {
    const expression = new RegExp(`^${escapeRegExp(key)}:[\\t ]*([^\\r\\n]*)\\r?$`, "gm");
    const values = [];
    let match;
    while ((match = expression.exec(frontmatter))) values.push(match[1].trim());
    if (!values.length) return "";
    if (values.length !== 1 || !values[0]) throw new Error(`target frontmatter ${key} is malformed.`);
    return values[0];
  }

  function assertTargetIdentity(content, region) {
    const frontmatter = frontmatterBlock(content);
    if (frontmatterScalar(frontmatter, "type") !== "auction_region") throw new Error("target frontmatter type must be auction_region.");
    const sido = frontmatterScalar(frontmatter, "region_sido");
    const sigungu = frontmatterScalar(frontmatter, "region_sigungu");
    const derivedKey = `${sido}-${sigungu}`;
    const declaredKey = optionalFrontmatterScalar(frontmatter, "region_key");
    if (derivedKey !== region.region_key || sido !== region.region_sido || sigungu !== region.region_sigungu || (declaredKey && declaredKey !== region.region_key)) {
      throw new Error("target frontmatter region identity does not match the approved Region.");
    }
  }

  function targetSection(content, rule) {
    const headings = exactLineMatches(content, `## ${rule.heading}`);
    if (headings.length !== 1) throw new Error("target heading must occur exactly once.");
    const heading = headings[0];
    const h2Expression = /^## [^\r\n]*\r?$/gm;
    let nextHeading = content.length;
    let match;
    while ((match = h2Expression.exec(content))) {
      if (match.index > heading.start) {
        nextHeading = match.index;
        break;
      }
    }
    const startMarkers = exactLineMatches(content, rule.pendingStart, heading.end, nextHeading);
    const endMarkers = exactLineMatches(content, rule.pendingEnd, heading.end, nextHeading);
    const humanMarkers = exactLineMatches(content, rule.marker, heading.end, nextHeading);
    if (startMarkers.length !== 1 || endMarkers.length !== 1 || humanMarkers.length !== 1) {
      throw new Error("target marker structure must occur exactly once.");
    }
    if (!(startMarkers[0].start < endMarkers[0].start && endMarkers[0].start < humanMarkers[0].start)) {
      throw new Error("target marker order is invalid.");
    }
    return humanMarkers[0];
  }

  function dailyWikiLink(path) { return `[[${path.slice(0, -3)}]]`; }

  function provenanceComment(dailyPath, evidenceId) { return `<!-- ${PROVENANCE_PREFIX}${dailyPath}#${evidenceId} -->`; }

  function canonicalEvidenceIdentity(evidenceId) { return `<!-- evidence_id: ${evidenceId} -->`; }

  function assertSupplyObservationMatchesCommittedEvidence(current, request) {
    if (request.candidate.category !== "supply_observation") return;
    if (!journalCore || typeof journalCore.parseDailyEvidenceBlocks !== "function") throw new Error("저장된 Daily Evidence를 해석하지 못했습니다. Evidence를 다시 저장해 주세요.");
    const day = request.committed_daily_path.slice(DAILY_FOLDER.length + 1, -3);
    const blocks = journalCore.parseDailyEvidenceBlocks(current, day).filter((block) => block && !block.legacy && block.evidence_id === request.committed_evidence_id);
    if (blocks.length !== 1 || blocks[0].experience !== request.candidate.text) {
      throw new Error("supply_observation은 저장된 Daily Evidence Experience와 정확히 일치해야 합니다.");
    }
  }

  function assertCommittedDailyEvidence(current, request) {
    if (typeof current !== "string" || exactLineMatches(current, canonicalEvidenceIdentity(request.committed_evidence_id)).length !== 1) {
      throw new Error("저장된 Daily Evidence를 현재 확인하지 못했습니다. Evidence를 다시 저장해 주세요.");
    }
    assertSupplyObservationMatchesCommittedEvidence(current, request);
  }

  async function requireCommittedDailyEvidence(app, dailyFile, request) {
    if (!app || !app.vault || typeof app.vault.read !== "function") throw new Error("Daily Evidence를 확인할 수 없습니다. Evidence를 다시 저장해 주세요.");
    const current = await app.vault.read(dailyFile);
    assertCommittedDailyEvidence(current, request);
    return current;
  }

  function renderedEntry(request) {
    return `- ${request.candidate.text} · 근거: ${dailyWikiLink(request.committed_daily_path)} ${provenanceComment(request.committed_daily_path, request.committed_evidence_id)}`;
  }

  async function appendApprovedExperience(app, input) {
    const request = normalizeAppendRequest(input);
    const target = requireTFile(app, request.region.path, "Region target");
    const daily = requireTFile(app, request.committed_daily_path, "Committed Daily");
    const verifiedDaily = await requireCommittedDailyEvidence(app, daily, request);
    if (!app || !app.vault || typeof app.vault.process !== "function") throw new Error("Obsidian Vault process is unavailable.");
    const provenance = provenanceComment(request.committed_daily_path, request.committed_evidence_id);
    const entry = renderedEntry(request);
    let result;
    await app.vault.process(daily, async (currentDaily) => {
      if (currentDaily !== verifiedDaily) throw new Error("저장된 Daily Evidence가 변경되었거나 없습니다. Evidence를 다시 저장해 주세요.");
      assertCommittedDailyEvidence(currentDaily, request);
      await app.vault.process(target, (current) => {
        if (typeof current !== "string") throw new Error("Region target content is unavailable.");
        assertTargetIdentity(current, request.region);
        const marker = targetSection(current, request.candidate.rule);
        if (current.includes(provenance)) {
          result = { ok: true, status: "unchanged", path: target.path, no_op: true, content: current };
          return current;
        }
        const eol = current.includes("\r\n") ? "\r\n" : "\n";
        const markerLineEnd = current[marker.end] === "\n" ? marker.end + 1 : marker.end;
        const separator = markerLineEnd === marker.end ? eol : "";
        const next = `${current.slice(0, markerLineEnd)}${separator}${entry}${eol}${current.slice(markerLineEnd)}`;
        result = { ok: true, status: "appended", path: target.path, content: next };
        return next;
      });
      return currentDaily;
    });
    return result;
  }

  const api = Object.freeze({
    TARGET_FOLDER,
    PROVENANCE_PREFIX,
    normalizeAppendRequest,
    dailyWikiLink,
    provenanceComment,
    appendApprovedExperience
  });
  root.RegionExperienceStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
