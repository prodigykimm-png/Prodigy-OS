(function (root) {
  "use strict";

  // Task 10 (llmwiki-batch-core-simplification): byte-identical archival of a
  // fully resolved INBOX source into `INBOX/Processed/YYYY-MM/<basename>`.
  //
  // Locked contract:
  //   - Move target is exactly `INBOX/Processed/YYYY-MM/<original basename>`
  //     derived from the original relative path inside INBOX.
  //   - Source SHA-256 is verified BEFORE the move and destination bytes are
  //     verified AFTER the move; any drift fails closed with state preserved.
  //   - An existing Processed destination is a hard conflict (fail closed).
  //   - Only the expected source path and the expected Processed path are
  //     ever touched.
  //   - Replay of an already archived source is an idempotent duplicate.
  // Eligibility itself is decided by LLMWikiBatchApprovalAdapter
  // .archivalEligibility; this service only performs the verified move and
  // never calls providers, writers, git, or audit authorities.

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);

  const PROCESSED_PREFIX = "INBOX/Processed/";
  const SOURCE_PREFIX = "INBOX/";
  const MONTH = /^\d{4}-\d{2}$/u;

  function fail(reason) { return Object.freeze({ ok: false, reason }); }
  function shaOf(value) { return hashApi.sha256(String(value)); }

  function processedTargetPath(sourcePath, options = {}) {
    if (typeof sourcePath !== "string" || !sourcePath.startsWith(SOURCE_PREFIX) || sourcePath === SOURCE_PREFIX) return null;
    if (sourcePath.includes("\\") || sourcePath.endsWith("/")) return null;
    const relative = sourcePath.slice(SOURCE_PREFIX.length);
    const segments = relative.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
    if (segments[0] === "Processed") return null;
    const now = typeof options.now === "string" && !Number.isNaN(Date.parse(options.now)) ? options.now : new Date().toISOString();
    const month = now.slice(0, 7);
    if (!MONTH.test(month)) return null;
    const basename = segments[segments.length - 1];
    return `${PROCESSED_PREFIX}${month}/${basename}`;
  }

  async function archiveProcessed(request = {}) {
    if (typeof request.source_path !== "string" || !hashApi) return fail("archive_request_invalid");
    if (!/^[0-9a-f]{64}$/u.test(String(request.expected_sha256 || ""))) return fail("expected_sha256_required");
    const vault = request.vault;
    if (!vault || typeof vault.readBytes !== "function" || typeof vault.writeExact !== "function" || typeof vault.deleteExact !== "function") {
      return fail("exact_move_vault_required");
    }
    const targetPath = processedTargetPath(request.source_path, { now: request.now });
    if (!targetPath) return fail("invalid_source_path");

    const read = async (path) => { try { const bytes = await vault.readBytes(path); return bytes === null || typeof bytes === "string" ? bytes : undefined; } catch (_error) { return undefined; } };

    const sourceBytes = await read(request.source_path);
    const targetBytes = await read(targetPath);
    if (sourceBytes === undefined) return fail("source_read_failed");

    // Idempotent replay: source already moved and destination byte-identical.
    if (sourceBytes === null) {
      if (typeof targetBytes === "string" && shaOf(targetBytes) === request.expected_sha256) {
        return Object.freeze({
          ok: true,
          value: Object.freeze({
            status: "duplicate",
            source_path: request.source_path, processed_path: targetPath,
            sha256: request.expected_sha256, month: targetPath.split("/")[2],
          }),
        });
      }
      return fail("source_missing");
    }

    if (shaOf(sourceBytes) !== request.expected_sha256) return fail("source_changed_before_archive");
    if (typeof targetBytes === "string") return fail("processed_destination_exists");

    // Byte-identical copy, verify, then remove the verified source. A
    // readback mismatch quarantines the freshly-written bad destination so
    // no stray file blocks a later retry; the source stays untouched.
    try { await vault.writeExact(targetPath, sourceBytes); } catch (_error) { return fail("processed_write_failed"); }
    const written = await read(targetPath);
    if (written !== sourceBytes || shaOf(written) !== request.expected_sha256) {
      let quarantined = false;
      try { quarantined = (await vault.deleteExact(targetPath))?.ok === true; } catch (_error) { quarantined = false; }
      if (await read(targetPath) !== null) quarantined = false;
      return Object.freeze({ ok: false, reason: "processed_write_verification_failed", quarantined });
    }
    let removed = false;
    try { removed = (await vault.deleteExact(request.source_path))?.ok === true; } catch (_error) { removed = false; }
    if (!removed || await read(request.source_path) !== null) return fail("source_remove_failed");

    return Object.freeze({
      ok: true,
      value: Object.freeze({
        status: "archived",
        source_path: request.source_path, processed_path: targetPath,
        sha256: request.expected_sha256, month: targetPath.split("/")[2],
      }),
    });
  }

  const api = Object.freeze({ processedTargetPath, archiveProcessed, PROCESSED_PREFIX });
  root.LLMWikiProcessedSourceService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
