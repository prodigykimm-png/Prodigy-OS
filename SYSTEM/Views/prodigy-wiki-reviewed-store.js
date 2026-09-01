(function (root) {
  "use strict";

  const defaultHash = root.LLMWikiHash
    || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const artifactApi = root.ProdigyWikiArtifactContract
    || (typeof require === "function" ? require("./prodigy-wiki-artifact-contract.js") : null);
  const VERSION = "prodigy_wiki_reviewed_store_v1";
  const RECEIPT_VERSION = "prodigy_wiki_reviewed_receipt_v1";
  const HASH = /^[0-9a-f]{64}$/u;

  function plain(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freeze(child)]),
    ));
  }
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function clean(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
  }
  function safeTitle(value) {
    return clean(value).replace(/[\\/:*?"<>|#^[\]]/gu, " ").replace(/\s+/gu, " ").slice(0, 96).trim() || "Prodigy Wiki";
  }
  function zeroWrites() {
    return freeze({ reviewed: 0, canonical: 0, source: 0, provider: 0 });
  }
  function failure(reason, extras = {}) {
    return freeze({ ok: false, status: "rejected", reason, write_counts: zeroWrites(), ...extras });
  }
  function reviewedBytes(previewBytes) {
    const source = String(previewBytes || "");
    if (/^---\n[\s\S]*?\n---\n/u.test(source)) {
      return source.replace(/^---\n([\s\S]*?)\n---\n/u, (_match, body) => {
        const lines = body.split("\n")
          .filter((line) => !/^(?:type|status)\s*:/u.test(line));
        return `---\ntype: prodigy_wiki\nstatus: reviewed\n${lines.join("\n")}\n---\n`;
      });
    }
    return `---\ntype: prodigy_wiki\nstatus: reviewed\n---\n\n${source}`;
  }
  function reviewedReceiptBody(receipt) {
    return {
      receipt_version: RECEIPT_VERSION,
      store_version: VERSION,
      artifact_id: receipt.artifact_id,
      artifact_receipt_hash: receipt.artifact_receipt_hash,
      preview_document_hash: receipt.preview_document_hash,
      reviewed_document_path: receipt.reviewed_document_path,
      reviewed_document_hash: receipt.reviewed_document_hash,
      source_id: receipt.source_id,
      source_path: receipt.source_path,
      source_revision: receipt.source_revision,
      scope: receipt.scope,
      document_kind: receipt.document_kind,
      title: receipt.title,
      logical_id: receipt.logical_id,
      trust_tier: "prodigy_reviewed",
      navigation_manifest: receipt.navigation_manifest,
      navigation_hash: receipt.navigation_hash,
      source_outline: receipt.source_outline,
      source_outline_hash: receipt.source_outline_hash,
      reviewed_at: receipt.reviewed_at,
      supersedes: receipt.supersedes,
      canonical_published: false,
    };
  }
  function inspectReviewed(receipt, documentBytes, hashApi) {
    if (!plain(receipt) || receipt.receipt_version !== RECEIPT_VERSION
      || receipt.store_version !== VERSION || !/^prodigy_artifact_[0-9a-f]{24}$/u.test(receipt.artifact_id || "")
      || !HASH.test(receipt.artifact_receipt_hash || "") || !HASH.test(receipt.preview_document_hash || "")
      || !HASH.test(receipt.reviewed_document_hash || "") || !HASH.test(receipt.source_revision || "")
      || !HASH.test(receipt.navigation_hash || "") || !HASH.test(receipt.source_outline_hash || "")
      || !HASH.test(receipt.logical_id || "") || receipt.trust_tier !== "prodigy_reviewed"
      || receipt.canonical_published !== false || !Array.isArray(receipt.supersedes)
      || !receipt.reviewed_document_path.startsWith(`${artifactApi.REVIEWED_ROOT}/`)
      || receipt.reviewed_document_path.startsWith("PARA/RESOURCES/Knowledge/")
      || typeof documentBytes !== "string" || hashApi.sha256(documentBytes) !== receipt.reviewed_document_hash
      || !plain(receipt.navigation_manifest) || receipt.navigation_manifest.navigation_hash !== receipt.navigation_hash
      || !plain(receipt.source_outline) || receipt.source_outline.outline_hash !== receipt.source_outline_hash
      || !Number.isFinite(Date.parse(receipt.reviewed_at || ""))
      || receipt.receipt_hash !== hashApi.sha256(stable(reviewedReceiptBody(receipt)))) {
      return failure("invalid_reviewed_receipt");
    }
    return freeze({ ok: true, status: "verified" });
  }
  function entryFrom(receipt, status) {
    return freeze({
      artifact_id: receipt.artifact_id,
      artifact_receipt_hash: receipt.artifact_receipt_hash,
      document_path: receipt.reviewed_document_path,
      document_hash: receipt.reviewed_document_hash,
      source_id: receipt.source_id,
      source_path: receipt.source_path,
      source_revision: receipt.source_revision,
      scope: receipt.scope,
      document_kind: receipt.document_kind,
      title: receipt.title,
      logical_id: receipt.logical_id,
      trust_tier: "prodigy_reviewed",
      navigation_manifest: receipt.navigation_manifest,
      source_outline: receipt.source_outline,
      reviewed_at: receipt.reviewed_at,
      supersedes: receipt.supersedes,
      status,
      canonical_published: false,
    });
  }
  function createReviewedStore(options = {}) {
    const storage = options.storage;
    const hashApi = options.hash || defaultHash;
    if (!artifactApi || !hashApi || typeof hashApi.sha256 !== "function"
      || !storage || typeof storage.list !== "function" || typeof storage.read !== "function"
      || typeof storage.writeImmutable !== "function") {
      throw new TypeError("reviewed_store_dependencies_required");
    }
    let loaded = false;
    let receipts = new Map();
    let issues = [];
    let snapshot = freeze({ version: VERSION, revision: hashApi.sha256("[]"), entries: [], current_entries: [], issues: [] });
    let queue = Promise.resolve();
    const subscribers = new Set();

    function project() {
      const superseded = new Set([...receipts.values()].flatMap((receipt) => receipt.supersedes));
      const entries = [...receipts.values()]
        .map((receipt) => entryFrom(receipt, superseded.has(receipt.artifact_id) ? "superseded" : "current"))
        .sort((left, right) => left.reviewed_at.localeCompare(right.reviewed_at)
          || left.artifact_id.localeCompare(right.artifact_id, "en"));
      const body = entries.map((entry) => ({
        artifact_id: entry.artifact_id,
        artifact_receipt_hash: entry.artifact_receipt_hash,
        status: entry.status,
      }));
      snapshot = freeze({
        version: VERSION,
        revision: hashApi.sha256(stable(body)),
        entries,
        current_entries: entries.filter((entry) => entry.status === "current"),
        issues: clone(issues),
      });
      return snapshot;
    }
    function emit() {
      for (const subscriber of [...subscribers]) subscriber(snapshot);
    }
    async function load() {
      if (loaded) return snapshot;
      const nextReceipts = new Map();
      const nextIssues = [];
      let paths = [];
      try {
        paths = await storage.list(`${artifactApi.REVIEWED_RECEIPT_ROOT}/`);
      } catch (_error) {
        throw new Error("reviewed_receipt_list_failed");
      }
      for (const receiptPath of paths.filter((value) => value.endsWith(".json")).sort()) {
        try {
          const receipt = JSON.parse(await storage.read(receiptPath));
          const documentBytes = await storage.read(receipt.reviewed_document_path);
          const inspected = inspectReviewed(receipt, documentBytes, hashApi);
          if (!inspected.ok || nextReceipts.has(receipt.artifact_id)) throw new Error(inspected.reason || "duplicate_artifact");
          nextReceipts.set(receipt.artifact_id, freeze(receipt));
        } catch (error) {
          nextIssues.push(freeze({
            receipt_path: receiptPath,
            reason: clean(error && error.message) || "invalid_reviewed_receipt",
          }));
        }
      }
      receipts = nextReceipts;
      issues = nextIssues;
      loaded = true;
      return project();
    }
    function getSnapshot() {
      return freeze(clone(snapshot));
    }
    function has(artifactId) {
      return receipts.has(artifactId);
    }
    function subscribe(subscriber, emitCurrent = true) {
      if (typeof subscriber !== "function") throw new TypeError("subscriber_required");
      subscribers.add(subscriber);
      if (emitCurrent) subscriber(snapshot);
      return () => subscribers.delete(subscriber);
    }
    async function acknowledge(input) {
      const task = queue.then(async () => {
        await load();
        if (!plain(input) || typeof input.preview_document_path !== "string"
          || typeof input.preview_receipt_path !== "string" || typeof input.source_text !== "string"
          || !Number.isFinite(Date.parse(input.reviewed_at || ""))) {
          return failure("invalid_review_acknowledgement");
        }
        let previewBytes;
        let previewReceipt;
        try {
          previewBytes = await storage.read(input.preview_document_path);
          previewReceipt = JSON.parse(await storage.read(input.preview_receipt_path));
        } catch (_error) {
          return failure("preview_artifact_unavailable");
        }
        const inspected = artifactApi.inspectPreviewArtifact({
          document_path: input.preview_document_path,
          document_bytes: previewBytes,
          navigation_manifest: previewReceipt.navigation_manifest,
          source_outline: previewReceipt.source_outline,
          receipt: previewReceipt,
        });
        if (!inspected.ok || previewReceipt.status !== "publishable_preview"
          || previewReceipt.document_path !== input.preview_document_path
          || hashApi.sha256(input.source_text) !== previewReceipt.source_revision) {
          return failure(inspected.ok ? "source_revision_changed" : inspected.reason);
        }
        const artifactId = previewReceipt.artifact_id;
        if (receipts.has(artifactId)) {
          return freeze({
            ok: true,
            status: "replay",
            entry: entryFrom(receipts.get(artifactId), snapshot.entries.find((entry) => entry.artifact_id === artifactId)?.status || "current"),
            snapshot,
            write_counts: zeroWrites(),
          });
        }
        const supersedes = Array.isArray(input.supersedes) ? [...new Set(input.supersedes)] : [];
        if (supersedes.some((artifactIdValue) => artifactIdValue === artifactId
          || !receipts.has(artifactIdValue)
          || receipts.get(artifactIdValue).source_id !== previewReceipt.source_id)) {
          return failure("invalid_review_supersession");
        }
        const sourceName = safeTitle(previewReceipt.source_path.split("/").pop().replace(/\.md$/u, ""));
        const sourceKey = hashApi.sha256(previewReceipt.source_path).slice(0, 8);
        const reviewedPath = `${artifactApi.REVIEWED_ROOT}/${sourceName}--${sourceKey}/${safeTitle(previewReceipt.title)}--${artifactId.slice(-8)}.md`;
        const reviewedDocument = reviewedBytes(previewBytes);
        const logicalId = hashApi.sha256(stable({
          source_id: previewReceipt.source_id,
          range_key: clean(previewReceipt.scope && previewReceipt.scope.range_key) || "full",
          document_kind: previewReceipt.document_kind,
          title: clean(previewReceipt.title).normalize("NFC").toLowerCase(),
        }));
        const receiptBody = reviewedReceiptBody({
          artifact_id: artifactId,
          artifact_receipt_hash: previewReceipt.artifact_receipt_hash || previewReceipt.receipt_hash,
          preview_document_hash: previewReceipt.document_hash,
          reviewed_document_path: reviewedPath,
          reviewed_document_hash: hashApi.sha256(reviewedDocument),
          source_id: previewReceipt.source_id,
          source_path: previewReceipt.source_path,
          source_revision: previewReceipt.source_revision,
          scope: previewReceipt.scope || null,
          document_kind: previewReceipt.document_kind,
          title: previewReceipt.title,
          logical_id: logicalId,
          navigation_manifest: previewReceipt.navigation_manifest,
          navigation_hash: previewReceipt.navigation_hash,
          source_outline: previewReceipt.source_outline,
          source_outline_hash: previewReceipt.source_outline_hash,
          reviewed_at: new Date(input.reviewed_at).toISOString(),
          supersedes,
        });
        const reviewedReceipt = freeze({
          ...receiptBody,
          receipt_hash: hashApi.sha256(stable(receiptBody)),
        });
        const reviewedReceiptPath = `${artifactApi.REVIEWED_RECEIPT_ROOT}/${artifactId}.json`;
        let reviewedWrites = 0;
        try {
          if (await storage.writeImmutable(reviewedPath, reviewedDocument)) reviewedWrites += 1;
          if (await storage.writeImmutable(reviewedReceiptPath, `${JSON.stringify(reviewedReceipt, null, 2)}\n`)) reviewedWrites += 1;
        } catch (_error) {
          return failure("reviewed_artifact_persist_failed", {
            partial_reviewed_writes: reviewedWrites,
          });
        }
        receipts.set(artifactId, reviewedReceipt);
        project();
        emit();
        return freeze({
          ok: true,
          status: "reviewed",
          entry: snapshot.entries.find((entry) => entry.artifact_id === artifactId),
          snapshot,
          write_counts: freeze({ reviewed: reviewedWrites, canonical: 0, source: 0, provider: 0 }),
        });
      });
      queue = task.catch(() => {});
      return task;
    }

    return freeze({
      load,
      acknowledge,
      has,
      snapshot: getSnapshot,
      subscribe,
    });
  }

  const api = freeze({
    VERSION,
    RECEIPT_VERSION,
    createReviewedStore,
    inspectReviewed,
    reviewedBytes,
  });
  root.ProdigyWikiReviewedStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
