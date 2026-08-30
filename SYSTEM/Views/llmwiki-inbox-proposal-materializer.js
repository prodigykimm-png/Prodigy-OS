(function (root) {
  "use strict";

  // Task 9 (llmwiki-batch-core-simplification): this materializer consumes only
  // strict Task 5 compact provider artifacts ({chunk_key, outcome, items}) and
  // maps every role to exactly one lifecycle proposal class:
  //   source_summary -> Literature proposal   (ZETA/LITERATURE, create)
  //   reusable_claim -> Candidate proposal    (ZETA/CANDIDATES, create/update/merge/conflict)
  //   object_context -> typed PARA handoff draft
  //   hold / unknown / weak provenance -> unselected hold
  // Allowlisted related candidate ids may select update/merge/conflict classes,
  // but path/destination authority always comes from the local candidate index.
  // Direct Permanent proposals and promotion_complete:true are removed: an
  // existing explicit promotion gate remains the only route to Permanent.

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const routingApi = root.LLMWikiLifecycleRoutingContract || (typeof require === "function" ? require("./llmwiki-lifecycle-routing-contract.js") : null);
  const identityApi = root.LLMWikiIdentityResolution || (typeof require === "function" ? require("./llmwiki-identity-resolution.js") : null);
  const operationApi = root.LLMWikiOperationContract || (typeof require === "function" ? require("./llmwiki-operation-contract.js") : null);
  const objectHandoffApi = root.LLMWikiObjectHandoffContract || (typeof require === "function" ? require("./llmwiki-object-handoff-contract.js") : null);
  const documentAssemblerApi = root.LLMWikiDocumentAssembler || (typeof require === "function" ? require("./llmwiki-document-assembler.js") : null);
  const documentMergePlannerApi = root.LLMWikiDocumentMergePlanner || (typeof require === "function" ? require("./llmwiki-document-merge-planner.js") : null);
  if (!documentAssemblerApi) throw new Error("LLMWikiDocumentAssembler is required.");
  if (!documentMergePlannerApi) throw new Error("LLMWikiDocumentMergePlanner is required.");
  const HASH = /^[0-9a-f]{64}$/u;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const CAND = /^cand_[a-zA-Z0-9_-]{1,64}$/u;
  const ROLES = Object.freeze(["source_summary", "reusable_claim", "object_context", "hold"]);
  const OUTCOMES = Object.freeze(["proposals", "hold", "no_change"]);
  const ITEM_FIELDS = new Set(["role", "topic", "evidence_key", "evidence_quote", "claims", "review_reasons", "related_candidate_ids", "span"]);
  const FORBIDDEN_FIELDS = new Set([
    "offset", "offsets", "start", "end", "alias", "temporary_span_alias", "span_path", "path", "paths",
    "operation", "operation_kind", "operation_id", "serialized_operation", "destination",
    "destination_id", "destination_ids", "write", "writes", "approval", "approved", "provider",
    "provider_key", "model", "secret", "api_key", "canonical_proposal", "canonical_bytes",
  ]);
  const LITERATURE_DIR = "ZETA/LITERATURE";
  const CANDIDATE_DIR = "ZETA/CANDIDATES";

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) { if (operationApi?.isOperationRecord?.(value)) return value; if (Array.isArray(value)) return Object.freeze(value.map(freeze)); if (!plain(value)) return value; return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)]))); }
  function fail(reason) { return freeze({ ok: false, reason }); }
  function sha(value) { return hashApi.sha256(String(value)); }
  function safeVaultPath(value, prefix) { return typeof value === "string" && value.startsWith(`${prefix}/`) && value.endsWith(".md") && !value.includes("\\") && !value.split("/").some(part => !part || part === "." || part === ".."); }
  function identityKey(unitId) { return `identity_${String(unitId).replace(/^unit_/u, "")}`; }
  function titleFor(itemRow) { const first = Array.isArray(itemRow.claims) && itemRow.claims[0]; const text = String(first?.text || itemRow.evidence_quote || "").trim(); return text; }

  function localIndex(value) {
    if (!Array.isArray(value)) return [];
    const rows = [];
    for (const row of value) {
      if (!plain(row) || Object.keys(row).some(key => !["identity_id", "identity_key", "content_hash", "revision"].includes(key))
        || !ID.test(String(row.identity_id || "")) || !ID.test(String(row.identity_key || "")) || !HASH.test(String(row.content_hash || ""))
        || !HASH.test(String(row.revision || ""))) return null;
      rows.push(freeze({ ...row }));
    }
    return rows;
  }
  function candidates(index) { return index.map(({ identity_id, identity_key, content_hash, revision }) => ({ identity_id, identity_key, content_hash, revision })); }

  // Local related-candidate index: rows are trusted local state; the model may
  // only reference their ids through the allowlist. Paths never come from the model.
  function relatedIndex(value) {
    if (!Array.isArray(value)) return [];
    const rows = [];
    for (const row of value) {
      if (!plain(row) || Object.keys(row).some(key => !["candidate_id", "path", "content_hash", "revision", "before_bytes"].includes(key))
        || !CAND.test(String(row.candidate_id || "")) || !safeVaultPath(row.path, CANDIDATE_DIR)
        || !HASH.test(String(row.content_hash || "")) || !HASH.test(String(row.revision || ""))
        || typeof row.before_bytes !== "string" || sha(row.before_bytes) !== row.revision) return null;
      rows.push(freeze({ ...row }));
    }
    return rows;
  }
  function allowedIds(value) {
    if (!Array.isArray(value)) return new Set();
    const ids = new Set();
    for (const id of value) if (typeof id === "string" && CAND.test(id)) ids.add(id);
    return ids;
  }

  function localObjectRoutes(value) {
    if (!Array.isArray(value)) return null;
    const seen = new Set();
    const slots = objectHandoffApi && objectHandoffApi.TARGET_SLOTS;
    for (const route of value) {
      if (!plain(route) || Object.keys(route).some(key => !["semantic_id", "object_type", "object_id", "slot", "lane"].includes(key))
        || !ID.test(String(route.semantic_id || "")) || !ID.test(String(route.object_id || ""))
        || (route.lane !== undefined && route.lane !== "operational" && route.lane !== "mixed")
        || !slots || !Array.isArray(slots[route.object_type]) || !slots[route.object_type].includes(route.slot)
        || seen.has(route.semantic_id)) return null;
      seen.add(route.semantic_id);
    }
    return freeze(value.map(route => ({ ...route })));
  }
  function objectDraftFor(unit, route, decision) {
    const routed = decision ? { ok: true, value: decision } : routingApi.routeLifecycle({
      unit_id: unit.unit_id, lane: "operational", semantic_type: "object_state",
      target: { object_type: route.object_type, slot: route.slot },
      identity: { identity_key: `object_${route.object_id}`, content_hash: unit.text_hash, candidates: [] },
    });
    if (!routed.ok || routed.value.destination !== "para_object" || routed.value.review_state !== "review") return fail(routed.reason || "local_object_routing_failed");
    const text = titleFor(unit.item || unit);
    if (!text || route.slot === "related_knowledge") return fail("local_object_draft_invalid");
    return freeze({ ok: true, value: freeze({
      handoff_id: `handoff_${sha(`${unit.unit_id}:${route.object_id}:${route.slot}`).slice(0, 24)}`,
      object_type: route.object_type, object_id: route.object_id, slot: route.slot, text,
      linked_lifecycle_ids: routed.value.link_id ? [unit.unit_id, routed.value.link_id] : [unit.unit_id], decision: routed.value, unit_id: unit.unit_id,
    }) });
  }

  function validateItem(rawItem) {
    if (!plain(rawItem)) return fail("invalid_item");
    for (const key of Object.keys(rawItem)) {
      if (FORBIDDEN_FIELDS.has(key)) return fail("forbidden_authority");
      if (!ITEM_FIELDS.has(key)) return fail("unknown_field");
    }
    if (!ROLES.includes(rawItem.role)) return fail("unknown_role");
    if (rawItem.topic !== undefined && (typeof rawItem.topic !== "string" || rawItem.topic.trim().length === 0 || rawItem.topic.length > 160)) return fail("invalid_topic");
    if (rawItem.evidence_key !== undefined && (typeof rawItem.evidence_key !== "string" || !/^evidence_[1-9][0-9]{0,2}$/u.test(rawItem.evidence_key))) return fail("invalid_evidence_key");
    if (typeof rawItem.evidence_quote !== "string" || rawItem.evidence_quote.length === 0) return fail("invalid_evidence_quote");
    if (!Array.isArray(rawItem.claims) || rawItem.claims.length > 8) return fail("invalid_claims");
    for (const claim of rawItem.claims) if (!plain(claim) || typeof claim.text !== "string" || claim.text.trim().length === 0) return fail("invalid_claims");
    if (!Array.isArray(rawItem.review_reasons) || rawItem.review_reasons.length > 4) return fail("invalid_review_reasons");
    for (const reason of rawItem.review_reasons) if (typeof reason !== "string" || reason.trim().length === 0) return fail("invalid_review_reasons");
    if (!Array.isArray(rawItem.related_candidate_ids)) return fail("invalid_related_candidates");
    let span = null;
    if (rawItem.span !== undefined) {
      if (!plain(rawItem.span) || Object.keys(rawItem.span).length !== 3
        || !Number.isInteger(rawItem.span.start) || !Number.isInteger(rawItem.span.end) || typeof rawItem.span.alias !== "string"
        || rawItem.span.start < 0 || rawItem.span.end < rawItem.span.start) return fail("invalid_span");
      span = rawItem.span;
    }
    return freeze({ ok: true, value: freeze({
      role: rawItem.role, ...(rawItem.topic ? { topic: rawItem.topic.trim() } : {}), ...(rawItem.evidence_key ? { evidence_key: rawItem.evidence_key } : {}), evidence_quote: rawItem.evidence_quote,
      claims: freeze(rawItem.claims.map(claim => freeze({ text: claim.text }))),
      review_reasons: freeze([...rawItem.review_reasons]),
      related_candidate_ids: freeze([...rawItem.related_candidate_ids]),
      ...(span ? { span: freeze({ ...span }) } : {}),
    }) });
  }

  function citationFor(source, itemRow) {
    const anchored = itemRow.span && Number.isInteger(itemRow.span.start) && Number.isInteger(itemRow.span.end);
    return freeze({
      source_id: source.source_id, content_hash: source.content_hash, source_url: null,
      locators: anchored ? [source.source_path, `${source.source_path}#${itemRow.span.start}-${itemRow.span.end}`] : [source.source_path],
      source_archive_id: null, confidence: anchored ? "explicit" : "inferred",
    });
  }

  function baseOperation(input) {
    return {
      contract_version: "llmwiki_operation_contract_v1",
      operation_id: null, kind: input.kind, destination_ids: input.destination_ids,
      base_revisions: input.base_revisions || {}, before_bytes: input.before_bytes || {},
      after_bytes: input.after_bytes, source_citations: input.citations || [input.citation],
      conflicts: input.conflicts || [], risk_tier: input.risk_tier,
      effects: { deprecations: [], supersessions: [] },
      ...(input.kind === "merge" ? { source_ids: input.source_ids } : {}),
    };
  }
  function finalizeOperation(template, unitId, kind, destination) {
    template.operation_id = `operation_${sha(`${unitId}:${kind}:${template.destination_ids.join("|")}`).slice(0, 24)}`;
    const parsed = operationApi.parseOperation(JSON.stringify(template));
    if (!parsed.ok) return parsed;
    return freeze({ ok: true, value: freeze({ kind, capture_target: destination === "literature" ? "zeta_literature" : "knowledge_candidate", operation: parsed.value }) });
  }

  function citationForDocument(source, document) {
    const locators = [...new Set((document.citations || []).flatMap((row) => Array.isArray(row.locators) ? row.locators : []))];
    return freeze({
      source_id: source.source_id, content_hash: source.content_hash, source_url: null,
      locators: locators.length ? locators : [source.source_path],
      source_archive_id: null,
      confidence: (document.citations || []).every((row) => row.confidence === "explicit") ? "explicit" : "inferred",
    });
  }
  function documentUnitId(source, document) {
    return `document_${sha(JSON.stringify([source.source_id, document.role, document.title, document.matched_candidate_ids || [], document.claims])).slice(0, 24)}`;
  }

  function literatureProposal(document, source) {
    const unitId = documentUnitId(source, document);
    const routed = routingApi.routeLifecycle({
      unit_id: unitId, lane: "epistemic", semantic_type: "source_material", source_bound: true,
      identity: { identity_key: identityKey(unitId), content_hash: sha(document.body), candidates: [] },
    });
    if (!routed.ok) return routed;
    if (routed.value.destination !== "literature" || routed.value.review_state !== "review") return holdFor({ unit_id: unitId }, "lifecycle_hold");
    const path = `${LITERATURE_DIR}/${unitId}.md`;
    const built = finalizeOperation(baseOperation({
      kind: "create", destination_ids: [path], after_bytes: { [path]: document.body },
      citation: citationForDocument(source, document), risk_tier: "low",
    }), unitId, "create", "literature");
    if (!built.ok) return built;
    return freeze({ ok: true, value: freeze({ title: document.title, class: "create", selected: false, unit_id: unitId, document, decision: routed.value, ...built.value }) });
  }

  function resolvedRelated(itemRow, related, allowed, index) {
    const resolved = [];
    for (const id of itemRow.related_candidate_ids) {
      if (!allowed.has(id)) return fail("candidate_id_not_allowed");
      const row = related.find(candidate => candidate.candidate_id === id);
      if (row) resolved.push(row);
    }
    return freeze({ ok: true, value: freeze(resolved) });
  }

  function candidateProposal(document, source, related) {
    const unitId = documentUnitId(source, document);
    const routed = routingApi.routeLifecycle({
      unit_id: unitId, lane: "epistemic", semantic_type: "reusable_knowledge", promotion_complete: false,
      identity: { identity_key: identityKey(unitId), content_hash: sha(document.body), candidates: [] },
    });
    if (!routed.ok) return routed;
    if (routed.value.destination !== "knowledge_candidate") return holdFor({ unit_id: unitId }, "lifecycle_hold");
    const matchedIds = Array.isArray(document.matched_candidate_ids) ? document.matched_candidate_ids : [];
    const rows = matchedIds.map((id) => related.find((candidate) => candidate.candidate_id === id)).filter(Boolean);
    const mutationDocument = document.document_kind === "topic_article" ? document : {
      ...document,
      document_kind: "topic_article",
      page_id: `page_${sha(`${unitId}:compiled-section`).slice(0, 24)}`,
    };
    const mutation = documentMergePlannerApi.planDocumentMutation({ document: mutationDocument, candidate_documents: related });
    if (!mutation.ok) return mutation;
    if (mutation.value.kind === "hold") return holdFor({ unit_id: unitId, item: document }, mutation.value.reason);
    if (mutation.value.kind === "no_change") return holdFor({ unit_id: unitId, item: document }, mutation.value.reason);
    const citation = citationForDocument(source, document);
    const conflicts = document.review_reasons.length > 0 && rows.length > 0
      ? [{ conflict_id: `conflict_${sha(`${unitId}:conflict`).slice(0, 24)}`, status: "unresolved", source_ids: [citation.source_id], summary: document.review_reasons[0] }]
      : [];
    let kind;
    let template;
    if (rows.length === 1) {
      kind = "update";
      const row = rows[0];
      template = baseOperation({
        kind, destination_ids: [row.path],
        base_revisions: { [row.path]: row.revision }, before_bytes: { [row.path]: row.before_bytes },
        after_bytes: { [row.path]: mutation.value.after_bytes }, citation, conflicts, risk_tier: conflicts.length > 0 ? "high" : "medium",
      });
    } else {
      kind = "create";
      const path = `${CANDIDATE_DIR}/${unitId}.md`;
      template = baseOperation({ kind, destination_ids: [path], after_bytes: { [path]: document.body }, citation, risk_tier: "low" });
    }
    const built = finalizeOperation(template, unitId, kind, "knowledge_candidate");
    if (!built.ok) return built;
    return freeze({ ok: true, value: freeze({
      title: document.title, class: conflicts.length > 0 ? "conflict" : kind, selected: false,
      unit_id: unitId, document, decision: routed.value, ...built.value,
    }) });
  }

  function holdFor(unit, reason) {
    return freeze({ ok: true, value: freeze({
      hold_id: `hold_${sha(`${unit.unit_id}:${reason}`).slice(0, 24)}`,
      reason, unit_id: unit.unit_id, role: unit.item ? unit.item.role : "hold",
      review_reasons: unit.item ? unit.item.review_reasons : [], selected: false,
    }) });
  }

  function createInboxProposalMaterializer(options = {}) {
    const index = localIndex(options.localIdentityIndex || []);
    const related = relatedIndex(options.relatedCandidates || []);
    const allowed = allowedIds(options.allowedCandidateIds || []);
    const routes = localObjectRoutes(options.localObjectRoutes || []);
    const objectResolver = options.objectResolver || (objectHandoffApi && Array.isArray(options.localObjectIndex) ? objectHandoffApi.createLocalObjectResolver(options.localObjectIndex) : null);
    const objectHandoff = options.objectHandoff || (objectHandoffApi && objectResolver
      ? objectHandoffApi.create({ registry: objectHandoffApi.createProductionAdapterRegistry(), objectResolver, knowledgeResolver: options.knowledgeResolver }) : null);
    if (index === null) throw new TypeError("invalid_local_identity_index");
    if (related === null) throw new TypeError("invalid_related_candidates");
    if (routes === null) throw new TypeError("invalid_local_object_routes");
    const documentAssembler = options.documentAssembler || documentAssemblerApi.createDocumentAssembler({
      canonicalDocuments: Array.isArray(options.canonicalDocuments) ? options.canonicalDocuments : [],
      candidateDocuments: related,
    });

    // Pure mapping of strict Task 5 compact artifacts into lifecycle review
    // proposals, PARA handoff drafts, and unselected holds. Zero writes: this
    // module has no writer, no approval authority, and touches no files.
    function materialize(input) {
      if (!plain(input) || !Array.isArray(input.artifacts) || !plain(input.source)) return fail("compact_artifacts_required");
      const source = input.source;
      if (!ID.test(String(source.source_id || "")) || !HASH.test(String(source.content_hash || "")) || typeof source.source_path !== "string" || source.source_path.length === 0) return fail("invalid_source_citation");
      const proposals = [];
      const para_drafts = [];
      const holds = [];
      const documentArtifacts = [];
      for (const artifact of input.artifacts) {
        if (!plain(artifact) || Object.keys(artifact).some(key => !["chunk_key", "outcome", "items"].includes(key))
          || !ID.test(String(artifact.chunk_key || "")) || !OUTCOMES.includes(artifact.outcome) || !Array.isArray(artifact.items) || artifact.items.length > 8) return fail("invalid_compact_artifact");
        const documentItems = [];
        for (let position = 0; position < artifact.items.length; position += 1) {
          const checked = validateItem(artifact.items[position]);
          if (!checked.ok) return checked;
          const itemRow = checked.value;
          const unitId = `${artifact.chunk_key}_item${position}`;
          const unit = freeze({
            unit_id: unitId, text_hash: sha(JSON.stringify([artifact.chunk_key, itemRow.evidence_quote, itemRow.claims])),
            item: itemRow,
          });
          if (artifact.outcome === "hold" || itemRow.role === "hold" || itemRow.claims.length === 0) {
            holds.push(holdFor(unit, itemRow.role === "hold" ? "weak_provenance_hold" : itemRow.claims.length === 0 ? "empty_claims_hold" : "outcome_hold").value);
            continue;
          }
          if (itemRow.role === "object_context") {
            const route = routes.find(entry => entry.semantic_id === artifact.chunk_key);
            if (!route) { holds.push(holdFor(unit, "object_route_unresolved").value); continue; }
            const draft = objectDraftFor(unit, route);
            if (!draft.ok) return draft;
            para_drafts.push(draft.value);
            continue;
          }
          for (const id of itemRow.related_candidate_ids) if (!allowed.has(id)) return fail("candidate_id_not_allowed");
          documentItems.push(itemRow);
        }
        documentArtifacts.push(freeze({ chunk_key: artifact.chunk_key, outcome: artifact.outcome, items: documentItems }));
      }
      const assembled = documentAssembler.assemble({ source, artifacts: documentArtifacts });
      if (!assembled.ok) return fail(assembled.reason || "document_assembly_failed");
      for (const document of assembled.documents) {
        const proposed = document.role === "source_summary"
          ? literatureProposal(document, source)
          : candidateProposal(document, source, related);
        if (!proposed.ok) return proposed;
        if (proposed.value.hold_id) holds.push(proposed.value);
        else proposals.push(proposed.value);
      }
      for (const hold of assembled.holds || []) holds.push(freeze({
        hold_id: `hold_${sha(JSON.stringify([source.source_id, hold.role, hold.reason, holds.length])).slice(0, 24)}`,
        reason: hold.reason, role: hold.role, review_reasons: [], selected: false,
      }));
      return freeze({ ok: true, proposals, para_drafts, holds, no_changes: assembled.no_changes || [] });
    }
    function materializeDocuments(input) {
      if (!plain(input) || !plain(input.source) || !Array.isArray(input.documents)) return fail("compiled_documents_required");
      const source = input.source;
      if (!ID.test(String(source.source_id || "")) || !HASH.test(String(source.content_hash || ""))
        || typeof source.source_path !== "string" || source.source_path.length === 0) return fail("invalid_source_citation");
      const linkTargets = new Map();
      for (const document of input.documents) {
        if (!plain(document) || document.role !== "reusable_claim" || typeof document.title !== "string") continue;
        const matchedIds = Array.isArray(document.matched_candidate_ids) ? document.matched_candidate_ids : [];
        const matchedRows = matchedIds.map((id) => related.find((candidate) => candidate.candidate_id === id)).filter(Boolean);
        const targetPath = matchedRows.length === 1
          ? matchedRows[0].path
          : matchedRows.length === 0
            ? `${CANDIDATE_DIR}/${documentUnitId(source, document)}.md`
            : null;
        if (targetPath) linkTargets.set(document.title, targetPath.replace(/\.md$/u, ""));
      }
      const proposals = [];
      const holds = [];
      for (const document of input.documents) {
        if (!plain(document) || !["source_summary", "reusable_claim"].includes(document.role)
          || typeof document.title !== "string" || typeof document.body !== "string"
          || !Array.isArray(document.claims) || !Array.isArray(document.citations)) return fail("invalid_compiled_document");
        let materializedDocument = document;
        if (document.role === "source_summary" && linkTargets.size > 0) {
          let body = document.body;
          for (const [title, targetPath] of linkTargets) {
            body = body.split(`[[${title}]]`).join(`[[${targetPath}|${title}]]`);
          }
          materializedDocument = { ...document, body };
        }
        const proposed = materializedDocument.role === "source_summary"
          ? literatureProposal(materializedDocument, source)
          : candidateProposal(materializedDocument, source, related);
        if (!proposed.ok) return proposed;
        if (proposed.value.hold_id) holds.push(proposed.value);
        else proposals.push(proposed.value);
      }
      return freeze({ ok: true, proposals, holds, para_drafts: [], no_changes: [] });
    }
    // PARA is a local operational destination. This materializer only mints a
    // typed review proposal; it has no approval or write authority.
    async function materializeParaObject(draft) {
      if (!objectHandoff || typeof objectHandoff.propose !== "function") return fail("object_handoff_unavailable");
      return objectHandoff.propose(draft);
    }
    return freeze({ materialize, materializeDocuments, materializeParaObject });
  }
  const api = freeze({ createInboxProposalMaterializer });
  root.LLMWikiInboxProposalMaterializer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
