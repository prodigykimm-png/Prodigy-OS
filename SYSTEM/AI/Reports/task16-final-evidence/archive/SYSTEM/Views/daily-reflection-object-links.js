(function (root) {
  "use strict";

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function normalizedName(value) { return clean(value).normalize("NFC").toLocaleLowerCase("ko-KR"); }
  function objectScopes(kind) {
    const key = normalizedName(kind);
    if (key === "people" || key === "person") return ["PARA/RESOURCES/CONTACTS/"];
    if (key === "auction" || key === "auction_case") return ["PARA/PROJECTS/Auction/"];
    if (key === "project") return ["PARA/PROJECTS/"];
    return [];
  }
  function fileNames(app, file) {
    const cache = app && app.metadataCache && typeof app.metadataCache.getFileCache === "function" ? app.metadataCache.getFileCache(file) : null;
    const frontmatter = (cache && cache.frontmatter) || {};
    const aliases = Array.isArray(frontmatter.aliases) ? frontmatter.aliases : (frontmatter.aliases ? [frontmatter.aliases] : []);
    return [file.basename, frontmatter.title, frontmatter.name].concat(aliases).map(normalizedName).filter(Boolean);
  }
  async function resolveObjectLinks(app, proposal) {
    const suggestions = proposal && Array.isArray(proposal.object_linking_suggestions) ? proposal.object_linking_suggestions : [];
    const files = app && app.vault && typeof app.vault.getMarkdownFiles === "function" ? app.vault.getMarkdownFiles() : [];
    suggestions.forEach((item) => {
      const scopes = objectScopes(item.object_kind);
      const target = normalizedName(item.name);
      const matches = scopes.length && target ? files.filter((file) => scopes.some((scope) => String(file.path || "").startsWith(scope)) && fileNames(app, file).includes(target)) : [];
      item.match_count = matches.length;
      item.existence = matches.length === 1 ? "existing" : (matches.length > 1 ? "ambiguous" : (scopes.length ? "missing" : "unknown"));
      item.resolved_path = matches.length === 1 ? matches[0].path : "";
      item.wiki_link = matches.length === 1 ? `[[${matches[0].basename}]]` : "";
    });
    return proposal;
  }

  const api = { resolveObjectLinks };
  root.DailyReflectionObjectLinks = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
