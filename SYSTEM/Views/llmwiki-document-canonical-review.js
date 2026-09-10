(function (root) {
  "use strict";
  // Wiki document review composition; all authority and writes remain in the existing contracts.
  const dep = (name, path) => root[name] || (typeof require === "function" ? require(path) : null);
  const hash = dep("LLMWikiHash", "./llmwiki-hash.js");
  const claims = dep("LLMWikiClaimProvenance", "./llmwiki-claim-provenance.js");
  const promotion = dep("LLMWikiPromotionContract", "./llmwiki-promotion-contract.js");
  const store = dep("KnowledgeCandidateStore", "./knowledge-candidate-store.js");
  const packetApi = dep("LLMWikiCanonicalPacket", "./llmwiki-canonical-packet.js");
  const operation = dep("LLMWikiOperationContract", "./llmwiki-operation-contract.js");
  const writer = dep("LLMWikiOperationWriter", "./llmwiki-operation-writer.js");
  const obsidian = dep("LLMWikiObsidianAdapter", "./llmwiki-obsidian-adapter.js");
  const reader = dep("LLMWikiResurfacingReadAdapter", "./llmwiki-resurfacing-read-adapter.js");
  const registry = dep("KnowledgeExplorerRegistry", "./knowledge-explorer-registry.js");
  const recovery = dep("LLMWikiUIRecovery", "./llmwiki-ui-recovery.js");
  const evidence = dep("LLMWikiEvidenceContract", "./llmwiki-evidence-contract.js");
  const sha = value => hash.sha256(String(value));
  const stable = value => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}` : JSON.stringify(value);
  const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
  const recoveryCopy = result => {
    if (["approval_expired", "stale_before_write"].includes(result.reason)) return "검토 이후 내용이 바뀌었습니다. 변경안을 다시 확인해야 합니다.";
    if (result.reason === "source_revision_changed") return "원문이 변경되었습니다. 최신 내용으로 다시 확인하세요.";
    if (result.reason === "review_checkpoint_failed" || result.reason === "canonical_readback_pending" || result.writer_result?.status === "committed") return "문서는 저장됐지만 확인이 끝나지 않았습니다.";
    if (result.reason === "promotion_review_required") return `적용 전에 확인할 항목이 있습니다. ${(result.promotion_gaps || []).map(gap => typeof gap === "string" ? gap : gap.message || gap.reason || gap.code).filter(Boolean).join(" · ")}`;
    return recovery.mapRecovery(result.reason === "stale_before_write" ? { reason: "target_revision_mismatch" } : result).copy;
  };
  const lines = value => String(value || "").split(/\n/u).map(v => v.trim()).filter(Boolean);
  // Keep additions inside the document, before user notes/review metadata.
  // Consolidate only the two existing generated footer sections; never rewrite prose.
  const REVIEW_SCOPE_HEADING = "\n## 사용자 검토 범위";
  function stripReviewScopeBlock(body) {
    const text = String(body || "");
    const scopeIndex = text.indexOf(REVIEW_SCOPE_HEADING);
    if (scopeIndex < 0) return text;
    return text.slice(0, scopeIndex).replace(/\s+$/u, "");
  }
  function splitScopeBlock(body) {
    const text = String(body || "");
    const start = text.indexOf(REVIEW_SCOPE_HEADING);
    if (start < 0) return { head: text, tail: "" };
    const rest = text.slice(start + REVIEW_SCOPE_HEADING.length);
    const next = rest.search(/\n#{1,2} /u);
    if (next < 0) return { head: text.slice(0, start).replace(/\s+$/u, ""), tail: "" };
    const cut = start + REVIEW_SCOPE_HEADING.length + next;
    return { head: text.slice(0, start).replace(/\s+$/u, ""), tail: text.slice(cut).replace(/^\n+/u, "") };
  }
  function normalizeParagraph(value) {
    return String(value || "").replace(/\s+/gu, " ").trim();
  }
  function splitParagraphs(text) {
    return String(text || "").split(/\n\n+/u).map((paragraph) => paragraph.trim()).filter(Boolean);
  }
  function mergeAdditionSections(base, incoming) {
    const cleanBase = String(base || "").trimEnd();
    const cleanIncoming = String(incoming || "").trim();
    if (!cleanBase) return cleanIncoming;
    if (!cleanIncoming || cleanBase.includes(cleanIncoming)) return cleanBase;
    const splitRaw = (text) => String(text || "").split(/(?=^## )/mu).filter((chunk) => chunk.trim()).map((chunk) => {
      if (!chunk.startsWith("## ")) return { heading: null, raw: chunk.trimEnd() };
      const cut = chunk.indexOf("\n");
      return cut < 0
        ? { heading: chunk.slice(3).trim(), raw: chunk.trimEnd() }
        : { heading: chunk.slice(3, cut).trim(), raw: chunk.trimEnd() };
    });
    const sectionBody = (raw) => {
      const cut = raw.indexOf("\n");
      return cut < 0 ? "" : raw.slice(cut + 1);
    };
    const out = splitRaw(cleanBase);
    const fresh = [];
    for (const section of splitRaw(cleanIncoming)) {
      if (section.heading === null) {
        if (!out.some((row) => normalizeParagraph(row.raw).includes(normalizeParagraph(section.raw)))) fresh.push(section.raw);
        continue;
      }
      const at = out.findIndex((row) => row.heading === section.heading);
      if (at < 0) {
        fresh.push(section.raw);
        continue;
      }
      const have = new Set(splitParagraphs(sectionBody(out[at].raw)).map(normalizeParagraph));
      const additions = splitParagraphs(sectionBody(section.raw)).filter((paragraph) => paragraph && !have.has(normalizeParagraph(paragraph)));
      if (additions.length) out[at] = { heading: out[at].heading, raw: `${out[at].raw.trimEnd()}\n\n${additions.join("\n\n")}` };
    }
    if (fresh.length) {
      const insert = fresh.join("\n\n");
      if (!out.map((row) => row.raw).join("\n\n").includes(insert)) {
        const at = out.findIndex((row) => row.heading !== null
          && ["사용자 메모", "사용자 검토 범위", "출처", "관련 지식"].includes(row.heading));
        if (at < 0) out.push({ heading: null, raw: insert });
        else out.splice(at, 0, { heading: null, raw: insert });
      }
    }
    return out.map((row) => row.raw).join("\n\n").trimEnd();
  }
  function integrateDocumentBody(previous, addition, reviewScope, relatedLinks, sourceLinks) {
    const { head, tail } = splitScopeBlock(previous);
    let body = mergeAdditionSections(String(head || "").trimEnd(), String(addition || "").trim());
    const scopeBlock = String(reviewScope || "").trim();
    if (/^## 사용자 검토 범위/mu.test(body)) {
      body = body.replace(/^## 사용자 검토 범위[ \t]*\r?\n([\s\S]*?)(?=^#{1,2} |$(?![\s\S]))/mu, () => `${scopeBlock}\n`);
    } else body += "\n" + scopeBlock;
    const footers = new Map([["관련 지식", []], ["출처", []]]);
    const pullFooters = (text) => String(text || "").replace(/^## (관련 지식|출처)[ \t]*\r?\n([\s\S]*?)(?=^#{1,2} |$(?![\s\S]))/gmu, (_all, title, content) => {
      footers.get(title).push(content.trim()); return "";
    }).trimEnd();
    body = pullFooters(body);
    const rest = pullFooters(tail);
    if (rest) body = body ? `${body}\n\n${rest}` : rest;
    footers.get("관련 지식").push(relatedLinks.map(link => `- ${link}`).join("\n"));
    footers.get("출처").push(sourceLinks);
    for (const [title, blocks] of footers) {
      const entries = [...new Set(blocks.flatMap(block => block.split("\n")).filter(line => line.trim()))];
      if (entries.length) body += `\n\n## ${title}\n${entries.join("\n")}`;
    }
    return body + "\n";
  }
  function citationLinksFor(groundedById, claimIds) {
    const seen = new Set();
    const links = [];
    for (const claimId of claimIds || []) {
      const grounded = groundedById.get(claimId);
      if (!grounded) continue;
      for (const citation of grounded.citations || []) {
        const locator = citation.locator || citation.source_path || "";
        if (!locator || seen.has(locator)) continue;
        seen.add(locator);
        links.push(`[원문](${encodeURI(locator)})`);
      }
    }
    return links.length ? ` ${links.join(" ")}` : "";
  }
  function renderCanonicalAddition({ item, added, isUpdate }) {
    const compiledSections = Array.isArray(item.compiled_sections) ? item.compiled_sections : [];
    if (!compiledSections.length) return item.document_body;
    const groundedById = new Map(item.grounded_claims.map((claim) => [claim.claim_id, claim]));
    const addedIds = new Set(added.map((claim) => claim.claim_id));
    const parts = [];
    if (!isUpdate) parts.push(`# ${item.title}`);
    for (const section of compiledSections) {
      const paragraphs = (section.paragraphs || []).filter((paragraph) => !isUpdate
        || (paragraph.claim_ids || []).some((claimId) => addedIds.has(claimId)));
      if (!paragraphs.length) continue;
      parts.push(`## ${section.heading}`);
      for (const paragraph of paragraphs) {
        parts.push(`${paragraph.text}${citationLinksFor(groundedById, paragraph.claim_ids)}`);
      }
    }
    return parts.join("\n\n").trim();
  }
  function create({ app, now = () => new Date().toISOString(), jobStore = null, jobId = "", onStateChange = null }) {
    const adapter = obsidian.createObsidianAdapter(app), prepared = new WeakMap();
    const recoveryKey = item => sha(String(item.review_id));
    async function saveReview(state, status, outcome = null) {
      if (!jobStore || !jobId) return;
      await jobStore.load();
      const snapshot = jobStore.getPlanSnapshot(jobId);
      if (!snapshot) throw new Error("processing_plan_required");
      const previous = snapshot.canonical_reviews?.[recoveryKey(state.item)];
      const superseded = previous?.superseded_reviews || [];
      const changedPacket = previous && previous.packet?.packet_hash !== state.packet.packet_hash;
      if (changedPacket && status !== "review_ready") throw new Error("stale_review_packet");
      const { superseded_reviews: ignoredHistory, ...previousReview } = previous || {};
      const record = { item: state.item, fields: state.fields, packet: state.packet, claim_set: state.claimSet,
        superseded_reviews: changedPacket ? [...superseded, previousReview] : superseded,
        promotion_input: state.promotionInput, promotion_receipt: state.receipt,
        sources: [...state.snapshots.values()].map(({ source_text, ...source }) => source),
        source_paths: Object.fromEntries(state.sourcePaths), status, outcome,
        original_reviewed_at: state.reviewedAt || null, retry_requested_at: state.retryRequestedAt || null,
        origin_plan_hash: state.originPlanHash || snapshot.plan_hash, updated_at: now(), automatic_approval: false };
      await jobStore.savePlanSnapshot({ ...snapshot, plan_revision: snapshot.plan_revision + 1,
        canonical_reviews: { ...(snapshot.canonical_reviews || {}), [recoveryKey(state.item)]: record } });
      onStateChange?.();
    }
    function previewFor(packet, claimSet, sourcePaths) {
      return Object.freeze({ before: packet.before_bytes, after: packet.after_bytes, target_path: packet.target_path,
        claim_count: claimSet.claims.length, source_paths: [...sourcePaths.values()], packet_hash: packet.packet_hash });
    }
    async function restore(item) {
      if (!jobStore || !jobId) return { ok: true, status: "not_available" };
      let record = null, observedWritten = null;
      const restoreFailure = (reason, extra = {}) => fail(reason, { stage: "restore", ...extra,
        ...(record?.packet ? { retained_preview: { before: record.packet.before_bytes, after: record.packet.after_bytes, target_path: record.packet.target_path }, fields: record.fields, already_written: observedWritten } : {}) });
      try {
        await jobStore.load();
        const plan = jobStore.getPlanSnapshot(jobId);
        record = [plan, ...(plan?.history || []).slice().reverse()].map(snapshot => snapshot?.canonical_reviews?.[recoveryKey(item)]).find(Boolean);
        if (!record) return { ok: true, status: "not_available" };
        if (!["review_ready", "running", "blocked", "resolved"].includes(record.status)) return restoreFailure("invalid_review_state");
        const rawPacket = record.packet;
        const op = operation.parseCanonicalOperation(JSON.stringify(Object.fromEntries(["operation_id", "proposal_id", "proposal_kind", "payload_hash"].map(key => [key, rawPacket.operation[key]]))));
        if (!op.ok) return restoreFailure(op.reason);
        const derived = operation.deriveCanonicalPacketOperation(op.value);
        if (!derived.ok) return restoreFailure(derived.reason);
        const original = { ...rawPacket, operation: derived.value };
        const checked = packetApi.verifyCanonicalPacket(original);
        if (!checked.ok) return restoreFailure(checked.reason);
        const live = await adapter.readBytes(original.target_path);
        observedWritten = live === original.after_bytes;
        if (live !== original.after_bytes && live !== (original.operation.proposal_kind === "create" ? null : original.before_bytes)) return restoreFailure("stale_before_write", { item: record.item });
        const sourcePaths = new Map(Object.entries(record.source_paths)), snapshots = new Map();
        for (const source of record.sources) snapshots.set(source.source_id, { ...source, source_text: await readSource(sourcePaths.get(source.source_id), source.source_content_hash) });
        const old = record.claim_set;
        const rawClaims = old.claims.map(claim => ({ origin: claim.origin, text: claim.text,
          ...(claim.citation_ids.length ? { citations: claim.citation_ids.map(id => old.citations.find(c => c.citation_id === id)).map(c => ({ source_id: c.source_id, provider_span: { start: c.source_span.start - snapshots.get(c.source_id).provider_window.start, end: c.source_span.end - snapshots.get(c.source_id).provider_window.start, span_digest: c.span_digest } })) } : {}),
          ...(claim.derived_from_claim_ids.length ? { derivation_indices: claim.derived_from_claim_ids.map(id => old.claims.findIndex(c => c.claim_id === id)) } : {}) }));
        const rebuilt = claims.createClaimSet({ source_snapshots: [...snapshots.values()], claims: rawClaims });
        if (!rebuilt.ok) return restoreFailure(rebuilt.reason);
        if (rebuilt.value.claim_set_hash !== old.claim_set_hash) return restoreFailure("claim_set_hash_mismatch");
        const document = store.parseLifecycleDocument(original.after_bytes);
        const receipt = promotion.evaluatePromotion(record.promotion_input);
        if (!receipt.canonical_write_eligible || sha(stable(receipt)) !== document.promotion_receipt_hash || document.claim_set_hash !== rebuilt.value.claim_set_hash) return restoreFailure("promotion_receipt_invalid");
        if (record.status === "resolved") {
          if (!observedWritten) return restoreFailure("stale_before_write", { historical_completed: true });
          const verified = (await targets()).find(row => row.path === original.target_path && row.canonical_revision === original.after_sha256);
          if (!verified) return restoreFailure("canonical_readback_pending", { historical_completed: true });
          return { ok: true, status: "completed", current_verified: true, outcome: {
            ok: true, status: "completed", target_path: original.target_path, revision: verified.canonical_revision, trust_status: verified.trust_status,
          } };
        }
        // Only reconstruct the original exact packet. Expired work requires a fresh review,
        // never an extended expiry or a serialized approval promoted into authority.
        if (Date.parse(now()) > Date.parse(original.expires_at)) return restoreFailure("approval_expired");
        const timestamp = now(), packet = Object.freeze(original);
        const claimSet = rebuilt.value;
        const citationsFor = claim => [...new Set([...claim.citation_ids, ...claim.derived_from_claim_ids.flatMap(id => citationsFor(claimSet.claims.find(c => c.claim_id === id)))])];
        const preview = previewFor(packet, claimSet, sourcePaths);
        prepared.set(preview, { packet, claimSet, promotionInput: record.promotion_input, receipt, snapshots, sourcePaths,
          item: record.item, fields: record.fields, timestamp, citationsFor, reviewedAt: record.original_reviewed_at || null, originPlanHash: record.origin_plan_hash || plan.plan_hash, restored: true, busy: false, authorization: null, result: null });
        return { ok: true, status: "review", value: preview, item: record.item, fields: record.fields,
          already_written: live === original.after_bytes, requires_new_approval: true };
      } catch (error) { return restoreFailure(error.message || "review_restore_failed"); }
    }
    async function targets() {
      const result = await reader.create().read({ app });
      return result.ok ? result.rows : [];
    }
    async function readSource(sourcePath, expectedHash) {
      if (store.isCanonicalKnowledgeTarget(sourcePath)) throw new Error("canonical_wiki_not_independent_source");
      const file = app.vault.getAbstractFileByPath(sourcePath);
      if (!file || !sourcePath.endsWith(".md")) throw new Error("source_missing");
      const bytes = await app.vault.read(file);
      if (expectedHash && sha(bytes) !== expectedHash) throw new Error("source_revision_changed");
      return bytes;
    }
    async function prepare({ item, fields, target_path = "" }) {
      fields = { ...fields };
      try {
        if (!item || !Array.isArray(item.grounded_claims) || !item.grounded_claims.length || !item.document_body) return fail("grounded_document_required");
        for (const name of ["knowledge_kind", "knowledge_domain", "knowledge_topics", "application_trigger", "application_contexts", "conditions", "invalidation_conditions", "relation_status", "classification", "evidence_strength"]) {
          if (!String(fields && fields[name] || "").trim()) return fail("review_field_required", { field: name });
        }
        if (!registry.DOMAIN_ORDER.includes(fields.knowledge_domain) || lines(fields.knowledge_topics).some(topic => !registry.TOPICS_BY_DOMAIN[fields.knowledge_domain]?.includes(topic))) return fail("registered_classification_required");
        const target = target_path ? (await targets()).find(row => row.path === target_path) : null;
        if (target_path && !target) return fail("verified_target_required");
        const old = target ? store.parseLifecycleDocument(target.canonical_bytes) : null;
        const authorities = target ? await adapter.readFinalizedCanonicalAuthorities() : [];
        const binding = authorities.map(obsidian.finalizedCanonicalAuthorityData).find(row => row && row.path === target_path && row.revision === target.canonical_revision);
        const prior = binding && binding.canonical_v2_authority.claim_set;
        const snapshots = new Map(), sourcePaths = new Map(), raw = [];
        if (prior) {
          for (const source of prior.sources) {
            const reference = (target.citations || []).find(c => c.source_id === source.source_id);
            const locator = new RegExp(`\\[${source.source_id}\\]\\(([^)]+)\\)`, "u").exec(old.body)?.[1]
              || reference?.locator || reference?.locators?.[0];
            if (!locator) return fail("prior_source_locator_required", { source_id: source.source_id });
            const sourcePath = decodeURIComponent(locator.split("#")[0]);
            const bytes = await readSource(sourcePath, source.source_content_hash);
            snapshots.set(source.source_id, { ...source, source_text: bytes }); sourcePaths.set(source.source_id, sourcePath);
          }
          for (const claim of prior.claims) {
            raw.push({ origin: claim.origin, text: claim.text,
              ...(claim.citation_ids.length ? { citations: claim.citation_ids.map(id => prior.citations.find(c => c.citation_id === id)).map(c => ({ source_id: c.source_id, provider_span: { start: c.source_span.start - snapshots.get(c.source_id).provider_window.start, end: c.source_span.end - snapshots.get(c.source_id).provider_window.start, span_digest: c.span_digest } })) } : {}),
              ...(claim.derived_from_claim_ids.length ? { derivation_indices: claim.derived_from_claim_ids.map(id => prior.claims.findIndex(c => c.claim_id === id)) } : {}) });
          }
        }
        let added = 0;
        const addedClaims = [];
        for (const claim of item.grounded_claims) {
          if (!claim.text || !claim.citations?.length) return fail("claim_evidence_required");
          const citationRows = [];
          for (const citation of claim.citations) {
            if (!citation.content_hash || !citation.evidence_quote || !citation.locator) return fail("exact_evidence_required");
            const path = citation.source_path || citation.locator.split("#")[0];
            const bytes = await readSource(path, citation.content_hash);
            const start = bytes.indexOf(citation.evidence_quote);
            if (start < 0 || bytes.indexOf(citation.evidence_quote, start + 1) >= 0) return fail("unique_evidence_quote_required");
            const actualLine = bytes.slice(0, start).split("\n").length;
            const suppliedLine = /#L(\d+)/u.exec(citation.locator);
            if (suppliedLine && Number(suppliedLine[1]) !== actualLine) return fail("citation_locator_mismatch");
            const id = citation.source_id;
            const existing = snapshots.get(id);
            if (existing && existing.source_content_hash !== citation.content_hash) return fail("source_revision_changed");
            snapshots.set(id, existing || { source_id: id, source_kind: "immutable_source", source_revision: citation.content_hash, extractor_revision: sha("llmwiki_document_review_markdown_v1"), source_content_hash: citation.content_hash, source_text: bytes, provider_window: { start: 0, end: bytes.length } });
            sourcePaths.set(id, path);
            citationRows.push({ source_id: id, provider_span: { start, end: start + citation.evidence_quote.length, span_digest: sha(citation.evidence_quote) } });
          }
          const priorCitationIds = c => [...new Set([...c.citation_ids, ...c.derived_from_claim_ids.flatMap(id => {
            const found = prior.claims.find(row => row.claim_id === id);
            return found ? priorCitationIds(found) : [];
          })])];
          const priorCitations = c => priorCitationIds(c).map(id => prior.citations.find(row => row.citation_id === id));
          const matchedPriors = prior ? prior.claims.filter(c => c.text === claim.text) : [];
          let isDuplicate = false;
          for (const matchedPrior of matchedPriors) {
            const olds = priorCitations(matchedPrior);
            if (olds.some(oldCitation => !oldCitation)) return fail("prior_claim_graph_broken", { source_path: sourcePath });
            if (citationRows.every(row => olds.some(oldCitation => oldCitation.source_id === row.source_id && oldCitation.source_span.start === row.provider_span.start && oldCitation.source_span.end === row.provider_span.end && oldCitation.span_digest === row.provider_span.span_digest))) { isDuplicate = true; break; }
          }
          if (isDuplicate) continue;
          const indexes = [];
          citationRows.forEach(c => { const s = snapshots.get(c.source_id); const existingIndex = raw.findIndex(row => row.origin === "source_extract" && row.text === s.source_text.slice(c.provider_span.start, c.provider_span.end) && stable(row.citations) === stable([c]));
            if (existingIndex >= 0) indexes.push(existingIndex); else { indexes.push(raw.length); raw.push({ origin: "source_extract", text: s.source_text.slice(c.provider_span.start, c.provider_span.end), citations: [c] }); } });
          raw.push({ origin: "ai_interpretation", text: claim.text, derivation_indices: indexes }); added += 1; addedClaims.push(claim);
        }
        const addition = renderCanonicalAddition({ item, added: addedClaims, isUpdate: Boolean(target) });
        const exclusionsEqual = !target ? true : (fields.exclusions
          ? old.body.includes(`- 예외·금지: ${fields.exclusions}\n`)
          : !old.body.includes("- 예외·금지:"));
        const fieldsEqual = Boolean(target) && old.knowledge_kind === fields.knowledge_kind && old.knowledge_domain === fields.knowledge_domain
          && stable(old.knowledge_topics) === stable(lines(fields.knowledge_topics)) && old.application_trigger === fields.application_trigger
          && stable(old.application_contexts) === stable(lines(fields.application_contexts))
          && old.body.includes(`- 적용 조건: ${fields.conditions}\n`) && exclusionsEqual
          && stable(old.invalidation_conditions) === stable(lines(fields.invalidation_conditions));
        if (target && !added && fieldsEqual) return { ok: true, status: "no_change", target_path, provider_count: 0, writes: 0 };
        const created = claims.createClaimSet({ source_snapshots: [...snapshots.values()], claims: raw });
        if (!created.ok) return created;
        const claimSet = created.value;
        const citationsFor = claim => [...new Set([...claim.citation_ids, ...claim.derived_from_claim_ids.flatMap(id => citationsFor(claimSet.claims.find(c => c.claim_id === id)))])];
        const timestamp = now();
        const title = old?.title || item.title;
        const statement = old?.statement || item.grounded_claims.map(c => c.text).join("\n");
        const evidenceRows = claimSet.citations.map((c, i) => ({ evidence_id: `evidence_${i}`, source_ref: c.source_id, strength: fields.evidence_strength }));
        const promotionInput = { knowledge_kind: fields.knowledge_kind, classification: fields.classification, state: "current", title, statement,
          relation_status: fields.relation_status, approval_status: "approved", claim_set_hash: claimSet.claim_set_hash,
          evidence: evidenceRows, claims: claimSet.claims.map(c => ({ claim_id: c.claim_id, statement: c.text, origin: c.origin, review_status: "accepted", evidence_refs: citationsFor(c).map(id => `evidence_${claimSet.citations.findIndex(row => row.citation_id === id)}`) })),
          claim_scope: fields.conditions, principle_boundaries: { conditions: lines(fields.conditions), exclusions: lines(fields.exclusions), invalidation_conditions: lines(fields.invalidation_conditions) }, principle_rationale: fields.rationale || "",
          procedure_preconditions: lines(fields.conditions), procedure_steps: lines(fields.steps), procedure_outcome: fields.outcome || "", concept_definition: fields.definition || "", concept_boundaries: lines(fields.conditions) };
        const receipt = promotion.evaluatePromotion(promotionInput);
        if (!receipt.canonical_write_eligible) return fail("promotion_review_required", { promotion_gaps: receipt.promotion_gaps });
        const id = old?.canonical_id || `knowledge_${sha(title).slice(0, 24)}`;
        const sourceRows = [...snapshots.values()].map(s => ({ source_id: s.source_id, span: { start: 0, end: s.source_text.length } }));
        const updateBase = old ? stripReviewScopeBlock(old.body) : "";
        const sourceLinks = sourceRows.filter(s => !old || !updateBase.includes(`[${s.source_id}](`)).map(s => `- [${s.source_id}](${sourcePaths.get(s.source_id).split("/").map(encodeURIComponent).join("/")}#L1)`).join("\n");
        const reviewScope = `\n## 사용자 검토 범위\n- 적용 조건: ${fields.conditions}\n${fields.exclusions ? `- 예외·금지: ${fields.exclusions}\n` : ""}- 재검토 조건: ${fields.invalidation_conditions}\n`;
        const relatedLinks = (item.related_knowledge || []).filter(row => row.path && row.path !== target_path && app.vault.getAbstractFileByPath(row.path)).map(row => `[[${row.path.replace(/\.md$/u, "")}]]`).filter((link, index, rows) => rows.indexOf(link) === index && !item.document_body.includes(link) && !updateBase.includes(link));
        const body = integrateDocumentBody(old?.body, addition, reviewScope, relatedLinks, sourceLinks);
        const document = { ...(old || {}), schema_version: 2, type: "knowledge", canonical_id: id, knowledge_kind: fields.knowledge_kind, status: "active", title, statement,
          knowledge_domain: fields.knowledge_domain, knowledge_topics: lines(fields.knowledge_topics), application_trigger: fields.application_trigger, application_contexts: lines(fields.application_contexts), connections: old?.connections || [], invalidation_conditions: lines(fields.invalidation_conditions),
          sources: sourceRows, relations: old?.relations || [], claim_set_hash: claimSet.claim_set_hash, promotion_receipt_hash: sha(stable(receipt)), ai_enrichment_status: old?.ai_enrichment_status || "none", created: old?.created || timestamp, updated: timestamp, body };
        delete document.legacy;
        const suffix = sha(stable(document)).slice(0, 24);
        const op = operation.parseCanonicalOperation(JSON.stringify({ operation_id: `operation_${suffix}`, proposal_id: `proposal_${suffix}`, proposal_kind: target ? "update" : "create", payload_hash: sha(stable(document)) }));
        if (!op.ok) return op;
        const packet = await packetApi.assembleCanonicalPacket({ run_id: `run_${suffix}`, operation: op.value, canonical_document: document, ...(target ? { target_path } : {}), source_citations: sourceRows.map(s => ({ source_id: s.source_id, content_hash: snapshots.get(s.source_id).source_content_hash, locators: [`${sourcePaths.get(s.source_id)}#L1`] })),
          consent_hash: sha(stable({ review_id: item.review_id, sources: sourceRows, action: "local_canonical_review" })), expires_at: new Date(Date.parse(timestamp) + 3600000).toISOString(), nonce: `review_${suffix}_${Date.parse(timestamp)}` }, adapter);
        if (!packet.ok) return packet;
        if (packet.status === "stale_reconfirm_required") return fail("existing_knowledge_target_required");
        const value = Object.freeze({ before: packet.value.before_bytes, after: packet.value.after_bytes, target_path: packet.value.target_path, claim_count: claimSet.claims.length, added_claim_texts: addedClaims.map((claim) => claim.text), source_paths: [...sourcePaths.values()], packet_hash: packet.value.packet_hash });
        const state = { packet: packet.value, claimSet, promotionInput, receipt, snapshots, sourcePaths, timestamp, citationsFor, item, fields, busy: false, authorization: null, result: null };
        await saveReview(state, "review_ready");
        prepared.set(value, state);
        return { ok: true, status: "review", value, durable: Boolean(jobStore && jobId) };
      } catch (error) { return fail(error.message || "document_review_failed"); }
    }
    async function apply(preview, decision) {
      const state = prepared.get(preview);
      if (!state || decision?.approved !== true || decision?.claims_accepted !== true || decision.packet_hash !== preview.packet_hash) return fail("explicit_exact_approval_required");
      if (state.busy) return fail("action_in_progress");
      state.busy = true;
      try {
        for (const [id, source] of state.snapshots) await readSource(state.sourcePaths.get(id), source.source_content_hash);
        if (state.result?.ok) {
          if (await adapter.readBytes(preview.target_path) !== preview.after) return fail("stale_before_write");
          const verified = (await targets()).some(row => row.path === preview.target_path && row.canonical_revision === state.packet.after_sha256);
          return verified ? state.result : fail("canonical_readback_pending");
        }
        if (!state.authorization) {
          state.reviewedAt ||= now();
          if (state.restored) state.retryRequestedAt = now();
          const accepted = claims.transitionClaimSet(state.claimSet, { claim_set_hash: state.claimSet.claim_set_hash, claim_ids: state.claimSet.claims.map(c => c.claim_id), status: "accepted", authorized_by: "human_wiki_reviewer", authorized_at: state.reviewedAt });
          if (!accepted.ok) return accepted;
          const v2 = writer.authorizeCanonicalV2({ packet: state.packet, canonical_id: store.parseLifecycleDocument(preview.after).canonical_id, claim_set: accepted.value, promotion_input: state.promotionInput, promotion_receipt: state.receipt });
          if (!v2.ok) return v2;
          if (state.packet.operation.proposal_kind === "update") {
            const assessed = evidence.evaluateEvidence({ operation_id: state.packet.operation.operation_id, claims: accepted.value.claims.map(c => ({ claim_id: c.claim_id, text: c.text, changed: true, citation_ids: state.citationsFor(c) })), citations: accepted.value.citations.map(c => ({ citation_id: c.citation_id, source_id: c.source_id, source_span: { ...c.source_span, locator: `${state.sourcePaths.get(c.source_id)}#L${state.snapshots.get(c.source_id).source_text.slice(0, c.source_span.start).split("\n").length}` }, source_length: state.snapshots.get(c.source_id).source_text.length, source_content_hash: c.source_content_hash, extractor_revision: c.extractor_revision })), verification: { verified_at: state.reviewedAt, owner: { owner_id: "human_wiki_reviewer", owner_type: "human" }, validity_conditions: lines(state.promotionInput.claim_scope), invalidation_conditions: lines(state.promotionInput.principle_boundaries.invalidation_conditions.join("\n")), stale_triggers: [...state.snapshots.values()].map(s => ({ trigger_id: `trigger_${s.source_id}`, kind: "extractor_revision_changed", source_id: s.source_id })) }, current_source_snapshots: Object.fromEntries([...state.snapshots.values()].map(s => [s.source_id, { source_length: s.source_text.length, content_hash: s.source_content_hash, extractor_revision: s.extractor_revision }])), triggered_conditions: [] });
            if (!assessed.ok) return assessed;
            const auth = writer.authorizeCanonicalUpdate({ packet: state.packet, canonical_id: v2.value.canonical_id, evidence: assessed.value, canonical_v2_authorization: v2.value, compensation_plan: { strategy: "restore_exact_before_bytes", target_path: preview.target_path, before_sha256: state.packet.before_sha256 } });
            if (!auth.ok) return auth; state.authorization = auth.value;
          } else state.authorization = v2.value;
        }
        await saveReview(state, "running");
        const method = state.packet.operation.proposal_kind === "update" ? "commitApprovedUpdate" : "commitApprovedCanonicalV2";
        const committed = await writer[method]({ packet: state.packet, authorization: state.authorization, adapter }, { now: now() });
        if (!["committed", "duplicate"].includes(committed.status)) {
          await saveReview(state, "blocked", committed);
          return fail(committed.reason || committed.status, { stage: "apply", operation_kind: state.packet.operation.proposal_kind, writer_result: committed });
        }
        const refreshed = await reader.create().read({ app });
        const row = refreshed.rows?.find(row => row.path === preview.target_path && row.canonical_revision === sha(preview.after));
        if (!row) { await saveReview(state, "blocked", committed); return fail("canonical_readback_pending", { stage: "readback", writer_result: committed, target_path: preview.target_path }); }
        const complete = { ok: true, status: "completed", target_path: preview.target_path, revision: row.canonical_revision, trust_status: row.trust_status, writer_result: committed };
        try { await saveReview(state, "resolved", complete); }
        catch (error) { return fail("review_checkpoint_failed", { stage: "processing_state", detail: error.message, writer_result: committed, target_path: preview.target_path }); }
        state.result = complete;
        return state.result;
      } catch (error) { return fail(error.message || "canonical_apply_failed"); }
      finally { state.busy = false; }
    }
    return Object.freeze({ prepare, apply, targets, restore });
  }
  const ui = dep("ProdigyWikiWorkspaceView", "./prodigy-wiki-workspace-view.js");
  const OPEN_REVIEWS = new WeakMap();
  function open({ app, Modal, item, onComplete, onOpenSource, jobStore = null, jobId = "", onStateChange = null,
    container = null, decisionContainer = null, workspace = null, renderMarkdown = null, onLater = null, onNext = null, onSelectSource = null, intendedTargetPath = "" }) {
    let sessions = OPEN_REVIEWS.get(app);
    if (!sessions) { sessions = new Map(); OPEN_REVIEWS.set(app, sessions); }
    const key = sha(stable([jobId, item.review_id, item.document_body, item.grounded_claims, Boolean(container)]));
    const cached = sessions.get(key);
    if (cached) {
      Object.assign(cached.callbacks, { onComplete, onOpenSource, onStateChange, decisionContainer, workspace, renderMarkdown, onLater, onNext, onSelectSource });
      if (container) cached.modal.contentEl = container;
      cached.modal.onClose = cached.onClose; cached.modal.open(); return cached.modal;
    }
    const callbacks = { onComplete, onOpenSource, onStateChange, decisionContainer, workspace, renderMarkdown, onLater, onNext, onSelectSource };
    const flow = create({ app, jobStore, jobId, onStateChange: () => callbacks.onStateChange?.() });
    const modal = container ? { contentEl: container, open() { this.ready = this.onOpen(); }, close() { this.onClose?.(); callbacks.onLater?.(); } } : new Modal(app);
    const viewState = { fields: {}, preview: null, lastResult: null, render: 0, restored: false, restoreError: "" };
    const onClose = () => { viewState.render += 1; };
    modal.onClose = onClose;
    sessions.set(key, { modal, callbacks, onClose });
    modal.onOpen = async () => {
      const renderId = ++viewState.render;
      if (!viewState.restored) {
        const restored = await flow.restore(item);
        viewState.restored = true;
        if (restored.ok && restored.status === "review") { viewState.preview = restored.value; viewState.fields = { ...restored.fields }; }
        else if (!restored.ok) { viewState.restoreError = restored.reason; viewState.blockedPreview = restored.retained_preview; viewState.alreadyWritten = restored.already_written; viewState.fields = { ...(restored.fields || {}) }; }
        else if (restored.status === "completed") viewState.lastResult = restored.outcome;
        if (renderId !== viewState.render) return;
      }
      const el = modal.contentEl; el.empty();
      el.addClass?.("llmwiki-document-review");
      el.createEl("style", { text: `.llmwiki-document-review label:not([hidden]) { display: flex; flex-direction: column; gap: .35rem; margin: .8rem 0; }
        .llmwiki-document-review label:has(input[type="checkbox"]) { flex-direction: row; align-items: flex-start; }
        .llmwiki-document-review label > select, .llmwiki-document-review label > textarea { width: 100%; max-width: 100%; box-sizing: border-box; }
        .llmwiki-document-review textarea { min-height: 4rem; resize: vertical; }
        .llmwiki-document-review pre { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 100%; }
        .llmwiki-document-review button { white-space: normal; max-width: 100%; height: auto; min-height: 2rem; }
        .llmwiki-document-review [role="status"] { overflow-wrap: anywhere; }` });
      el.createEl("h2", { text: item.title });
      el.createEl("p", { text: "AI 초안 · 문서 반영 전", attr: { "data-review-category": "draft" } });
      const decision = callbacks.decisionContainer || el.createEl("footer", { attr: { class: "wiki-decision-bar" } });
      decision.empty();
      callbacks.workspace?.setJourney({ status: viewState.lastResult?.ok ? "applied" : viewState.alreadyWritten ? "applying" : "review" });
      const reusableNames = ["knowledge_kind", "knowledge_domain", "knowledge_topics", "application_trigger", "application_contexts", "conditions", "exclusions", "invalidation_conditions", "rationale", "steps", "outcome", "definition", "classification"];
      const asText = value => Array.isArray(value) ? value.join("\n") : typeof value === "string" ? value : "";
      const defaults = source => Object.fromEntries(reusableNames.filter(name => asText(source?.[name])).map(name => [name, asText(source[name])]));
      if (!viewState.seeded) { viewState.fields = { ...viewState.fields }; viewState.seeded = true; }
      const fields = viewState.fields, inputs = [], fieldRows = {}, fieldInputs = {};
      const sources = [...new Set((item.grounded_claims || []).flatMap(claim => (claim.citations || []).map(c => c.source_path || c.locator?.split("#")[0])).filter(Boolean))];
      el.createEl("p", { text: `출처: ${sources.map(ui.title).join(" · ")}`, attr: { "data-review-sources": "" } });
      const storage = el.createEl("fieldset", { attr: { class: "wiki-storage-choices", "data-storage-choices": "" } });
      storage.createEl("legend", { text: "저장 방식" });
      const modes = {};
      for (const [mode, label] of [["new", "새 문서로 저장"], ["existing", "기존 문서에 내용 추가"]]) {
        const row = storage.createEl("label");
        modes[mode] = row.createEl("input", { attr: { type: "radio", name: `storage-${item.review_id}`, value: mode, "data-storage-mode": mode } });
        row.createEl("span", { text: label });
      }
      const targetHost = storage.createEl("div", { attr: { class: "wiki-storage-targets" } });
      const changes = el.createDiv({ attr: { "data-proposed-document": "" } });
      ui.markdown(changes, item.document_body || "원문 근거를 확인하세요.", callbacks.renderMarkdown);
      const evidenceEl = el.createEl("details"); evidenceEl.createEl("summary", { text: `근거 ${(item.grounded_claims || []).length}개` });
      for (const claim of item.grounded_claims || []) {
        evidenceEl.createEl("p", {text:claim.text});
        for (const c of claim.citations || []) { evidenceEl.createEl("blockquote", {text:c.evidence_quote || "원문 확인 필요"}); const b=evidenceEl.createEl("button",{text:ui.title(c.source_path || c.locator?.split("#")[0]),attr:{type:"button","data-citation-locator":c.locator}});b.onclick=()=>callbacks.onOpenSource?.(c.locator, c, b, () => { viewState.blockedPreview = preview; viewState.restoreError = "source_revision_changed"; invalidate(); accepted.disabled = true; status.setText(recoveryCopy({ reason: "source_revision_changed" })); }); }
      }
      const inheritedFields = el.createEl("details", { attr: { class: "wiki-review-fields", "data-review-conditions": "" } });
      inheritedFields.createEl("summary", { text: `저장 조건${fields.knowledge_kind || fields.knowledge_domain ? ` · ${[fields.knowledge_kind, fields.knowledge_domain, fields.knowledge_topics].filter(Boolean).join(" · ")}` : ""}` });
      const groups = {};
      for (const [id, label] of [["classification", "분류"], ["scope", "사용 범위"], ["principle", "원칙"], ["procedure", "절차"], ["concept", "개념"], ["human", "사람의 판단"]]) {
        groups[id] = inheritedFields.createEl("fieldset", { attr: { "data-review-group": id } }); groups[id].createEl("legend", { text: label });
      }
      const groupFor = { knowledge_kind: "classification", classification: "classification", knowledge_domain: "classification", knowledge_topics: "classification", application_trigger: "scope", application_contexts: "scope", conditions: "scope", invalidation_conditions: "scope", exclusions: "principle", rationale: "principle", steps: "procedure", outcome: "procedure", definition: "concept", relation_status: "human", evidence_strength: "human" };
      let accepted = null, applyButton = null, topicOptions = null, formRevision = 0, prepareButton = null, status = null, busy = false;
      const required = () => ["knowledge_kind", "classification", "knowledge_domain", "knowledge_topics", "application_trigger", "application_contexts", "conditions", "invalidation_conditions", "relation_status", "evidence_strength", ...({ principle: ["exclusions", "rationale"], procedure: ["steps", "outcome"], concept: ["definition"] }[fields.knowledge_kind] || [])];
      const field = (name, label, choices) => {
        const row = (name === "target_path" ? targetHost : groups[groupFor[name]]).createEl("label"); fieldRows[name] = row; row.createEl("span", { text: label });
        const multiline = ["knowledge_topics", "application_contexts", "conditions", "invalidation_conditions", "exclusions", "rationale", "steps", "definition"].includes(name);
        const input = row.createEl(choices ? "select" : multiline ? "textarea" : "input", { attr: { "data-review-field": name, "aria-label": label, ...(!choices && !multiline ? { type: "text" } : {}) } });
        if (choices) { input.createEl("option", { text: "선택하세요", attr: { value: "" } }); choices.forEach(([value,text]) => input.createEl("option", {text,attr:{value}})); }
        fieldInputs[name] = input;
        input.value = fields[name] || "";
        input.oninput = () => { if (busy || viewState.lastResult?.ok) return; fields[name] = input.value; invalidate(); showKindFields(); if (name === "knowledge_domain") { fields.knowledge_topics = ""; if (fieldInputs.knowledge_topics) fieldInputs.knowledge_topics.value = ""; showTopicOptions(); } };
        inputs.push(input); return input;
      };
      let preview = viewState.preview;
      function invalidate() {
        preview = null; viewState.preview = null; viewState.lastResult = null; formRevision += 1;
        if (accepted) accepted.checked = false;
        if (applyButton) applyButton.disabled = true;
        if (prepareButton) { prepareButton.hidden = false; applyButton.hidden = true; }
        if (status) status.setText("변경안을 다시 확인하세요. 다음: 승인 및 적용");
        changes.empty(); ui.attr(changes, "data-exact-preview", "false"); ui.markdown(changes, item.document_body, callbacks.renderMarkdown);
      }
      function showKindFields() {
        for (const [name, kind] of Object.entries({ exclusions: "principle", rationale: "principle", steps: "procedure", outcome: "procedure", definition: "concept" })) {
          if (fieldRows[name]) fieldRows[name].hidden = fields.knowledge_kind !== kind;
        }
        for (const kind of ["principle", "procedure", "concept"]) groups[kind].hidden = fields.knowledge_kind !== kind;
        if (required().some(name => !fields[name])) inheritedFields.open = true;
      }
      const target = field("target_path", "대상 문서", [["new", "새 문서로 저장"]]);
      const currentTargets = await flow.targets();
      if (renderId !== viewState.render) return;
      for (const row of currentTargets) target.createEl("option", { text: row.title || row.path, attr: { value: row.path } });
      if (preview && fields.target_path && fields.target_path !== "new" && !currentTargets.some(row => row.path === fields.target_path)) {
        target.createEl("option", { text: `${fields.target_path} · 적용 후 검증 대기`, attr: { value: fields.target_path } });
      }
      if (!viewState.targetSeeded && intendedTargetPath && currentTargets.some(row => row.path === intendedTargetPath)) fields.target_path = intendedTargetPath;
      viewState.targetSeeded = true;
      target.value = fields.target_path || "";
      modes.new.checked = fields.target_path === "new";
      modes.existing.checked = Boolean(fields.target_path && fields.target_path !== "new");
      targetHost.hidden = !modes.existing.checked;
      const targetSearch = targetHost.createEl("input", { attr: { type: "search", placeholder: "문서 검색", "aria-label": "대상 문서 검색" } });
      targetSearch.oninput = () => { for (const option of target.children) option.hidden = option.value === "new" || Boolean(targetSearch.value) && !String(option.textContent || option.text).toLocaleLowerCase("ko").includes(targetSearch.value.toLocaleLowerCase("ko")); };
      inputs.push(targetSearch, ...Object.values(modes));
      target.oninput = async () => {
        const selected = target.value;
        invalidate();
        const existing = currentTargets.find(row => row.path === selected);
        const doc = existing ? store.parseLifecycleDocument(existing.canonical_bytes) : null;
        const inherited = defaults(doc);
        if (doc) {
          // These values were explicitly recorded by a prior review; do not infer new safety decisions.
          const scope = String(doc.body || "").split("## 사용자 검토 범위\n").slice(1).pop()?.split(/^## /m)[0] || "";
          for (const [name, label] of [["conditions", "적용 조건"], ["exclusions", "예외·금지"]]) {
            const value = scope.match(new RegExp(`^- ${label}: ([^\\n]*)`, "m"))?.[1];
            if (value) inherited[name] = value;
          }
        }
        viewState.fields = { ...inherited, target_path: selected };
        viewState.restoreError = ""; viewState.blockedPreview = null;
        return modal.onOpen();
      };
      modes.new.onchange = () => { if (!busy) { target.value = "new"; return target.oninput(); } };
      modes.existing.onchange = () => {
        if (busy) return;
        invalidate(); fields.target_path = ""; target.value = ""; modes.new.checked = false; modes.existing.checked = true; targetHost.hidden = false; targetSearch.focus?.();
      };
      if (modes.existing.checked) {
        const chosen = currentTargets.find(row => row.path === fields.target_path);
        if (chosen) { targetHost.createEl("p", { text: `대상: ${chosen.title || ui.title(chosen.path)}` }); const change = targetHost.createEl("button", { text: "변경", attr: { type: "button", "data-action": "change-target" } }); change.onclick = () => targetSearch.focus?.(); inputs.push(change); }
      }
      field("knowledge_kind", "지식 종류", [["claim","주장"],["principle","원칙"],["procedure","절차"],["concept","개념"]]);
      field("classification", "내용 성격", [["epistemic","재사용할 지식"],["operational","실행 업무"],["mixed","지식·업무 혼합"]]);
      field("knowledge_domain", "분야", registry.DOMAIN_ORDER.map(domain => [domain, domain])); field("knowledge_topics", "주제");
      field("application_trigger", "사용할 때"); field("application_contexts", "사용 맥락");
      field("conditions", "적용 범위"); field("exclusions", "예외·금지사항");
      field("invalidation_conditions", "다시 검토할 조건"); field("rationale", "원칙의 근거");
      field("steps", "절차"); field("outcome", "기대 결과"); field("definition", "개념 정의");
      field("relation_status", "기존 지식과의 관계", [["resolved","상충·중복 검토 완료"],["conflict","상충 미해결"],["duplicate","중복 확인 필요"]]);
      field("evidence_strength", "근거 수준", [["sufficient","충분함"],["strong","강함"],["thin","부족함"]]);
      // Offer existing analysis text for explicit reuse, never infer a condition or a passed check.
      const reuse = (name, text) => {
        const input = fieldInputs[name];
        fields[name] = [...new Set([...lines(fields[name]), String(text)])].join("\n");
        input.value = fields[name]; invalidate();
      };
      for (const [name, value] of Object.entries(defaults(item))) {
        const suggestion = fieldRows[name].createEl("button", { text: "분석 값 사용", attr: { type: "button", "data-field-suggestion": name } });
        suggestion.onclick = () => { fieldInputs[name].value = value; fieldInputs[name].oninput(); }; inputs.push(suggestion);
      }
      for (const [name, label] of [["conditions", "분석된 주장 중 적용 조건 선택"], ["exclusions", "분석된 주장 중 예외·금지 선택"]]) {
        const select = fieldRows[name].createEl("select", { attr: { "data-analysis-reuse": name, "aria-label": label } });
        select.createEl("option", { text: label, attr: { value: "" } });
        (item.grounded_claims || []).forEach((claim, index) => select.createEl("option", { text: claim.text, attr: { value: String(index) } }));
        select.onchange = () => { const claim = item.grounded_claims?.[Number(select.value)]; if (select.value !== "" && claim?.text) reuse(name, claim.text); select.value = ""; };
        inputs.push(select);
      }
      if (item.plan_purpose) {
        const usePurpose = fieldRows.application_trigger.createEl("button", { text: `분석된 사용 목적 사용: ${item.plan_purpose}`, attr: { type: "button" } });
        usePurpose.onclick = () => reuse("application_trigger", item.plan_purpose); inputs.push(usePurpose);
      }
      topicOptions = fieldRows.knowledge_topics.createEl("select", { attr: { "data-topic-options": "true", "aria-label": "주제 선택" } });
      function showTopicOptions() {
        if (!fieldRows.knowledge_topics) return;
        const picker = topicOptions;
        if (!picker) return;
        picker.empty(); picker.createEl("option", { text: "주제 선택", attr: { value: "" } });
        (registry.TOPICS_BY_DOMAIN[fields.knowledge_domain] || []).forEach(topic => picker.createEl("option", { text: topic, attr: { value: topic } }));
      }
      topicOptions.onchange = () => { if ((registry.TOPICS_BY_DOMAIN[fields.knowledge_domain] || []).includes(topicOptions.value)) reuse("knowledge_topics", topicOptions.value); topicOptions.value = ""; };
      inputs.push(topicOptions); showTopicOptions();
      // Domain/Topic candidates from related existing documents. Suggest only;
      // nothing is applied until the user clicks. Unreadable relations stay empty.
      const candidatePaths = [...new Set((item.related_knowledge || []).map(row => row && row.path).filter(p => typeof p === "string" && p.endsWith(".md")))].slice(0, 8);
      const candidateDomains = new Map(), candidateTopics = new Map();
      for (const candidatePath of candidatePaths) {
        try {
          const candidateFile = app.vault.getAbstractFileByPath(candidatePath);
          if (!candidateFile) continue;
          const candidateBytes = await (app.vault.cachedRead ? app.vault.cachedRead(candidateFile) : app.vault.read(candidateFile));
          const candidateDoc = store.parseLifecycleDocument(candidateBytes);
          const candidateDomain = candidateDoc && candidateDoc.knowledge_domain;
          if (!registry.DOMAIN_ORDER.includes(candidateDomain)) continue;
          candidateDomains.set(candidateDomain, (candidateDomains.get(candidateDomain) || 0) + 1);
          for (const candidateTopic of [].concat(candidateDoc.knowledge_topics || [])) {
            if (registry.TOPICS_BY_DOMAIN[candidateDomain]?.includes(candidateTopic)) {
              const key = `${candidateDomain}|||${candidateTopic}`;
              candidateTopics.set(key, (candidateTopics.get(key) || 0) + 1);
            }
          }
        } catch { /* unreadable related documents offer no candidates */ }
      }
      if (renderId !== viewState.render) return;
      const topCandidates = counts => [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (candidateDomains.size || candidateTopics.size) {
        const candidateBox = fieldRows.knowledge_domain.createEl("div", { attr: { "data-candidates": "domain-topic" } });
        candidateBox.createEl("span", { text: "관련 문서 후보 (선택 시 적용): " });
        for (const [domain, count] of topCandidates(candidateDomains)) {
          const chip = candidateBox.createEl("button", { text: `분야 ${domain} (${count})`, attr: { type: "button", "data-candidate-domain": domain } });
          chip.onclick = () => { if (fieldInputs.knowledge_domain) { fieldInputs.knowledge_domain.value = domain; fieldInputs.knowledge_domain.oninput(); } };
          inputs.push(chip);
        }
        for (const [key, count] of topCandidates(candidateTopics)) {
          const [domain, topic] = key.split("|||");
          const chip = candidateBox.createEl("button", { text: `주제 ${topic} (${count})`, attr: { type: "button", "data-candidate-domain": domain, "data-candidate-topic": topic } });
          chip.onclick = () => { if (fieldInputs.knowledge_domain) { fieldInputs.knowledge_domain.value = domain; fieldInputs.knowledge_domain.oninput(); } reuse("knowledge_topics", topic); };
          inputs.push(chip);
        }
      }
      showKindFields();
      status = decision.createEl("p", { text: "다음: 승인 및 적용", attr: { role: "status", "data-decision-status": "" } });
      const acceptedLabel = decision.createEl("label"); accepted = acceptedLabel.createEl("input", { attr: { type: "checkbox", "data-review-acknowledgement": "" } }); accepted.checked = false;
      acceptedLabel.createEl("span", { text: "변경 내용과 출처를 확인했습니다." });
      const actions = decision.createEl("div", { attr: { "data-decision-actions": "" } });
      const later = ui.button(actions, "나중에", "review-later", () => { if (!busy) modal.close(); });
      prepareButton = ui.button(actions, "변경안 확인", "prepare-document-review", null, true);
      applyButton = ui.button(actions, "승인 및 적용", "apply-document-review", null, true);
      applyButton.disabled = true;
      const sync = () => {
        acceptedLabel.hidden = !preview; accepted.disabled = busy || !preview;
        prepareButton.hidden = Boolean(preview); applyButton.hidden = !preview;
        applyButton.disabled = busy || !preview || !accepted.checked || viewState.lastResult?.ok === true;
      };
      const setBusy = value => { busy = value; inputs.forEach(input => input.disabled = value); prepareButton.disabled = value; later.disabled = value; accepted.disabled = value; callbacks.workspace?.setLocked(value); };
      const blockedField = (name, reason) => {
        inheritedFields.open = true;
        const row = fieldRows[name];
        if (row) { row.hidden = false; row.createEl("span", { text: `! ${reason}`, attr: { role: "alert", "data-field-error": name } }); fieldInputs[name].focus?.(); }
        status.setText(reason);
      };
      const applied = result => {
        status.setText("문서에 적용했습니다."); callbacks.workspace?.setJourney({ status: "applied" });
        acceptedLabel.hidden = true; prepareButton.hidden = true; applyButton.hidden = true;
        inputs.forEach(input => input.disabled = true);
        const link = el.createEl("a", { text: ui.title(result.target_path), attr: { href: result.target_path, "data-applied-document": result.target_path } });
        link.onclick = event => { event?.preventDefault?.(); app.workspace?.openLinkText?.(result.target_path, "", false); };
        ui.button(actions, "문서 열기", "open-applied-document", () => app.workspace?.openLinkText?.(result.target_path, "", false), true);
        later.setText(callbacks.onNext ? "다음 제안 확인" : "다른 자료 선택"); later.onclick = () => callbacks.onNext ? callbacks.onNext() : callbacks.onSelectSource ? callbacks.onSelectSource() : modal.close();
      };
      accepted.onchange = () => { sync(); status.setText(accepted.checked && preview ? "이 변경만 승인하고 적용합니다." : "변경 내용과 출처를 확인하고 체크하세요."); };
      prepareButton.onclick = async () => {
        if (busy) return;
        if (!fields.target_path) { status.setText("저장 방식과 대상 문서를 선택하세요."); (modes.existing.checked ? target : modes.new).focus?.(); return; }
        const missing = required().find(name => !String(fields[name] || "").trim());
        if (missing) { blockedField(missing, `${ui.FIELD_LABELS[missing]}을 확인하세요.`); return; }
        const requestRevision = ++formRevision; preview = null; viewState.preview = null; viewState.lastResult = null;
        setBusy(true); applyButton.disabled = true; accepted.checked = false; status.setText("변경과 출처를 확인하고 있습니다.");
        const result = await flow.prepare({ item, fields: { ...fields }, target_path: fields.target_path === "new" ? "" : fields.target_path || "" });
        setBusy(false);
        if (requestRevision !== formRevision || renderId !== viewState.render) return;
        if (!result.ok) {
          status.setText(`! 적용 전에 확인할 항목이 있습니다. ${recoveryCopy(result)}`);
          const fieldName = result.field || (fields.relation_status !== "resolved" ? "relation_status" : fields.evidence_strength === "thin" ? "evidence_strength" : "");
          if (fieldName) blockedField(fieldName, recoveryCopy(result));
          const diagnostics = el.createEl("details"); diagnostics.createEl("summary", { text: "상세 정보" }); diagnostics.createEl("pre", { text: JSON.stringify(result, null, 2) });
          return;
        }
        if (result.status === "no_change") {
          status.setText("이미 반영된 내용입니다."); prepareButton.hidden = true;
          ui.button(actions, callbacks.onNext ? "다음 제안 확인" : "다른 자료 선택", "next-proposal", () => callbacks.onNext ? callbacks.onNext() : callbacks.onSelectSource ? callbacks.onSelectSource() : modal.close(), true);
          if (result.target_path) ui.button(actions, "문서 열기", "open-applied-document", () => app.workspace?.openLinkText?.(result.target_path, "", false));
          return;
        }
        preview = result.value; viewState.preview = preview; viewState.restoreError = ""; viewState.blockedPreview = null;
        ui.exactPreview(changes, preview, { ...callbacks, reviewFields: fields }); sync(); status.setText("변경 내용과 출처를 확인하고 체크하세요.");
      };
      applyButton.onclick = async () => {
        if (busy || !preview || !accepted.checked || viewState.lastResult?.ok) return;
        setBusy(true); sync(); callbacks.workspace?.setJourney({ status: "applying" });
        status.setText("승인한 변경을 적용하고 있습니다.");
        const progress = decision.createEl("progress", { attr: { "aria-label": "문서 적용 중" } });
        const result = await flow.apply(preview, { approved: true, claims_accepted: true, packet_hash: preview.packet_hash });
        progress.remove?.(); viewState.lastResult = result; setBusy(false); accepted.checked = false;
        if (renderId !== viewState.render) return;
        if (result.ok) { applied(result); await callbacks.onComplete?.(result); }
        else {
          const written = result.reason === "canonical_readback_pending" || result.reason === "review_checkpoint_failed" || result.writer_result?.status === "committed";
          const stale = ["stale_before_write", "source_revision_changed", "approval_expired"].includes(result.reason);
          status.setText(written ? "문서는 저장됐지만 확인이 끝나지 않았습니다." : stale ? "검토 이후 내용이 바뀌었습니다. 변경안을 다시 확인해야 합니다." : recoveryCopy(result));
          callbacks.workspace?.setJourney({ status: written ? "applying" : "blocked" });
          if (stale) { viewState.blockedPreview = preview; preview = null; viewState.preview = null; }
          sync(); if (written) applyButton.setText("저장 상태 다시 확인");
          if (stale) prepareButton.setText("변경안 다시 준비");
        }
      };
      sync();
      if (viewState.restoreError) status.setText(recoveryCopy({ reason: viewState.restoreError }));
      if (!preview && viewState.blockedPreview) {
        ui.exactPreview(changes, viewState.blockedPreview, { ...callbacks, reviewFields: fields });
        el.createEl("p", { text: "이전 변경안 · 현재 적용 승인 아님", attr: { role: "alert" } });
        accepted.disabled = true; applyButton.disabled = true;
        prepareButton.setText("변경안 다시 준비");
        if (viewState.alreadyWritten !== false) {
          prepareButton.disabled = true;
          ui.button(actions, "저장 상태 확인", "restore-document-review", () => { viewState.restored = false; viewState.restoreError = ""; return modal.onOpen(); });
        }
      }
      if (preview) {
        ui.exactPreview(changes, preview, { ...callbacks, reviewFields: fields });
        accepted.checked = false; sync();
        status.setText("변경 내용과 출처를 확인하고 체크하세요.");
        if (viewState.lastResult && !viewState.lastResult.ok) applyButton.setText("저장 상태 다시 확인");
      }
      if (viewState.lastResult?.ok) applied(viewState.lastResult);
    };
    modal.open(); return modal;
  }
  const api = Object.freeze({ create, open });
  root.LLMWikiDocumentCanonicalReview = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
