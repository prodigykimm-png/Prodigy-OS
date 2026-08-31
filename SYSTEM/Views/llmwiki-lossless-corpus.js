(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const VERSION = "llmwiki_lossless_corpus_v1";
  const RECEIPT_VERSION = "llmwiki_lossless_receipt_v1";
  const META = /^(?:글번호|작성자|날짜|출처|원문|https?:\/\/|---)/u;
  const HEADING = /^#{1,6}\s+/u;
  const LIST = /^(?:[-+]\s+|\d+[.)]\s+)/u;
  const ORDERED_LIST = /^\d+[.)]\s+/u;
  const COMMENT_AUTHOR = /^\*\*[^*]+\*\*\s*\(\d{4}\./u;
  const COMMENT_START = /(?:^|\s)댓글\s+\d+\s*$/u;
  const MAX_CLAIM_CHARS = 500;

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function clean(value) { return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : ""; }
  function sha(value) { return hashApi.sha256(String(value)); }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function fail(reason) { return freeze({ ok: false, reason }); }
  function claimType(text, listKind) {
    if (/무리|안전|주의|위험|다치|보호/iu.test(text)) return "safety_sensitive";
    if (/ISO|조리개|셔터|렌즈|mm\b|광량|스트로보/iu.test(text)) return "equipment_dependent";
    if (/달랐|일반적|기준|통상|대체로|경우/iu.test(text)) return "heuristic";
    if (listKind) return "procedure";
    if (/했다|였다|경험|낙찰|직접|줄였다|다녀/iu.test(text)) return "experience";
    if (/\d[\d,.]*\s*(?:%|원|만원|억원|㎡|평|년|개월|일|mm)|세율|한도|금리|비율/iu.test(text)) return "time_sensitive_numeric";
    if (text.length < 18 || /^(?:이것|저것|그것|여기|이때|그때|참고|기타)/u.test(text)) return "context_dependent";
    return "factual_definition";
  }
  function routeFor(type) {
    if (type === "experience") return "experience_note";
    if (["procedure", "safety_sensitive"].includes(type)) return "field_guide";
    if (["equipment_dependent", "time_sensitive_numeric", "heuristic"].includes(type)) return "verification_queue";
    if (type === "context_dependent") return "source_guide";
    return "reference_article";
  }
  function semanticRows(document) {
    const rows = []; const prose = [];
    function splitLongRow(row) {
      if (row.text.length <= MAX_CLAIM_CHARS) return [row];
      const parts = [];
      let cursor = 0;
      while (cursor < row.text.length) {
        let end = Math.min(row.text.length, cursor + MAX_CLAIM_CHARS);
        if (end < row.text.length) {
          const boundary = row.text.lastIndexOf(" ", end);
          if (boundary > cursor + Math.floor(MAX_CLAIM_CHARS * 0.6)) end = boundary;
        }
        const text = row.text.slice(cursor, end).trim();
        const leading = row.text.slice(cursor, end).indexOf(text);
        parts.push({ text, start: row.start + cursor + Math.max(0, leading), end: row.start + cursor + Math.max(0, leading) + text.length });
        cursor = end;
        while (row.text[cursor] === " ") cursor += 1;
      }
      return parts;
    }
    function flush() {
      if (!prose.length) return;
      let chunk = [];
      function emit() {
        if (!chunk.length) return;
        const text = clean(chunk.map((row) => row.text).join(" "));
        if (text.length >= 4) rows.push({ classification: "claim", text, listKind: false, start: chunk[0].start, end: chunk.at(-1).end });
        chunk = [];
      }
      for (const original of prose) for (const row of splitLongRow(original)) {
        if (chunk.length && clean([...chunk.map((item) => item.text), row.text].join(" ")).length > MAX_CLAIM_CHARS) emit();
        chunk.push(row);
      }
      emit();
      prose.length = 0;
    }
    let offset = 0; let inComments = false;
    for (const raw of document.source_text.split(/(?<=\n)/u)) {
      const withoutBreak = raw.replace(/\r?\n$/u, "");
      const trimmed = withoutBreak.trim();
      const leading = withoutBreak.indexOf(trimmed);
      const start = offset + Math.max(0, leading);
      const end = start + trimmed.length;
      if (!trimmed) { flush(); rows.push({ classification: "blank", start: offset, end: offset + raw.length }); }
      else if (COMMENT_AUTHOR.test(trimmed) || COMMENT_START.test(trimmed)) { flush(); inComments = true; rows.push({ classification: "context_only", start, end }); }
      else if (inComments) rows.push({ classification: "context_only", start, end });
      else if (HEADING.test(trimmed)) { flush(); rows.push({ classification: "boilerplate", start, end }); }
      else if (META.test(trimmed) || /^>\s*(?:총|작성|출처)/u.test(trimmed) || /^블로그>/u.test(trimmed)) { flush(); rows.push({ classification: "metadata", start, end }); }
      else if (LIST.test(trimmed)) {
        flush();
        const body = clean(trimmed.replace(LIST, ""));
        if (body.length >= 4) {
          const bodyStart = start + trimmed.indexOf(body);
          for (const part of splitLongRow({ text: body, start: bodyStart, end: bodyStart + body.length })) {
            rows.push({ classification: "claim", text: part.text, listKind: ORDERED_LIST.test(trimmed), start: part.start, end: part.end });
          }
        }
      } else prose.push({ text: trimmed, start, end });
      offset += raw.length;
    }
    flush();
    return rows;
  }
  function buildInventory(segmentation) {
    const claims = []; const ledger = [];
    for (const document of segmentation.subdocuments) {
      const occurrences = new Map();
      for (const row of semanticRows(document)) {
        const globalSpan = { start: document.global_span.start + row.start, end: document.global_span.start + row.end };
        if (row.classification !== "claim") {
          ledger.push(freeze({ subdocument_id: document.subdocument_id, classification: row.classification, global_span: globalSpan }));
          continue;
        }
        const type = claimType(row.text, row.listKind);
        const occurrence = occurrences.get(row.text) || 0;
        occurrences.set(row.text, occurrence + 1);
        const claim = freeze({
          claim_id: `claim_${sha(`${document.subdocument_id}|${row.text.normalize("NFC")}|${occurrence}`).slice(0, 24)}`,
          subdocument_id: document.subdocument_id,
          claim_type: type,
          text: row.text,
          evidence_quote: row.text,
          local_span: { start: row.start, end: row.end },
          global_span: globalSpan,
          confidence: type === "context_dependent" ? "review_required" : "explicit",
          verification_need: ["equipment_dependent", "time_sensitive_numeric", "heuristic"].includes(type),
        });
        claims.push(claim);
        ledger.push(freeze({ subdocument_id: document.subdocument_id, classification: "claim", claim_id: claim.claim_id, global_span: globalSpan }));
      }
    }
    const units = ledger.filter((row) => row.classification === "claim").length;
    return freeze({
      inventory_version: "llmwiki_lossless_inventory_v1",
      source_hash: segmentation.source_hash,
      claims,
      ledger,
      inventory_hash: sha(stable(claims)),
      semantic_units: units,
    });
  }
  function buildRouting(inventory) {
    const assignments = inventory.claims.map((claim) => freeze({ claim_id: claim.claim_id, route: routeFor(claim.claim_type) }));
    const ids = assignments.map((row) => row.claim_id);
    return freeze({
      routing_version: "llmwiki_lossless_routing_v1",
      assignments,
      unassigned_claim_ids: inventory.claims.map((row) => row.claim_id).filter((id) => !ids.includes(id)),
      duplicate_claim_ids: [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))],
      routing_hash: sha(stable(assignments)),
    });
  }
  const TOPIC_TAXONOMY = Object.freeze([
    ["건축·시공", /건축|단독주택|집짓|토목|기초공사|보강토|신축/iu],
    ["토지·개발", /토지|맹지|임야|농지|개발|성토/iu],
    ["경매·입찰", /경매|입찰|낙찰|배당|명도/iu],
    ["주택·매매", /주택|아파트|빌라|매매|매도|매수/iu],
    ["임대·수익", /임대|월세|전세|수익|상가/iu],
    ["현장·임장", /임장|현장|답사|지역/iu],
  ]);
  function topicKey(claim, detailBySubdocument) {
    const title = clean(detailBySubdocument.get(claim.subdocument_id)?.title || "기타");
    return TOPIC_TAXONOMY.find(([, pattern]) => pattern.test(`${title} ${claim.text}`))?.[0] || "기타";
  }
  function renderClaims(claims) {
    return claims.map((claim) => `- ${claim.text} ^${claim.claim_id}`).join("\n");
  }
  function buildHierarchy(segmentation, inventory, routing) {
    const indexId = `index_${sha(segmentation.source_path).slice(0, 24)}`;
    const assignment = new Map(routing.assignments.map((row) => [row.claim_id, row.route]));
    const claimById = new Map(inventory.claims.map((claim) => [claim.claim_id, claim]));
    const sourceDetails = segmentation.subdocuments.map((document) => {
      const detailClaims = inventory.claims.filter((claim) => claim.subdocument_id === document.subdocument_id);
      const page = {
      page_id: `detail_${document.subdocument_id.slice(7)}`,
      page_kind: "source_detail",
      title: document.title,
      subdocument_id: document.subdocument_id,
      corpus_index_id: indexId,
      claim_ids: detailClaims.map((claim) => claim.claim_id),
      source_path: document.source_path,
      global_span: document.global_span,
      body: `# ${document.title}\n\n[[${indexId}|전체 색인]]\n\n${renderClaims(detailClaims)}`,
    };
      const pageIdentity = { page_id: page.page_id, page_kind: page.page_kind, title: page.title,
        subdocument_id: page.subdocument_id, corpus_index_id: page.corpus_index_id,
        claim_ids: page.claim_ids, source_path: page.source_path, body: page.body };
      return freeze({ ...page, page_hash: sha(stable(pageIdentity)), locator_hash: sha(stable(page.global_span)) }); });
    const grouped = new Map();
    const detailBySubdocument = new Map(sourceDetails.map((page) => [page.subdocument_id, page]));
    for (const row of routing.assignments) {
      const claim = claimById.get(row.claim_id);
      const topic = topicKey(claim, detailBySubdocument);
      const key = `${row.route}:${topic}`;
      if (!grouped.has(key)) grouped.set(key, { route: row.route, topic, claim_ids: [] });
      grouped.get(key).claim_ids.push(row.claim_id);
    }
    const topicPages = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right, "ko")).flatMap(([key, group]) => {
      const sortedIds = group.claim_ids.sort();
      const pages = [];
      for (let offset = 0; offset < sortedIds.length; offset += 100) {
        const claimIds = sortedIds.slice(offset, offset + 100);
        const part = Math.floor(offset / 100) + 1;
        const total = Math.ceil(sortedIds.length / 100);
        const sourceDetailIds = sourceDetails.filter((page) => page.claim_ids.some((id) => claimIds.includes(id))).map((page) => page.page_id);
        const claims = claimIds.map((id) => claimById.get(id));
        const suffix = total > 1 ? ` ${part}/${total}` : "";
        pages.push(freeze({ page_id: `topic_${sha(`${key}:${part}`).slice(0, 24)}`, page_kind: group.route, title: `${group.topic} · ${group.route.replace(/_/gu, " ")}${suffix}`, claim_ids: claimIds, source_detail_ids: sourceDetailIds, corpus_index_id: indexId,
          body: `# ${group.topic}${suffix}\n\n유형: ${group.route}\n\n${renderClaims(claims)}\n\n## 출처 문서\n${sourceDetailIds.map((id) => `- [[${id}]]`).join("\n")}` }));
      }
      return pages;
    });
    return freeze({
      hierarchy_version: "llmwiki_lossless_hierarchy_v1",
      corpus_index: { page_id: indexId, page_kind: "corpus_index", title: segmentation.source_path.split("/").pop().replace(/\.md$/u, ""), source_detail_ids: sourceDetails.map((row) => row.page_id), topic_page_ids: topicPages.map((row) => row.page_id),
        body: `# ${segmentation.source_path.split("/").pop().replace(/\.md$/u, "")}\n\n## 원문별 상세\n${sourceDetails.map((page) => `- [[${page.page_id}|${page.title}]] (${page.claim_ids.length})`).join("\n")}\n\n## 주제별 문서\n${topicPages.map((page) => `- [[${page.page_id}|${page.title}]] (${page.claim_ids.length})`).join("\n")}` },
      source_details: sourceDetails,
      topic_pages: topicPages,
      hierarchy_hash: sha(stable([sourceDetails, topicPages])),
    });
  }
  function auditLosslessOutput(input) {
    if (!input || !input.inventory || !input.hierarchy) return fail("lossless_audit_input_required");
    const expected = input.inventory.claims.map((row) => row.claim_id).sort();
    const detailIds = input.hierarchy.source_details.flatMap((page) => page.claim_ids).sort();
    const topicIds = input.hierarchy.topic_pages.flatMap((page) => page.claim_ids).sort();
    const exact = (ids) => ids.length === expected.length && ids.every((id, index) => id === expected[index]);
    const uniquePages = new Set(input.hierarchy.topic_pages.map((page) => page.page_id)).size === input.hierarchy.topic_pages.length;
    return freeze({ ok: exact(detailIds) && exact(topicIds) && uniquePages, detail_complete: exact(detailIds), topic_complete: exact(topicIds), unique_pages: uniquePages });
  }
  function stageReceipt(stage, inputHash, outputHash) {
    const body = { receipt_version: RECEIPT_VERSION, stage, input_hash: inputHash, output_hash: outputHash, rules_version: VERSION };
    return freeze({ ...body, receipt_hash: sha(stable(body)) });
  }
  function buildLosslessCorpus(input) {
    const segmentation = input?.segmentation;
    if (!segmentation?.ok || !Array.isArray(segmentation.subdocuments)) return fail("valid_segmentation_required");
    const inventory = buildInventory(segmentation);
    const routing = buildRouting(inventory);
    const hierarchy = buildHierarchy(segmentation, inventory, routing);
    const audit = auditLosslessOutput({ inventory, hierarchy });
    if (!audit.ok || routing.unassigned_claim_ids.length || routing.duplicate_claim_ids.length) return fail("lossless_lineage_failed");
    const semanticCoverage = inventory.semantic_units ? inventory.claims.length / inventory.semantic_units : 1;
    const receipts = freeze({
      segmentation: stageReceipt("segmentation", segmentation.source_hash, sha(stable(segmentation.subdocuments.map((row) => [row.subdocument_id, row.content_hash])))),
      inventory: stageReceipt("inventory", segmentation.source_hash, inventory.inventory_hash),
      routing: stageReceipt("routing", inventory.inventory_hash, routing.routing_hash),
      hierarchy: stageReceipt("hierarchy", routing.routing_hash, hierarchy.hierarchy_hash),
      subdocuments: Object.fromEntries(segmentation.subdocuments.map((document) => {
        const page = hierarchy.source_details.find((row) => row.subdocument_id === document.subdocument_id);
        return [document.subdocument_id, stageReceipt("subdocument", document.content_hash, page.page_hash)];
      })),
    });
    const resultBody = { version: VERSION, segmentation, inventory, ledger: inventory.ledger, routing, hierarchy, receipts,
      coverage: { semantic_coverage: semanticCoverage, unassigned_units: inventory.semantic_units - inventory.claims.length } };
    return freeze({ ok: true, ...resultBody, output_hash: sha(stable(resultBody)), provider_calls: 0 });
  }
  function replayLosslessCorpus(input) {
    if (!input?.prior?.ok || !input.segmentation?.ok) return fail("lossless_replay_input_required");
    if (input.prior.segmentation.source_hash === input.segmentation.source_hash) return freeze({ ...input.prior, status: "exact_replay", provider_calls: 0 });
    const priorByTitle = new Map(input.prior.segmentation.subdocuments.map((row) => [row.title, row]));
    const changed = []; const reused = [];
    for (const row of input.segmentation.subdocuments) {
      const prior = priorByTitle.get(row.title);
      (prior && prior.content_hash === row.content_hash ? reused : changed).push(row.subdocument_id);
    }
    const rebuilt = buildLosslessCorpus({ segmentation: input.segmentation });
    return freeze({ ...rebuilt, status: "partial_rebuild", changed_subdocument_ids: changed, reused_subdocument_ids: reused, provider_calls: 0 });
  }

  function publicationWarnings(claim) {
    const warnings = [];
    if (claim.claim_type === "experience") warnings.push("개인 경험");
    if (claim.claim_type === "heuristic") warnings.push("경험적 기준");
    if (claim.claim_type === "time_sensitive_numeric") warnings.push("수치·기준일 확인 필요");
    if (claim.claim_type === "equipment_dependent") warnings.push("장비·환경 의존");
    if (claim.claim_type === "safety_sensitive") warnings.push("안전 조건 확인");
    if (claim.confidence === "review_required") warnings.push("문맥 검토 필요");
    return warnings;
  }
  function finalizeLosslessCorpus(input) {
    const result = input?.result;
    if (!result?.ok) return fail("lossless_result_required");
    const audit = auditLosslessOutput({ inventory: result.inventory, hierarchy: result.hierarchy });
    if (!audit.ok || result.coverage.semantic_coverage !== 1 || result.coverage.unassigned_units !== 0) return fail("publication_information_loss");
    const warnings = Object.fromEntries(result.inventory.claims.map((claim) => [claim.claim_id, publicationWarnings(claim)]));
    const bodies = [result.hierarchy.corpus_index, ...result.hierarchy.topic_pages, ...result.hierarchy.source_details]
      .map((page) => ({ page_id: page.page_id, body: page.body }));
    const lineageHash = sha(stable(result.inventory.claims.map((claim) => claim.claim_id).sort()));
    const outputHash = sha(stable(bodies));
    const body = { receipt_version: "llmwiki_lossless_publication_v1", source_hash: result.segmentation.source_hash,
      inventory_hash: result.inventory.inventory_hash, routing_hash: result.routing.routing_hash,
      hierarchy_hash: result.hierarchy.hierarchy_hash, lineage_hash: lineageHash, output_hash: outputHash,
      semantic_coverage: 1, claim_count: result.inventory.claims.length, rules_version: VERSION };
    return freeze({ ok: true, status: "publishable_lossless", warnings, bodies, lineage_hash: lineageHash,
      output_hash: outputHash, publication_receipt: { ...body, receipt_hash: sha(stable(body)) }, canonical_writes: 0, source_writes: 0 });
  }

  const api = freeze({ VERSION, RECEIPT_VERSION, buildLosslessCorpus, replayLosslessCorpus, auditLosslessOutput, finalizeLosslessCorpus });
  root.LLMWikiLosslessCorpus = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
