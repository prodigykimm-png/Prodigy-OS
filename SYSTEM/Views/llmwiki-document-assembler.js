(function (root) {
  "use strict";

  const CONTRACT_VERSION = "llmwiki_document_assembler_v2";
  const ROLES = new Set(["source_summary", "reusable_claim"]);
  const TOKEN = /[가-힣a-z0-9]{2,}/giu;
  const STOPWORDS = new Set(["대한", "위한", "한다", "있다", "해당", "그리고", "또는", "에서", "으로", "자료"]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function clean(value) { return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : ""; }
  function unique(values) { return [...new Set(values)]; }
  function sourceTitle(path) {
    const basename = clean(path).split("/").pop() || "지식 문서";
    return basename.replace(/\.md$/iu, "").replace(/_backup(?:\s*\(\d+\))?$/iu, "").trim() || "지식 문서";
  }
  function tokens(value) {
    return new Set((clean(value).toLowerCase().match(TOKEN) || []).filter((token) => !STOPWORDS.has(token)));
  }
  function coverage(needle, haystack) {
    const left = tokens(needle);
    if (left.size === 0) return 0;
    const right = tokens(haystack);
    let hits = 0;
    for (const token of left) if (right.has(token)) hits += 1;
    return hits / left.size;
  }
  function candidateText(row) {
    return [row.title, row.statement, row.summary, row.content, row.before_bytes].map(clean).filter(Boolean).join("\n");
  }
  function citation(source, item) {
    const span = plain(item.span) && Number.isInteger(item.span.start) && Number.isInteger(item.span.end)
      ? { start: item.span.start, end: item.span.end }
      : null;
    return freeze({
      source_id: source.source_id,
      content_hash: source.content_hash,
      source_path: source.source_path,
      locators: span ? [source.source_path, `${source.source_path}#${span.start}-${span.end}`] : [source.source_path],
      evidence_quote: clean(item.evidence_quote),
      confidence: span ? "explicit" : "inferred",
    });
  }
  function topicSimilarity(left, right) {
    const leftTokens = tokens(left);
    const rightTokens = tokens(right);
    if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
    let hits = 0;
    for (const token of leftTokens) if (rightTokens.has(token)) hits += 1;
    return hits / Math.min(leftTokens.size, rightTokens.size);
  }
  function renderDocument(title, role, sections, claims, citations, reviewReasons = []) {
    const content = role === "source_summary"
      ? `## 주제별 내용\n\n${sections.map((section) => `### ${section.heading}\n\n${section.claims.map((claim) => `- ${claim.text}`).join("\n")}`).join("\n\n")}`
      : `## 핵심 내용\n\n${claims.map((claim) => `- ${claim.text}`).join("\n")}`;
    const quotes = unique(citations.map((row) => clean(row.evidence_quote)).filter(Boolean));
    const quoteLines = quotes.map((quote) => `> ${quote}`).join("\n\n");
    const sourceLines = unique(citations.flatMap((row) => row.locators.slice(-1))).map((locator) => `- ${locator}`).join("\n");
    const review = reviewReasons.length ? `\n\n## 확인 필요\n\n${unique(reviewReasons).map(reason => `- ${reason}`).join("\n")}` : "";
    return `# ${title}\n\n${content}${review}\n\n## 근거 발췌\n\n${quoteLines}\n\n## 출처\n\n${sourceLines}\n`;
  }
  function matchCanonical(claims, rows) {
    let best = null;
    for (const row of rows) {
      const text = candidateText(row);
      if (!text) continue;
      const scores = claims.map((claim) => {
        const normalizedClaim = clean(claim.text).toLowerCase();
        const normalizedText = text.toLowerCase();
        // Similar vocabulary is retrieval evidence, not proof of duplication:
        // a changed number, condition or negation must remain reviewable.
        return normalizedText.includes(normalizedClaim) ? 1 : 0;
      });
      const complete = scores.length > 0 && scores.every((score) => score === 1);
      const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
      if (complete && (!best || average > best.score)) best = { row, score: average };
    }
    return best;
  }
  function semanticCandidateIds(claims, rows) {
    const draft = claims.map((claim) => claim.text).join("\n");
    return rows
      .map((row) => ({ row, score: coverage(draft, candidateText(row)) }))
      .filter((match) => match.score >= 0.72)
      .sort((left, right) => right.score - left.score || String(left.row.candidate_id).localeCompare(String(right.row.candidate_id), "en"))
      .slice(0, 2)
      .map((match) => match.row.candidate_id);
  }

  function createDocumentAssembler(options = {}) {
    const canonicalDocuments = Array.isArray(options.canonicalDocuments) ? options.canonicalDocuments.filter(plain) : [];
    const candidateDocuments = Array.isArray(options.candidateDocuments) ? options.candidateDocuments.filter(plain) : [];
    const knownCandidateIds = new Set(candidateDocuments.map((row) => row.candidate_id).filter((id) => typeof id === "string"));

    function assemble(input) {
      if (!plain(input) || !plain(input.source) || !Array.isArray(input.artifacts)) {
        return freeze({ ok: false, reason: "document_assembler_input_required" });
      }
      const source = input.source;
      if (!clean(source.source_id) || !clean(source.source_path) || !/^[0-9a-f]{64}$/u.test(clean(source.content_hash))) {
        return freeze({ ok: false, reason: "invalid_document_source" });
      }

      const groups = [];
      const holds = [];
      for (const artifact of input.artifacts) {
        if (!plain(artifact) || !Array.isArray(artifact.items)) return freeze({ ok: false, reason: "invalid_document_artifact" });
        if (artifact.outcome === "no_change") continue;
        for (const [position, item] of artifact.items.entries()) {
          const itemIndex = artifact.item_indices?.[position] ?? position;
          if (!plain(item) || !Array.isArray(item.claims)) return freeze({ ok: false, reason: "invalid_document_item" });
          if (!ROLES.has(item.role)) {
            holds.push(freeze({ role: item.role || "hold", reason: item.role === "object_context" ? "object_context_outside_document_assembler" : "non_document_role", item }));
            continue;
          }
          const itemClaims = item.claims.map((claim, claim_index) => ({ text: clean(plain(claim) ? claim.text : claim), claim_index })).filter((claim) => claim.text);
          if (itemClaims.length === 0) {
            holds.push(freeze({ role: item.role, reason: "empty_claims_hold", item }));
            continue;
          }
          const related = unique((Array.isArray(item.related_candidate_ids) ? item.related_candidate_ids : []).filter((id) => typeof id === "string")).sort();
          const fallbackTopic = item.role === "source_summary" ? "전체 개요" : sourceTitle(source.source_path);
          const topic = clean(item.topic) || fallbackTopic;
          let group = item.role === "source_summary"
            ? groups.find((row) => row.role === "source_summary")
            : groups.find((row) => row.role === "reusable_claim"
              && row.related_candidate_ids.join("|") === related.join("|")
              && topicSimilarity(row.title, topic) >= 0.6);
          if (!group) {
            group = { role: item.role, title: topic, related_candidate_ids: related, claims: [], citations: [], review_reasons: [], sections: new Map(), topics: [] };
            groups.push(group);
          }
          const itemCitation = citation(source, item);
          // Preserve every contributing occurrence before claim deduplication.
          // Text and the item citation are join evidence, not new claim fields.
          if (clean(item.topic)) {
            for (const { text, claim_index } of itemClaims) {
              group.topics.push({ topic: item.topic, chunk_key: artifact.chunk_key, item_index: itemIndex, claim_index, text, citation: itemCitation });
            }
          }
          group.review_reasons = unique([
            ...group.review_reasons,
            ...(Array.isArray(item.review_reasons) ? item.review_reasons.map(clean).filter(Boolean) : []),
          ]);
          const sectionHeading = group.role === "source_summary" ? topic : group.title;
          const sectionClaims = group.sections.get(sectionHeading) || [];
          for (const { text } of itemClaims) {
            if (!group.claims.some((claim) => clean(claim.text).toLowerCase() === text.toLowerCase())) {
              const claim = freeze({ text });
              group.claims.push(claim);
              sectionClaims.push(claim);
            }
          }
          group.sections.set(sectionHeading, sectionClaims);
          if (!group.citations.some((row) => row.evidence_quote === itemCitation.evidence_quote && row.locators.join("|") === itemCitation.locators.join("|"))) {
            group.citations.push(itemCitation);
          }
        }
      }

      const documents = [];
      const noChanges = [];
      const baseTitle = sourceTitle(source.source_path);
      for (const group of groups) {
        const title = group.role === "source_summary" ? `${baseTitle} 자료 해설` : group.title || baseTitle;
        const sections = [...group.sections.entries()].map(([heading, sectionClaims]) => freeze({ heading, claims: sectionClaims }));
        const canonical = group.role === "reusable_claim" ? matchCanonical(group.claims, canonicalDocuments) : null;
        if (canonical) {
          noChanges.push(freeze({
            contract_version: CONTRACT_VERSION,
            role: group.role,
            title,
            sections,
            claims: group.claims,
            citations: group.citations,
            review_reasons: group.review_reasons,
            original_topic_refs: freeze(group.topics.map((row) => freeze({ ...row }))),
            operation_hint: "no_change",
            matched_document_id: canonical.row.document_id,
            matched_path: canonical.row.path || "",
            match_score: canonical.score,
          }));
          continue;
        }

        const explicitIds = group.related_candidate_ids.filter((id) => knownCandidateIds.has(id));
        const matchedCandidateIds = explicitIds.length ? explicitIds : semanticCandidateIds(group.claims, candidateDocuments);
        const operationHint = matchedCandidateIds.length > 1 ? "merge" : matchedCandidateIds.length === 1 ? "update" : "create";
        documents.push(freeze({
          contract_version: CONTRACT_VERSION,
          role: group.role,
          title,
          sections,
          claims: group.claims,
          citations: group.citations,
          review_reasons: group.review_reasons,
          original_topic_refs: freeze(group.topics.map((row) => freeze({ ...row }))),
          related_candidate_ids: group.related_candidate_ids,
          matched_candidate_ids: matchedCandidateIds,
          operation_hint: operationHint,
          body: renderDocument(title, group.role, sections, group.claims, group.citations, group.review_reasons),
        }));
      }

      return freeze({ ok: true, contract_version: CONTRACT_VERSION, documents, no_changes: noChanges, holds });
    }

    return freeze({ assemble });
  }

  // Only an exact locally resolved target joins documents. Similar titles are
  // not target authority; ambiguous/multi-target mutations keep their holds.
  function combineTargetDocuments(documents) {
    const groups = new Map();
    for (const document of documents) {
      const ids = document.matched_candidate_ids || [];
      const key = document.role === "reusable_claim" && ids.length === 1 ? ids[0] : document;
      groups.set(key, [...(groups.get(key) || []), document]);
    }
    return freeze([...groups.values()].map(rows => {
      if (rows.length === 1) return rows[0];
      const first = rows[0];
      const uniqueRows = values => [...new Map(values.map(row => [JSON.stringify(row), row])).values()];
      const claims = uniqueRows(rows.flatMap(row => row.claims));
      const citations = uniqueRows(rows.flatMap(row => row.citations));
      const sections = rows.flatMap(row => row.sections || []);
      const reviewReasons = unique(rows.flatMap(row => row.review_reasons || []));
      const compiled = sections.some(section => Array.isArray(section.paragraphs));
      const body = compiled
        ? `# ${first.title}\n\n${sections.map(section => `## ${section.heading}\n\n${(section.paragraphs || []).map(p => p.text).join("\n\n")}`).join("\n\n")}\n\n## 출처\n\n${unique(citations.flatMap(c => c.locators || [])).map(locator => `- ${locator}`).join("\n")}\n`
        : renderDocument(first.title, first.role, sections, claims, citations, reviewReasons);
      return { ...first, claims, citations, sections, body, review_reasons: reviewReasons,
        original_topic_refs: uniqueRows(rows.flatMap(row => row.original_topic_refs || [])) };
    }));
  }

  const api = freeze({ CONTRACT_VERSION, renderDocument, combineTargetDocuments, createDocumentAssembler });
  root.LLMWikiDocumentAssembler = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
