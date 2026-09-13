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
  const migrationFlows = dep("LLMWikiLifecycleMigrationFlows", "./llmwiki-lifecycle-migration-flows.js");
  const VERSION = "llmwiki_document_canonical_review_recovery_v2";
  const sha = value => hash.sha256(String(value));
  const stable = value => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}` : JSON.stringify(value);
  const fail = (reason, extra = {}) => ({ ok: false, reason, ...(reason === "outcome_unknown" ? { status: "outcome_unknown" } : {}), ...extra });
  const recoveryCopy = (result, context = null) => {
    if (["approval_expired", "stale_before_write", "target_revision_changed"].includes(result.reason)) return "검토 이후 내용이 바뀌었습니다. 변경안을 다시 확인해야 합니다.";
    if (result.reason === "source_revision_changed") return "원문이 변경되었습니다. 최신 내용으로 다시 확인하세요.";
    if (result.reason === "review_checkpoint_failed" || result.reason === "canonical_readback_pending" || result.writer_result?.status === "committed") return "문서는 저장됐지만 확인이 끝나지 않았습니다.";
    if (result.reason === "promotion_review_required") {
      const content = { claim_scope_required: "주장의 적용 조건", principle_boundaries_required: "원칙의 적용·예외·재검토 조건", principle_rationale_required: "원칙의 근거", procedure_preconditions_required: "절차의 전제 조건", procedure_steps_required: "절차", procedure_outcome_required: "기대 결과", concept_definition_required: "개념 정의", concept_boundaries_required: "개념의 적용 범위" };
      // 지식 판단(중복·충돌·미정)이 막을 때는 무엇과 겹치는지 말한다. 상대 문서를
      // 밝히지 않으면 소유자는 판단할 근거가 없다.
      const relation = { unresolved_duplicate: "기존 문서에 같은 내용이 있습니다. 그 문서에 이미 있는 내용이면 반려로 이 제안을 버리고, 나중에 다시 볼 일이면 보류하세요. 다른 내용이면 '중복·충돌 없음'으로 고쳐 주세요.", unresolved_conflict: "기존 문서와 내용이 어긋납니다. 어느 쪽이 맞는지 확인한 뒤 고쳐 주세요.", unresolved_relation: "기존 지식과의 관계가 '미정'입니다. 관계를 확인한 뒤 다시 검토하세요." };
      const counterpart = (context && Array.isArray(context.related_knowledge) ? context.related_knowledge : [])
        .filter(row => row && row.path).map(row => row.title || row.path).slice(0, 2);
      return `적용 전에 확인할 항목이 있습니다. ${(result.promotion_gaps || []).map(gap => {
        const code = typeof gap === "string" ? gap : gap?.reason_code;
        if (relation[code]) return `${relation[code]}${counterpart.length ? ` (겹치는 문서: ${counterpart.join(", ")})` : ""}`;
        if (content[code]) return `분석과 본문에 ${content[code]} 내용이 없습니다. 내용을 보완한 뒤 다시 검토하세요.`;
        return typeof gap === "string" ? gap : gap.message || gap.reason || gap.code || gap.reason_code;
      }).filter(Boolean).join(" · ")}`;
    }
    if (result.reason === "domain_choice_required" || result.reason === "registered_classification_required") return "등록된 분야를 확인할 수 없습니다. 아래 등록된 분야에서 하나를 고르세요. 임의 분류로 저장하지 않습니다.";
    return recovery.mapRecovery(result.reason === "stale_before_write" ? { reason: "target_revision_mismatch" } : result).copy;
  };
  const lines = value => String(value || "").split(/\n/u).map(v => v.trim()).filter(Boolean);
  const DECISION_FIELDS = ["knowledge_kind", "relation_status", "evidence_strength"];
  // Compiled pages carry only title/purpose/sections/paragraphs/claims/citations.
  // Kind-required content is extracted from that page's own source-grounded
  // statements only; a field with no support stays absent and the unchanged
  // gate reports it for that field. Nothing is inferred beyond what the page
  // states, and the chosen kind is the kind that content can actually supply.
  const KIND_REQUIRED_FIELDS = Object.freeze({
    claim: ["conditions"],
    principle: ["conditions", "exclusions", "invalidation_conditions", "rationale"],
    procedure: ["conditions", "steps", "outcome"],
    concept: ["definition", "conditions"],
  });
  const CONDITION_CLAUSE = "(?:할 때|하는 경우|한 경우|일 경우|의 경우|경우에는|경우|때는|때|전에는|전에|라면|한다면|하면|시에는|시)";
  const STEP_ENDING = /(?:한다|하세요|하십시오|하라|할 것|할것|하기|시킨다|맞춘다|맞추기|배치한다|해야 한다|정리한다|삭제한다|재배치한다|활용한다|조절한다|살린다|높인다)\.?$/u;
  const RESULT_WORD = "(?:유지|확보|방지|완성|향상|보존|안정|균형|정렬|극대화|줄이|없애)";
  const RESULT_ENDING = new RegExp(`${RESULT_WORD}(?:한다|합니다|됩니다|된다|시킨다)\\.?$`, "u");
  const RESULT_CONNECTIVE = /(?:시켜|하게|하여|하고|,)/u;
  function isCompiledPage(item) { return Boolean(item) && (item.plan_kind === "compiled_document" || item.compiled_kind === "topic_article"); }
  function sourceGroundedStatements(item) {
    const statements = [], seen = new Set();
    const push = value => { const body = String(value || "").trim().replace(/^-\s*/u, ""); if (body && !seen.has(body)) { seen.add(body); statements.push(body); } };
    for (const claim of (item && item.grounded_claims) || []) if ((claim.citations || []).some(citation => citation && citation.evidence_quote)) push(claim.text);
    for (const section of (item && item.compiled_sections) || []) for (const paragraph of section.paragraphs || []) push(paragraph.text);
    return statements;
  }
  function conditionClauseOf(text) {
    const matched = text.match(new RegExp(`^(.{2,80}?${CONDITION_CLAUSE})(?:는|은|에는|에|,|\\.|\\s|$)`, "u"));
    if (matched) return matched[1].trim();
    const marker = text.match(new RegExp(CONDITION_CLAUSE, "u"));
    return marker ? text.slice(0, marker.index + marker[0].length).trim() : "";
  }
  function resultClauseOf(text) {
    const clauses = text.split(RESULT_CONNECTIVE).map(clause => clause.trim()).filter(Boolean);
    return clauses.find(clause => RESULT_ENDING.test(clause) && !STEP_ENDING.test(clause)) || "";
  }
  function compiledPageDefaults(item) {
    if (!isCompiledPage(item)) return {};
    const statements = sourceGroundedStatements(item);
    const unique = rows => [...new Set(rows)];
    return {
      conditions: unique(statements.map(conditionClauseOf).filter(Boolean)).join("\n"),
      steps: unique(statements.filter(statement => STEP_ENDING.test(statement))).join("\n"),
      outcome: unique(statements.map(resultClauseOf).filter(Boolean)).join("\n"),
    };
  }
  function kindContentSatisfiable(kind, fields) {
    const required = KIND_REQUIRED_FIELDS[kind];
    return Boolean(required) && required.every(name => String((fields || {})[name] || "").trim());
  }
  function contentSupportedKind(fields) {
    for (const kind of ["procedure", "concept", "principle", "claim"]) if (kindContentSatisfiable(kind, fields)) return kind;
    return "";
  }
  const KIND_LABELS = Object.freeze({ claim: "주장", principle: "원칙", procedure: "절차", concept: "개념" });
  const KIND_REQUIRED_LABELS = Object.freeze({ conditions: "적용 범위", exclusions: "예외·금지사항", invalidation_conditions: "다시 검토할 조건", rationale: "원칙의 근거", steps: "절차", outcome: "기대 결과", definition: "개념 정의" });
  // A restored draft can carry a kind whose required content exists in neither
  // the saved draft nor the page's own source-grounded extraction. That value
  // can never pass its own content gate, so replaying it dead-ends the owner;
  // it is re-derived from what the page can actually supply. A kind the saved
  // content satisfies is the owner's decision and is never touched.
  function storedKindInvalidation(item, fields) {
    if (!isCompiledPage(item)) return null;
    const saved = fields || {};
    const stored = String(saved.knowledge_kind || "").trim();
    if (!stored || !KIND_REQUIRED_FIELDS[stored]) return null;
    const grounded = compiledPageDefaults(item);
    const missing = KIND_REQUIRED_FIELDS[stored].filter(name => !String(saved[name] || "").trim() && !String(grounded[name] || "").trim());
    if (!missing.length) return null;
    const recommended = contentSupportedKind({ ...analysisDefaults(item), ...saved });
    if (!recommended || recommended === stored) return null;
    return { stored, missing, recommended };
  }
  // Reuse analysis verbatim. A section is content evidence only for its named
  // purpose; arbitrary document prose must never manufacture a passed gate.
  function analysisDefaults(item) {
    const asText = value => Array.isArray(value) ? value.join("\n") : typeof value === "string" ? value.trim() : "";
    const suggested = Object.fromEntries(autofillables().map(name => [name, asText(item[name])]));
    const classification = registry.suggestClassification({ claims: item.grounded_claims });
    suggested.knowledge_domain ||= classification.knowledge_domain;
    suggested.knowledge_kind ||= classification.knowledge_kind;
    if (!suggested.knowledge_topics && suggested.knowledge_domain === classification.knowledge_domain) suggested.knowledge_topics = classification.stored_knowledge_topics.join("\n");
    if (!registry.DOMAIN_ORDER.includes(suggested.knowledge_domain)) suggested.knowledge_domain = "";
    if (lines(suggested.knowledge_topics).some(topic => !registry.TOPICS_BY_DOMAIN[suggested.knowledge_domain]?.includes(topic))) suggested.knowledge_topics = "";
    if (!["claim", "principle", "procedure", "concept"].includes(suggested.knowledge_kind)) suggested.knowledge_kind = "claim";
    suggested.classification = "epistemic";
    suggested.application_trigger ||= asText(item.plan_purpose);
    const sections = [...(item.compiled_sections || []), ...[...String(item.document_body || "").matchAll(/^#{1,6} ([^\n]+)\n([\s\S]*?)(?=^#{1,6} |$(?![\s\S]))/gmu)]
      .map(([, heading, text]) => ({ heading, paragraphs: [{ text: text.trim() }] }))];
    const headings = {
      application_trigger: /^(사용할 때|언제 쓰나요\??|사용 계기|사용 목적|application trigger)$/iu,
      application_contexts: /^(사용 맥락|어디에 쓰나요\??|사용처|application contexts?)$/iu,
      conditions: /^(적용 조건|적용 범위|전제 조건|사전 조건|개념 경계|어떤 조건에서만 맞나요\??|conditions|scope|preconditions|boundaries)$/iu,
      invalidation_conditions: /^(다시 검토할 조건|재검토 조건|무엇이 바뀌면 다시 봐야 하나요\??|invalidation conditions|review triggers)$/iu,
      exclusions: /^(예외[·・/ ]?금지(?:사항)?|예외|금지사항|exclusions|exceptions)$/iu,
      rationale: /^(원칙의 근거|근거와 이유|왜 이렇게 해야 하나요\??|rationale)$/iu,
      steps: /^(절차|실행 절차|단계|procedure(?: steps)?|steps)$/iu,
      outcome: /^(기대 결과|예상 결과|outcome|expected outcome)$/iu,
      definition: /^(개념 정의|정의|definition|concept definition)$/iu,
    };
    for (const [name, pattern] of Object.entries(headings)) {
      suggested[name] ||= [...new Set(sections.filter(section => pattern.test(section.heading.trim()))
        .flatMap(section => (section.paragraphs || []).map(paragraph => asText(paragraph.text))).filter(Boolean))].join("\n");
    }
    if (isCompiledPage(item)) {
      for (const [name, value] of Object.entries(compiledPageDefaults(item))) if (value && !suggested[name]) suggested[name] = value;
      if (!asText(item.knowledge_kind)) suggested.knowledge_kind = contentSupportedKind(suggested) || suggested.knowledge_kind;
    }
    return suggested;
  }
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
    const adapter = obsidian.createObsidianAdapter(app), prepared = new WeakMap(), discarded = new WeakSet();
    const recoveryKey = item => sha(String(item.review_id));
    const itemHash = item => sha(stable([item.review_id, item.document_body, item.grounded_claims, item.proposed_target || null]));
    async function restoreDraft(item) {
      if (!jobStore || !jobId) return { ok: true };
      await jobStore.load();
      const plan = jobStore.getPlanSnapshot(jobId);
      if (!plan) throw new Error("processing_plan_required");
      const identity = { source_revision: plan.source_revision, plan_hash: plan.plan_hash, item_hash: itemHash(item),
        sources: [...new Map(item.grounded_claims.flatMap(claim => claim.citations).map(c => [c.source_id, {
          source_id: c.source_id, source_path: c.source_path || c.locator.split("#")[0], content_hash: c.content_hash,
        }])).values()] };
      const record = plan.canonical_reviews?.[recoveryKey(item)];
      const draft = record?.pending_draft;
      if (!draft) {
        const archived = (plan.history || []).some(snapshot => snapshot.canonical_reviews?.[recoveryKey(item)]?.pending_draft)
          || (record?.superseded_reviews || []).some(row => row.pending_draft);
        return { ok: true, identity, archived, reason: archived ? "draft_identity_changed" : "", edit_revision: 0 };
      }
      let reason = "";
      if (draft.source_revision !== identity.source_revision || draft.plan_hash !== identity.plan_hash || draft.item_hash !== identity.item_hash) reason = "draft_identity_changed";
      try {
        for (const source of draft.sources) await readSource(source.source_path, source.content_hash);
        if (draft.target_path && draft.target_path !== "new") {
          const bytes = await adapter.readBytes(draft.target_path);
          if (bytes === null || sha(bytes) !== draft.target_revision) {
            if (!(record.packet && ["running", "blocked", "resolved"].includes(record.status) && bytes === record.packet.after_bytes)) reason = "target_revision_changed";
          }
        }
      } catch (error) { reason = error.message; }
      if (reason) {
        await jobStore.saveCanonicalReviewDraft({ job_id: jobId, review_key: recoveryKey(item), item, draft, archive_reason: reason });
        return { ok: true, identity, archived: true, reason, edit_revision: draft.edit_revision };
      }
      return { ok: true, identity, draft, recovery_pending: Boolean(record.packet && ["running", "blocked", "resolved", "outcome_unknown"].includes(record.status)) };
    }
    async function saveDraft(item, draft) {
      if (!jobStore || !jobId) return;
      await jobStore.saveCanonicalReviewDraft({ job_id: jobId, review_key: recoveryKey(item), item, draft });
    }
    async function saveReview(state, status, outcome = null) {
      if (!jobStore || !jobId) return;
      await jobStore.load();
      const snapshot = jobStore.getPlanSnapshot(jobId);
      if (!snapshot) throw new Error("processing_plan_required");
      const previous = snapshot.canonical_reviews?.[recoveryKey(state.item)];
      const superseded = previous?.superseded_reviews || [];
      const changedPacket = previous?.packet && previous.packet.packet_hash !== state.packet.packet_hash;
      if (changedPacket && status !== "review_ready") throw new Error("stale_review_packet");
      const { superseded_reviews: ignoredHistory, ...previousReview } = previous || {};
      const record = { ...(previous?.pending_draft ? { pending_draft: previous.pending_draft } : {}), item: state.item, fields: state.fields, packet: state.packet, claim_set: state.claimSet,
        superseded_reviews: changedPacket ? [...superseded, previousReview] : superseded,
        promotion_input: state.promotionInput, promotion_receipt: state.receipt,
        sources: [...state.snapshots.values()].map(({ source_text, ...source }) => source),
        source_paths: Object.fromEntries(state.sourcePaths), status, outcome,
        original_reviewed_at: state.reviewedAt || null, retry_requested_at: state.retryRequestedAt || null,
        origin_plan_hash: state.originPlanHash || snapshot.plan_hash, updated_at: now(), automatic_approval: false,
        ...(state.legacy_adoption ? { legacy_adoption: true } : {}) };
      await jobStore.savePlanSnapshot({ ...snapshot, plan_revision: snapshot.plan_revision + 1,
        canonical_reviews: { ...(snapshot.canonical_reviews || {}), [recoveryKey(state.item)]: record } });
      onStateChange?.();
    }
    function previewFor(packet, claimSet, sourcePaths, legacyAdoption = false) {
      return Object.freeze({ before: packet.before_bytes, after: packet.after_bytes, target_path: packet.target_path,
        claim_count: claimSet.claims.length, source_paths: [...sourcePaths.values()], packet_hash: packet.packet_hash, legacy_adoption: legacyAdoption });
    }
    async function pendingAudit(outcome, packet) {
      if (!["committed_audit_pending", "committed_authority_pending"].includes(outcome?.status) || !outcome.repair) return false;
      const repair = outcome.repair;
      let before, final;
      try { before = JSON.parse(repair.prepared_audit_bytes); final = JSON.parse(repair.final_audit_bytes); }
      catch (_error) { return false; }
      if (repair.target_path !== packet.target_path || repair.canonical_bytes !== packet.after_bytes
        || final.packet_hash !== packet.packet_hash || final.operation_id !== packet.operation.operation_id
        || final.before_sha256 !== packet.before_sha256 || final.after_sha256 !== packet.after_sha256
        || repair.audit_path !== obsidian.auditPath(final.nonce)) return false;
      let current;
      try { current = await adapter.readReceipt(final.nonce); }
      catch (error) { throw new Error("outcome_unknown", { cause: error }); }
      return current !== null && (stable(current) === stable(final) || stable(current) === stable(before)
        && before.result === "prepared" && before.canonical_bytes === packet.after_bytes
        && before.final_audit_sha256 === sha(repair.final_audit_bytes));
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
        if (!record?.packet) return { ok: true, status: "not_available" };
        if (!["review_ready", "running", "blocked", "resolved", "outcome_unknown"].includes(record.status)) return restoreFailure("invalid_review_state");
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
        if (!observedWritten && record.origin_plan_hash && record.origin_plan_hash !== plan.plan_hash) return restoreFailure("draft_identity_changed");
        const finalized = observedWritten && (await adapter.readFinalizedCanonicalAuthorities()).map(obsidian.finalizedCanonicalAuthorityData)
          .some(row => row.path === original.target_path && row.revision === original.after_sha256 && row.packet_hash === original.packet_hash);
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
        const repairableAudit = observedWritten && !finalized && await pendingAudit(record.outcome, original);
        if (observedWritten && !finalized && !repairableAudit) return restoreFailure("outcome_unknown", { status: "outcome_unknown" });
        if (record.status === "resolved") {
          if (observedWritten && !finalized) return restoreFailure("outcome_unknown");
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
        const preview = previewFor(packet, claimSet, sourcePaths, Boolean(record.legacy_adoption));
        prepared.set(preview, { packet, claimSet, promotionInput: record.promotion_input, receipt, snapshots, sourcePaths,
          item: record.item, fields: record.fields, timestamp, citationsFor, reviewedAt: record.original_reviewed_at || null, originPlanHash: record.origin_plan_hash || plan.plan_hash, restored: true, busy: false, authorization: null, result: null, legacy_adoption: Boolean(record.legacy_adoption),
          pendingAudit: repairableAudit ? record.outcome : null, committed: finalized ? { status: "committed" } : null });
        return { ok: true, status: "review", value: preview, item: record.item, fields: record.fields,
          already_written: live === original.after_bytes, requires_new_approval: true, refresh_only: Boolean(finalized) };
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
    async function prepare({ item, fields, target_path = "", target_revision }) {
      fields = { ...fields };
      try {
        if (!item || !Array.isArray(item.grounded_claims) || !item.grounded_claims.length || !item.document_body) return fail("grounded_document_required");
        // 반려는 종결이다: 버린 제안을 다시 준비해 기록 상태를 되살릴 수 없다.
        // (마음이 바뀌면 새 분석 실행이 새 계획으로 다시 제안한다.)
        if (discarded.has(item)) return fail("review_closed", { stage: "prepare", review_status: "rejected" });
        if (jobStore && jobId && item.review_id) {
          const durable = await jobStore.getPlanSnapshot(jobId);
          const status = durable?.canonical_reviews?.[recoveryKey(item)]?.status;
          if (["rejected", "cancelled", "superseded"].includes(status)) {
            discarded.add(item);
            return fail("review_closed", { stage: "prepare", review_status: status });
          }
        }
        for (const name of DECISION_FIELDS) {
          if (!String(fields[name] || "").trim()) return fail("review_field_required", { field: name });
        }
        const suggested = analysisDefaults(item);
        // Empty descriptive controls are not a demand for owner-authored prose.
        // Only actual analysis/section content can satisfy the unchanged gates.
        for (const name of autofillables().filter(name => !DECISION_FIELDS.includes(name))) {
          if (fields[name] === undefined && suggested[name]) fields[name] = suggested[name];
        }
        for (const name of ["classification", "knowledge_domain", "conditions", ...({ principle: ["exclusions", "invalidation_conditions", "rationale"], procedure: ["steps", "outcome"], concept: ["definition"] }[fields.knowledge_kind] || [])]) {
          if (!String(fields[name] || "").trim()) fields[name] = suggested[name] || "";
        }
        const expectedTargetRevision = target_revision || (item.proposed_target?.path === target_path ? item.proposed_target.revision : "");
        let targetBytes = null;
        if (target_path) {
          targetBytes = await adapter.readBytes(target_path);
          if (expectedTargetRevision && sha(targetBytes) !== expectedTargetRevision) return fail("target_revision_changed");
        }
        const target = target_path ? (await targets()).find(row => row.path === target_path) : null;
        // M1 phase 2/3: a note that still exists on disk without the v2 lifecycle
        // header is a legacy adoption target. Its live bytes are the packet's
        // before_bytes; there is no prior classification or claim graph to inherit.
        // A missing file, or v2 bytes that are not a verified target, stay refused.
        let legacyAdoption = false, legacyData = {}, legacyBody = "";
        if (target_path && !target) {
          if (targetBytes === null) return fail("verified_target_required");
          let alreadyV2 = false;
          try {
            const raw = store.parseFrontmatter(targetBytes).data;
            alreadyV2 = raw.schema_version === 2 || raw.schema_version === "2" || Boolean(raw.canonical_id);
          } catch (_error) { alreadyV2 = false; }
          if (alreadyV2) return fail("verified_target_required");
          legacyAdoption = true;
          // The legacy note's own authored frontmatter is the only registered
          // classification available for its adoption. Inherit it; never invent.
          try {
            const legacy = store.parseFrontmatter(targetBytes);
            legacyData = legacy.data || {}; legacyBody = String(legacy.body || "");
          } catch (_error) { legacyData = {}; legacyBody = ""; }
          // A legacy list value is an array in frontmatter, not one comma-joined line.
          const legacyLines = value => [].concat(value || []).flatMap(row => String(row).split("\n")).map(row => row.trim()).filter(Boolean);
          if (!registry.DOMAIN_ORDER.includes(fields.knowledge_domain) && registry.DOMAIN_ORDER.includes(legacyData.knowledge_domain)) fields.knowledge_domain = legacyData.knowledge_domain;
          if (!lines(fields.knowledge_topics).length && legacyLines(legacyData.knowledge_topics).length) fields.knowledge_topics = legacyLines(legacyData.knowledge_topics).join("\n");
          if (!lines(fields.application_contexts).length && legacyLines(legacyData.application_contexts).length) fields.application_contexts = legacyLines(legacyData.application_contexts).join("\n");
          if (!lines(fields.invalidation_conditions).length && legacyLines(legacyData.invalidation_conditions).length) fields.invalidation_conditions = legacyLines(legacyData.invalidation_conditions).join("\n");
        }
        const old = target ? store.parseLifecycleDocument(target.canonical_bytes) : null;
        // An adopted legacy note keeps what its author wrote. Its body is the
        // update base and its authored values the fallbacks, so the reviewed
        // page is added to the guide instead of replacing it. The v2 knowledge
        // contract refuses a `summary` key (duplicate_v2_summary): the adopted
        // document keeps the author's statement and body instead.
        let legacySeed = null;
        if (legacyAdoption) {
          legacySeed = { ...legacyData, body: legacyBody };
          delete legacySeed.summary;
        }
        const priorDoc = old || legacySeed;
        // An existing canonical target is an authoritative prior classification
        // and review rule, not a newly invented suggestion.
        if (!registry.DOMAIN_ORDER.includes(fields.knowledge_domain) && registry.DOMAIN_ORDER.includes(old?.knowledge_domain)) fields.knowledge_domain = old.knowledge_domain;
        if (!lines(fields.invalidation_conditions).length && lines(old?.invalidation_conditions).length) fields.invalidation_conditions = lines(old.invalidation_conditions).join("\n");
        if (!registry.DOMAIN_ORDER.includes(fields.knowledge_domain)) return fail("domain_choice_required", {
          field: "knowledge_domain", candidates: registry.DOMAIN_ORDER,
          consequence: "등록된 분야를 고르지 않으면 저장할 수 없습니다. 임의 분류로 저장하지 않습니다.",
        });
        if (lines(fields.knowledge_topics).some(topic => !registry.TOPICS_BY_DOMAIN[fields.knowledge_domain]?.includes(topic))) return fail("registered_classification_required", { field: "knowledge_domain" });
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
          raw.push({ origin: "ai_interpretation", text: claim.text, derivation_indices: indexes }); added += 1;
          // Retain independent evidence in the claim graph, not a second visible copy of the same fact.
          if (!matchedPriors.length) addedClaims.push(claim);
        }
        const addition = renderCanonicalAddition({ item, added: addedClaims, isUpdate: Boolean(target) || /^#\s/mu.test(String(priorDoc?.body || "")) });
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
        const title = priorDoc?.title || item.title;
        const statement = priorDoc?.statement || item.grounded_claims.map(c => c.text).join("\n");
        const evidenceRows = claimSet.citations.map((c, i) => ({ evidence_id: `evidence_${i}`, source_ref: c.source_id, strength: fields.evidence_strength }));
        const promotionInput = { knowledge_kind: fields.knowledge_kind, classification: fields.classification, state: "current", title, statement,
          relation_status: fields.relation_status, approval_status: "approved", claim_set_hash: claimSet.claim_set_hash,
          evidence: evidenceRows, claims: claimSet.claims.map(c => ({ claim_id: c.claim_id, statement: c.text, origin: c.origin, review_status: "accepted", evidence_refs: citationsFor(c).map(id => `evidence_${claimSet.citations.findIndex(row => row.citation_id === id)}`) })),
          claim_scope: fields.conditions, principle_boundaries: { conditions: lines(fields.conditions), exclusions: lines(fields.exclusions), invalidation_conditions: lines(fields.invalidation_conditions) }, principle_rationale: fields.rationale || "",
          procedure_preconditions: lines(fields.conditions), procedure_steps: lines(fields.steps), procedure_outcome: fields.outcome || "", concept_definition: fields.definition || "", concept_boundaries: lines(fields.conditions) };
        const receipt = promotion.evaluatePromotion(promotionInput);
        if (!receipt.canonical_write_eligible) return fail("promotion_review_required", { promotion_gaps: receipt.promotion_gaps });
        const id = priorDoc?.canonical_id || `knowledge_${sha(title).slice(0, 24)}`;
        const sourceRows = [...snapshots.values()].map(s => ({ source_id: s.source_id, span: { start: 0, end: s.source_text.length } }));
        const updateBase = priorDoc ? stripReviewScopeBlock(priorDoc.body || "") : "";
        const sourceLinks = sourceRows.filter(s => !old || !updateBase.includes(`[${s.source_id}](`)).map(s => `- [${s.source_id}](${sourcePaths.get(s.source_id).split("/").map(encodeURIComponent).join("/")}#L1)`).join("\n");
        const reviewScope = `\n## 사용자 검토 범위\n- 적용 조건: ${fields.conditions}\n${fields.exclusions ? `- 예외·금지: ${fields.exclusions}\n` : ""}- 재검토 조건: ${fields.invalidation_conditions || ""}\n`;
        const relatedLinks = (item.related_knowledge || []).filter(row => row.path && row.path !== target_path && app.vault.getAbstractFileByPath(row.path)).map(row => `[[${row.path.replace(/\.md$/u, "")}]]`).filter((link, index, rows) => rows.indexOf(link) === index && !item.document_body.includes(link) && !updateBase.includes(link));
        const body = integrateDocumentBody(priorDoc?.body, addition, reviewScope, relatedLinks, sourceLinks);
        const document = { ...(priorDoc || {}), schema_version: 2, type: "knowledge", canonical_id: id, knowledge_kind: fields.knowledge_kind, status: "active", title, statement,
          knowledge_domain: fields.knowledge_domain, knowledge_topics: lines(fields.knowledge_topics), application_trigger: fields.application_trigger || "", application_contexts: lines(fields.application_contexts), connections: priorDoc?.connections || [], invalidation_conditions: lines(fields.invalidation_conditions),
          sources: sourceRows, relations: priorDoc?.relations || [], claim_set_hash: claimSet.claim_set_hash, promotion_receipt_hash: sha(stable(receipt)), ai_enrichment_status: priorDoc?.ai_enrichment_status || "none", created: priorDoc?.created || timestamp, updated: timestamp, body };
        delete document.legacy;
        const suffix = sha(stable(document)).slice(0, 24);
        const isUpdateOperation = Boolean(target) || legacyAdoption;
        const op = operation.parseCanonicalOperation(JSON.stringify({ operation_id: `operation_${suffix}`, proposal_id: `proposal_${suffix}`, proposal_kind: isUpdateOperation ? "update" : "create", payload_hash: sha(stable(document)) }));
        if (!op.ok) return op;
        const packet = await packetApi.assembleCanonicalPacket({ run_id: `run_${suffix}`, operation: op.value, canonical_document: document, ...(isUpdateOperation ? { target_path } : {}), source_citations: sourceRows.map(s => ({ source_id: s.source_id, content_hash: snapshots.get(s.source_id).source_content_hash, locators: [`${sourcePaths.get(s.source_id)}#L1`] })),
          consent_hash: sha(stable({ review_id: item.review_id, sources: sourceRows, action: "local_canonical_review" })), expires_at: new Date(Date.parse(timestamp) + 3600000).toISOString(), nonce: `review_${suffix}_${Date.parse(timestamp)}` }, adapter);
        if (!packet.ok) return packet;
        if (packet.status === "stale_reconfirm_required") return fail("existing_knowledge_target_required");
        if (expectedTargetRevision && packet.value.before_sha256 !== expectedTargetRevision) return fail("target_revision_changed");
        const value = Object.freeze({ before: packet.value.before_bytes, after: packet.value.after_bytes, target_path: packet.value.target_path, claim_count: claimSet.claims.length, added_claim_texts: addedClaims.map((claim) => claim.text), source_paths: [...sourcePaths.values()], packet_hash: packet.value.packet_hash, legacy_adoption: legacyAdoption });
        const state = { packet: packet.value, claimSet, promotionInput, receipt, snapshots, sourcePaths, timestamp, citationsFor, item, fields, busy: false, authorization: null, result: null, legacy_adoption: legacyAdoption };
        // 종결된 검토는 저장 큐에서 거부된다(경합 대비): prepare도 여기서 멈춘다.
        try { await saveReview(state, "review_ready"); }
        catch (error) {
          if (error?.message === "review_closed") { discarded.add(item); return fail("review_closed", { stage: "prepare", review_status: "rejected" }); }
          throw error;
        }        prepared.set(value, state);
        return { ok: true, status: "review", value, durable: Boolean(jobStore && jobId) };
      } catch (error) { return fail(error.message || "document_review_failed"); }
    }
    async function apply(preview, decision) {
      const state = prepared.get(preview);
      if (!state || decision?.approved !== true || decision?.claims_accepted !== true || decision.packet_hash !== preview.packet_hash) return fail("explicit_exact_approval_required");
      if (state.busy) return fail("action_in_progress");
      // 소유자가 버린 제안은 준비된 패킷이 남아 있어도 절대 쓰지 않는다.
      if (discarded.has(state.item)) return fail("review_closed", { stage: "apply", review_status: "rejected" });
      if (jobStore && jobId) {
        const snapshot = await jobStore.getPlanSnapshot(jobId);
        const status = snapshot?.canonical_reviews?.[recoveryKey(state.item)]?.status;
        if (["rejected", "cancelled", "superseded"].includes(status)) {
          discarded.add(state.item);
          return fail("review_closed", { stage: "apply", review_status: status });
        }
      }
      state.busy = true;
      let writeStarted = false, leaseId = null;
      try {
        for (const [id, source] of state.snapshots) await readSource(state.sourcePaths.get(id), source.source_content_hash);
        if (state.committed || state.result?.ok) return await refresh(preview);
        if (await adapter.readBytes(preview.target_path) === preview.after) {
          const finalized = (await adapter.readFinalizedCanonicalAuthorities()).map(obsidian.finalizedCanonicalAuthorityData)
            .some(row => row.path === preview.target_path && row.revision === state.packet.after_sha256 && row.packet_hash === state.packet.packet_hash);
          if (finalized) { state.committed = { status: "committed" }; return await refresh(preview); }
          if (!await pendingAudit(state.pendingAudit, state.packet)) return fail("outcome_unknown", { status: "outcome_unknown" });
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
          state.migrationClaimSet = accepted.value;
        }
        // 정본 쓰기 권한(임차)을 저장 큐에서 원자적으로 얻는다. 이 시점부터 반려는 거부되고,
        // 종결된 검토는 임차를 받지 못하므로 경합에서 반려 뒤에 쓰이는 일이 없다.
        // (영속 스토어가 없는 세션에서는 임차가 없다 — 제품 경로에는 항상 있다.)
        if (jobStore && jobId) {
          try {
            // 인수 여부는 스토어가 세대로 판단한다(다른 세대의 중단된 임차만 인수 가능).
            const authority = await jobStore.beginCanonicalWrite({ job_id: jobId, review_key: recoveryKey(state.item), review_id: String(state.item.review_id) });
            leaseId = (authority && authority.write_lease && authority.write_lease.lease_id) || null;
          }
          catch (error) {
            if (error?.message === "review_closed") { discarded.add(state.item); return fail("review_closed", { stage: "apply", review_status: "rejected" }); }
            if (error?.message === "review_write_in_progress") return fail("review_write_in_progress", { stage: "apply" });
            throw error;
          }
        }
        try { await saveReview(state, "running"); }
        catch (error) {
          // 임차는 얻었는데 기록을 못 남긴 경우: writer는 아직 호출되지 않았다.
          if (error?.message === "review_closed") { discarded.add(state.item); return fail("review_closed", { stage: "apply", review_status: "rejected" }); }
          throw error;
        }
        writeStarted = true;
        if (state.legacy_adoption) {
          const migrated = await applyLegacyAdoption(state);
          if (!migrated.ok) {
            state.pendingAudit = migrated;
            await saveReview(state, "blocked", migrated);
            return fail(migrated.reason || migrated.status, { stage: "apply", operation_kind: "update", writer_result: migrated });
          }
          state.committed = { status: migrated.status };
          return await refresh(preview);
        }
        const method = state.packet.operation.proposal_kind === "update" ? "commitApprovedUpdate" : "commitApprovedCanonicalV2";
        const committed = await writer[method]({ packet: state.packet, authorization: state.authorization, adapter }, { now: now() });
        if (!["committed", "duplicate"].includes(committed.status)) {
          state.pendingAudit = committed;
          await saveReview(state, "blocked", committed);
          return fail(committed.reason || committed.status, { stage: "apply", operation_kind: state.packet.operation.proposal_kind, writer_result: committed });
        }
        state.committed = committed;
        return await refresh(preview);
      } catch (error) { return writeStarted ? fail("outcome_unknown", { status: "outcome_unknown", detail: error.message }) : fail(error.message || "canonical_apply_failed"); }
      finally {
        state.busy = false;
        if (leaseId && jobStore && jobId) { try { await jobStore.releaseCanonicalWrite({ job_id: jobId, review_key: recoveryKey(state.item), lease_id: leaseId }); } catch (_error) { /* 임차 해제 실패는 다음 시도에서 재확인된다 */ } }
      }
    }
    // M1 legacy adoption is written through the sanctioned lifecycle migration
    // transaction (buildPlan -> authorizePlan -> executePlan). The packet is an
    // update bound to the existing legacy bytes and the authorization is the
    // already-evaluated canonical update approval, so the canonical update gate
    // is reused untouched. Missing migration authority is a refusal, never a
    // silent fallback to a weaker writer.
    async function applyLegacyAdoption(state) {
      // Resolve at call time: the hub evaluates modules with `new Function`, so a
      // load-order miss must not refuse every adoption forever.
      const flows = migrationFlows || root.LLMWikiLifecycleMigrationFlows || null;
      if (!flows || typeof flows.buildPlan !== "function"
        || typeof flows.authorizePlan !== "function" || typeof flows.executePlan !== "function") return fail("lifecycle_migration_flows_required", { stage: "apply", operation_kind: "update" });
      const packet = state.packet, targetPath = packet.target_path, sourceBytes = packet.before_bytes;
      const inventory = { digest: sha(stable([targetPath, packet.before_sha256])), items: [{ path: targetPath, disposition: "adopt_update", revision: packet.before_sha256, bytes: new TextEncoder().encode(sourceBytes).byteLength, sha256: packet.before_sha256 }], counts: {} };
      const planned = await flows.buildPlan({ inventory, source_path: targetPath, source_bytes: sourceBytes, disposition: "adopt_update", source_action: "preserve", canonical_request: { packet, authorization: state.authorization } });
      if (!planned.ok) return fail(planned.reason || "lifecycle_migration_plan_failed", { stage: "apply", operation_kind: "update" });
      const approved = flows.authorizePlan({ plan: planned.value, claim_set: state.migrationClaimSet, promotion_input: state.promotionInput, promotion_receipt: state.receipt, expires_at: packet.expires_at, nonce: packet.nonce });
      if (!approved.ok) return fail(approved.reason || "lifecycle_migration_authorization_failed", { stage: "apply", operation_kind: "update" });
      const executed = await flows.executePlan({ plan: planned.value, approval: approved.value, app });
      if (!executed.ok || !["committed", "duplicate"].includes(executed.status)) return fail(executed.reason || executed.status || "lifecycle_migration_execute_failed", { stage: "apply", operation_kind: "update", writer_result: executed });
      return { ok: true, status: executed.status, receipt: executed.receipt, write_counts: executed.write_counts };
    }
    // A confirmed commit is recovered through reads/checkpoint repair only. This
    // path never issues an approval or invokes a canonical writer.
    function refresh(preview) {
      const state = prepared.get(preview);
      if (!state) return Promise.resolve(fail("review_required"));
      if (!state.refreshFlight) state.refreshFlight = refreshVerified(preview, state)
        .then(result => recordResult(state.item, result, "readback"))
        .finally(() => { state.refreshFlight = null; });
      return state.refreshFlight;
    }
    async function refreshVerified(preview, state) {
      const pending = (reason, extra = {}) => fail(reason, { status: reason === "outcome_unknown" ? "outcome_unknown" : "readback_pending",
        target_path: preview.target_path, writer_result: state.committed, ...extra });
      try {
        if (await adapter.readBytes(preview.target_path) !== preview.after) return fail("stale_before_write", { status: "stale" });
        const authorities = await adapter.readFinalizedCanonicalAuthorities();
        const authority = authorities.map(obsidian.finalizedCanonicalAuthorityData).find(row => row.path === preview.target_path
          && row.revision === state.packet.after_sha256 && row.packet_hash === state.packet.packet_hash);
        if (!authority) return pending("outcome_unknown");
        const refreshed = await reader.create().read({ app });
        const row = refreshed.ok && refreshed.rows?.find(row => row.path === preview.target_path && row.canonical_revision === state.packet.after_sha256);
        if (!row) return pending("canonical_readback_pending", { stage: "readback", detail: refreshed.reason });
        const complete = { ok: true, status: "completed", target_path: preview.target_path, revision: row.canonical_revision,
          trust_status: row.trust_status, writer_result: state.committed };
        if (!state.result?.ok) {
          try { await saveReview(state, "resolved", complete); }
          catch (error) { return pending("review_checkpoint_failed", { stage: "processing_state", detail: error.message }); }
        }
        state.result = complete;
        return complete;
      } catch (error) { return pending("canonical_readback_pending", { stage: "readback", detail: error.message }); }
    }
    async function recordResult(item, result, stage, context = {}) {
      if (!jobStore || !jobId || !item || result.ok && !["no_change", "held"].includes(result.status)
        || ["explicit_exact_approval_required", "action_in_progress"].includes(result.reason)) return result;
      const reason = result.reason || result.status;
      const disposition = reason === "outcome_unknown" ? "outcome_unknown"
        : ["canonical_readback_pending", "review_checkpoint_failed"].includes(reason) ? "committed-refresh-pending"
        : ["stale_before_write", "source_revision_changed", "target_revision_changed", "approval_expired", "draft_identity_changed"].includes(reason) ? "stale"
        : ["no_change", "held", "promotion_review_required"].includes(reason) ? "held/no-change"
        : ["committed_audit_pending", "committed_authority_pending"].includes(result.writer_result?.status) ? "outcome_unknown" : "failed";
      try {
        await jobStore.recordAttempt({ job_id: jobId, review_key: recoveryKey(item), review_id: String(item.review_id),
          target_path: result.target_path || context.target_path || item.proposed_target?.path || null,
          target_revision: context.target_revision || item.proposed_target?.revision || null,
          stage: reason === "review_checkpoint_failed" ? "checkpoint" : stage, disposition,
          observation: /^[a-z0-9_]{1,128}$/u.test(reason || "") ? reason : "operation_failed",
          ...(context.correction_reason ? { correction_reason: context.correction_reason } : {}) });
        return result;
      } catch (error) { return { ...result, ok: false, record_error: error.message || "attempt_persistence_failed" }; }
    }
    return Object.freeze({
      prepare: async input => recordResult(input.item, await prepare(input), "review", input),
      apply: async (preview, decision) => recordResult(prepared.get(preview)?.item, await apply(preview, decision), "apply"),
      restore: async item => recordResult(item, await restore(item), "restore"),
      hold: (item, correction_reason) => recordResult(item, { ok: true, status: "held" }, "review", { correction_reason }),
      // 반려: 소유자가 제안 자체를 버림. 초안·근거는 보존하고 기록 상태만 닫는다.
      reject: async (item, reason = "user_rejected") => {
        if (!jobStore || !jobId || !item) return { ok: false, reason: "review_persistence_required" };
        try {
          await jobStore.recordAttempt({ job_id: jobId, review_key: recoveryKey(item), review_id: String(item.review_id),
            target_path: item.proposed_target?.path || null, target_revision: item.proposed_target?.revision || null,
            stage: "review", observation: "user_rejected", disposition: "rejected" });
          await jobStore.rejectCanonicalReview({ job_id: jobId, review_key: recoveryKey(item), review_id: String(item.review_id), reason });
          discarded.add(item);
          return { ok: true, status: "rejected" };
        } catch (error) {
          // 적용이 쓰기 권한을 쥐고 있으면 반려는 거부된다(경합에서 정본을 지키기 위함).
          return { ok: false, reason: error.message === "review_write_in_progress" ? "review_write_in_progress" : (error.message || "review_rejection_failed") };
        }
      },
      targets, restoreDraft, saveDraft, refresh,
    });
  }
  const ui = dep("ProdigyWikiWorkspaceView", "./prodigy-wiki-workspace-view.js");
  const OPEN_REVIEWS = new WeakMap();
  function open({ app, Modal, item, onComplete, onOpenSource, jobStore = null, jobId = "", onStateChange = null,
    container = null, decisionContainer = null, workspace = null, renderMarkdown = null, onLater = null, onNext = null, onSelectSource = null, intendedTargetPath = "" }) {
    let sessions = OPEN_REVIEWS.get(app);
    if (!sessions) { sessions = new Map(); OPEN_REVIEWS.set(app, sessions); }
    const key = sha(stable([jobId, item.review_id, item.document_body, item.grounded_claims, item.proposed_target || null, Boolean(container)]));
    const cached = sessions.get(key);
    if (cached) {
      Object.assign(cached.callbacks, { onComplete, onOpenSource, onStateChange, decisionContainer, workspace, renderMarkdown, onLater, onNext, onSelectSource });
      if (container) cached.modal.contentEl = container;
      cached.modal.onClose = cached.onClose; cached.modal.open(); return cached.modal;
    }
    const callbacks = { onComplete, onOpenSource, onStateChange, decisionContainer, workspace, renderMarkdown, onLater, onNext, onSelectSource };
    const flow = create({ app, jobStore, jobId, onStateChange: () => callbacks.onStateChange?.() });
    const modal = container ? { contentEl: container, open() { this.ready = this.onOpen(); }, close() { this.onClose?.(); callbacks.onLater?.(); } } : new Modal(app);
    const viewState = { fields: {}, touched: {}, preview: null, lastResult: null, render: 0, restored: false, restoreError: "", editRevision: 0 };
    const persistDraft = () => {
      if (!viewState.draftIdentity || viewState.lastResult?.ok || viewState.recoveryPending) return Promise.resolve();
      const fields = { ...viewState.fields }, touched = { ...viewState.touched };
      const draft = { ...viewState.draftIdentity, fields, touched,
        cleared: Object.fromEntries(Object.keys(touched).filter(name => fields[name] === "").map(name => [name, true])),
        target_path: fields.target_path || "", target_revision: viewState.targetRevision || null, edit_revision: ++viewState.editRevision };
      modal.draftSaved = flow.saveDraft(item, draft).then(() => { viewState.draftError = ""; }, error => {
        viewState.draftError = error.message || "draft_save_failed";
        modal.contentEl.querySelector('[data-decision-status]')?.setText(`! 수정 저장 실패: ${viewState.draftError}`);
      });
      return modal.draftSaved;
    };
    const onClose = () => {
      viewState.render += 1;
      const pending = viewState.lastResult && !viewState.lastResult.ok;
      if (!pending && !viewState.lastResult?.ok) viewState.preview = null;
      if (jobStore && !viewState.draftError) viewState.restored = false;
      return persistDraft();
    };
    modal.onClose = onClose;
    sessions.set(key, { modal, callbacks, onClose });
    modal.onOpen = async () => {
      const renderId = ++viewState.render;
      if (!viewState.restored) {
        await modal.draftSaved;
        let draftState;
        try { draftState = await flow.restoreDraft(item); }
        catch (error) { viewState.draftError = error.message; draftState = {}; }
        viewState.draftIdentity = draftState.identity;
        if (draftState.draft) {
          viewState.fields = { ...draftState.draft.fields }; viewState.touched = { ...draftState.draft.touched };
          viewState.targetRevision = draftState.draft.target_revision;
          viewState.editRevision = draftState.draft.edit_revision;
          viewState.preview = null;
          const recalculation = storedKindInvalidation(item, viewState.fields);
          if (recalculation) {
            viewState.kindRecalculated = recalculation;
            delete viewState.fields.knowledge_kind; delete viewState.touched.knowledge_kind;
          }
        }
        if (draftState.archived) {
          viewState.fields = {}; viewState.touched = {}; viewState.preview = null; viewState.targetSeeded = false;
          viewState.editRevision = draftState.edit_revision; viewState.restoreError = draftState.reason;
          viewState.draftArchived = true;
        }
        const restored = draftState.draft && !draftState.recovery_pending || draftState.archived
          ? { ok: true, status: "not_available" } : await flow.restore(item);
        viewState.restored = true;
        if (restored.ok && restored.status === "review") {
          viewState.preview = restored.already_written || draftState.recovery_pending ? restored.value : null;
          viewState.fields = { ...restored.fields }; viewState.touched = Object.fromEntries(Object.keys(restored.fields).map(name => [name, true]));
          viewState.recoveryPending = restored.refresh_only;
        }
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
      const targetDefaults = existing => {
        const doc = existing ? store.parseLifecycleDocument(existing.canonical_bytes) : null;
        const inherited = defaults(doc);
        const scope = String(doc?.body || "").split("## 사용자 검토 범위\n").slice(1).pop()?.split(/^## /m)[0] || "";
        for (const [name, label] of [["conditions", "적용 조건"], ["exclusions", "예외·금지"], ["invalidation_conditions", "재검토 조건"]]) {
          const value = scope.match(new RegExp(`^- ${label}: ([^\\n]*)`, "m"))?.[1];
          if (value) inherited[name] = value;
        }
        return inherited;
      };
      // A legacy note's own authored frontmatter is the only registered
      // classification a target-scoped review can inherit without inventing one.
      const legacyTargetDefaults = async candidatePath => {
        const file = candidatePath && app.vault.getAbstractFileByPath(candidatePath);
        if (!file || typeof app.vault.read !== "function") return {};
        let parsed = null;
        try { parsed = store.parseLifecycleDocument(await app.vault.read(file)); } catch (_error) { parsed = null; }
        if (!parsed || !parsed.legacy) return {};
        const inherited = {};
        if (registry.DOMAIN_ORDER.includes(parsed.knowledge_domain)) inherited.knowledge_domain = parsed.knowledge_domain;
        if (lines(parsed.knowledge_topics).length) inherited.knowledge_topics = lines(parsed.knowledge_topics).join("\n");
        if (lines(parsed.invalidation_conditions).length) inherited.invalidation_conditions = lines(parsed.invalidation_conditions).join("\n");
        return inherited;
      };
      const classification = registry.suggestClassification({ claims: item.grounded_claims });
      const originalTopics = classification.knowledge_topics;
      if (originalTopics.length) el.createEl("p", { text: `원문 주제 (제안 근거): ${originalTopics.join(" · ")}`,
        attr: { "data-classification-basis": "", "data-original-topics": JSON.stringify(originalTopics) } });
      if (!viewState.seeded) { viewState.fields = { ...viewState.fields }; viewState.seeded = true; }
      const fields = viewState.fields, inputs = [], fieldRows = {}, fieldInputs = {};
      const sources = [...new Set((item.grounded_claims || []).flatMap(claim => (claim.citations || []).map(c => c.source_path || c.locator?.split("#")[0])).filter(Boolean))];
      const sourceLinks = el.createEl("p", { text: "출처: ", attr: { "data-review-sources": "" } });
      for (const path of sources) {
        const link = sourceLinks.createEl("a", { text: ui.title(path), attr: { href: path, "data-review-source": path } });
        link.onclick = event => { event?.preventDefault?.(); app.workspace?.openLinkText?.(path, "", false); };
        sourceLinks.createEl("span", { text: " " });
      }
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
      const groups = { human: el.createEl("fieldset", { attr: { "data-review-group": "human" } }) };
      groups.human.createEl("legend", { text: "세 가지만 확인하세요 · 추천이 틀리면 고치세요" });
      const inheritedFields = el.createEl("details", { attr: { class: "wiki-review-fields", "data-review-conditions": "" } });
      const fieldSummary = inheritedFields.createEl("summary");
      inheritedFields.appendChild(storage);
      for (const [id, label] of [["classification", "분류"], ["scope", "사용 범위"], ["principle", "원칙"], ["procedure", "절차"], ["concept", "개념"]]) {
        groups[id] = inheritedFields.createEl("fieldset", { attr: { "data-review-group": id } }); groups[id].createEl("legend", { text: label });
      }
      const groupFor = { knowledge_kind: "human", classification: "classification", knowledge_domain: "classification", knowledge_topics: "classification", application_trigger: "scope", application_contexts: "scope", conditions: "scope", invalidation_conditions: "scope", exclusions: "principle", rationale: "principle", steps: "procedure", outcome: "procedure", definition: "concept", relation_status: "human", evidence_strength: "human" };
      let accepted = null, applyButton = null, topicOptions = null, formRevision = 0, prepareButton = null, status = null, busy = false;
      const required = () => DECISION_FIELDS;
      const field = (name, label, choices) => {
        label = ui.FIELD_LABELS[name] || label;
        const row = (name === "target_path" ? targetHost : groups[groupFor[name]]).createEl("label"); fieldRows[name] = row; row.createEl("span", { text: label });
        const multiline = ["knowledge_topics", "application_contexts", "conditions", "invalidation_conditions", "exclusions", "rationale", "steps", "definition"].includes(name);
        const input = row.createEl(choices ? "select" : multiline ? "textarea" : "input", { attr: { "data-review-field": name, "aria-label": label, ...(!choices && !multiline ? { type: "text" } : {}) } });
        if (choices) { input.createEl("option", { text: "선택하세요", attr: { value: "" } }); choices.forEach(([value,text]) => input.createEl("option", {text,attr:{value}})); }
        fieldInputs[name] = input;
        input.value = fields[name] || "";
        input.oninput = () => {
          if (busy || viewState.lastResult?.ok || renderId !== viewState.render) return;
          fields[name] = input.value; viewState.touched[name] = true;
          if (viewState.aiPrefilled) delete viewState.aiPrefilled[name];
          row.querySelector("[data-ai-badge]")?.remove(); row.removeAttribute("data-ai-prefilled");
          invalidate(); showKindFields(); showConsequences(); summarizeFields(); if (name === "knowledge_domain" || name === "knowledge_topics") showTopicOptions();
          return persistDraft();
        };
        input.onchange = input.oninput;
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
      }
      function summarizeFields() {
        const count = Object.keys(fieldRows).filter(name => !DECISION_FIELDS.includes(name) && fieldRows[name].getAttribute("data-ai-prefilled") === "true").length;
        fieldSummary.setText(`AI가 ${count}개 항목을 채웠습니다 · 펼쳐서 틀린 곳을 고치세요`);
        fieldSummary.setAttribute("data-ai-filled-count", String(count));
      }
      function showConsequences() {
        const consequences = {
          classification: { operational: ["operational_unit", "실행 업무로 표시하면 지식 문서로 저장할 수 없습니다. 업무와 재사용할 지식을 나눠 검토하세요."], mixed: ["mixed_unit", "지식·업무 혼합으로 표시하면 저장할 수 없습니다. 재사용할 지식과 실행 업무를 나눠 검토하세요."] },
          relation_status: { duplicate: ["unresolved_duplicate", "중복으로 표시하면 저장할 수 없습니다. 아래 '겹치는 기존 지식'의 문장과 비교해 판단하세요. 이미 있는 내용이면 반려, 나중에 볼 일이면 보류."], conflict: ["unresolved_conflict", "충돌로 표시하면 저장할 수 없습니다. 아래 '겹치는 기존 지식'에서 어느 내용이 맞는지 확인하세요."], pending: ["unresolved_relation", "미정으로 표시하면 저장을 보류합니다. 기존 내용과의 관계를 먼저 확인하세요."] },
          evidence_strength: { thin: ["thin_evidence", "얇음으로 표시하면 저장할 수 없습니다. 원문 근거를 보완한 뒤 다시 검토하세요."] },
        };
        for (const [name, values] of Object.entries(consequences)) {
          const row = fieldRows[name]; if (!row) continue;
          row.querySelector("[data-promotion-block]")?.remove();
          const consequence = values[fields[name]];
          if (consequence) {
            row.createEl("span", { text: consequence[1], attr: { role: "alert", "data-promotion-block": consequence[0] } });
            if (name === "classification") inheritedFields.open = true;
          }
        }
        // 지식 종류 also blocks: its consequence is the content its gate reads.
        // Say what is missing, and what the page's own content can supply instead.
        const kindRow = fieldRows.knowledge_kind;
        if (kindRow) {
          kindRow.querySelector("[data-kind-content-requirement]")?.remove();
          const selected = String(fields.knowledge_kind || "").trim();
          const available = { ...analysisDefaults(item), ...fields };
          if (selected && KIND_REQUIRED_FIELDS[selected] && !kindContentSatisfiable(selected, available)) {
            const missing = KIND_REQUIRED_FIELDS[selected].filter(name => !String(available[name] || "").trim()).map(name => KIND_REQUIRED_LABELS[name] || name);
            const alternative = contentSupportedKind(available);
            kindRow.createEl("span", { text: `${KIND_LABELS[selected] || selected}으로 저장하려면 ${missing.join(" · ")} 내용이 필요합니다. 지금은 없어 저장할 수 없습니다${alternative && alternative !== selected ? `. '${KIND_LABELS[alternative]}'으로 고르면 지금 내용으로 저장할 수 있습니다` : ""}.`,
              attr: { role: "alert", "data-kind-content-requirement": selected } });
          }
        }
      }
      const target = field("target_path", "대상 문서", [["new", "새 문서로 저장"]]);
      const currentTargets = await flow.targets();
      if (renderId !== viewState.render) return;
      for (const row of currentTargets) target.createEl("option", { text: row.title || row.path, attr: { value: row.path } });
      if (preview && fields.target_path && fields.target_path !== "new" && !currentTargets.some(row => row.path === fields.target_path)) {
        target.createEl("option", { text: `${fields.target_path} · 적용 후 검증 대기`, attr: { value: fields.target_path } });
      }
      const proposedPath = intendedTargetPath || item.proposed_target?.path || "";
      if (proposedPath && !currentTargets.some(row => row.path === proposedPath) && !preview) {
        target.createEl("option", { text: `${proposedPath} · 기존 문서 검토 필요`, attr: { value: proposedPath } });
      }
      if (!viewState.targetSeeded && !Object.hasOwn(fields, "target_path") && proposedPath) {
        const intended = currentTargets.find(row => row.path === proposedPath);
        const inherited = intended ? targetDefaults(intended) : await legacyTargetDefaults(proposedPath);
        Object.assign(fields, { ...inherited, ...fields, target_path: proposedPath });
        viewState.targetRevision = item.proposed_target?.path === proposedPath ? item.proposed_target.revision : intended?.canonical_revision || "";
        target.value = proposedPath;
      }
      viewState.targetSeeded = true;
      // This is the sole exceptional additional decision: there is no analysis
      // or selected target classification to inherit, so only registered domains
      // may be chosen. Otherwise the normal three-decision surface remains.
      const needsDomainChoice = !registry.DOMAIN_ORDER.includes(fields.knowledge_domain)
        && !registry.DOMAIN_ORDER.includes(analysisDefaults(item).knowledge_domain);
      groupFor.knowledge_domain = needsDomainChoice ? "human" : "classification";
      target.value = fields.target_path || "";
      modes.new.checked = fields.target_path === "new";
      modes.existing.checked = Boolean(fields.target_path && fields.target_path !== "new");
      targetHost.hidden = !modes.existing.checked;
      // ③ Novel items skip the storage dilemma: default to a new document.
      // The user can still switch; approval still applies.
      if (isNovelItem(item) && !viewState.novelApplied && !fields.target_path) {
        viewState.novelApplied = true;
        fields.target_path = "new";
        modes.new.checked = true;
        modes.existing.checked = false;
        targetHost.hidden = true;
        target.value = "new";
      }
      const targetSearch = targetHost.createEl("input", { attr: { type: "search", placeholder: "문서 검색", "aria-label": "대상 문서 검색" } });
      targetSearch.oninput = () => { for (const option of target.children) option.hidden = option.value === "new" || Boolean(targetSearch.value) && !String(option.textContent || option.text).toLocaleLowerCase("ko").includes(targetSearch.value.toLocaleLowerCase("ko")); };
      inputs.push(targetSearch, ...Object.values(modes));
      // ② Read-only preview of the selected existing document, rendered on
      // demand only. Never preloaded, never editable here.
      const previewTargetButton = targetHost.createEl("button", { text: "선택 문서 보기", attr: { type: "button" } });
      const previewTargetBox = targetHost.createEl("div", { attr: { class: "wiki-target-preview", hidden: "" } });
      previewTargetButton.onclick = () => {
        const row = currentTargets.find((entry) => entry.path === target.value);
        previewTargetBox.empty();
        if (!row || !row.exists) { previewTargetBox.hidden = true; return; }
        let parsed = null;
        try { parsed = store.parseLifecycleDocument(row.canonical_bytes); } catch (_) { parsed = null; }
        previewTargetBox.createEl("h4", { text: row.title || row.path });
        const bodyBox = previewTargetBox.createEl("div", { attr: { class: "wiki-target-preview-body" } });
        bodyBox.textContent = String((parsed && parsed.body) || row.canonical_bytes || "").slice(0, 1500);
        previewTargetBox.hidden = false;
      };
      inputs.push(previewTargetButton);
      target.oninput = async () => {
        if (busy || viewState.lastResult?.ok || renderId !== viewState.render) return;
        const selected = target.value;
        invalidate();
        const existing = currentTargets.find(row => row.path === selected);
        const corrections = Object.fromEntries(Object.entries(fields).filter(([name]) => viewState.touched[name]));
        viewState.fields = { ...targetDefaults(existing), ...corrections, target_path: selected };
        viewState.touched.target_path = true;
        viewState.targetRevision = existing?.canonical_revision || "";
        viewState.aiPrefilled = {};
        viewState.restoreError = ""; viewState.blockedPreview = null;
        await persistDraft();
        return modal.onOpen();
      };
      target.onchange = target.oninput;
      modes.new.onchange = () => { if (!busy) { target.value = "new"; return target.oninput(); } };
      modes.existing.onchange = () => {
        if (busy) return;
        invalidate(); fields.target_path = ""; viewState.touched.target_path = true; viewState.targetRevision = null;
        target.value = ""; modes.new.checked = false; modes.existing.checked = true; targetHost.hidden = false; targetSearch.focus?.();
        return persistDraft();
      };
      if (modes.existing.checked) {
        const chosen = currentTargets.find(row => row.path === fields.target_path);
        if (chosen) { targetHost.createEl("p", { text: `대상: ${chosen.title || ui.title(chosen.path)}` }); const change = targetHost.createEl("button", { text: "변경", attr: { type: "button", "data-action": "change-target" } }); change.onclick = () => targetSearch.focus?.(); inputs.push(change); }
      }
  // ④ Merge designation removed: collect-and-review cannot work because
  // prepare() builds only from grounded claims and never reads an edited
  // draft body. Merging needs analysis-backed intake (separate design).
      field("knowledge_kind", "지식 종류", [["claim","주장"],["principle","원칙"],["procedure","절차"],["concept","개념"]]);
      field("classification", "내용 성격", [["epistemic","재사용할 지식"],["operational","실행 업무"],["mixed","지식·업무 혼합"]]);
      field("knowledge_domain", "분야", registry.DOMAIN_ORDER.map(domain => [domain, domain]));
      if (needsDomainChoice) fieldRows.knowledge_domain.createEl("span", { text: "분석과 대상 문서에 등록된 분야가 없습니다. 등록된 분야를 하나 고르지 않으면 저장할 수 없습니다. 임의 분류는 하지 않습니다.", attr: { "data-domain-choice-note": "" } });
      field("knowledge_topics", "주제");
      field("application_trigger", "사용할 때"); field("application_contexts", "사용 맥락");
      field("conditions", "적용 범위"); field("exclusions", "예외·금지사항");
      field("invalidation_conditions", "다시 검토할 조건"); field("rationale", "원칙의 근거");
      field("steps", "절차"); field("outcome", "기대 결과"); field("definition", "개념 정의");
      field("relation_status", "이미 알고 있던 내용과 같은가요?", [["resolved","중복·충돌 없음"],["conflict","충돌"],["duplicate","중복"],["pending","미정"]]);
      field("evidence_strength", "근거가 얼마나 탄탄한가요?", [["sufficient","충분함"],["strong","강함"],["thin","얇음"]]);
      // 중복·충돌 판단은 상대 문장을 봐야 할 수 있다. 추천과 함께 겹치는 문서와
      // 그 문장을 읽기 전용으로 보여 주고, 판단은 소유자가 한다.
      const overlaps = (item.related_knowledge || []).filter(row => row && typeof row.path === "string" && row.path.endsWith(".md"));
      if (overlaps.length) {
        const overlapBox = groups.human.createEl("div", { attr: { class: "wiki-overlap", "data-knowledge-overlap": "" } });
        overlapBox.createEl("h4", { text: "겹치는 기존 지식" });
        for (const row of overlaps.slice(0, 3)) {
          const claims = Array.isArray(row.covered_claims) ? row.covered_claims : [];
          const line = overlapBox.createEl("p", { attr: { "data-overlap-document": row.path } });
          const link = line.createEl("a", { text: row.title || ui.title(row.path), attr: { href: row.path, "data-overlap-link": row.path } });
          link.onclick = event => { event?.preventDefault?.(); app.workspace?.openLinkText?.(row.path, "", false); };
          line.createEl("span", { text: ` · ${row.covered_claim_count || claims.length}개 문장 겹침` });
          for (const sentence of claims) overlapBox.createEl("blockquote", { text: sentence, attr: { "data-overlap-claim": "" } });
          // 문장이 전달되지 않아도 판단할 수 있어야 한다: 상대 문서를 읽기 전용으로 연다.
          const viewButton = line.createEl("button", { text: "원문 보기", attr: { type: "button", "data-overlap-view": row.path } });
          const preview = overlapBox.createEl("div", { attr: { class: "wiki-overlap-source", "data-overlap-body": row.path } });
          preview.hidden = true;
          viewButton.onclick = async () => {
            if (preview.hidden === false) { preview.hidden = true; return; }
            preview.empty();
            let content = "";
            try {
              const file = app.vault.getAbstractFileByPath(row.path);
              content = file ? await (app.vault.cachedRead ? app.vault.cachedRead(file) : app.vault.read(file)) : "";
            } catch (_error) { content = ""; }
            preview.createEl("pre", { text: content ? String(content).slice(0, 1500) : "문서를 읽을 수 없습니다." });
            preview.hidden = false;
          };
        }
      }
      // Offer existing analysis text for explicit reuse, never infer a condition or a passed check.
      const reuse = (name, text) => {
        const input = fieldInputs[name];
        input.value = [...new Set([...lines(fields[name]), String(text)])].join("\n");
        input.oninput();
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
        const registered = registry.TOPICS_BY_DOMAIN[fields.knowledge_domain] || [];
        registered.forEach(topic => picker.createEl("option", { text: topic, attr: { value: topic } }));
        fieldRows.knowledge_topics.querySelector("[data-topic-error]")?.remove();
        if (lines(fields.knowledge_topics).some(topic => !registered.includes(topic))) {
          fieldRows.knowledge_topics.createEl("span", { text: "선택한 분야에 등록된 주제로 수정해야 적용할 수 있습니다. 기존 입력은 보존됩니다.", attr: { role: "alert", "data-topic-error": "" } });
        }
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
      // Descriptive content comes from analysis; the three decisions are
      // visible, correctable recommendations, never an approval or a review receipt.
      // Preserve explicit corrections/clears and re-mark untouched restored values.
      const cleanText = (value) => String(value || "").trim();
      if (!viewState.aiPrefilled) viewState.aiPrefilled = {};
      const recorded = viewState.aiPrefilled;
      let filledThisRender = false;
      const suggested = analysisDefaults(item);
      const relationHint = [item.relation_status, ...(item.related_knowledge || []).map(row => row.relation)].find(value => ["conflict", "duplicate", "pending"].includes(value));
      const targetKind = targetDefaults(currentTargets.find(row => row.path === fields.target_path)).knowledge_kind;
      const recommendedKind = isCompiledPage(item)
        ? (targetKind && kindContentSatisfiable(targetKind, suggested) ? targetKind : contentSupportedKind(suggested) || suggested.knowledge_kind || targetKind)
        : targetKind || suggested.knowledge_kind;
      const recommendations = { knowledge_kind: recommendedKind, relation_status: relationHint || "resolved",
        evidence_strength: ["thin", "sufficient", "strong"].includes(item.evidence_strength) ? item.evidence_strength
          : item.grounded_claims.every(claim => claim.citations?.length && claim.citations.every(c => c.content_hash && c.evidence_quote && c.locator)) ? "sufficient" : "thin" };
      for (const name of DECISION_FIELDS) {
        const input = fieldInputs[name];
        if (!viewState.touched[name] && !cleanText(fields[name])) { fields[name] = recommendations[name]; input.value = fields[name]; filledThisRender = true; }
        const option = [...input.children].find(row => row.value === recommendations[name]);
        fieldRows[name].createEl("span", { text: `추천: ${option?.textContent || recommendations[name]} · 원문을 보고 틀리면 고치세요. 아직 승인한 판단이 아닙니다.`, attr: { "data-decision-suggestion": recommendations[name] } });
      }
      if (viewState.kindRecalculated) {
        const label = KIND_LABELS[viewState.kindRecalculated.stored] || viewState.kindRecalculated.stored;
        fieldRows.knowledge_kind.createEl("span", { text: `저장돼 있던 '${label}'은(는) 이 문서 내용으로 채울 수 없어 추천으로 다시 계산했습니다. 틀리면 고치세요.`,
          attr: { role: "alert", "data-kind-recalculated": viewState.kindRecalculated.stored } });
      }
      const markRow = (input) => {
        const rowName = Object.keys(fieldInputs).find((key) => fieldInputs[key] === input);
        const row = rowName ? fieldRows[rowName] : input.parentElement;
        const host = row || input.parentElement;
        if (!host || host.querySelector("[data-ai-badge]")) return;
        if (row) row.setAttribute("data-ai-prefilled", "true");
        host.createEl("span", { text: "AI 입력", attr: { "data-ai-badge": "true" } });
      };
      for (const name of autofillables().filter(name => !DECISION_FIELDS.includes(name))) {
        const input = fieldInputs[name];
        if (!input) continue;
        if (!(name in recorded) && !viewState.touched[name]) {
          const value = cleanText(suggested[name] || "");
          if (value && !cleanText(fields[name] || "")) {
            fields[name] = value;
            filledThisRender = true;
          }
          if (value && fields[name] === value) recorded[name] = value;
        }
        if (recorded[name] === undefined) continue;
        input.value = fields[name];
        if (input.value === recorded[name]) {
          markRow(input);
        } else {
          // User corrected it, or the control cannot display the value:
          // drop the record; never submit an unseen AI value.
          if (fields[name] === recorded[name]) fields[name] = "";
          delete recorded[name];
        }
      }
      if (filledThisRender) { invalidate(); showTopicOptions(); showKindFields(); }
      summarizeFields(); showConsequences();
      status = decision.createEl("p", { text: "다음: 승인 및 적용", attr: { role: "status", "data-decision-status": "" } });
      const acceptedLabel = decision.createEl("label"); accepted = acceptedLabel.createEl("input", { attr: { type: "checkbox", "data-review-acknowledgement": "" } }); accepted.checked = false;
      acceptedLabel.createEl("span", { text: "변경 내용과 출처를 확인했습니다." });
      const actions = decision.createEl("div", { attr: { "data-decision-actions": "" } });
      const later = ui.button(actions, "보류", "review-later", async () => {
        if (busy) return;
        await persistDraft();
        const held = await flow.hold(item);
        if (!held.ok) { status.setText(`! 수정 저장 실패: ${held.record_error}`); return; }
        modal.close();
      });
      // 제안 자체를 버리는 결정. 초안은 보존되고 대기 목록에서 빠진다.
      const reject = ui.button(actions, "반려", "reject-document-review", async () => {
        if (busy) return;
        setBusy(true);
        try {
          await persistDraft();
          const rejected = await flow.reject(item);
          if (!rejected.ok) {
            const copy = rejected.reason === "review_write_in_progress" ? "지금 적용이 진행 중이라 반려할 수 없습니다. 잠시 후 다시 시도해 주세요." : rejected.reason;
            status.setText(`! 반려하지 못했습니다: ${copy}`);
            return;
          }
          preview = null; viewState.preview = null; viewState.lastResult = null;
          callbacks.workspace?.setJourney({ status: "blocked" });
          modal.close();
        } finally { setBusy(false); }
      });
      prepareButton = ui.button(actions, "변경안 확인", "prepare-document-review", null, true);
      applyButton = ui.button(actions, "승인 및 적용", "apply-document-review", null, true);
      applyButton.disabled = true;
      const sync = () => {
        acceptedLabel.hidden = !preview; accepted.disabled = busy || !preview;
        prepareButton.hidden = Boolean(preview); applyButton.hidden = !preview;
        applyButton.disabled = busy || !preview || !accepted.checked || viewState.lastResult?.ok === true;
      };
      const setBusy = value => { busy = value; inputs.forEach(input => input.disabled = value); prepareButton.disabled = value; later.disabled = value; reject.disabled = value; accepted.disabled = value; callbacks.workspace?.setLocked(value); };
      const blockedField = (name, reason) => {
        if (!DECISION_FIELDS.includes(name) && name !== "knowledge_domain") inheritedFields.open = true;
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
        await modal.draftSaved;
        if (busy || renderId !== viewState.render) return;
        const requestRevision = ++formRevision; preview = null; viewState.preview = null; viewState.lastResult = null;
        setBusy(true); applyButton.disabled = true; accepted.checked = false; status.setText("변경과 출처를 확인하고 있습니다.");
        const result = await flow.prepare({ item, fields: { ...fields }, target_path: fields.target_path === "new" ? "" : fields.target_path || "", target_revision: viewState.targetRevision });
        setBusy(false);
        if (requestRevision !== formRevision || renderId !== viewState.render) return;
        if (!result.ok) {
          const copy = recoveryCopy(result, item);
          status.setText(`! ${copy.startsWith("적용 전에 확인할 항목이 있습니다.") ? copy : `적용 전에 확인할 항목이 있습니다. ${copy}`}`);
          const fieldName = result.field || (fields.relation_status !== "resolved" ? "relation_status" : fields.evidence_strength === "thin" ? "evidence_strength" : "");
          if (fieldName) blockedField(fieldName, copy);
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
      const refreshOnly = () => {
        viewState.recoveryPending = true;
        accepted.checked = false; acceptedLabel.hidden = true; accepted.disabled = true;
        prepareButton.hidden = true; applyButton.hidden = true; applyButton.disabled = true;
        inputs.forEach(input => input.disabled = true);
        let refreshButton = actions.querySelector('[data-action="refresh-document-review"]');
        if (!refreshButton) refreshButton = ui.button(actions, "저장 상태 다시 확인", "refresh-document-review", async () => {
          if (busy) return;
          setBusy(true);
          const result = await flow.refresh(preview);
          setBusy(false); viewState.lastResult = result;
          if (result.ok) { refreshButton.hidden = true; applied(result); await callbacks.onComplete?.(result); }
          else { status.setText(recoveryCopy(result, item)); refreshOnly(); }
        });
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
          sync(); if (written || result.reason === "outcome_unknown") refreshOnly();
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
      else if (viewState.recoveryPending && preview) refreshOnly();
      if (viewState.draftArchived) el.createEl("p", { text: "이전 수정은 이력에 보존했습니다. 현재 원문과 대상을 다시 검토하세요.", attr: { role: "alert", "data-archived-draft": "" } });
      if (viewState.draftError) status.setText(`! 수정 저장 실패: ${viewState.draftError}`);
    };
    modal.open(); return modal;
  }
  // Pure helpers (exported for tests; DOM wiring below consumes them).
  // Analysis content fields. Relation/evidence recommendations are kept
  // separate from content reuse; only exact explicit approval authorizes them.
  function autofillables() {
    return ["knowledge_kind", "classification", "knowledge_domain", "knowledge_topics", "application_trigger", "application_contexts", "conditions", "invalidation_conditions", "exclusions", "rationale", "steps", "outcome", "definition"];
  }
  // ③ Novelty: no related knowledge means no merge target to choose.
  function isNovelItem(item) {
    return !((item && item.related_knowledge) || []).length;
  }
  const api = Object.freeze({ VERSION, create, open, autofillables, isNovelItem, analysisDefaults, compiledPageDefaults, contentSupportedKind, kindContentSatisfiable, storedKindInvalidation });
  root.LLMWikiDocumentCanonicalReview = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
