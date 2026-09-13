(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const DEFAULT_DIR = "SYSTEM/CACHE/llmwiki";
  const STATE_FILE = "batch-job-state.json";
  const SCHEMA_VERSION = 3;
  const STATES = Object.freeze(["pending", "running", "review_ready", "resolved", "blocked", "outcome_unknown"]);
  // 닫힌 검토: 적용 완료(resolved) 또는 더 이상 유효하지 않음(cancelled/superseded),
  // 그리고 소유자가 버린 rejected. 닫힌 검토는 대기 대상이나 충돌로 남지 않는다.
  const CLOSED_REVIEW_STATES = Object.freeze(["resolved", "rejected", "cancelled", "superseded"]);
  // 종결(되돌릴 수 없음): 반려·취소·대체. 진행 중이던 prepare/apply가 뒤늦게 기록을
  // 되살리려 하면 저장 큐 안에서 거부한다(경합으로 반려 뒤에 쓰이는 일을 막는다).
  const TERMINAL_REVIEW_STATES = Object.freeze(["rejected", "cancelled", "superseded"]);
  // 검토 상태 전이표: 저장 큐 경계에서 강제한다. 같은 상태(초안 저장)는 항상 허용.
  const REVIEW_TRANSITIONS = Object.freeze({
    pending: ["pending", "review_ready", "running", "blocked", "rejected", "cancelled", "superseded"],
    review_ready: ["review_ready", "running", "blocked", "rejected", "cancelled", "superseded"],
    running: ["running", "resolved", "blocked", "outcome_unknown", "rejected", "cancelled", "superseded"],
    blocked: ["blocked", "review_ready", "running", "resolved", "rejected", "cancelled", "superseded"],
    outcome_unknown: ["outcome_unknown", "review_ready", "running", "resolved", "blocked", "rejected", "cancelled", "superseded"],
    resolved: ["resolved", "review_ready"],
    rejected: ["rejected"],
    cancelled: ["cancelled"],
    superseded: ["superseded"],
  });
  // 쓰기를 시작할 수 있는 사전 상태(준비 완료, 또는 이전 시도의 재개).
  const WRITE_ELIGIBLE_PRE_STATES = Object.freeze(["review_ready", "blocked", "running", "outcome_unknown"]);
  // 쓰기 임차: 살아 있는 동안은 반려도 다른 쓰기도 거부한다. 시간 기반 만료는 두지 않는다
  // (살아 있는 느린 writer와 죽은 writer를 구분할 수 없으므로, 만료가 있으면 반려 뒤 쓰기가 가능해진다).
  // 크래시로 남은 임차는 **명시적 복구**(재시작 후 새 승인)의 인수(takeover)로만 넘긴다.
  function leaseId(reviewKey) { return sha(stable([reviewKey, new Date().toISOString(), Math.random()])); }
  // 임차의 런타임 세대는 **프로세스당 하나**여야 한다. 인스턴스마다 다르면 같은 프로세스의 두 번째
  // 스토어가 살아 있는 writer의 임차를 인수해버린다. 실제 재시작 = 새 프로세스 = 새 세대.
  // (테스트는 options.generation 으로 "이전 런타임"을 흉내낼 수 있다 — 제품 경로는 전달하지 않는다.)
  const PROCESS_GENERATION = runtimeGeneration();
  // 임차에는 발급한 런타임 세대를 적는다: 같은 세대의 임차는 살아 있는 writer이므로 인수할 수 없고,
  // 다른 세대(재시작 이전)의 임차만 인수할 수 있다. 인수 여부는 호출자가 아니라 스토어가 정한다.
  function runtimeGeneration() { return sha(stable(["runtime", Date.now(), Math.random()])); }
  const PLAN_STATES = Object.freeze(["pending_review", "approved", "revision_requested", "compiled", "cancelled"]);
  const HASH = /^[0-9a-f]{64}$/u;
  const VERSION = "llmwiki_batch_job_store_attempts_v1";
  const DISPOSITIONS = Object.freeze(["committed", "committed-refresh-pending", "stale", "held/no-change", "failed", "outcome_unknown", "rejected"]);
  const STAGES = ["analysis", "planning", "review", "apply", "readback", "checkpoint", "restore"];
  const label = value => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f]/u.test(value);
  const exactKeys = (value, keys) => plain(value) && Object.keys(value).every(key => keys.includes(key));
  const nullable = (value, check) => value === null || check(value);
  function validAttempt(value) {
    return exactKeys(value, ["run_id", "job_id", "attempt_id", "previous_attempt_id", "sources", "target", "references", "provider", "versions", "stage", "time", "kind", "observation", "correction_delta", "correction_action", "taxonomy_tags", "reason_hash", "correction_reason", "disposition", "applies_automatically"])
      && [value.run_id, value.job_id, value.attempt_id].every(label) && nullable(value.previous_attempt_id, label)
      && Array.isArray(value.sources) && value.sources.length > 0 && value.sources.every(row => exactKeys(row, ["source_id", "version"]) && label(row.source_id) && HASH.test(row.version))
      && exactKeys(value.target, ["path", "base_revision"]) && nullable(value.target.path, label) && nullable(value.target.base_revision, v => HASH.test(v))
      && exactKeys(value.references, ["proposal_id", "review_id", "packet_hash", "plan_hash"]) && ["proposal_id", "review_id"].every(key => nullable(value.references[key], label))
      && ["packet_hash", "plan_hash"].every(key => nullable(value.references[key], v => HASH.test(v)))
      && exactKeys(value.provider, ["provider_key", "model"]) && ["provider_key", "model"].every(key => nullable(value.provider[key], label))
      && exactKeys(value.versions, ["prompt", "planner", "compiler", "orchestrator", "modules"])
      && ["prompt", "planner", "compiler", "orchestrator"].every(key => nullable(value.versions[key], label))
      && exactKeys(value.versions.modules, ["batch_job_store", "document_review", "planner", "compiler", "orchestrator", "analyzer", "writer", "controller"])
      && Object.values(value.versions.modules).every(label) && label(value.versions.modules.batch_job_store)
      && STAGES.includes(value.stage) && typeof value.time === "string" && Number.isFinite(Date.parse(value.time))
      && ["observation", "correction", "failure"].includes(value.kind) && /^[a-z0-9_]{1,128}$/u.test(value.observation)
      && Array.isArray(value.correction_delta) && value.correction_delta.every(row => exactKeys(row, ["field", "before", "after", "before_hash", "after_hash", "cleared"])
        && label(row.field) && correctionField(row.field) && deltaValue(row.before) && deltaValue(row.after)
        && row.before_hash === sha(stable(row.before)) && row.after_hash === sha(stable(row.after)) && typeof row.cleared === "boolean")
      && (value.correction_action === undefined || /^[a-z_]{1,64}$/u.test(value.correction_action))
      && (value.taxonomy_tags === undefined || Array.isArray(value.taxonomy_tags) && value.taxonomy_tags.every(tag => /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/u.test(tag)))
      && (value.reason_hash === undefined || HASH.test(value.reason_hash))
      && (value.correction_reason === undefined || typeof value.correction_reason === "string" && value.correction_reason.length <= 2000 && value.reason_hash === sha(value.correction_reason))
      && nullable(value.disposition, v => DISPOSITIONS.includes(v)) && value.applies_automatically === false;
  }
  function runtimeVersions(snapshot, job) {
    const available = {
      batch_job_store: VERSION, document_review: root.LLMWikiDocumentCanonicalReview?.VERSION,
      planner: root.LLMWikiDeterministicPagePlanner?.VERSION, compiler: root.LLMWikiDocumentCompiler?.COMPILER_VERSION,
      orchestrator: root.LLMWikiGoldenWikiOrchestrator?.VERSION, analyzer: root.LLMWikiBatchAnalyzer?.ARTIFACT_VERSION,
      writer: root.LLMWikiOperationWriter?.RECEIPT_VERSION, controller: root.LLMWikiRunController?.CONTROLLER_VERSION,
    };
    return { prompt: job.frozen_identity?.prompt_version || null, planner: available.planner || snapshot?.planner_version || null,
      compiler: available.compiler || snapshot?.quality_receipt?.compiler_version || null, orchestrator: available.orchestrator || snapshot?.orchestrator_version || null,
      modules: Object.fromEntries(Object.entries(available).filter(([, value]) => label(value))) };
  }
  const PAGE_EDIT_FIELDS = ["title", "purpose", "selected", "claim_ids", "target_candidate_ids", "operation_hint"];
  const correctionField = field => DRAFT_FIELDS.has(field) || /^[a-zA-Z0-9_-]+:/u.test(field) && PAGE_EDIT_FIELDS.includes(field.split(":")[1]);
  const deltaValue = value => value === null || typeof value === "string" || typeof value === "boolean" || Array.isArray(value) && value.every(label);
  const pageEdits = plan => Object.fromEntries((plan.pages || []).flatMap(page => PAGE_EDIT_FIELDS.map(field => [`${page.page_id}:${field}`, page[field] ?? null])));
  function correctionDelta(before = {}, after = {}) {
    // Only review-editable values, never item bodies, evidence quotes or prompts.
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
      .filter(key => correctionField(key) && stable(before[key]) !== stable(after[key])).map(field => ({
        field, before: before[field] ?? null, after: after[field] ?? null,
        before_hash: sha(stable(before[field] ?? null)), after_hash: sha(stable(after[field] ?? null)), cleared: after[field] === "" || after[field] === null || after[field] === undefined,
      }));
  }
  function frozenIdentity(value) {
    return Object.fromEntries(["provider_key", "model", "structured_mode", "schema_id", "prompt_version", "candidate_context_hash"].map(key => [key, value[key]]));
  }

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function sorted(values) { return [...values].sort(); }
  function empty() { return { schema_version: SCHEMA_VERSION, jobs: {}, packs: {}, plans: {}, legacy: [], recovery: null }; }
  function jsonClone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function validQualityReceipt(receipt, documents) {
    if (!plain(receipt) || !Array.isArray(documents)) return false;
    const fields = ["receipt_version", "source_hash", "inventory_hash", "plan_hash", "compiler_version",
      "quality_rules_version", "compiled_hash", "quality_status", "quality_issues", "quality_rewrite_count"];
    const body = Object.fromEntries(fields.map((field) => [field, receipt[field]]));
    return typeof receipt.receipt_version === "string" && HASH.test(receipt.source_hash || "")
      && HASH.test(receipt.inventory_hash || "") && HASH.test(receipt.plan_hash || "")
      && typeof receipt.compiler_version === "string" && typeof receipt.quality_rules_version === "string"
      && HASH.test(receipt.compiled_hash || "") && receipt.compiled_hash === sha(stable(documents))
      && ["publishable", "review_required", "draft"].includes(receipt.quality_status)
      && Array.isArray(receipt.quality_issues) && Number.isSafeInteger(receipt.quality_rewrite_count)
      && HASH.test(receipt.receipt_hash || "") && receipt.receipt_hash === sha(stable(body));
  }

  function parse(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (_error) { return null; }
    if (plain(parsed) && [1, 2].includes(parsed.schema_version) && plain(parsed.jobs) && plain(parsed.packs) && Array.isArray(parsed.legacy)) {
      parsed = { ...parsed, schema_version: SCHEMA_VERSION, plans: plain(parsed.plans) ? parsed.plans : {}, recovery: parsed.schema_version === 1 ? null : parsed.recovery ?? null };
    }
    if (!plain(parsed) || parsed.schema_version !== SCHEMA_VERSION || !plain(parsed.jobs) || !plain(parsed.packs) || !plain(parsed.plans)
      || !Array.isArray(parsed.legacy) || !(parsed.recovery === null || validRecovery(parsed.recovery))) return null;
    for (const job of Object.values(parsed.jobs)) {
      if (!validJob(job)) return null;
    }
    for (const pack of Object.values(parsed.packs)) {
      if (!validPack(pack)) return null;
    }
    for (const [jobId, snapshot] of Object.entries(parsed.plans)) {
      if (jobId !== snapshot?.job_id || !validPlanSnapshot(snapshot)) return null;
    }
    if (parsed.legacy.some((entry) => !plain(entry) || typeof entry.proposal_id !== "string")) return null;
    return parsed;
  }

  function validIdentity(identity) {
    const fields = ["provider_key", "model", "structured_mode", "schema_id", "prompt_version", "candidate_context_hash"];
    return plain(identity) && fields.every((field) => typeof identity[field] === "string" && identity[field].length > 0);
  }
  function validJob(job) {
    return plain(job) && HASH.test(job.job_id) && HASH.test(job.batch_id) && HASH.test(job.request_key)
      && STATES.includes(job.status) && plain(job.sources)
      && (job.failure_reason === undefined || typeof job.failure_reason === "string" && /^[a-z0-9_]{0,128}$/u.test(job.failure_reason))
      && (job.parent_job_id === undefined || HASH.test(job.parent_job_id))
      && (job.retry_parent_job_id === undefined || HASH.test(job.retry_parent_job_id))
      && !(job.parent_job_id !== undefined && job.retry_parent_job_id !== undefined)
      && (job.retry_intent_id === undefined || typeof job.retry_intent_id === "string" && job.retry_intent_id.length > 0)
      && (job.frozen_identity === undefined || validIdentity(job.frozen_identity))
      && (job.attempts === undefined || Array.isArray(job.attempts) && job.attempts.every(validAttempt))
      && Object.entries(job.sources).every(([id, revision]) => typeof id === "string" && id.length > 0 && HASH.test(revision));
  }
  function validRecovery(value) {
    if (!plain(value) || !["llmwiki"].includes(value.active_tab) || !HASH.test(value.selected_batch_id || "")
      || !plain(value.review) || typeof value.review.run_id !== "string" || !Array.isArray(value.review.selected_operation_ids)
      || !Array.isArray(value.review.proposals) || !Array.isArray(value.operation_outcomes)) return false;
    const operationIds = value.review.proposals.map((row) => plain(row) && row.operation_id);
    return operationIds.every((id) => typeof id === "string" && id.length > 0)
      && value.review.selected_operation_ids.every((id) => operationIds.includes(id))
      && value.operation_outcomes.every((row) => plain(row) && typeof row.operation_id === "string" && typeof row.status === "string");
  }
  function validPack(pack) {
    return plain(pack) && HASH.test(pack.pack_id) && HASH.test(pack.job_id) && HASH.test(pack.pack_hash)
      && Number.isSafeInteger(pack.received_at) && (pack.historical !== true || pack.artifact_hash === null);
  }
  function planIdentity(snapshot) {
    return sha(`${snapshot.source_revision}:${snapshot.inventory_hash}:${snapshot.plan?.plan_version || "unknown"}`);
  }
  const DRAFT_FIELDS = new Set(["target_path", "knowledge_kind", "knowledge_domain", "knowledge_topics", "application_trigger", "application_contexts", "conditions", "exclusions", "invalidation_conditions", "rationale", "steps", "outcome", "definition", "classification", "relation_status", "evidence_strength"]);
  function validDraft(draft) {
    const keys = ["fields", "touched", "cleared", "target_path", "target_revision", "source_revision", "plan_hash", "item_hash", "sources", "edit_revision"];
    return plain(draft) && Object.keys(draft).every(key => keys.includes(key))
      && plain(draft.fields) && Object.entries(draft.fields).every(([key, value]) => DRAFT_FIELDS.has(key) && typeof value === "string")
      && [draft.touched, draft.cleared].every(markers => plain(markers) && Object.entries(markers).every(([key, value]) => DRAFT_FIELDS.has(key) && value === true && Object.hasOwn(draft.fields, key)))
      && Object.keys(draft.cleared).every(key => draft.touched[key] && draft.fields[key] === "")
      && Object.keys(draft.touched).every(key => draft.fields[key] !== "" || draft.cleared[key])
      && typeof draft.target_path === "string" && draft.target_path === (draft.fields.target_path || "")
      && (draft.target_revision === null || HASH.test(draft.target_revision))
      && [draft.source_revision, draft.plan_hash, draft.item_hash].every(value => HASH.test(value))
      && Array.isArray(draft.sources) && draft.sources.length > 0 && draft.sources.every(source => plain(source)
        && Object.keys(source).every(key => ["source_id", "source_path", "content_hash"].includes(key))
        && typeof source.source_id === "string" && typeof source.source_path === "string" && HASH.test(source.content_hash))
      && Number.isSafeInteger(draft.edit_revision) && draft.edit_revision > 0;
  }
  function validReviewDrafts(reviews) {
    return plain(reviews) && Object.values(reviews).every(record => plain(record)
      && (record.pending_draft === undefined || validDraft(record.pending_draft))
      && (record.superseded_reviews === undefined || Array.isArray(record.superseded_reviews)
        && record.superseded_reviews.every(row => validReviewDrafts({ row }))));
  }
  function validPlanSnapshot(snapshot, allowHistory = true) {
    return plain(snapshot) && HASH.test(snapshot.job_id) && typeof snapshot.source_id === "string" && snapshot.source_id.length > 0
      && HASH.test(snapshot.source_revision) && HASH.test(snapshot.inventory_hash) && HASH.test(snapshot.plan_hash)
      && (snapshot.plan_identity === undefined || HASH.test(snapshot.plan_identity))
      && Number.isSafeInteger(snapshot.plan_revision) && snapshot.plan_revision > 0
      && PLAN_STATES.includes(snapshot.status) && plain(snapshot.plan)
      && (snapshot.canonical_reviews === undefined || validReviewDrafts(snapshot.canonical_reviews))
      && (snapshot.review_event === undefined || exactKeys(snapshot.review_event, ["action", "taxonomy_tags", "reason"])
        && /^[a-z_]{1,64}$/u.test(snapshot.review_event.action) && Array.isArray(snapshot.review_event.taxonomy_tags)
        && snapshot.review_event.taxonomy_tags.every(tag => /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/u.test(tag))
        && (snapshot.review_event.reason === undefined || typeof snapshot.review_event.reason === "string" && snapshot.review_event.reason.length <= 2000))
      && (snapshot.execution === undefined || (plain(snapshot.execution) && typeof snapshot.execution.plan_hash === "string"))
      && (snapshot.quality_receipt === undefined || Array.isArray(snapshot.compiled_documents)
        && validQualityReceipt(snapshot.quality_receipt, snapshot.compiled_documents)
        && snapshot.quality_receipt.source_hash === snapshot.source_revision
        && snapshot.quality_receipt.inventory_hash === snapshot.inventory_hash
        && snapshot.quality_receipt.plan_hash === snapshot.plan_hash)
      && (!allowHistory || snapshot.history === undefined || Array.isArray(snapshot.history) && snapshot.history.every((row) => validPlanSnapshot(row, false)));
  }

  function createNodeStorage(dir) {
    const fs = root.process ? require("node:fs") : null;
    const path = root.process ? require("node:path") : null;
    if (!fs) throw new Error("node_fs_unavailable");
    function resolve(name) { return path.join(dir, name); }
    return freeze({
      async exists(name) { return fs.existsSync(resolve(name)); },
      async read(name) { return fs.readFileSync(resolve(name), "utf8"); },
      async writeAtomic(name, text) {
        const target = resolve(name);
        const temp = `${target}.tmp-${root.process.pid}-${Date.now()}`;
        try { fs.writeFileSync(temp, text); fs.renameSync(temp, target); } catch (error) { try { fs.unlinkSync(temp); } catch (_ignored) {} throw error; }
      },
      async quarantine(name, text) { fs.renameSync(resolve(name), resolve(`${name}.quarantine`)); void text; },
    });
  }

  function createBatchJobStore(options = {}) {
    const storage = options.storage;
    const counters = options.counters || {};
    if (!storage || ["exists", "read", "writeAtomic", "quarantine"].some((method) => typeof storage[method] !== "function")) throw new TypeError("storage_required");
    let state = null;
    let mutationTail = Promise.resolve();
    const generation = typeof options.generation === "string" && /^[a-f0-9]{64}$/u.test(options.generation) ? options.generation : PROCESS_GENERATION;

    async function load() {
      if (state) return state;
      if (await storage.exists(STATE_FILE)) {
        let parsed = null;
        try { parsed = parse(await storage.read(STATE_FILE)); } catch (_error) { parsed = null; }
        if (parsed) {
          state = parsed;
        } else {
          await storage.quarantine(STATE_FILE, "");
          state = empty();
        }
      } else state = empty();
      // Restart recovery: running means an in-flight request without a durable receipt.
      // Mapped in memory only; reload makes zero provider calls and zero writes.
      for (const job of Object.values(state.jobs)) {
        if (job.status === "running") state.jobs[job.job_id] = freeze({ ...job, status: "outcome_unknown" });
      }
      return state;
    }

    // 다른 인스턴스(다른 런타임)가 더 새 계획을 썼다면 그 계획을 채택한다: 낡은 메모리로 남의
    // 기록을 덮어쓰지 않기 위해서다. 이 프로세스가 최신이면 아무 것도 하지 않는다.
    async function adoptLatestPlan(jobId) {
      if (!(await storage.exists(STATE_FILE))) return;
      let parsed = null;
      try { parsed = parse(await storage.read(STATE_FILE)); } catch (_error) { return; }
      const persisted = parsed?.plans?.[jobId];
      if (!persisted) return;
      const current = state.plans[jobId];
      if (current && Number.isFinite(current.plan_revision) && persisted.plan_revision <= current.plan_revision) return;
      state.plans[jobId] = freeze(jsonClone(persisted));
      const persistedJob = parsed?.jobs?.[jobId];
      if (persistedJob) state.jobs[jobId] = freeze(jsonClone(persistedJob));
    }

    async function persist() {
      const serialized = JSON.stringify(state, null, 2);
      await storage.writeAtomic(STATE_FILE, serialized);
    }

    function mutate(fn) {
      const operation = mutationTail.then(async () => {
        await load();
        const durable = JSON.stringify(state);
        try {
          await fn();
          // Exact replay is a read: keep serialization comparison inside the
          // mutation queue so concurrent duplicates cannot write twice.
          if (JSON.stringify(state) !== durable) {
            captureAttempts(JSON.parse(durable));
            await persist();
          }
        } catch (error) {
          // Failed persistence must not leave memory ahead of disk.
          state = parse(durable) || empty();
          throw error;
        }
      });
      mutationTail = operation.catch(() => undefined);
      return operation;
    }

    function appendAttempt(jobId, snapshot, review, event) {
      const job = state.jobs[jobId], attempts = job.attempts || [];
      const parent = state.jobs[job.retry_parent_job_id || job.parent_job_id];
      const packet = review?.packet, draft = review?.pending_draft;
      const sourceRows = review?.sources?.map(source => ({ source_id: source.source_id, version: source.source_content_hash }))
        || Object.entries(job.sources).map(([source_id, version]) => ({ source_id, version }));
      const attempt = {
        run_id: event.run_id || job.batch_id, job_id: jobId, attempt_id: sha(`${jobId}:${attempts.length + 1}`),
        previous_attempt_id: attempts.at(-1)?.attempt_id || parent?.attempts?.at(-1)?.attempt_id || null,
        sources: sourceRows, target: { path: packet?.target_path || (draft?.target_path !== "new" && draft?.target_path) || null,
          base_revision: packet?.before_sha256 || draft?.target_revision || null },
        references: { proposal_id: packet?.operation?.proposal_id || null, review_id: review?.item?.review_id || null,
          packet_hash: packet?.packet_hash || null, plan_hash: snapshot?.plan_hash || null },
        provider: { provider_key: job.frozen_identity?.provider_key || null, model: job.frozen_identity?.model || null },
        versions: runtimeVersions(snapshot, job), stage: event.stage, time: (options.now || (() => new Date().toISOString()))(),
        kind: event.kind || "observation", observation: event.observation, correction_delta: event.correction_delta || [],
        ...(event.correction_action ? { correction_action: event.correction_action, taxonomy_tags: event.taxonomy_tags || [] } : {}),
        ...(event.reason_hash ? { reason_hash: event.reason_hash, correction_reason: event.correction_reason } : {}), disposition: event.disposition ?? null, applies_automatically: false,
      };
      if (!validAttempt(attempt)) throw new TypeError("invalid_attempt_record");
      state.jobs[jobId] = freeze({ ...job, attempts: [...attempts, attempt] });
    }
    function captureAttempts(before) {
      for (const [jobId, job] of Object.entries(state.jobs)) {
        const prior = before.jobs[jobId], plan = state.plans[jobId], oldPlan = before.plans[jobId];
        if (!prior || prior.status !== job.status || prior.failure_reason !== job.failure_reason) {
          const disposition = job.status === "outcome_unknown" ? "outcome_unknown" : job.status === "blocked" ? "failed" : null;
          appendAttempt(jobId, plan, null, { stage: "analysis", disposition, kind: disposition === "failed" ? "failure" : "observation",
            observation: job.failure_reason || (prior ? job.status : "attempt_started") });
        }
        if (stable(plan) === stable(oldPlan) || !plan) continue;
        let changedReview = false;
        for (const [key, review] of Object.entries(plan.canonical_reviews || {})) {
          const oldReview = oldPlan?.canonical_reviews?.[key];
          if (stable(review) === stable(oldReview)) continue;
          changedReview = true;
          const draft = review.pending_draft;
          const initialFields = Object.fromEntries(Object.keys(draft?.touched || {}).map(name => [name, review.item?.[name] ?? null]));
          const delta = correctionDelta(oldReview?.pending_draft?.fields || oldReview?.fields || initialFields,
            !oldReview && draft ? Object.fromEntries(Object.keys(draft.touched).map(name => [name, draft.fields[name]])) : draft?.fields || review.fields || {});
          const reason = review.outcome?.reason || review.reason || review.status;
          const disposition = review.status === "resolved" ? "committed" : reason === "outcome_unknown" ? "outcome_unknown"
            : ["stale_before_write", "source_revision_changed", "target_revision_changed", "approval_expired"].includes(reason) ? "stale"
            : ["canonical_readback_pending", "review_checkpoint_failed"].includes(reason) ? "committed-refresh-pending"
            : ["committed_audit_pending", "committed_authority_pending"].includes(review.outcome?.status) ? "outcome_unknown"
            : review.status === "blocked" ? "failed" : null;
          appendAttempt(jobId, plan, review, { stage: review.status === "resolved" ? "checkpoint" : review.status === "running" ? "apply" : "review",
            kind: disposition === "failed" ? "failure" : delta.length && (oldReview || draft) ? "correction" : "observation", disposition,
            observation: /^[a-z0-9_]{1,128}$/u.test(reason || "") ? reason : "review_observed", correction_delta: oldReview || draft ? delta : [] });
        }
        if (!changedReview) {
          const event = plan.review_event;
          const delta = oldPlan && event ? correctionDelta(pageEdits(oldPlan.plan), pageEdits(plan.plan)) : [];
          appendAttempt(jobId, plan, null, { stage: "planning", kind: delta.length ? "correction" : "observation", correction_delta: delta,
            ...(delta.length ? { correction_action: event.action, taxonomy_tags: event.taxonomy_tags,
              ...(event.reason ? { reason_hash: sha(event.reason), correction_reason: event.reason } : {}) } : {}),
            observation: plan.status, disposition: plan.status === "cancelled" ? "held/no-change" : null });
        }
      }
      const recovery = state.recovery;
      if (!recovery || stable(recovery) === stable(before.recovery)) return;
      const job = state.jobs[recovery.selected_batch_id] || Object.values(state.jobs).find(job => job.batch_id === recovery.selected_batch_id);
      if (!job) return; // Legacy recovery snapshots did not require a job.
      for (const outcome of recovery.operation_outcomes) {
        if (stable(outcome) === stable(before.recovery?.operation_outcomes.find(row => row.operation_id === outcome.operation_id))) continue;
        const reference = recovery.review.proposals.find(row => row.operation_id === outcome.operation_id)
          || before.recovery?.review.proposals.find(row => row.operation_id === outcome.operation_id);
        let operation = null, invalidReference = false;
        if (reference?.serialized_operation) {
          try { operation = JSON.parse(reference.serialized_operation); }
          catch (_error) { invalidReference = true; }
        }
        const disposition = invalidReference ? "outcome_unknown" : ["committed", "duplicate"].includes(outcome.status) ? "committed"
          : ["rejected", "no_change", "cancelled"].includes(outcome.status) ? "held/no-change"
          : ["stale", "outcome_unknown", "failed"].includes(outcome.status) ? outcome.status : null;
        const paths = Array.isArray(operation?.destination_ids) && operation.destination_ids.length ? operation.destination_ids : [null];
        for (const target of paths) appendAttempt(job.job_id, state.plans[job.job_id], {
          item: { review_id: reference?.packet_id || outcome.operation_id },
          packet: { target_path: target, before_sha256: target ? operation.base_revisions?.[target] || sha(operation.before_bytes?.[target] || "") : null,
            operation: { proposal_id: outcome.operation_id } },
        }, { run_id: recovery.review.run_id, stage: "checkpoint", disposition, kind: disposition === "failed" ? "failure" : "observation",
          observation: invalidReference ? "operation_reference_invalid" : /^[a-z0-9_]{1,128}$/u.test(outcome.reason || outcome.status) ? outcome.reason || outcome.status : "outcome_observed" });
      }
    }
    function getJob(jobId) { return state?.jobs[jobId] || null; }
    function getPlanSnapshot(jobId) {
      const snapshot = state?.plans?.[jobId];
      return snapshot ? freeze(jsonClone(snapshot)) : null;
    }
    function listPlanSnapshots() {
      return freeze(Object.values(state?.plans || {}).map((snapshot) => jsonClone(snapshot))
        .sort((left, right) => String(left.source_id).localeCompare(String(right.source_id), "en")
          || String(left.job_id).localeCompare(String(right.job_id), "en")));
    }
    async function findRetryParent(sources) {
      validSourceRows(sources);
      await load();
      const normalized = stableSources(Object.fromEntries(sources.map((row) => [row.source_id, row.revision_hash])));
      return freeze(Object.values(state.jobs).reverse().find((job) => ["blocked", "outcome_unknown"].includes(job.status) && stableSources(job.sources) === normalized) || null);
    }

    return freeze({
      load,
      getJob,
      getPlanSnapshot,
      listPlanSnapshots,
      findRetryParent,
      async recordAttempt({ job_id, review_key, review_id = null, target_path = null, target_revision = null, stage, observation, disposition = null, correction_reason }) {
        if (!HASH.test(job_id) || !STAGES.includes(stage) || !/^[a-z0-9_]{1,128}$/u.test(observation)
          || !nullable(review_id, label) || !nullable(target_path, label) || !nullable(target_revision, v => HASH.test(v))
          || disposition !== null && !DISPOSITIONS.includes(disposition) || correction_reason !== undefined && (typeof correction_reason !== "string" || correction_reason.length > 2000)) throw new TypeError("invalid_attempt_event");
        await mutate(() => {
          const job = state.jobs[job_id];
          if (!job) throw new Error("unknown_job");
          const plan = state.plans[job_id], review = plan?.canonical_reviews?.[review_key]
            || { item: { review_id }, pending_draft: { target_path, target_revision } };
          const previous = job.attempts?.at(-1), reasonHash = correction_reason ? sha(correction_reason) : undefined;
          if (previous?.stage === stage && previous.observation === observation && previous.disposition === disposition
            && previous.references.review_id === (review.item?.review_id || null) && previous.reason_hash === reasonHash) return;
          appendAttempt(job_id, plan, review, { stage, observation, disposition, kind: disposition === "failed" ? "failure" : "observation",
            ...(reasonHash ? { reason_hash: reasonHash, correction_reason } : {}) });
        });
      },
      async createJob(input) {
        if (!plain(input) || !HASH.test(input.request_key)) throw new TypeError("invalid_job_input");
        validSourceRows(input.sources);
        const batchId = batchIdFor(input.sources, input.request_key);
        const sources = Object.fromEntries(sorted(input.sources.map((source) => source.source_id)).map((id) => [id, input.sources.find((source) => source.source_id === id).revision_hash]));
        let conflict = false;
        await mutate(() => {
          const existing = state.jobs[batchId];
          if (existing) {
            if (existing.request_key !== input.request_key || stableSources(existing.sources) !== stableSources(sources)) conflict = true;
            return;
          }
          state.jobs[batchId] = freeze({ job_id: batchId, batch_id: batchId, request_key: input.request_key, status: "pending", sources, ...(validIdentity(input.frozen_identity) ? { frozen_identity: frozenIdentity(input.frozen_identity) } : {}) });
        });
        if (conflict) throw new Error("batch_conflict");
        return freeze(getJob(batchId));
      },
      async setJobState(jobId, nextStatus, failureReason = "") {
        if (!STATES.includes(nextStatus)) throw new TypeError("invalid_state");
        if (typeof failureReason !== "string" || !/^[a-z0-9_]{0,128}$/u.test(failureReason)) throw new TypeError("invalid_failure_reason");
        await mutate(() => {
          const job = state.jobs[jobId];
          if (!job) throw new Error("unknown_job");
          state.jobs[jobId] = freeze({ ...job, status: nextStatus, ...(failureReason || job.failure_reason ? { failure_reason: failureReason } : {}) });
        });
      },
      async removeSettledJob(input) {
        if (!plain(input) || !HASH.test(input.job_id || "")
          || typeof input.expected_source_id !== "string" || !input.expected_source_id) {
          throw new TypeError("invalid_job_cleanup");
        }
        const removed = { ok: true, jobs: 0, plans: 0, packs: 0 };
        await mutate(() => {
          const job = state.jobs[input.job_id];
          if (!job) throw new Error("unknown_job");
          const sourceIds = Object.keys(job.sources);
          const packIds = Object.entries(state.packs)
            .filter(([, pack]) => pack.job_id === input.job_id)
            .map(([packId]) => packId);
          const settledSingleSource = sourceIds.length === 1
            && sourceIds[0] === input.expected_source_id
            && ["review_ready", "resolved", "blocked", "outcome_unknown"].includes(job.status);
          const unstartedExactRevision = job.status === "pending"
            && !state.plans[input.job_id] && packIds.length === 0
            && HASH.test(input.expected_source_revision || "")
            && job.sources[input.expected_source_id] === input.expected_source_revision;
          if (!settledSingleSource && !unstartedExactRevision) {
            throw new Error("job_cleanup_source_mismatch");
          }
          delete state.jobs[input.job_id];
          removed.jobs = 1;
          if (state.plans[input.job_id]) {
            delete state.plans[input.job_id];
            removed.plans = 1;
          }
          for (const packId of packIds) {
            delete state.packs[packId];
            removed.packs += 1;
          }
        });
        return freeze(removed);
      },
      async savePlanSnapshot(snapshot) {
        const copy = jsonClone(snapshot);
        if (!validPlanSnapshot(copy)) throw new TypeError("invalid_plan_snapshot");
        copy.plan_identity = planIdentity(copy);
        let result = null;
        await mutate(() => {
          const job = state.jobs[copy.job_id];
          if (!job) throw new Error("unknown_job");
          if (job.sources[copy.source_id] !== copy.source_revision) throw new Error("plan_source_revision_mismatch");
          const prior = state.plans[copy.job_id];
          if (prior) {
            if (stablePlan(prior) === stablePlan(copy)) { result = prior; return; }
            if (copy.plan_revision <= prior.plan_revision) throw new Error("plan_revision_not_monotonic");
            const sameReviewPlan = copy.plan_hash === prior.plan_hash && copy.inventory_hash === prior.inventory_hash && copy.source_revision === prior.source_revision;
            if (sameReviewPlan && copy.canonical_reviews === undefined && prior.canonical_reviews !== undefined) copy.canonical_reviews = jsonClone(prior.canonical_reviews);
            if (copy.inventory_hash !== prior.inventory_hash || (!sameReviewPlan && prior.canonical_reviews && Object.keys(prior.canonical_reviews).length)) {
              const archived = jsonClone(prior);
              delete archived.history;
              copy.history = [...(prior.history || []), archived];
            } else if (prior.history) copy.history = jsonClone(prior.history);
          }
          // 종결된 검토는 지워질 수도, 되살아날 수도 없다(원자적).
          // ① 들어오는 스냅샷이 종결 기록을 빠뜨리면(명시적 {}\ 포함) 이전 기록을 그대로 되살린다.
          // ② 쓰기 임차(write_lease)는 스토어 소유 상태다: 일반 스냅샷 저장으로 지워지지 않는다.
          const priorReviews = prior?.canonical_reviews || {};
          // 같은 계획(해시 동일)의 스냅샷 저장에서만 누락을 보존한다. 계획이 바뀌면 기존 코드가
          // 이전 버전을 history로 옮기는 게 정상 경로이므로 거기에는 개입하지 않는다.
          const sameReviewPlanForKeep = prior && copy.plan_hash === prior.plan_hash && copy.inventory_hash === prior.inventory_hash && copy.source_revision === prior.source_revision;
          if (prior && copy.canonical_reviews) {
            const incoming = { ...copy.canonical_reviews };
            for (const [key, previousReview] of Object.entries(priorReviews)) {
              if (!(key in incoming)) { if (sameReviewPlanForKeep && CLOSED_REVIEW_STATES.includes(previousReview.status)) incoming[key] = jsonClone(previousReview); continue; }
              // 임차는 스토어 소유 상태다: 들어오는 스냅샷이 값을 바꿀 수 없다.
              const next = { ...incoming[key] };
              if (previousReview.write_lease === undefined) delete next.write_lease;
              else next.write_lease = jsonClone(previousReview.write_lease);
              incoming[key] = next;
            }
            // 스토어가 발급한 적 없는 임차(새 키의 값)는 신뢰하지 않는다.
            for (const [key, next] of Object.entries(incoming)) {
              if (!priorReviews[key] && next && typeof next === "object" && next.write_lease !== undefined) { const stripped = { ...next }; delete stripped.write_lease; incoming[key] = stripped; }
            }
            copy.canonical_reviews = incoming;
          }
          for (const [key, next] of Object.entries(copy.canonical_reviews || {})) {
            const before = priorReviews[key];
            if (!before) continue;
            const allowed = REVIEW_TRANSITIONS[before.status];
            if (allowed && next.status !== before.status && !allowed.includes(next.status)) throw new Error("invalid_review_transition");
          }
          // Admission and persistence share the existing mutation queue. A
          // second proposal cannot race a pending target, even after remount.
          const pendingTargets = [];
          for (const snapshot of Object.values({ ...state.plans, [copy.job_id]: copy })) {
            const seen = new Set();
            for (const version of [snapshot, ...(snapshot.history || []).slice().reverse()]) {
              for (const [key, review] of Object.entries(version.canonical_reviews || {})) {
                if (seen.has(key)) continue;
                seen.add(key);
                if (CLOSED_REVIEW_STATES.includes(review.status)) continue;
                const paths = new Set([review.packet?.target_path, review.pending_draft?.target_path].filter(path => path && path !== "new"));
                for (const path of paths) {
                  pendingTargets.push({ path, owner: `${snapshot.job_id}:${key}` });
                }
              }
            }
          }
          for (const [key, review] of Object.entries(copy.canonical_reviews || {})) {
            if (!review.packet || CLOSED_REVIEW_STATES.includes(review.status)) continue;
            if (pendingTargets.some(row => row.path === review.packet.target_path && row.owner !== `${copy.job_id}:${key}`)) throw new Error("pending_target_conflict");
          }
          state.plans[copy.job_id] = freeze(copy);
          result = state.plans[copy.job_id];
        });
        return freeze(jsonClone(result));
      },
      async saveCanonicalReviewDraft({ job_id, review_key, item, draft, archive_reason = "" }) {
        if (!HASH.test(job_id) || !HASH.test(review_key) || !plain(item) || !validDraft(draft)) throw new TypeError("invalid_review_draft");
        let result;
        await mutate(() => {
          const plan = state.plans[job_id];
          if (!plan) throw new Error("plan_snapshot_unavailable");
          const previous = plan.canonical_reviews?.[review_key] || { item: jsonClone(item), status: "review_ready", automatic_approval: false };
          const pending = previous.pending_draft;
          const identity = value => stable([value.source_revision, value.plan_hash, value.item_hash, value.target_path, value.target_revision]);
          const history = [...(previous.superseded_reviews || [])];
          const record = { ...previous };
          const archive = (value, reason) => history.push({ item: jsonClone(item), pending_draft: jsonClone(value), status: "superseded", reason });
          if (archive_reason) {
            if (!pending || stable(pending) !== stable(draft)) { result = previous; return; }
            archive(pending, archive_reason); delete record.pending_draft;
          } else if (draft.plan_hash !== plan.plan_hash || draft.source_revision !== plan.source_revision) {
            archive(draft, "draft_identity_changed");
          } else {
            if (pending && draft.edit_revision <= pending.edit_revision) { result = previous; return; }
            if (pending && identity(pending) !== identity(draft)) archive(pending, "draft_identity_changed");
            record.pending_draft = jsonClone(draft);
          }
          record.superseded_reviews = history;
          state.plans[job_id] = freeze({ ...plan, plan_revision: plan.plan_revision + 1,
            canonical_reviews: { ...(plan.canonical_reviews || {}), [review_key]: record } });
          result = record;
        });
        return freeze(jsonClone(result));
      },
      // 소유자가 제안 자체를 버린 경우(반려): 초안과 근거는 보존하고 기록 상태만
      // rejected로 닫아 대기 목록에서 빠지게 한다. 같은 계획/원문 리비전에서는
      // 다시 제안하지 않는다(저장된 기록이 계획 행을 대체하므로).
      // 적용이 정본을 쓰는 동안의 배타적 쓰기 권한(임차). 반려는 임차 중에는 거부되고,
      // 종결된 검토는 임차를 받을 수 없다 — 둘 다 저장 큐 안에서 원자적으로 판정된다.
      async beginCanonicalWrite({ job_id, review_key, review_id = null }) {
        if (!HASH.test(job_id) || !HASH.test(review_key) || !nullable(review_id, label)) throw new TypeError("invalid_write_authority");
        let result;
        await mutate(async () => {
          await adoptLatestPlan(job_id);
          const plan = state.plans[job_id];
          if (!plan) throw new Error("plan_snapshot_unavailable");
          const previous = plan.canonical_reviews?.[review_key];
          if (!previous) throw new Error("unknown_review");
          if (review_id && previous.item?.review_id && review_id !== previous.item.review_id) throw new Error("review_identity_mismatch");
          if (TERMINAL_REVIEW_STATES.includes(previous.status)) throw new Error("review_closed");
          const held = previous.write_lease;
          // 같은 런타임의 임차는 살아 있는 writer다 — 인수 불가.
          if (held && held.generation === generation) throw new Error("review_write_in_progress");
          // 이전 런타임(재시작 전)의 임차는 중단된 쓰기에만 인수할 수 있다.
          if (held && !["running", "outcome_unknown"].includes(previous.status)) throw new Error("review_write_in_progress");
          // 임차 없는 검토는 쓰기 가능한 상태에서만 시작한다.
          if (!held && !WRITE_ELIGIBLE_PRE_STATES.includes(previous.status)) throw new Error("review_write_not_eligible");
          const record = { ...previous, status: "running", write_lease: { lease_id: leaseId(review_key), generation, granted_at: new Date().toISOString(), ...(review_id ? { review_id } : {}) } };
          state.plans[job_id] = freeze({ ...plan, plan_revision: plan.plan_revision + 1,
            canonical_reviews: { ...(plan.canonical_reviews || {}), [review_key]: freeze(record) } });
          result = record;
        });
        return freeze(jsonClone(result));
      },
      // 해제는 임차 소유자만: 일치하는 임차 식별자를 반드시 요구한다(식별자 없는 해제 금지).
      async releaseCanonicalWrite({ job_id, review_key, lease_id }) {
        if (!HASH.test(job_id) || !HASH.test(review_key) || !HASH.test(lease_id || "")) throw new TypeError("invalid_write_authority");
        let result = null;
        await mutate(async () => {
          await adoptLatestPlan(job_id);
          const plan = state.plans[job_id];
          const previous = plan?.canonical_reviews?.[review_key];
          if (!previous || previous.write_lease === undefined) return;
          if (previous.write_lease.lease_id !== lease_id) return;
          const record = { ...previous };
          delete record.write_lease;
          state.plans[job_id] = freeze({ ...plan, plan_revision: plan.plan_revision + 1,
            canonical_reviews: { ...(plan.canonical_reviews || {}), [review_key]: freeze(record) } });
          result = record;
        });
        return result ? freeze(jsonClone(result)) : null;
      },
      async rejectCanonicalReview({ job_id, review_key, review_id = null, reason = "user_rejected", rejected_at = new Date().toISOString() }) {
        if (!HASH.test(job_id) || !HASH.test(review_key) || !nullable(review_id, label)
          || typeof reason !== "string" || !reason || reason.length > 2000 || !Number.isFinite(Date.parse(rejected_at))) throw new TypeError("invalid_review_rejection");
        let result;
        await mutate(async () => {
          await adoptLatestPlan(job_id);
          const plan = state.plans[job_id];
          if (!plan) throw new Error("plan_snapshot_unavailable");
          const previous = plan.canonical_reviews?.[review_key];
          if (!previous) throw new Error("unknown_review");
          // 적용이 쓰기 권한을 쥐고 있는 동안에는 반려할 수 없다(경합 시 정본 쓰기 방지).
          // 임차는 시간으로 만료되지 않는다: 살아 있는 writer를 죽은 것으로 오인하면 그 뒤 쓰기가 가능해진다.
          if (previous.write_lease !== undefined) throw new Error("review_write_in_progress");
          // 의도한 검토만 닫는다: 식별자가 다르면 거부하고, 이미 종결된 검토는 재기록하지 않는다.
          if (review_id && previous.item?.review_id && review_id !== previous.item.review_id) throw new Error("review_identity_mismatch");
          if (previous.status === "rejected") { result = previous; return; }
          if (CLOSED_REVIEW_STATES.includes(previous.status)) throw new Error("review_already_closed");
          const record = { ...previous, status: "rejected", rejection: { reason, rejected_at, ...(review_id ? { review_id } : {}) } };
          delete record.write_lease;
          state.plans[job_id] = freeze({ ...plan, plan_revision: plan.plan_revision + 1,
            canonical_reviews: { ...(plan.canonical_reviews || {}), [review_key]: freeze(record) } });
          result = record;
        });
        return freeze(jsonClone(result));
      },
      async setPlanStatus(jobId, expectedPlanHash, nextStatus) {
        if (!HASH.test(jobId || "") || !HASH.test(expectedPlanHash || "") || !PLAN_STATES.includes(nextStatus)) throw new TypeError("invalid_plan_status");
        await mutate(() => {
          const prior = state.plans[jobId];
          if (!prior) throw new Error("plan_snapshot_unavailable");
          if (prior.plan_hash !== expectedPlanHash) throw new Error("stale_plan_snapshot");
          state.plans[jobId] = freeze({ ...prior, status: nextStatus });
        });
        return getPlanSnapshot(jobId);
      },
      async recordPackReceipt(receipt) {
        if (!plain(receipt) || !HASH.test(receipt.job_id) || !HASH.test(receipt.pack_id) || typeof receipt.pack_hash !== "string" || !receipt.pack_hash) throw new TypeError("invalid_receipt");
        let conflict = false; let unknownJob = false;
        await mutate(() => {
          if (!state.jobs[receipt.job_id]) { unknownJob = true; return; }
          const existing = state.packs[receipt.pack_id];
          if (existing) {
            if (existing.historical === true) throw new Error("pack_conflict");
            if (existing.job_id !== receipt.job_id || existing.pack_hash !== receipt.pack_hash) conflict = true;
            return;
          }
          state.packs[receipt.pack_id] = freeze({ pack_id: receipt.pack_id, job_id: receipt.job_id, pack_hash: receipt.pack_hash, artifact_hash: receipt.artifact_hash ?? null, received_at: Date.now(), historical: false });
        });
        if (conflict) throw new Error("pack_conflict");
        if (unknownJob) throw new Error("unknown_job");
        return freeze(state.packs[receipt.pack_id]);
      },
      async lookupPackReceipt(packId, packHash, requestKey) {
        await load();
        const pack = state.packs[packId];
        if (!pack || pack.historical === true) return false;
        const job = state.jobs[pack.job_id];
        return Boolean(pack.pack_hash === packHash && job && job.request_key === requestKey);
      },
      getRecoverySnapshot() { return state?.recovery ? freeze(jsonClone(state.recovery)) : null; },
      async saveRecoverySnapshot(snapshot) {
        const copy = jsonClone(snapshot);
        if (!validRecovery(copy)) throw new TypeError("invalid_recovery_snapshot");
        await mutate(() => { state.recovery = freeze(copy); });
        return freeze(jsonClone(state.recovery));
      },
      async invalidateRecoveryOperation(input) {
        if (!plain(input) || typeof input.operation_id !== "string" || !["source_hash_changed", "packet_changed", "repacket_required"].includes(input.reason)) throw new TypeError("invalid_recovery_invalidation");
        let found = false;
        await mutate(() => {
          if (!state.recovery) throw new Error("recovery_snapshot_unavailable");
          const outcomes = state.recovery.operation_outcomes.map((row) => {
            if (row.operation_id !== input.operation_id) return row;
            found = true;
            return { ...row, status: "stale", reason: input.reason, action: "repacket" };
          });
          if (!found) throw new Error("unknown_operation");
          state.recovery = freeze({ ...state.recovery, operation_outcomes: outcomes });
        });
        return freeze({ ok: true, operation_id: input.operation_id, status: "stale", action: "repacket" });
      },
      async claimExplicitRetry(input) {
        const parentJobId = input && (input.retry_parent_job_id || input.parent_job_id);
        if (!plain(input) || !HASH.test(parentJobId || "") || typeof input.retry_intent_id !== "string" || !input.retry_intent_id
          || !HASH.test(input.request_key || "") || !validIdentity(input.frozen_identity)) throw new TypeError("invalid_retry_input");
        validSourceRows(input.sources);
        let retryJob = null;
        await mutate(() => {
          const parent = state.jobs[parentJobId];
          if (!parent || !["blocked", "outcome_unknown"].includes(parent.status)
            || stableSources(parent.sources) !== stableSources(Object.fromEntries(input.sources.map((row) => [row.source_id, row.revision_hash])))) throw new Error("retry_not_available");
          const existing = Object.values(state.jobs).find((job) => (job.retry_parent_job_id || job.parent_job_id) === parent.job_id && job.retry_intent_id === input.retry_intent_id);
          if (existing) {
            if (existing.request_key !== input.request_key || stableSources(existing.sources) !== stableSources(Object.fromEntries(input.sources.map((row) => [row.source_id, row.revision_hash])))) throw new Error("retry_intent_conflict");
            retryJob = existing;
            return;
          }
          const batchId = batchIdFor(input.sources, input.request_key);
          const jobId = sha(`${parent.job_id}|${input.retry_intent_id}|${input.request_key}`);
          const sources = Object.fromEntries(sorted(input.sources.map((row) => row.source_id)).map((id) => [id, input.sources.find((row) => row.source_id === id).revision_hash]));
          retryJob = freeze({ job_id: jobId, batch_id: batchId, request_key: input.request_key, status: "pending", sources, retry_parent_job_id: parent.job_id, retry_intent_id: input.retry_intent_id, frozen_identity: frozenIdentity(input.frozen_identity) });
          state.jobs[jobId] = retryJob;
        });
        return freeze(retryJob);
      },
      async importLegacyCompleted(entries) {
        if (!Array.isArray(entries) || entries.some((entry) => !plain(entry) || typeof entry.proposal_id !== "string" || typeof entry.review_state !== "string")) throw new TypeError("invalid_legacy_entries");
        let imported = 0;
        await mutate(() => {
          const seen = new Set(state.legacy.map((entry) => entry.proposal_id));
          for (const entry of entries) {
            if (seen.has(entry.proposal_id)) continue;
            seen.add(entry.proposal_id);
            imported += 1;
            state.legacy.push(freeze({ ...entry, historical: true }));
            const packId = sha(`legacy:${entry.proposal_id}`);
            state.packs[packId] = freeze({ pack_id: packId, job_id: sha(`legacy-job:${entry.proposal_id}`), pack_hash: sha(`legacy-pack:${entry.proposal_id}:${entry.proposal_hash || ""}`), artifact_hash: null, received_at: 0, historical: true });
          }
        });
        return freeze({ ok: true, imported });
      },
    });
  }

  function sha(value) { return hashApi.sha256(value); }
  function stablePlan(value) { return JSON.stringify(value); }
  function stableSources(sources) { return JSON.stringify(Object.keys(sources).sort().map((key) => `${key}:${sources[key]}`)); }
  function validSourceRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) throw new TypeError("invalid_batch_sources");
    const seen = new Set();
    for (const row of rows) {
      if (!plain(row) || typeof row.source_id !== "string" || row.source_id.length === 0 || !HASH.test(row.revision_hash)
        || row.source_id === "__proto__" || Object.prototype.hasOwnProperty.call(row, "__proto__")) throw new TypeError("invalid_batch_sources");
      if (seen.has(row.source_id)) throw new TypeError("duplicate_source_id");
      seen.add(row.source_id);
    }
  }
  function batchIdFor(rows, requestKey) {
    validSourceRows(rows);
    const keyed = sorted(rows.map((source) => `${source.source_id}:${source.revision_hash}`));
    return sha(`${JSON.stringify(keyed)}+${requestKey}`);
  }
  function packId(jobId, chunkHashes) { return sha(`${jobId}+${JSON.stringify(sorted(chunkHashes))}`); }
  function requestKey(identityValue) {
    const fields = ["provider_key", "model", "structured_mode", "schema_id", "prompt_version", "candidate_context_hash"];
    if (!plain(identityValue) || fields.some((field) => typeof identityValue[field] !== "string" || identityValue[field].length === 0)) throw new TypeError("invalid_identity");
    const values = fields.map((field) => identityValue[field]);
    // Preserve legacy keys except the proven pipe-boundary collision shape.
    // JSON preserves exact tuple values; escaping pipes makes this encoding
    // disjoint from legacy six-field strings (which always have five pipes).
    return sha(values.some((value) => value.includes("|"))
      ? JSON.stringify(values).replace(/\|/gu, "\\u007c")
      : values.join("|"));
  }

  const api = Object.freeze({ VERSION, validAttempt, DISPOSITIONS, DEFAULT_DIR, STATE_FILE, SCHEMA_VERSION, STATES, PLAN_STATES, requestKey, packId, batchId: batchIdFor, createNodeStorage, createBatchJobStore });
  root.LLMWikiBatchJobStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
