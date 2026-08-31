(function(root){
  "use strict";
  const VERSION = 4;
  const BLOCKED_PREFIXES = Object.freeze(["INBOX/Processed/", "INBOX/Private/", "INBOX/Protected/", "INBOX/Sensitive/"]);
  const freeze = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; };
  const safePath = (path) => typeof path === "string" && path.startsWith("INBOX/") && path.endsWith(".md") && !path.includes("\\") && !path.split("/").some((part) => !part || part === "." || part === "..");
  function frontmatterPrivate(bytes) {
    const head = String(bytes || "").startsWith("---\n") ? String(bytes).slice(4, String(bytes).indexOf("\n---\n", 4)) : "";
    return /^(?:private|sensitive)\s*:\s*true\s*$/imu.test(head) || /^privacy(?:_class)?\s*:\s*(?:private|protected|sensitive)\s*$/imu.test(head);
  }
  function metadataPrivate(metadata) {
    const row = metadata && typeof metadata === "object" ? metadata : {};
    return row.private === true || row.sensitive === true || ["private","protected","sensitive"].includes(String(row.privacy || row.privacy_class || "").trim().toLowerCase());
  }
  function eligibleInboxPath(path, bytes) {
    return safePath(path) && !BLOCKED_PREFIXES.some((prefix) => path.toLowerCase().startsWith(prefix.toLowerCase())) && !frontmatterPrivate(bytes);
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
      let sourceTitle = "";
      if (cache) {
        if (!eligibleInboxPath(file.path, "") || metadataPrivate(metadata)) return null;
        const heading = Array.isArray(cache.headings) ? cache.headings.find((row) => row && row.level === 1 && typeof row.heading === "string") : null;
        sourceTitle = heading ? heading.heading.trim() : String(file.basename || file.path.split("/").pop().replace(/\.md$/u,"")).trim();
      } else {
        const bytes = await vault.cachedRead(file);
        if (!eligibleInboxPath(file.path, bytes)) return null;
        sourceTitle = title(file.path, bytes);
      }
      const policy = privacy && typeof privacy.classifyInboxSource === "function" ? privacy.classifyInboxSource({ source_path: file.path, metadata }) : null;
      if (policy && (policy.route !== "knowledge" || policy.outbound_allowed !== true)) return null;
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
