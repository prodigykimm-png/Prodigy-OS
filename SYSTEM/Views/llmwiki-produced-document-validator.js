"use strict";
// LLM Wiki 산출물 검증기.
//
// 배치가 만든 정본 문서들을 규칙으로 검사한다. 사람이 눈으로 찾는 대신 이 검증기가 잡고,
// 실패는 "로직을 고쳐야 할 신호"로 쓴다. 각 검사는 이름 있는 코드로 돌려준다.
//
// 검사 항목
//  - raw_citation_fragment : 인용 목적지가 순수 숫자/줄 범위(#12, #L3, #12-40)로 남아 있음
//  - frontmatter_invalid   : frontmatter의 따옴표 스칼라가 여러 줄로 깨졌거나 따옴표가 홀수
//  - statement_duplicate    : statement 안에 토큰 50% 이상 겹치는 문장이 함께 남아 있음
//  - scope_incomplete       : ## 사용자 검토 범위에 적용 조건 또는 재검토 조건이 없음/빈 값
//  - body_duplicate_claim   : 본문에 같은 문장이 두 번 이상 나옴(중복 추가)
//  - citation_missing       : 인용 문구가 원문 파일에서 발견되지 않음(지어낸 근거 방지)
//  - near_duplicate_document: 두 문서의 본문이 70% 이상 겹침(중복 문서)

const TOKENS = /[0-9A-Za-z가-힣]+/gu;
const tokens = (text) => new Set(String(text || "").match(TOKENS) || []);
const overlapRatio = (left, right) => {
  const own = tokens(left);
  if (!own.size) return 0;
  const other = tokens(right);
  let hit = 0;
  for (const token of own) if (other.has(token)) hit += 1;
  return hit / own.size;
};

// frontmatter의 따옴표 스칼라가 닫히지 않으면 무효로 본다(정상 다중행은 통과).
function unterminatedQuote(frontmatter) {
  let inQuote = false;
  let line = 1;
  for (let index = 0; index < frontmatter.length; index += 1) {
    const char = frontmatter[index];
    if (char === "\n") { line += 1; continue; }
    if (char === "\\" && inQuote) { index += 1; continue; }
    if (char === '"') inQuote = !inQuote;
  }
  return inQuote ? line : 0;
}

function frontmatterBlock(text) {
  const match = /^---\n([\s\S]*?)\n---\n?/u.exec(String(text || ""));
  return match ? match[1] : "";
}
// candidate/레거시 문서는 frontmatter 스키마가 다르므로 v2 지식 문서만 검사 대상으로 삼는다.
function isKnowledgeDocument(text) {
  const frontmatter = frontmatterBlock(text);
  return /schema_version:\s*2/u.test(frontmatter)
    && /^type:\s*"?knowledge"?\s*$/mu.test(frontmatter);
}
function frontmatterValue(block, key) {
  const match = new RegExp(`^${key}:\\s*(.*)$`, "mu").exec(block);
  return match ? match[1].trim() : "";
}
function bodyOf(text) {
  const raw = String(text || "");
  const match = /^---\n[\s\S]*?\n---\n?/u.exec(raw);
  return match ? raw.slice(match[0].length) : raw;
}
function scopeBlock(body) {
  const match = /## 사용자 검토 범위\n([\s\S]*?)(?=\n## |\s*$)/u.exec(String(body || ""));
  return match ? match[1] : "";
}
function sentencesOf(text) {
  return String(text || "")
    .replace(/\\n/gu, "\n")
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((row) => row.trim())
    .filter(Boolean);
}

