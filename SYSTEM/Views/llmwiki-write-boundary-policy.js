(function (root) {
  "use strict";

  const CANONICAL_PREFIX = "ZETA/PERMANENT/";
  const AUDIT_PREFIX = ".llmwiki-audit/immutable/";
  const HASH = /^[0-9a-f]{64}$/u;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const SAFE_TITLE = /^[\p{L}\p{N}\p{M} _().-]+$/u;
  const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
  const SHELL_META = /[!"#$%&'*;<>?@[\\\]^`{|}~]/u;

  function ok(value, extras) { return Object.freeze({ ok: true, ...(extras || {}), value }); }
  function fail(reason) { return Object.freeze({ ok: false, reason }); }
  function exactNfc(value) { return typeof value === "string" && value.normalize("NFC") === value; }

  function parseCanonicalWritePath(value) {
    if (!exactNfc(value) || !value.startsWith(CANONICAL_PREFIX) || !value.endsWith(".md")) return fail("canonical_target_required");
    const title = value.slice(CANONICAL_PREFIX.length, -3);
    if (!title || title === "." || title === ".." || title.startsWith(".") || title.startsWith("-")
      || title.trim() !== title || title.endsWith(".") || !SAFE_TITLE.test(title)
      || CONTROL_OR_BIDI.test(title) || SHELL_META.test(title)) return fail("canonical_target_required");
    return ok(value);
  }

  function parseImmutableAuditGitPath(value) {
    if (!exactNfc(value) || !value.startsWith(AUDIT_PREFIX)) return fail("immutable_audit_path_required");
    const name = value.slice(AUDIT_PREFIX.length);
    if (name !== "head.json" && !HASH.test(name.slice(0, -5)) || !name.endsWith(".json")) return fail("immutable_audit_path_required");
    if (name !== "head.json" && name.length !== 69) return fail("immutable_audit_path_required");
    return ok(value);
  }

  function parseGitStagedPath(value) {
    const canonical = parseCanonicalWritePath(value);
    if (canonical.ok) return ok(value, { kind: "canonical" });
    const audit = parseImmutableAuditGitPath(value);
    if (audit.ok) return ok(value, { kind: "audit" });
    return fail("git_staged_path_required");
  }

  function parseCommitSubject(value) {
    if (!exactNfc(value) || !value || value.trim() !== value || value.startsWith("-")
      || CONTROL_OR_BIDI.test(value) || SHELL_META.test(value)) return fail("commit_subject_required");
    return ok(value);
  }

  function renderTrustedCommitMessage(input) {
    const subject = parseCommitSubject(input && input.subject);
    if (!subject.ok || !ID.test(input.run_id) || !Number.isSafeInteger(input.run_revision) || input.run_revision < 1
      || !ID.test(input.operation_id) || !Array.isArray(input.paths) || !input.paths.length
      || input.paths.some((value) => !parseGitStagedPath(value).ok) || new Set(input.paths).size !== input.paths.length) return fail("commit_message_required");
    const baseIdentity = `${input.run_id}:${input.run_revision}:${input.operation_id}`;
    if (input.identity !== baseIdentity && !new RegExp(`^${baseIdentity}:[0-9a-f]{64}$`, "u").test(input.identity)) return fail("commit_message_required");
    return ok([
      subject.value, "", `LLMWiki-Run: ${input.run_id}#${input.run_revision}`,
      `LLMWiki-Operation: ${input.operation_id}`, `LLMWiki-Identity: ${input.identity}`,
      `LLMWiki-Paths: ${input.paths.join(",")}`,
    ].join("\n"));
  }

  function parseRenderedCommitMessage(value) {
    if (typeof value !== "string") return fail("commit_message_required");
    const lines = value.split("\n");
    if (lines.length !== 6 || lines[1] !== "") return fail("commit_message_required");
    const run = /^LLMWiki-Run: ([a-z][a-z0-9_-]{2,127})#([1-9][0-9]*)$/u.exec(lines[2]);
    const operation = /^LLMWiki-Operation: ([a-z][a-z0-9_-]{2,127})$/u.exec(lines[3]);
    const identity = /^LLMWiki-Identity: (.+)$/u.exec(lines[4]);
    const paths = /^LLMWiki-Paths: (.+)$/u.exec(lines[5]);
    if (!run || !operation || !identity || !paths) return fail("commit_message_required");
    const rendered = renderTrustedCommitMessage({ subject: lines[0], run_id: run[1], run_revision: Number(run[2]), operation_id: operation[1], identity: identity[1], paths: paths[1].split(",") });
    if (!rendered.ok || rendered.value !== value) return fail("commit_message_required");
    return Object.freeze({
      ok: true, value, subject: lines[0], run_id: run[1], run_revision: Number(run[2]),
      operation_id: operation[1], identity: identity[1], paths: Object.freeze(paths[1].split(",")),
    });
  }

  const api = Object.freeze({ parseCanonicalWritePath, parseImmutableAuditGitPath, parseGitStagedPath, parseCommitSubject, renderTrustedCommitMessage, parseRenderedCommitMessage });
  root.LLMWikiWriteBoundaryPolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
