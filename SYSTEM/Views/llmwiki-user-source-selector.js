(function(root){
  "use strict";
  const VERSION = 4;
  const privacyApi = root.LLMWikiInboxPrivacyBoundary || (typeof require === "function" ? require("./llmwiki-inbox-privacy-boundary.js") : null);
  const sensitiveApi = root.LLMWikiSensitiveContentPolicy || (typeof require === "function" ? require("./llmwiki-sensitive-content-policy.js") : null);
  const BLOCKED_PREFIXES = Object.freeze(["INBOX/Processed/", "INBOX/Private/", "INBOX/Protected/", "INBOX/Sensitive/"]);
  const freeze = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; };
  const safePath = (path) => typeof path === "string" && path.startsWith("INBOX/") && path.endsWith(".md") && !path.includes("\\") && !path.split("/").some((part) => !part || part === "." || part === "..");
  function frontmatterPrivate(bytes) {
    const match = String(bytes || "").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
    const head = match ? match[1] : "";
    return /^(?:private|sensitive)\s*:\s*['"]?true['"]?\s*$/imu.test(head) || /^privacy(?:_class)?\s*:\s*['"]?(?:private|protected|sensitive)['"]?\s*$/imu.test(head) || /^type\s*:\s*['"]?person['"]?\s*$/imu.test(head);
  }
  function metadataPrivate(metadata) {
    const row = metadata && typeof metadata === "object" ? metadata : {};
    return row.private === true || row.sensitive === true || ["private","protected","sensitive"].includes(String(row.privacy || row.privacy_class || "").trim().toLowerCase());
  }
  function eligibleInboxPath(path, bytes, metadata = {}) {
    if (!safePath(path) || BLOCKED_PREFIXES.some((prefix) => path.toLowerCase().startsWith(prefix.toLowerCase())) || frontmatterPrivate(bytes) || metadataPrivate(metadata)) return false;
    if (!privacyApi || typeof privacyApi.classifyInboxSource !== "function" || !sensitiveApi || typeof sensitiveApi.inspect !== "function") return false;
    // Wiki intake never lets outbound consent override People or sensitive holds.
    const input = { source_path: path, source_text: bytes, metadata: { ...metadata, llmwiki_outbound: false } };
    const privacy = privacyApi.classifyInboxSource(input);
    return privacy.route === "knowledge" && privacy.outbound_allowed === true && sensitiveApi.inspect(input).type === "allow";
  }
  function title(path, bytes) {
    const heading = String(bytes || "").match(/^#\s+(.+)$/mu);
    return String(heading && heading[1] || path.split("/").pop().replace(/\.md$/u, "")).trim();
  }
  async function sha256(value, hash) {
    if (hash === root.LLMWikiHash && root.crypto && root.crypto.subtle && typeof TextEncoder === "function") {
      const digest = await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2,"0")).join("");
    }
    return hash.sha256(value);
  }
  async function listInboxSources(options) {
    const vault = options && options.vault, hash = options && options.hash, privacy = options && options.privacy, metadataCache = options && options.metadataCache;
    if (!vault || typeof vault.getMarkdownFiles !== "function" || typeof vault.cachedRead !== "function" || !hash || typeof hash.sha256 !== "function") throw new TypeError("source_selector_dependencies_required");
    const files = vault.getMarkdownFiles().filter((file) => file && safePath(file.path));
    const rows = (await Promise.all(files.map(async (file) => {
      const cache = metadataCache && typeof metadataCache.getFileCache === "function" ? metadataCache.getFileCache(file) : null;
      const metadata = cache && cache.frontmatter && typeof cache.frontmatter === "object" ? cache.frontmatter : {};
      if (!eligibleInboxPath(file.path, "", metadata)) return null;
      const policy = privacy && typeof privacy.classifyInboxSource === "function" ? privacy.classifyInboxSource({ source_path: file.path, metadata }) : null;
      if (policy && (policy.route !== "knowledge" || policy.outbound_allowed !== true)) return null;
      // Metadata cannot establish that a body is credential-free, even on a warm cache.
      const bytes = await vault.cachedRead(file);
      if (!eligibleInboxPath(file.path, bytes, metadata)) return null;
      const heading = cache && Array.isArray(cache.headings) ? cache.headings.find((row) => row && row.level === 1 && typeof row.heading === "string") : null;
      const sourceTitle = cache
        ? heading ? heading.heading.trim() : String(file.basename || file.path.split("/").pop().replace(/\.md$/u,"")).trim()
        : title(file.path, bytes);
      return freeze({ path: file.path, title: sourceTitle, source_id: `source_user_${hash.sha256(file.path).slice(0,24)}`, source_kind: "inbox", sensitivity: "internal", provider_modes: freeze(["direct"]) });
    }))).filter(Boolean);
    return freeze(rows.sort((a,b)=>a.title.localeCompare(b.title,"ko")||a.path.localeCompare(b.path,"ko")));
  }
  async function pinSelection(option, vault, hash) {
    if (!option || option.source_kind !== "inbox" || !vault || typeof vault.getAbstractFileByPath !== "function" || typeof vault.cachedRead !== "function" || !hash || typeof hash.sha256 !== "function") return freeze({ ok:false, reason:"selected_source_unavailable" });
    const file = vault.getAbstractFileByPath(option.path);
    if (!file) return freeze({ ok:false, reason:"selected_source_unavailable" });
    const bytes = await vault.cachedRead(file);
    if (!eligibleInboxPath(option.path, bytes)) return freeze({ ok:false, reason:"selected_source_changed" });
    return freeze({ ok:true, option: freeze({ ...option, content_hash: await sha256(bytes, hash) }) });
  }
  function verifySelection(option, bytes, hash) {
    if (!option || option.source_kind !== "inbox" || !eligibleInboxPath(option.path, bytes) || !hash || hash.sha256(bytes) !== option.content_hash) return freeze({ ok:false, reason:"selected_source_changed" });
    return freeze({ ok:true, option });
  }
  const api=freeze({VERSION,BLOCKED_PREFIXES,safePath,eligibleInboxPath,listInboxSources,pinSelection,verifySelection});
  root.LLMWikiUserSourceSelector=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
