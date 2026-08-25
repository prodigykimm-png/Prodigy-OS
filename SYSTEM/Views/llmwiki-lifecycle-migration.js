(function (root) {
  "use strict";

  const canRequire = typeof require === "function";
  const nodeFs = canRequire ? require("node:fs") : null;
  const nodePath = canRequire ? require("node:path") : null;
  const nodeCrypto = canRequire ? require("node:crypto") : null;
  const sensitiveApi = root.LLMWikiSensitiveContentPolicy || (canRequire ? require("./llmwiki-sensitive-content-policy.js") : null);

  const ALLOWLIST_ROOTS = Object.freeze([
    "ZETA/PERMANENT",
    "ZETA/LITERATURE",
    "ZETA/FLEETING",
    "ZETA/CANDIDATES",
    "PARA/RESOURCES/Knowledge/Candidates",
  ]);
  const VAULT_MARKERS = Object.freeze(["HUB", "SYSTEM"]);
  const FORBIDDEN_DIRECTORIES = new Set(["INBOX", ".trash", "evidence", ".llmwiki-audit"]);

  function sha256Hex(bytes) { return nodeCrypto.createHash("sha256").update(bytes).digest("hex"); }
  function fail(reason, extras = {}) { return Object.freeze({ ok: false, reason, ...extras }); }

  function parseFrontmatter(text) {
    if (typeof text !== "string" || !text.startsWith("---")) return fail("frontmatter_missing");
    const end = text.indexOf("\n---", 3);
    if (end < 0) return fail("frontmatter_unterminated");
    const lines = text.slice(4, end).split("\n");
    const fields = {};
    let currentKey = null;
    for (const line of lines) {
      const listMatch = line.match(/^\s+-\s+"?([^"]*)"?\s*$/u);
      if (listMatch && currentKey) { fields[currentKey].push(listMatch[1]); continue; }
      const pair = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/u);
      if (!pair) return fail("frontmatter_line_unparseable");
      currentKey = pair[1];
      const raw = pair[2].replace(/^"(.*)"$/u, "$1");
      fields[currentKey] = raw === "" ? [] : raw;
    }
    return Object.freeze({ ok: true, fields: Object.freeze(fields), body: text.slice(end + 5) });
  }

  function lifecycleClass(relativePath, fields) {
    const type = typeof fields.type === "string" ? fields.type : "";
    if (fields.canonical_id && fields.schema_version === "2") return "canonical_v2";
    if (relativePath.startsWith("ZETA/LITERATURE/")) return "literature";
    if (relativePath.startsWith("ZETA/FLEETING/")) return "fleeting";
    if (relativePath.startsWith("ZETA/PERMANENT/") && type === "permanent_note") return "legacy_permanent_note";
    if (relativePath.startsWith("ZETA/PERMANENT/")) return "legacy_knowledge";
    if (type === "knowledge_candidate" || relativePath.includes("Candidates/")) return "candidate";
    return "unknown";
  }

  function dispositionFor(itemClass, fields) {
    if (itemClass === "canonical_v2") return { disposition: "noop", quarantine_reason: null };
    if (fields.para_object || fields.object_id) return { disposition: "para_handoff", quarantine_reason: null };
    if (itemClass === "legacy_knowledge") return { disposition: "adopt_update", quarantine_reason: null };
    if (itemClass === "legacy_permanent_note") return { disposition: "legacy_unchanged", quarantine_reason: null };
    if (itemClass === "literature") return { disposition: "literature_reclassify", quarantine_reason: null };
    if (itemClass === "fleeting") return { disposition: "noop", quarantine_reason: null };
    if (itemClass === "candidate") return { disposition: "candidate_migrate", quarantine_reason: null };
    return { disposition: "hold_quarantine", quarantine_reason: "unclassifiable_lifecycle" };
  }

  function walkAllowlist(vaultRoot) {
    const items = [];
    for (const allowRoot of ALLOWLIST_ROOTS) {
      const absRoot = nodePath.join(vaultRoot, allowRoot);
      if (!nodeFs.existsSync(absRoot) || nodeFs.lstatSync(absRoot).isSymbolicLink()) continue;
      const stack = [absRoot];
      while (stack.length > 0) {
        const dir = stack.pop();
        for (const entry of nodeFs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isSymbolicLink() || FORBIDDEN_DIRECTORIES.has(entry.name)) continue;
          const full = nodePath.join(dir, entry.name);
          if (entry.isDirectory()) stack.push(full);
          else if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.includes(" 2.")) items.push({ allow_root: allowRoot, absolute_path: full });
        }
      }
    }
    items.sort((left, right) => left.absolute_path.localeCompare(right.absolute_path));
    return items;
  }

  function buildInventory(input = {}) {
    if (!nodeFs || !nodePath || !nodeCrypto) return fail("node_inventory_runtime_required");
    const vaultRoot = input.vault_root;
    if (typeof vaultRoot !== "string" || !vaultRoot) return fail("vault_root_required");
    let resolved;
    try { resolved = nodeFs.realpathSync(vaultRoot); } catch (_error) { return fail("unsafe_vault_root"); }
    if (!nodeFs.statSync(resolved).isDirectory()) return fail("unsafe_vault_root");
    if (VAULT_MARKERS.some((marker) => !nodeFs.existsSync(nodePath.join(resolved, marker)))) return fail("unsafe_vault_root");
    const items = [];
    const counts = {};
    for (const entry of walkAllowlist(resolved)) {
      const stat = nodeFs.statSync(entry.absolute_path);
      const bytes = nodeFs.readFileSync(entry.absolute_path);
      const text = bytes.toString("utf8");
      const parsed = parseFrontmatter(text);
      const fields = parsed.ok ? parsed.fields : {};
      const relativePath = nodePath.relative(resolved, entry.absolute_path).split(nodePath.sep).join("/");
      const itemClass = lifecycleClass(relativePath, fields);
      const routed = dispositionFor(itemClass, fields);
      let disposition = routed.disposition;
      let quarantineReason = parsed.ok || itemClass === "fleeting" ? routed.quarantine_reason : parsed.reason;
      const sensitive = sensitiveApi ? sensitiveApi.inspect({ source_path: relativePath, source_text: text, metadata: fields }) : { type: "allow" };
      if (sensitive.type === "hold") { disposition = "hold_quarantine"; quarantineReason = sensitive.reason; }
      counts[itemClass] = (counts[itemClass] || 0) + 1;
      items.push(Object.freeze({ path: relativePath, lifecycle_class: itemClass, disposition, quarantine_reason: quarantineReason, bytes: stat.size, revision: 1, mtime_ms: stat.mtimeMs, sha256: sha256Hex(bytes) }));
    }
    const digestBody = JSON.stringify(items.map((item) => `${item.path}:${item.sha256}:${item.bytes}`));
    return Object.freeze({ ok: true, vault_root: resolved, allowlist_roots: ALLOWLIST_ROOTS, digest: sha256Hex(Buffer.from(digestBody)), items: Object.freeze(items), counts: Object.freeze(counts), total_items: items.length, zero_writes: true });
  }

  const api = Object.freeze({ ALLOWLIST_ROOTS, parseFrontmatter, buildInventory });
  root.LLMWikiLifecycleMigration = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
