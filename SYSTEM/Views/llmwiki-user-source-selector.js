(function(root){
  "use strict";
  const VERSION = 2;
  const BLOCKED_PREFIXES = Object.freeze(["INBOX/Processed/", "INBOX/Private/", "INBOX/Protected/", "INBOX/Sensitive/"]);
  const freeze = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; };
  const safePath = (path) => typeof path === "string" && path.startsWith("INBOX/") && path.endsWith(".md") && !path.includes("\\") && !path.split("/").some((part) => !part || part === "." || part === "..");
  function frontmatterPrivate(bytes) {
    const head = String(bytes || "").startsWith("---\n") ? String(bytes).slice(4, String(bytes).indexOf("\n---\n", 4)) : "";
    return /^(?:private|sensitive)\s*:\s*true\s*$/imu.test(head) || /^privacy(?:_class)?\s*:\s*(?:private|protected|sensitive)\s*$/imu.test(head);
  }
  function eligibleInboxPath(path, bytes) {
    return safePath(path) && !BLOCKED_PREFIXES.some((prefix) => path.toLowerCase().startsWith(prefix.toLowerCase())) && !frontmatterPrivate(bytes);
  }
  function title(path, bytes) {
    const heading = String(bytes || "").match(/^#\s+(.+)$/mu);
    return String(heading && heading[1] || path.split("/").pop().replace(/\.md$/u, "")).trim();
  }
  async function listInboxSources(options) {
    const vault = options && options.vault, hash = options && options.hash, privacy = options && options.privacy;
    if (!vault || typeof vault.getMarkdownFiles !== "function" || typeof vault.cachedRead !== "function" || !hash || typeof hash.sha256 !== "function") throw new TypeError("source_selector_dependencies_required");
    const rows = [];
    for (const file of vault.getMarkdownFiles()) {
      if (!file || !safePath(file.path)) continue;
      const bytes = await vault.cachedRead(file);
      if (!eligibleInboxPath(file.path, bytes)) continue;
      const policy = privacy && typeof privacy.classifyInboxSource === "function" ? privacy.classifyInboxSource({ source_path: file.path, metadata: {} }) : null;
      if (policy && (policy.route !== "knowledge" || policy.outbound_allowed !== true)) continue;
      rows.push(freeze({ path: file.path, title: title(file.path, bytes), source_id: `source_user_${hash.sha256(file.path).slice(0,24)}`, content_hash: hash.sha256(bytes), source_kind: "inbox", sensitivity: "internal", provider_modes: freeze(["direct"]) }));
    }
    return freeze(rows.sort((a,b)=>a.title.localeCompare(b.title,"ko")||a.path.localeCompare(b.path,"ko")));
  }
  function verifySelection(option, bytes, hash) {
    if (!option || option.source_kind !== "inbox" || !eligibleInboxPath(option.path, bytes) || !hash || hash.sha256(bytes) !== option.content_hash) return freeze({ ok:false, reason:"selected_source_changed" });
    return freeze({ ok:true, option });
  }
  const api=freeze({VERSION,BLOCKED_PREFIXES,safePath,eligibleInboxPath,listInboxSources,verifySelection});
  root.LLMWikiUserSourceSelector=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
