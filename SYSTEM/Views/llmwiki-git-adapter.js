(function (root) {
  "use strict";

  const boundaryPolicy = root.LLMWikiWriteBoundaryPolicy
    || (typeof require === "function" ? require("./llmwiki-write-boundary-policy.js") : null);

  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!value || typeof value !== "object") return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function failed(reason) { return freeze({ ok: false, reason }); }
  function create(options = {}) {
    const runtime = options.runtime || {};
    const deps = options.deps || (() => {
      if (typeof require !== "function") return null;
      try {
        return {
          childProcess: require("node:child_process"),
          crypto: require("node:crypto"),
          fs: require("node:fs"),
          os: require("node:os"),
          path: require("node:path"),
        };
      } catch (_error) { return null; }
    })();
    let observed = null;

    function available() {
      return runtime.available !== false && deps && deps.childProcess && deps.fs && deps.path && deps.os && deps.crypto;
    }
    function command(rootDir, args, env) {
      return deps.childProcess.execFileSync("git", ["-C", rootDir, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env, ...env },
      }).trim();
    }
    function inspect() {
      if (!available()) return failed("GitUnavailable");
      const candidate = options.rootDir || runtime.rootDir || process.cwd();
      let rootDir;
      try { rootDir = deps.path.resolve(command(candidate, ["rev-parse", "--show-toplevel"])); } catch (_error) { return failed("git_root_unavailable"); }
      if (runtime.iCloudAvailable === false) return failed("iCloudUnavailable");
      let gitDir;
      let head;
      try {
        gitDir = command(rootDir, ["rev-parse", "--git-dir"]);
        head = command(rootDir, ["rev-parse", "HEAD"]);
      } catch (_error) { return failed("git_head_unavailable"); }
      const lockPath = deps.path.resolve(rootDir, gitDir, "index.lock");
      if (deps.fs.existsSync(lockPath)) return failed("git_locked");
      return freeze({ ok: true, status: "available", root: rootDir, head, iCloud: rootDir.includes("Mobile Documents") });
    }
    function expectedBytes(input, targetPath) {
      try {
        const bytes = deps.fs.readFileSync(deps.path.join(input.root, targetPath));
        const expected = input.expected_hashes && input.expected_hashes[targetPath];
        if (typeof expected === "string") return deps.crypto.createHash("sha256").update(bytes).digest("hex") === expected;
        if (!targetPath.startsWith(".llmwiki-audit/immutable/") || typeof input.immutable_audit_hash !== "string") return false;
        const audit = JSON.parse(bytes.toString("utf8"));
        return audit.audit_hash === input.immutable_audit_hash || audit.head_hash === input.immutable_audit_hash;
      } catch (_error) { return false; }
    }
    function lookupCommit(rootDir, identity) {
      let lines;
      try { lines = command(rootDir, ["log", "--all", "-z", "--format=%H%x00%B"]); } catch (_error) { return null; }
      const values = lines.split("\0");
      for (let index = 0; index + 1 < values.length; index += 2) {
        const [commitId, storedMessage] = [values[index], values[index + 1]];
        const message = storedMessage?.endsWith("\n") ? storedMessage.slice(0, -1) : storedMessage;
        const parsed = boundaryPolicy?.parseRenderedCommitMessage?.(message);
        if (!commitId || !parsed?.ok || parsed.identity !== identity) continue;
        const paths = command(rootDir, ["-c", "core.quotePath=false", "show", "--format=", "--name-only", commitId]).split("\n").filter(Boolean);
        return freeze({ commit_id: commitId, paths, pushed: false });
      }
      return null;
    }

    async function capability() {
      observed = inspect();
      return observed;
    }
    async function verifySafeSync() {
      const current = inspect();
      if (!current.ok) return current;
      if (observed && (observed.root !== current.root || observed.head !== current.head)) return failed("git_head_drift");
      observed = current;
      return freeze({ ok: true, status: "safe" });
    }
    async function lookup(identity) {
      const current = inspect();
      if (!current.ok || typeof identity !== "string" || !identity) return null;
      return lookupCommit(current.root, identity);
    }
    async function snapshot(input = {}) {
      const rendered = boundaryPolicy?.renderTrustedCommitMessage?.({
        subject: input.message === undefined ? "LLM Wiki 승인 기록" : input.message,
        run_id: input.run_id, run_revision: input.run_revision, operation_id: input.operation_id,
        identity: input.identity, paths: input.paths,
      });
      if (input.push !== false || !rendered?.ok) return failed("git_snapshot_invalid");
      const current = inspect();
      if (!current.ok) return current;
      if (observed && (observed.root !== current.root || observed.head !== current.head)) return failed("git_head_drift");
      const existing = lookupCommit(current.root, input.identity);
      if (existing) return freeze({ ok: true, receipt: existing });
      const prepared = { ...input, root: current.root };
      if (!input.paths.every((targetPath) => expectedBytes(prepared, targetPath))) return failed("git_backup_pending");
      const tempDir = deps.fs.mkdtempSync(deps.path.join(deps.os.tmpdir(), "llmwiki-git-index-"));
      const indexPath = deps.path.join(tempDir, "index");
      const env = { GIT_INDEX_FILE: indexPath };
      try {
        command(current.root, ["read-tree", "HEAD"], env);
        command(current.root, ["add", "--", ...input.paths], env);
        const beforeCommit = inspect();
        if (!beforeCommit.ok) return beforeCommit;
        if (beforeCommit.root !== current.root || beforeCommit.head !== current.head) return failed("git_head_drift");
        command(current.root, ["commit", "--no-verify", "-m", rendered.value], env);
        const commitId = command(current.root, ["rev-parse", "HEAD"]);
        observed = freeze({ ...current, head: commitId });
        return freeze({ ok: true, receipt: { commit_id: commitId, paths: input.paths.slice(), pushed: false } });
      } catch (_error) {
        return failed("git_snapshot_failed");
      } finally {
        deps.fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
    return freeze({ capability, verifySafeSync, lookup, snapshot });
  }

  const fallback = create();
  const api = freeze({ create, capability: fallback.capability, verifySafeSync: fallback.verifySafeSync, lookup: fallback.lookup, snapshot: fallback.snapshot });
  root.LLMWikiGitGateway = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