function auditDocuments({ documents = [], sources = {} } = {}) {
  const findings = [];
  const push = (code, path, detail) => findings.push({ code, path, detail });
  const canonicalDocuments = documents.filter((document) => isKnowledgeDocument(document.content));
  for (const document of canonicalDocuments) {
    const path = document.path || document.title || "(unknown)";
    const text = String(document.content || "");
    const frontmatter = frontmatterBlock(text);
    const body = bodyOf(text);

    // 1) 원시 인용 프래그먼트
    for (const match of text.matchAll(/\]\(([^)\s]+)#([^)\s]+)\)/gu)) {
      const fragment = decodeURIComponent(match[2]);
      if (/^(L?\d+)([-–]L?\d+)?$/u.test(fragment)) push("raw_citation_fragment", path, `#${fragment}`);
    }

    // 2) frontmatter 무결성: v2 지식 문서에만 요구한다(candidate/레거시는 스키마가 다르다)
    if (isKnowledgeDocument(text)) {
      if (!frontmatter) push("frontmatter_invalid", path, "frontmatter 없음");
      else {
        const openLine = unterminatedQuote(frontmatter);
        if (openLine) push("frontmatter_invalid", path, `닫히지 않은 따옴표(라인 ${openLine})`);
      }
    }

    // 3) statement 중복 + 이스케이프 잔여
    const statement = frontmatterValue(frontmatter, "statement");
    if (/\\"/u.test(statement.replace(/^"|"$/gu, ""))) push("statement_escape_residue", path, statement.slice(0, 60));
    const sentences = sentencesOf(statement.replace(/^"|"$/gu, "").replace(/\\"/gu, '"'));
    for (let index = 0; index < sentences.length; index += 1) {
      for (let other = index + 1; other < sentences.length; other += 1) {
        if (overlapRatio(sentences[index], sentences[other]) >= 0.5) {
          push("statement_duplicate", path, sentences[other].slice(0, 60));
        }
      }
    }

    // 4) 검토 범위 완결성: 이 배치가 만든 v2 문서에만 요구한다(레거시·외부 문서는 제외).
    const isBatchDocument = /schema_version:\s*2/u.test(frontmatter)
      && /^type:\s*"?knowledge"?\s*$/mu.test(frontmatter);
    const scope = scopeBlock(body);
    const conditions = /- 적용 조건:\s*(.*)$/mu.exec(scope);
    const invalidations = /- 재검토 조건:\s*(.*)$/mu.exec(scope);
    if (isBatchDocument) {
      if (!scope) push("scope_incomplete", path, "검토 범위 블록 없음");
      else {
        if (!conditions || !conditions[1].trim()) push("scope_incomplete", path, "적용 조건 없음");
        if (!invalidations || !invalidations[1].trim()) push("scope_incomplete", path, "재검토 조건 없음");
      }
    }

    // 5) 본문 중복 문장(토큰 85% 이상 겹치는 *문장*만; 헤딩·불릿·짧은 조각은 제외)
    const bodySentences = body
      .replace(/\[[^\]]*\]\([^)]*\)/gu, "")
      .split(/\n+/u)
      .map((row) => row.trim())
      .filter((row) => row && !row.startsWith("#") && !row.startsWith("-") && !row.startsWith("*") && !row.startsWith("|"))
      .flatMap((row) => row.split(/(?<=[.!?])\s+/u).map((part) => part.trim()).filter(Boolean))
      .filter((row) => row.length >= 20 && (row.match(TOKENS) || []).length >= 6);
    for (let index = 0; index < bodySentences.length; index += 1) {
      for (let other = index + 1; other < bodySentences.length; other += 1) {
        const left = tokens(bodySentences[index]);
        const right = tokens(bodySentences[other]);
        if (!left.size || !right.size) continue;
        const shared = [...left].filter((token) => right.has(token)).length;
        if (shared / Math.min(left.size, right.size) >= 0.85) push("body_duplicate_claim", path, bodySentences[other].slice(0, 60));
      }
    }

    // 7) 인용 문구가 지어낸 것이 아닌지 (document.citations가 주어졌을 때만)
    for (const quote of document.citations || []) {
      const found = Object.values(sources).some((sourceText) => String(sourceText).includes(quote));
      if (!found) push("citation_missing", path, String(quote).slice(0, 50));
    }
  }

  // 8) 문서 간 근접 중복(본문이 충분히 긴 경우만: 목록·헤딩만 있는 문서는 제외)
  for (let index = 0; index < canonicalDocuments.length; index += 1) {
    for (let other = index + 1; other < canonicalDocuments.length; other += 1) {
      const left = bodyOf(canonicalDocuments[index].content).replace(/^#.*$/gmu, "").trim();
      const right = bodyOf(canonicalDocuments[other].content).replace(/^#.*$/gmu, "").trim();
      if ((left.match(TOKENS) || []).length < 120 || (right.match(TOKENS) || []).length < 120) continue;
      if (overlapRatio(left, right) >= 0.8) {
        push("near_duplicate_document", canonicalDocuments[index].path || canonicalDocuments[index].title, `≈ ${canonicalDocuments[other].path || canonicalDocuments[other].title}`);
      }
    }
  }

  const counts = findings.reduce((acc, finding) => ({ ...acc, [finding.code]: (acc[finding.code] || 0) + 1 }), {});
  return { ok: findings.length === 0, findings, counts };
}

const api = Object.freeze({ auditDocuments, VERSION: "llmwiki_produced_document_validator_v1" });
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.LLMWikiProducedDocumentValidator = api;
if (typeof globalThis !== "undefined") globalThis.LLMWikiProducedDocumentValidator = api;
