(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const routingApi = root.LLMWikiLifecycleRoutingContract || (typeof require === "function" ? require("./llmwiki-lifecycle-routing-contract.js") : null);
  const identityApi = root.LLMWikiIdentityResolution || (typeof require === "function" ? require("./llmwiki-identity-resolution.js") : null);
  const operationApi = root.LLMWikiOperationContract || (typeof require === "function" ? require("./llmwiki-operation-contract.js") : null);
  const objectHandoffApi = root.LLMWikiObjectHandoffContract || (typeof require === "function" ? require("./llmwiki-object-handoff-contract.js") : null);
  const HASH = /^[0-9a-f]{64}$/u;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) { if (operationApi?.isOperationRecord?.(value)) return value; if (Array.isArray(value)) return Object.freeze(value.map(freeze)); if (!plain(value)) return value; return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)]))); }
  function fail(reason) { return freeze({ ok: false, reason }); }
  function safePath(value) { return typeof value === "string" && value.startsWith("ZETA/PERMANENT/") && value.endsWith(".md") && !value.includes("\\") && !value.split("/").some(part => !part || part === "." || part === ".."); }
  function identityKey(unit) { return `identity_${String(unit.semantic_id || "").replace(/^semantic_/u, "")}`; }
  function canonicalBytes(claim) { return `# ${claim}\n\n${claim}\n`; }
  function titleFor(unit) { return String(unit.claims?.[0]?.text || "").trim(); }
  function localIndex(value) {
    if (!Array.isArray(value)) return [];
    const rows = [];
    for (const row of value) {
      if (!plain(row) || Object.keys(row).some(key => !["identity_id", "identity_key", "content_hash", "revision", "path", "before_bytes"].includes(key))
        || !ID.test(String(row.identity_id || "")) || !ID.test(String(row.identity_key || "")) || !HASH.test(String(row.content_hash || ""))
        || !HASH.test(String(row.revision || "")) || !safePath(row.path) || typeof row.before_bytes !== "string" || hashApi.sha256(row.before_bytes) !== row.revision) return null;
      rows.push(freeze({ ...row }));
    }
    return rows;
  }
  function candidates(index) { return index.map(({ identity_id, identity_key, content_hash, revision }) => ({ identity_id, identity_key, content_hash, revision })); }
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
    const identity = { identity_key: `object_${route.object_id}`, content_hash: unit.text_hash, candidates: [] };
    const routed = decision ? { ok: true, value: decision } : routingApi.routeLifecycle({ unit_id: unit.unit_id, lane: "operational", semantic_type: "object_state", target: { object_type: route.object_type, slot: route.slot }, identity });
    if (!routed.ok || routed.value.destination !== "para_object" || routed.value.review_state !== "review") return fail(routed.reason || "local_object_routing_failed");
    const text = titleFor(unit);
    if (!text || route.slot === "related_knowledge") return fail("local_object_draft_invalid");
    return freeze({ ok: true, value: freeze({
      handoff_id: `handoff_${hashApi.sha256(`${unit.unit_id}:${route.object_id}:${route.slot}`).slice(0, 24)}`,
      object_type: route.object_type, object_id: route.object_id, slot: route.slot, text,
      linked_lifecycle_ids: routed.value.link_id ? [unit.unit_id, routed.value.link_id] : [unit.unit_id], decision: routed.value, unit_id: unit.unit_id,
    }) });
  }
  function proposalFor(unit, source, index) {
    const claim = titleFor(unit);
    if (!claim || !ID.test(unit.unit_id) || !HASH.test(unit.text_hash || "")) return fail("invalid_durable_semantic_artifact");
    const key = identityKey(unit);
    if (!ID.test(key)) return fail("invalid_local_identity_key");
    // Explicitly exercise the local identity authority before lifecycle routing.
    const resolved = identityApi.resolveIdentity({ identity_key: key, content_hash: unit.text_hash, candidates: candidates(index) });
    if (!resolved.ok) return resolved;
    const routed = routingApi.routeLifecycle({
      unit_id: unit.unit_id, lane: "epistemic", semantic_type: "reusable_knowledge", promotion_complete: true,
      identity: { identity_key: key, content_hash: unit.text_hash, candidates: candidates(index) },
    });
    if (!routed.ok) return routed;
    const decision = routed.value;
    if (decision.destination !== "canonical_knowledge" || decision.review_state !== "review" || !["create", "update", "merge", "noop"].includes(decision.operation)) return fail("local_routing_not_reviewable");
    const existing = index.find(row => row.identity_id === decision.candidate_ids[0]) || null;
    const path = existing ? existing.path : `ZETA/PERMANENT/${unit.unit_id}.md`;
    const before = existing ? existing.before_bytes : "";
    const after = canonicalBytes(claim);
    const operation = {
      contract_version: "llmwiki_operation_contract_v1",
      operation_id: `operation_${hashApi.sha256(`${unit.unit_id}:${decision.operation}:${path}`).slice(0, 24)}`,
      kind: decision.operation,
      destination_ids: [path],
      base_revisions: decision.operation === "create" ? {} : { [path]: hashApi.sha256(before) },
      before_bytes: decision.operation === "create" ? {} : { [path]: before },
      after_bytes: { [path]: after },
      source_citations: [{ source_id: source.source_id, content_hash: source.content_hash, source_url: null, locators: [source.source_path], source_archive_id: null, confidence: "explicit" }],
      conflicts: [], risk_tier: "low", effects: { deprecations: [], supersessions: [] },
    };
    const parsed = operationApi.parseOperation(JSON.stringify(operation));
    if (!parsed.ok) return parsed;
    return freeze({ ok: true, value: freeze({ title: claim, operation: parsed.value, decision, unit_id: unit.unit_id }) });
  }
  function createInboxProposalMaterializer(options = {}) {
    const index = localIndex(options.localIdentityIndex || []);
    const routes = localObjectRoutes(options.localObjectRoutes || []);
    const objectResolver = options.objectResolver || (objectHandoffApi && Array.isArray(options.localObjectIndex) ? objectHandoffApi.createLocalObjectResolver(options.localObjectIndex) : null);
    const objectHandoff = options.objectHandoff || (objectHandoffApi && objectResolver
      ? objectHandoffApi.create({ registry: objectHandoffApi.createProductionAdapterRegistry(), objectResolver, knowledgeResolver: options.knowledgeResolver }) : null);
    if (index === null) throw new TypeError("invalid_local_identity_index");
    if (routes === null) throw new TypeError("invalid_local_object_routes");
    function materialize(input) {
      if (!plain(input) || !Array.isArray(input.artifacts) || !plain(input.source)) return fail("durable_artifacts_required");
      const proposals = [];
      const para_drafts = [];
      for (const artifact of input.artifacts) {
        if (!plain(artifact) || !Array.isArray(artifact.semantic_units) || !ID.test(String(artifact.semantic_id || "")) || !HASH.test(String(artifact.text_hash || ""))) return fail("invalid_durable_semantic_artifact");
        for (const unit of artifact.semantic_units) {
          if (unit.disposition !== "propose") continue;
          const durableUnit = { ...unit, semantic_id: artifact.semantic_id, text_hash: artifact.text_hash };
          const objectRoute = routes.find(route => route.semantic_id === artifact.semantic_id);
          if (objectRoute) {
            if (objectRoute.lane === "mixed") {
              const objectIdentity = { identity_key: `object_${objectRoute.object_id}`, content_hash: durableUnit.text_hash, candidates: [] };
              const knowledgeIdentity = { identity_key: identityKey(durableUnit), content_hash: durableUnit.text_hash, candidates: candidates(index) };
              const mixed = routingApi.routeLifecycle({ unit_id: durableUnit.unit_id, lane: "mixed", components: [
                { unit_id: durableUnit.unit_id, lane: "operational", semantic_type: "object_state", target: { object_type: objectRoute.object_type, slot: objectRoute.slot }, identity: objectIdentity },
                { unit_id: durableUnit.unit_id, lane: "epistemic", semantic_type: "reusable_knowledge", promotion_complete: true, identity: knowledgeIdentity },
              ] });
              if (!mixed.ok) return mixed;
              const objectDecision = mixed.value.decisions.find(decision => decision.destination === "para_object");
              const knowledgeDecision = mixed.value.decisions.find(decision => decision.destination === "canonical_knowledge");
              const proposed = proposalFor(durableUnit, input.source, index);
              const draft = objectDraftFor(durableUnit, objectRoute, objectDecision);
              if (!proposed.ok || !draft.ok || !knowledgeDecision) return fail("local_mixed_routing_failed");
              proposals.push(freeze({ ...proposed.value, decision: knowledgeDecision }));
              para_drafts.push(draft.value);
            } else {
              const draft = objectDraftFor(durableUnit, objectRoute);
              if (!draft.ok) return draft;
              para_drafts.push(draft.value);
            }
            continue;
          }
          const proposed = proposalFor(durableUnit, input.source, index);
          if (!proposed.ok) return proposed;
          proposals.push(proposed.value);
        }
      }
      return freeze({ ok: true, proposals, para_drafts });
    }
    // PARA is a local operational destination. This materializer only mints a
    // typed review proposal; it has no approval or write authority.
    async function materializeParaObject(draft) {
      if (!objectHandoff || typeof objectHandoff.propose !== "function") return fail("object_handoff_unavailable");
      return objectHandoff.propose(draft);
    }
    return freeze({ materialize, materializeParaObject });
  }
  const api = freeze({ canonicalBytes, createInboxProposalMaterializer });
  root.LLMWikiInboxProposalMaterializer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
