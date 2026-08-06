(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash
    || (typeof require === "function" ? require("./llmwiki-hash.js") : null);

  const ARTIFACT_NAMES = Object.freeze([
    "confidence-cache.json",
    "entity-graph.json",
    "lint-report.json",
    "retrieval-index.json",
    "run-memory.json",
  ]);
  const HASH = /^[a-f0-9]{64}$/u;
  const SAFE_ID = /^[A-Za-z0-9_-]{3,128}$/u;
  const PROJECTION_AUTHORITY = "derived_non_canonical";
  const SENSITIVE_KEYS = new Set([
    "api_key", "apikey", "authorization", "body", "credential", "credentials", "cookie", "cookies",
    "git_commit", "hidden_model_state", "note_body", "password", "provider", "raw_body", "raw_prompt",
    "secret", "source_text", "token", "access_token", "refresh_token",
  ]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (!plain(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha256(value) {
    if (!hashApi || typeof hashApi.sha256 !== "function") throw new Error("hash_contract_missing");
    return hashApi.sha256(String(value));
  }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function revision(value) { return typeof value === "string" && HASH.test(value); }
  function redactString(value) {
    return value
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[redacted-email]")
      .replace(/\bBearer\s+[^\s,;]+/giu, "Bearer [redacted]")
      .replace(/\b(?:api[_-]?key|password|secret|token)\s*[:=]\s*[^\s,;]+/giu, "$1=[redacted]")
      .replace(/\b(?:sk|pk)_[A-Za-z0-9_-]{12,}\b/gu, "[redacted-token]");
  }
  function redact(value, key = "") {
    if (SENSITIVE_KEYS.has(String(key).toLowerCase())) return "[redacted]";
    if (typeof value === "string") return redactString(value);
    if (Array.isArray(value)) return value.map((child) => redact(child));
    if (plain(value)) {
      const result = {};
      for (const [childKey, child] of Object.entries(value)) result[childKey] = redact(child, childKey);
      return result;
    }
    return value;
  }
  function safeLocator(locator) {
    if (typeof locator !== "string" || locator !== locator.trim() || locator.startsWith("/") || locator.includes("\\")) return false;
    if (/[\u0000-\u001f\u007f]/u.test(locator) || locator.includes("[[") || locator.includes("]]")) return false;
    const pathPart = locator.split("#", 1)[0];
    return pathPart.split("/").every((segment) => segment && segment !== "." && segment !== "..");
  }
  function safeVaultPath(value) {
    return typeof value === "string"
      && value === value.trim()
      && !value.startsWith("/")
      && !/^[A-Za-z]:[\\/]/u.test(value)
      && !/[\u0000-\u001f\u007f\\]/u.test(value)
      && value.split("/").every((segment) => segment && segment !== "." && segment !== "..");
  }
  function contentHashLinks(canonicalRevision, sourceRevision, auditRevision) {
    const result = [
      { kind: "canonical_revision", hash: canonicalRevision },
      { kind: "source_revision", hash: sourceRevision },
    ];
    if (revision(auditRevision)) result.push({ kind: "audit_revision", hash: auditRevision });
    return result;
  }

  function cleanCitation(citation) {
    return redact({
      source_id: citation && citation.source_id,
      content_hash: citation && citation.content_hash,
      locator: citation && citation.locator,
      ...(citation && Array.isArray(citation.locators) ? { locators: clone(citation.locators) } : {}),
      ...(citation && typeof citation.confidence === "string" ? { confidence: citation.confidence } : {}),
    });
  }
  function cleanConflict(conflict) {
    return redact({
      conflict_id: conflict && conflict.conflict_id,
      status: conflict && conflict.status,
      ...(conflict && Array.isArray(conflict.locators) ? { locators: clone(conflict.locators) } : {}),
      ...(conflict && Array.isArray(conflict.source_ids) ? { source_ids: clone(conflict.source_ids) } : {}),
    });
  }
  function cleanDocument(document) {
    return redact({
      document_id: document && document.document_id,
      type: document && document.type,
      title: document && document.title,
      statement: document && document.statement,
      citations: (document && document.citations || []).map(cleanCitation),
      conflicts: (document && document.conflicts || []).map(cleanConflict),
      content_hash: document && document.content_hash,
    });
  }
  function cleanProposal(proposal) {
    return redact({
      proposal_id: proposal && proposal.proposal_id,
      kind: proposal && proposal.kind,
      status: proposal && proposal.status,
      title: proposal && proposal.title,
      statement: proposal && proposal.statement,
      source_ids: clone(proposal && proposal.source_ids || []),
      citations: (proposal && proposal.citations || []).map(cleanCitation),
      conflicts: (proposal && proposal.conflicts || []).map(cleanConflict),
      payload_hash: proposal && proposal.payload_hash,
      trust_status: "proposal_unverified",
      write_intent: { target: "none" },
    });
  }
  function cleanConfidence(entry) {
    return redact({
      target_id: entry && entry.target_id,
      confidence: entry && entry.confidence,
      score: entry && entry.score,
      source_ids: clone(entry && entry.source_ids || []),
    });
  }
  function cleanRunMemory(memory) {
    return {
      run_id: memory && memory.run_id,
      result_ids: clone(memory && memory.result_ids || []),
      proposal_ids: clone(memory && memory.proposal_ids || []),
      explicit_user_feedback: redact(memory && memory.explicit_user_feedback),
      retrieval_method: memory && memory.retrieval_method,
      version: memory && memory.version,
      timing_ms: memory && memory.timing_ms,
      redacted_metrics: { tokens: memory && memory.metrics && memory.metrics.tokens },
    };
  }

  function createRedactedProjection(input) {
    const value = plain(input) ? input : {};
    return {
      refresh_id: value.refresh_id,
      canonical_revision: value.canonical_revision,
      current_canonical_revision: value.current_canonical_revision,
      source_revision: value.source_revision,
      current_source_revision: value.current_source_revision,
      ...(value.expected_current_snapshot_revision ? { expected_current_snapshot_revision: value.expected_current_snapshot_revision } : {}),
      ...(value.audit_revision ? { audit_revision: value.audit_revision } : {}),
      documents: (value.documents || []).map(cleanDocument),
      proposals: (value.proposals || []).map(cleanProposal),
      confidence: (value.confidence || []).map(cleanConfidence),
      run_memory: cleanRunMemory(value.run_memory),
      unavailable_source_ids: clone(value.unavailable_source_ids || []),
    };
  }

  function validateInput(input) {
    if (!plain(input)) return "invalid_projection";
    if (!SAFE_ID.test(input.refresh_id || "")) return "invalid_refresh_id";
    if (!revision(input.canonical_revision)) return "invalid_canonical_revision";
    if (!revision(input.source_revision)) return "invalid_source_revision";
    if (input.audit_revision !== undefined && !revision(input.audit_revision)) return "invalid_audit_revision";
    if (input.current_canonical_revision !== input.canonical_revision) return "canonical_revision_mismatch";
    if (input.current_source_revision !== input.source_revision) return "source_revision_mismatch";
    if (input.expected_current_snapshot_revision !== undefined && !revision(input.expected_current_snapshot_revision)) return "invalid_expected_snapshot_revision";
    for (const document of input.documents || []) {
      for (const citation of document.citations || []) {
        if (citation.locator !== undefined && !safeLocator(citation.locator)) return "invalid_locator";
        for (const locator of citation.locators || []) if (!safeLocator(locator)) return "invalid_locator";
      }
    }
    return null;
  }

  function buildArtifacts(input) {
    const projection = createRedactedProjection(input);
    const links = contentHashLinks(projection.canonical_revision, projection.source_revision, projection.audit_revision);
    const documents = projection.documents.map((document) => clone(document));
    const common = {
      canonical_revision: projection.canonical_revision,
      source_revision: projection.source_revision,
      ...(projection.audit_revision ? { audit_revision: projection.audit_revision } : {}),
      content_hash_links: links,
      projection_authority: PROJECTION_AUTHORITY,
    };
    return {
      "retrieval-index.json": { artifact_name: "retrieval-index.json", ...common, documents },
      "entity-graph.json": { artifact_name: "entity-graph.json", ...common, entities: documents.map((document) => ({ entity_id: document.document_id, type: document.type })) },
      "confidence-cache.json": { artifact_name: "confidence-cache.json", ...common, entries: clone(projection.confidence) },
      "lint-report.json": { artifact_name: "lint-report.json", ...common, status: "clean", issues: [] },
      "run-memory.json": { artifact_name: "run-memory.json", ...common, memory: clone(projection.run_memory) },
    };
  }

  function validateArtifacts(artifacts) {
    if (!plain(artifacts)) return "invalid_artifact_shape";
    const names = Object.keys(artifacts).sort();
    if (names.join("\n") !== ARTIFACT_NAMES.slice().sort().join("\n")) return "unknown_artifact";
    const arrayFields = {
      "retrieval-index.json": "documents",
      "entity-graph.json": "entities",
      "confidence-cache.json": "entries",
      "lint-report.json": "issues",
    };
    for (const name of ARTIFACT_NAMES) {
      const artifact = artifacts[name];
      if (!plain(artifact) || artifact.artifact_name !== name || artifact.projection_authority !== PROJECTION_AUTHORITY) return "invalid_artifact_shape";
      if (!revision(artifact.canonical_revision) || !revision(artifact.source_revision) || !Array.isArray(artifact.content_hash_links)) return "invalid_artifact_shape";
      if (arrayFields[name] && !Array.isArray(artifact[arrayFields[name]])) return "invalid_artifact_shape";
      if (name === "run-memory.json" && !plain(artifact.memory)) return "invalid_artifact_shape";
    }
    return null;
  }

  function buildSnapshot(input, artifacts, snapshotRevision) {
    const projection = createRedactedProjection(input);
    return {
      snapshot_revision: snapshotRevision,
      canonical_revision: projection.canonical_revision,
      source_revision: projection.source_revision,
      ...(projection.audit_revision ? { audit_revision: projection.audit_revision } : {}),
      content_hash_links: contentHashLinks(projection.canonical_revision, projection.source_revision, projection.audit_revision),
      projection_authority: PROJECTION_AUTHORITY,
      documents: clone(projection.documents),
      proposals: clone(projection.proposals),
      conflicts: projection.documents.flatMap((document) => clone(document.conflicts || [])),
      artifacts: clone(artifacts),
    };
  }

  function refreshError(reason) {
    const error = new Error(reason);
    error.refreshReason = reason;
    return error;
  }
  function failureReason(error, fallback) {
    return error && typeof error.refreshReason === "string" ? error.refreshReason : fallback;
  }

  function buildRefreshBundle(input, options = {}) {
    const projection = createRedactedProjection(input);
    const invalid = validateInput(projection);
    if (invalid) throw refreshError(invalid);
    let artifacts;
    try {
      artifacts = buildArtifacts(projection);
      if (typeof options.artifactBuilder === "function") artifacts = options.artifactBuilder({ input: clone(projection) }, artifacts);
    } catch (error) {
      if (error && error.refreshReason) throw error;
      throw refreshError("artifact_build_failed");
    }
    const artifactFailure = options.forceValidationFailure || validateArtifacts(artifacts);
    if (artifactFailure) throw refreshError(String(artifactFailure));
    const artifactMeta = {};
    for (const name of ARTIFACT_NAMES) artifactMeta[name] = { sha256: sha256(stable(artifacts[name])) };
    const snapshotRevision = sha256(stable({
      canonical_revision: projection.canonical_revision,
      source_revision: projection.source_revision,
      audit_revision: projection.audit_revision,
      artifacts: artifactMeta,
    }));
    const snapshot = buildSnapshot(projection, artifacts, snapshotRevision);
    const manifest = {
      snapshot_revision: snapshotRevision,
      canonical_revision: projection.canonical_revision,
      source_revision: projection.source_revision,
      ...(projection.audit_revision ? { audit_revision: projection.audit_revision } : {}),
      content_hash_links: contentHashLinks(projection.canonical_revision, projection.source_revision, projection.audit_revision),
      projection_authority: PROJECTION_AUTHORITY,
      artifacts: artifactMeta,
    };
    return { projection, artifacts, artifactMeta, snapshotRevision, snapshot, manifest };
  }

  function createDerivedRefreshStore({ rootDir }) {
    if (typeof require !== "function") throw new Error("node_runtime_unavailable");
    const fs = require("node:fs");
    const path = require("node:path");
    const snapshotsDir = path.join(rootDir, "snapshots");
    const tmpDir = path.join(rootDir, ".tmp");
    const currentPath = path.join(rootDir, "current-manifest.json");
    const failuresPath = path.join(rootDir, "failures.json");

    function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
    function currentManifest() { return fs.existsSync(currentPath) ? readJson(currentPath) : null; }
    function recordFailure(input, reason) {
      fs.mkdirSync(rootDir, { recursive: true });
      const failures = fs.existsSync(failuresPath) ? readJson(failuresPath) : [];
      const record = { refresh_id: input.refresh_id, reason };
      if (!failures.some((row) => stable(row) === stable(record))) failures.push(record);
      fs.writeFileSync(failuresPath, `${JSON.stringify(failures)}\n`, "utf8");
    }
    function preflight(input) {
      const projection = createRedactedProjection(input);
      const invalid = validateInput(projection);
      if (invalid) return invalid;
      const current = currentManifest();
      if (projection.expected_current_snapshot_revision && (!current || current.snapshot_revision !== projection.expected_current_snapshot_revision)) {
        const repeat = current
          && current.canonical_revision === projection.canonical_revision
          && current.source_revision === projection.source_revision
          && fs.existsSync(path.join(snapshotsDir, projection.expected_current_snapshot_revision));
        if (!repeat) return "current_snapshot_version_mismatch";
      }
      return null;
    }
    function refresh(input, options = {}) {
      const projection = createRedactedProjection(input);
      let tempPath;
      try {
        const invalid = preflight(projection);
        if (invalid) throw refreshError(invalid);
        const bundle = buildRefreshBundle(projection, options);
        fs.mkdirSync(tmpDir, { recursive: true });
        tempPath = path.join(tmpDir, `${bundle.snapshotRevision}-${process.pid}`);
        fs.mkdirSync(tempPath, { recursive: true });
        for (const name of ARTIFACT_NAMES) fs.writeFileSync(path.join(tempPath, name), `${JSON.stringify(bundle.artifacts[name])}\n`, "utf8");
        fs.writeFileSync(path.join(tempPath, "snapshot.json"), `${JSON.stringify(bundle.snapshot)}\n`, "utf8");
        if (options.simulatePartialSwapFailure) throw refreshError("simulated_partial_swap_failure");
        fs.mkdirSync(snapshotsDir, { recursive: true });
        const finalPath = path.join(snapshotsDir, bundle.snapshotRevision);
        if (!fs.existsSync(finalPath)) fs.renameSync(tempPath, finalPath);
        else fs.rmSync(tempPath, { recursive: true, force: true });
        tempPath = null;
        const pointerPath = path.join(tmpDir, `current-${process.pid}.json`);
        fs.writeFileSync(pointerPath, `${JSON.stringify(bundle.manifest)}\n`, "utf8");
        fs.renameSync(pointerPath, currentPath);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return { ok: true, value: { snapshot_revision: bundle.snapshotRevision, manifest_hash: sha256(stable(bundle.manifest)), artifacts: bundle.artifactMeta } };
      } catch (error) {
        if (tempPath) fs.rmSync(tempPath, { recursive: true, force: true });
        fs.rmSync(tmpDir, { recursive: true, force: true });
        const reason = failureReason(error, "refresh_failed");
        recordFailure(projection, reason);
        return { ok: false, reason };
      }
    }
    return {
      refresh,
      readCurrentManifest: currentManifest,
      readCurrentSnapshot() { const current = currentManifest(); return current ? readJson(path.join(snapshotsDir, current.snapshot_revision, "snapshot.json")) : null; },
      readArtifact(snapshotRevision, artifactName) { return readJson(path.join(snapshotsDir, snapshotRevision, artifactName)); },
      listFailures() { return fs.existsSync(failuresPath) ? readJson(failuresPath) : []; },
      queryCurrent({ query }) {
        const snapshot = this.readCurrentSnapshot();
        if (!snapshot) return { ok: false, reason: "no_current_snapshot" };
        const results = snapshot.documents.filter((document) => `${document.title} ${document.statement}`.includes(query));
        return { ok: true, value: { status: snapshot.conflicts.length ? "conflict" : "ok", results } };
      },
    };
  }

  function vaultReady(app) {
    const vault = app && app.vault;
    return Boolean(vault) && ["getAbstractFileByPath", "read", "create", "modify", "createFolder"]
      .every((method) => typeof vault[method] === "function");
  }
  function adapterError(code) { const error = new Error(code); error.code = code; return error; }

  function createObsidianDerivedRefreshStore(app, options = {}) {
    if (!vaultReady(app)) throw adapterError("app_vault_unavailable");
    const vault = app.vault;
    const rootPath = options.rootPath || ".llmwiki-derived";
    if (!safeVaultPath(rootPath)) throw adapterError("invalid_derived_root");
    const snapshotsPath = `${rootPath}/snapshots`;
    const currentPath = `${rootPath}/current-manifest.json`;
    const failuresPath = `${rootPath}/failures.json`;

    async function readEntry(filePath) {
      const file = vault.getAbstractFileByPath(filePath);
      if (!file) return { file: null, bytes: null };
      return { file, bytes: await vault.read(file) };
    }
    async function ensureFolder(folderPath) {
      let current = "";
      for (const segment of folderPath.split("/")) {
        current = current ? `${current}/${segment}` : segment;
        if (!vault.getAbstractFileByPath(current)) await vault.createFolder(current);
      }
    }
    async function readJson(filePath) {
      const entry = await readEntry(filePath);
      if (!entry.file) return null;
      try { return JSON.parse(entry.bytes); }
      catch (_error) { throw refreshError(filePath === currentPath ? "current_manifest_invalid" : "derived_json_invalid"); }
    }
    async function readCurrentManifest() {
      const manifest = await readJson(currentPath);
      if (manifest === null) return null;
      if (!plain(manifest) || !revision(manifest.snapshot_revision) || !revision(manifest.canonical_revision)
        || !revision(manifest.source_revision) || manifest.projection_authority !== PROJECTION_AUTHORITY || !plain(manifest.artifacts)) {
        throw refreshError("current_manifest_invalid");
      }
      return manifest;
    }
    async function writeImmutable(filePath, bytes) {
      const existing = await readEntry(filePath);
      if (existing.file) {
        if (existing.bytes !== bytes) throw refreshError("existing_snapshot_corrupt");
        return false;
      }
      await ensureFolder(filePath.split("/").slice(0, -1).join("/"));
      await vault.create(filePath, bytes);
      return true;
    }
    async function swapManifest(bytes) {
      const existing = await readEntry(currentPath);
      if (existing.file && existing.bytes === bytes) return false;
      await ensureFolder(rootPath);
      try {
        if (existing.file) await vault.modify(existing.file, bytes);
        else await vault.create(currentPath, bytes);
      } catch (_error) {
        throw refreshError("manifest_swap_failed");
      }
      return true;
    }
    function failureRecord(input, reason) {
      return {
        refresh_id: SAFE_ID.test(input.refresh_id || "") ? input.refresh_id : "redacted_refresh_id",
        reason,
        canonical_revision: revision(input.canonical_revision) ? input.canonical_revision : "0".repeat(64),
        source_revision: revision(input.source_revision) ? input.source_revision : "0".repeat(64),
        audit_revision: revision(input.audit_revision) ? input.audit_revision : "0".repeat(64),
      };
    }
    async function recordFailure(input, reason) {
      const record = failureRecord(input, reason);
      let failures = [];
      try {
        const existing = await readEntry(failuresPath);
        if (existing.file) {
          const parsed = JSON.parse(existing.bytes);
          if (!Array.isArray(parsed)) return false;
          failures = parsed;
          if (failures.some((row) => stable(row) === stable(record))) return false;
          failures.push(record);
          await vault.modify(existing.file, `${JSON.stringify(failures)}\n`);
        } else {
          await ensureFolder(rootPath);
          await vault.create(failuresPath, `${JSON.stringify([record])}\n`);
        }
        return true;
      } catch (_error) {
        return false;
      }
    }
    async function preflight(input) {
      const invalid = validateInput(input);
      if (invalid) return invalid;
      let current;
      try { current = await readCurrentManifest(); }
      catch (error) { return failureReason(error, "current_manifest_invalid"); }
      if (input.expected_current_snapshot_revision && (!current || current.snapshot_revision !== input.expected_current_snapshot_revision)) {
        const expectedPath = `${snapshotsPath}/${input.expected_current_snapshot_revision}`;
        const repeat = current
          && current.canonical_revision === input.canonical_revision
          && current.source_revision === input.source_revision
          && Boolean(vault.getAbstractFileByPath(expectedPath));
        if (!repeat) return "current_snapshot_version_mismatch";
      }
      return null;
    }
    async function refresh(input, refreshOptions = {}) {
      const projection = createRedactedProjection(input);
      try {
        const invalid = await preflight(projection);
        if (invalid) throw refreshError(invalid);
        const bundle = buildRefreshBundle(projection, refreshOptions);
        const snapshotRoot = `${snapshotsPath}/${bundle.snapshotRevision}`;
        for (const name of ARTIFACT_NAMES) await writeImmutable(`${snapshotRoot}/${name}`, `${JSON.stringify(bundle.artifacts[name])}\n`);
        await writeImmutable(`${snapshotRoot}/snapshot.json`, `${JSON.stringify(bundle.snapshot)}\n`);
        if (refreshOptions.simulatePartialSwapFailure) throw refreshError("simulated_partial_swap_failure");
        const changed = await swapManifest(`${JSON.stringify(bundle.manifest)}\n`);
        return {
          ok: true,
          value: {
            snapshot_revision: bundle.snapshotRevision,
            manifest_hash: sha256(stable(bundle.manifest)),
            artifacts: bundle.artifactMeta,
            changed,
          },
        };
      } catch (error) {
        const reason = failureReason(error, "refresh_failed");
        const failureRecorded = await recordFailure(projection, reason);
        return { ok: false, reason, failure_recorded: failureRecorded };
      }
    }
    async function readCurrentSnapshot() {
      const current = await readCurrentManifest();
      if (!current) return null;
      return readJson(`${snapshotsPath}/${current.snapshot_revision}/snapshot.json`);
    }
    return Object.freeze({
      refresh,
      readCurrentManifest,
      readCurrentSnapshot,
      async readArtifact(snapshotRevision, artifactName) {
        if (!revision(snapshotRevision) || !ARTIFACT_NAMES.includes(artifactName)) throw adapterError("invalid_artifact_path");
        return readJson(`${snapshotsPath}/${snapshotRevision}/${artifactName}`);
      },
      async listFailures() {
        try { const failures = await readJson(failuresPath); return Array.isArray(failures) ? failures : []; }
        catch (_error) { return []; }
      },
      async queryCurrent({ query }) {
        const snapshot = await readCurrentSnapshot();
        if (!snapshot) return { ok: false, reason: "no_current_snapshot" };
        const results = snapshot.documents.filter((document) => `${document.title} ${document.statement}`.includes(query));
        return { ok: true, value: { status: snapshot.conflicts.length ? "conflict" : "ok", results } };
      },
    });
  }

  function resolveObsidianDerivedRefreshStore(app, options = {}) {
    if (!vaultReady(app)) return { ok: false, status: "runtime_unavailable", reason: "app_vault_unavailable" };
    try { return { ok: true, status: "ready", store: createObsidianDerivedRefreshStore(app, options) }; }
    catch (error) { return { ok: false, status: "runtime_unavailable", reason: error.code || "derived_store_unavailable" }; }
  }

  async function refreshAfterCanonicalAudit({ canonicalResult, refreshStore, refreshInput, refreshOptions = {} }) {
    const eligibleStatus = plain(canonicalResult)
      && canonicalResult.ok === true
      && (canonicalResult.status === "committed" || canonicalResult.status === "repaired");
    if (!eligibleStatus) return canonicalResult;
    const auditRevision = canonicalResult.audit && canonicalResult.audit.hash;
    if (!revision(auditRevision)) {
      return Object.freeze({
        ...canonicalResult,
        ok: true,
        status: "committed_refresh_failed",
        refresh_ok: false,
        canonical_committed: true,
        reason: "finalized_audit_required",
        refresh_counts: { snapshot: 0, failure: 0 },
      });
    }
    const projection = createRedactedProjection({ ...refreshInput, audit_revision: auditRevision });
    let refreshed;
    try {
      refreshed = await refreshStore.refresh(projection, refreshOptions);
    } catch (_error) {
      refreshed = { ok: false, reason: "refresh_failed", failure_recorded: false };
    }
    const writeCounts = plain(canonicalResult.write_counts) ? clone(canonicalResult.write_counts) : {
      canonical: canonicalResult.status === "committed" ? 1 : 0,
      audit: 1,
      derived: 0,
      provider: 0,
      network: 0,
      git: 0,
    };
    if (refreshed && refreshed.ok === true) {
      const changed = refreshed.value.changed !== false;
      return Object.freeze({
        ...canonicalResult,
        ok: true,
        status: "committed",
        refresh_ok: true,
        snapshot_revision: refreshed.value.snapshot_revision,
        manifest_hash: refreshed.value.manifest_hash,
        write_counts: { ...writeCounts, derived: changed ? 1 : 0 },
        refresh_counts: { snapshot: changed ? 1 : 0, failure: 0 },
      });
    }
    return Object.freeze({
      ...canonicalResult,
      ok: true,
      status: "committed_refresh_failed",
      refresh_ok: false,
      canonical_committed: true,
      reason: refreshed && refreshed.reason || "refresh_failed",
      write_counts: { ...writeCounts, derived: 0 },
      refresh_counts: { snapshot: 0, failure: refreshed && refreshed.failure_recorded ? 1 : 0 },
    });
  }

  const api = Object.freeze({
    ARTIFACT_NAMES,
    PROJECTION_AUTHORITY,
    stable,
    createRedactedProjection,
    validateInput,
    buildArtifacts,
    validateArtifacts,
    buildSnapshot,
    buildRefreshBundle,
    createDerivedRefreshStore,
    createObsidianDerivedRefreshStore,
    resolveObsidianDerivedRefreshStore,
    refreshAfterCanonicalAudit,
  });
  root.LLMWikiDerivedRefresh = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
