(function (root) {
  "use strict";

  const TERMINAL_STATUSES = Object.freeze(["completed", "archived", "finished", "dropped"]);

  function normalizeWorkspaceId(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "auction_case") return "auction";
    if (raw === "project_note" || raw === "project_family") return "project";
    if (raw === "person" || raw === "people") return "personal";
    return raw;
  }

  function normalizeObjectPath(value) {
    return String(value || "")
      .trim()
      .replace(/^\.\/+/, "")
      .replace(/\/{2,}/g, "/")
      .toLowerCase();
  }

  function normalizeTitleKey(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function dedupeKeyFor(objectPath, workspace, title) {
    const normalizedPath = normalizeObjectPath(objectPath);
    if (normalizedPath) return "path:" + normalizedPath;
    const normalizedTitle = normalizeTitleKey(title);
    if (!normalizedTitle) return "";
    return "ws:" + normalizeWorkspaceId(workspace) + "|" + normalizedTitle;
  }

  function clampBriefLines(text, maxLines) {
    const raw = String(text || "").trim();
    if (!raw) return "오늘 우선순위를 정리했습니다.";
    const lines = raw.replace(/\\n/g, "\n").split(/\n+/).map((line) => line.trim()).filter(Boolean);
    return lines.slice(0, maxLines).join("\n");
  }

  function getHomeVariant(logicalWidth, mobileShell, breakpoints) {
    const points = breakpoints || {};
    if (mobileShell || logicalWidth < points.medium) return "compact";
    if (logicalWidth < points.wide) return "medium";
    return "wide";
  }

  function sanitizeFocusList(list, pathExists) {
    return (Array.isArray(list) ? list : []).filter((item) => {
      if (!item) return false;
      if (!item.object_path) return true;
      return pathExists(item.object_path);
    });
  }

  /**
   * Project existing Home sources into the ordered, de-duplicated Continue cards.
   * @param {object} options Home projection dependencies and source snapshots
   * @returns {object[]} at most four non-terminal cards
   */
  function buildContinueCards(options) {
    const opts = options || {};
    const cards = [];
    const seen = Object.create(null);
    const focusKeys = opts.focusKeys || Object.create(null);
    const workspacePathFor = typeof opts.workspacePathFor === "function" ? opts.workspacePathFor : () => "";
    const sourceLabel = typeof opts.getSourceTypeLabel === "function" ? opts.getSourceTypeLabel : (value) => value || "Object";

    const pushCard = (card) => {
      if (!card || !card.title) return;
      const key = dedupeKeyFor(card.object_path, card.workspace, card.title);
      if (!key || seen[key] || focusKeys[key]) return;
      const status = String(card.status || "").toLowerCase();
      if (TERMINAL_STATUSES.includes(status) || /\bcompleted\b/.test(status)) return;
      seen[key] = true;
      cards.push(card);
    };

    const byWorkspace = opts.continueByWorkspace || {};
    ["auction", "reading", "workout", "project", "personal"].forEach((workspace) => {
      const candidate = byWorkspace[workspace];
      if (!candidate) return;
      pushCard({
        title: candidate.label || candidate.title || "",
        workspace: candidate.workspace || workspace,
        workspace_label: sourceLabel(workspace === "personal" ? "journal" : workspace) || workspace,
        next_action: candidate.action || candidate.next_action || "",
        object_path: candidate.object_path || "",
        dashboard_path: candidate.dashboard_path || workspacePathFor(workspace),
        status: candidate.status || ""
      });
    });

    (Array.isArray(opts.candidates) ? opts.candidates : []).forEach((candidate) => {
      if (!candidate) return;
      const status = String(candidate.status || "").toLowerCase();
      const type = String(candidate.type || "").toLowerCase();
      if ((type === "auction" || type === "auction_case") && (status === "watching" || status === "관심" || status === "watch")) return;
      pushCard({
        title: candidate.name || candidate.title || "",
        workspace: candidate.type || "",
        workspace_label: sourceLabel(candidate.type) || candidate.type || "Object",
        next_action: candidate.next_action || "",
        object_path: candidate.path || candidate.object_path || "",
        dashboard_path: workspacePathFor(candidate.type),
        status: candidate.status || ""
      });
    });

    return cards.slice(0, 4);
  }

  function filterAttentionRisks(risks, auctions, isAuctionStatusOk) {
    const auctionByPath = Object.create(null);
    (Array.isArray(auctions) ? auctions : []).forEach((auction) => {
      if (auction && auction.path) auctionByPath[String(auction.path).toLowerCase()] = auction;
    });
    return (Array.isArray(risks) ? risks : []).filter((risk) => {
      if (!risk) return false;
      const objectPath = String(risk.object_path || "").toLowerCase();
      const auction = auctionByPath[objectPath];
      if (auction) return isAuctionStatusOk(auction.status);
      const workspace = String(risk.workspace_label || risk.workspace || "");
      if (/경매|auction/i.test(workspace) || /\/auction\//i.test(objectPath)) {
        return /입찰|bidding/i.test(String(risk.label || "") + String(risk.reason || ""));
      }
      return true;
    });
  }

  const api = Object.freeze({
    normalizeWorkspaceId,
    normalizeObjectPath,
    normalizeTitleKey,
    dedupeKeyFor,
    clampBriefLines,
    getHomeVariant,
    sanitizeFocusList,
    buildContinueCards,
    filterAttentionRisks
  });
  root.HomeModel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
