(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const candidateStore = root.KnowledgeCandidateStore || (typeof require === "function" ? require("./knowledge-candidate-store.js") : null);
  const literatureStore = root.KnowledgeSourceStore || (typeof require === "function" ? require("./knowledge-source-store.js") : null);
  const handoffApi = root.LLMWikiObjectHandoffContract || (typeof require === "function" ? require("./llmwiki-object-handoff-contract.js") : null);
  const canonicalApi = root.LLMWikiCanonicalPacket || (typeof require === "function" ? require("./llmwiki-canonical-packet.js") : null);
  const mergeApi = root.LLMWikiMergeTransaction || (typeof require === "function" ? require("./llmwiki-merge-transaction.js") : null);

  const PLAN_VERSION = "llmwiki_lifecycle_migration_plan_v3";
  const PLANS = new WeakSet();
  const PLAN_DATA = new WeakMap();
  const OPERATIONS = Object.freeze({
    adopt_update: "todo11.canonical_v2_then_optional_merge",
    literature_reclassify: "todo9.knowledge_source_store",
    para_handoff: "todo10.object_handoff_apply",
    candidate_migrate: "todo9.knowledge_candidate_store",
    hold_quarantine: "local.hold_receipt",
    legacy_unchanged: "local.legacy_receipt",
    noop: "local.noop_receipt",
  });

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha256(value) { return hashApi.sha256(String(value)); }
  function utf8Bytes(value) { return new TextEncoder().encode(String(value)).byteLength; }
  function fail(reason) { return freeze({ ok: false, status: "rejected", reason }); }
  function safePath(value) { return typeof value === "string" && !value.startsWith("/") && !value.includes("\\") && value.split("/").every((part) => part && part !== "." && part !== ".."); }

  function memoryVault(seed = {}) {
    const files = new Map(Object.entries(seed));
    const file = (filePath) => ({ path: filePath, extension: filePath.endsWith(".md") ? "md" : "json", basename: filePath.split("/").pop().replace(/\.[^.]+$/u, "") });
    return {
      files,
      app: { vault: {
        getAbstractFileByPath(filePath) {
          if (files.has(filePath)) return file(filePath);
          return [...files.keys()].some((entry) => entry.startsWith(`${filePath}/`)) ? { path: filePath, children: [] } : null;
        },
        async read(entry) { return files.get(entry.path); },
        async createFolder() {},
        async create(filePath, bytes) { if (files.has(filePath)) throw new Error("already_exists"); files.set(filePath, bytes); return file(filePath); },
        async modify(entry, bytes) { if (!files.has(entry.path)) throw new Error("missing"); files.set(entry.path, bytes); },
      } },
    };
  }

  function sourceBinding(input) {
    if (!plain(input.inventory) || !Array.isArray(input.inventory.items) || typeof input.source_path !== "string" || typeof input.source_bytes !== "string") return fail("migration_source_required");
    const target = input.inventory.items.find((item) => item.path === input.source_path);
    if (!target || target.disposition !== input.disposition || target.bytes !== utf8Bytes(input.source_bytes) || target.sha256 !== sha256(input.source_bytes)) return fail("migration_source_binding_mismatch");
    return { target };
  }

  async function candidateStep(input) {
    if (!plain(input.candidate_input) || !plain(input.promotion_receipt)) return fail("candidate_store_input_required");
    const staged = memoryVault();
    let saved;
    try { saved = await candidateStore.saveCandidate(staged.app, input.candidate_input, { promotion_receipt: input.promotion_receipt, now: input.now }); }
    catch (_error) { return fail("candidate_store_plan_failed"); }
    const afterBytes = staged.files.get(saved.path);
    if (typeof afterBytes !== "string" || !candidateStore.isCanonicalCandidatePath(saved.path)) return fail("candidate_store_plan_failed");
    return { public: step({ kind: "candidate", authority_method: "KnowledgeCandidateStore.saveCandidate", target_path: saved.path, before_bytes: null, after_bytes: afterBytes, finalization: "none" }), private: freeze({ candidate_input: clone(input.candidate_input), promotion_receipt: input.promotion_receipt, now: input.now }) };
  }

  async function literatureStep(input) {
    if (!plain(input.literature_input)) return fail("literature_store_input_required");
    const staged = memoryVault();
    let saved;
    try { saved = await literatureStore.saveSource(staged.app, input.literature_input, { now: input.now }); }
    catch (error) { return fail(error.code || error.message || "literature_store_plan_failed"); }
    const afterBytes = staged.files.get(saved.path);
    if (typeof afterBytes !== "string") return fail("literature_store_plan_failed");
    return { public: step({ kind: "literature", authority_method: "KnowledgeSourceStore.saveSource", target_path: saved.path, before_bytes: null, after_bytes: afterBytes, finalization: "none" }), private: freeze({ literature_input: clone(input.literature_input), now: input.now }) };
  }

  async function paraStep(input) {
    if (!handoffApi.isService(input.planning_handoff) || !handoffApi.isService(input.execution_handoff)
      || !plain(input.handoff) || !plain(input.preview_app)) return fail("para_planning_authority_required");
    const planned = await input.planning_handoff.propose(input.handoff);
    const executable = await input.execution_handoff.propose(input.handoff);
    if (!planned?.ok || !executable?.ok || stable(planned.value) !== stable(executable.value)) return fail("para_proposal_mismatch");
    const beforeBytes = planned.value.before.bytes;
    const applied = await input.planning_handoff.apply(input.preview_app, { proposal: planned.value, approval: { object_type: planned.value.object_type, handoff_id: planned.value.handoff_id, decision: "approve" } });
    if (!applied?.ok || applied.status !== "appended") return fail("para_preview_failed");
    const previewFile = input.preview_app.vault.getAbstractFileByPath(planned.value.target.path);
    const afterBytes = previewFile && await input.preview_app.vault.read(previewFile);
    if (typeof afterBytes !== "string" || afterBytes === beforeBytes) return fail("para_preview_failed");
    return { public: step({ kind: "para", authority_method: "LLMWikiObjectHandoffContract.apply", target_path: planned.value.target.path, before_bytes: beforeBytes, after_bytes: afterBytes, finalization: "none" }), private: Object.freeze({ service: input.execution_handoff, proposal: executable.value }) };
  }

  function canonicalSteps(input) {
    const request = input.canonical_request;
    if (!plain(request) || !canonicalApi.verifyCanonicalPacket(request.packet)?.ok) return fail("todo11_canonical_packet_required");
    const packet = request.packet;
    const steps = [step({ kind: "canonical", authority_method: "LLMWikiOperationWriter.commitApprovedCanonicalV2", target_path: packet.target_path, before_bytes: packet.before_bytes || null, after_bytes: packet.after_bytes, finalization: "todo11_immutable_authority" })];
    const privateSteps = [Object.freeze({ request: Object.freeze({ packet: request.packet, authorization: request.authorization }) })];
    if (input.source_action === "supersede" || input.merge_intent === "merge") {
      const merge = input.merge_request;
      if (!plain(merge) || !mergeApi.isMergePacket(merge.packet) || !mergeApi.isMergeAuthorization(merge.authorization)) return fail("approved_merge_request_required");
      for (const row of merge.packet.writes) steps.push(step({ kind: "merge", authority_method: "LLMWikiMergeTransaction.commitApprovedMerge", target_path: row.target_path, before_bytes: row.before_bytes, after_bytes: row.after_bytes, finalization: "preserve_finalized_destination" }));
      privateSteps.push(Object.freeze({ request: Object.freeze({ packet: merge.packet, authorization: merge.authorization }) }));
    }
    return { public: steps, private: privateSteps };
  }

  function step(input) {
    return freeze({ ...input, before_sha256: input.before_bytes === null ? null : sha256(input.before_bytes), after_sha256: sha256(input.after_bytes), deletions: [] });
  }

  function planIdentity(plan) {
    const identity = clone(plan);
    delete identity.plan_digest;
    return identity;
  }

  async function buildPlan(input = {}) {
    const source = sourceBinding(input);
    if (source.ok === false || !Object.hasOwn(OPERATIONS, input.disposition)) return source.ok === false ? source : fail("unknown_disposition");
    let built = { public: [], private: [] };
    switch (input.disposition) {
      case "candidate_migrate": { const value = await candidateStep(input); if (value.ok === false) return value; built = { public: [value.public], private: [value.private] }; break; }
      case "literature_reclassify": { const value = await literatureStep(input); if (value.ok === false) return value; built = { public: [value.public], private: [value.private] }; break; }
      case "para_handoff": { const value = await paraStep(input); if (value.ok === false) return value; built = { public: [value.public], private: [value.private] }; break; }
      case "adopt_update": { const value = canonicalSteps(input); if (value.ok === false) return value; built = value; break; }
      case "hold_quarantine":
      case "legacy_unchanged":
      case "noop": break;
      default: return fail("unknown_disposition");
    }
    const sourceAction = input.source_action || "preserve";
    if (!["preserve", "supersede"].includes(sourceAction)) return fail("invalid_source_action");
    if (sourceAction === "supersede" && !built.public.some((item) => item.kind === "merge")) return fail("approved_merge_request_required");
    const body = {
      plan_version: PLAN_VERSION,
      inventory_digest: input.inventory.digest,
      source_path: source.target.path,
      source_revision: source.target.revision,
      source_bytes: source.target.bytes,
      source_sha256: source.target.sha256,
      disposition: input.disposition,
      operation: OPERATIONS[input.disposition],
      source_action: sourceAction,
      finalization_intent: built.public.some((item) => item.kind === "canonical") ? "todo11_immutable_authority" : "none",
      merge_intent: built.public.some((item) => item.kind === "merge") ? "approved_merge_no_delete" : "none",
      steps: built.public,
    };
    const plan = freeze({ ...body, plan_digest: sha256(stable(body)) });
    PLANS.add(plan);
    PLAN_DATA.set(plan, Object.freeze({ private_steps: Object.freeze(built.private.slice()) }));
    return Object.freeze({ ok: true, status: "planned", value: plan });
  }

  function verifyPlan(plan) {
    return Boolean(plan && PLANS.has(plan) && plan.plan_digest === sha256(stable(planIdentity(plan)))
      && plan.steps.every((item) => safePath(item.target_path) && item.after_sha256 === sha256(item.after_bytes) && item.deletions.length === 0));
  }
  function authorityData(plan) { return verifyPlan(plan) ? PLAN_DATA.get(plan) : null; }
  function packetProjection(plan) {
    if (!verifyPlan(plan)) return null;
    return freeze({ plan_digest: plan.plan_digest, disposition: plan.disposition, operation: plan.operation, source_action: plan.source_action, finalization_intent: plan.finalization_intent, merge_intent: plan.merge_intent, authority_methods: plan.steps.map((item) => item.authority_method), target_paths: plan.steps.map((item) => item.target_path), writes: plan.steps.map((item) => ({ target_path: item.target_path, after_bytes: item.after_bytes, after_sha256: item.after_sha256 })) });
  }

  const api = Object.freeze({ PLAN_VERSION, buildPlan, verifyPlan, authorityData, packetProjection, stable, sha256 });
  root.LLMWikiLifecycleMigrationPlan = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
