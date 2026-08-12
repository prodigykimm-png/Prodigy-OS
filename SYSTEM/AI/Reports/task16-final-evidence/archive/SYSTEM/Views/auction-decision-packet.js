(function (root) {
  "use strict";

  const ACTIONABLE_STATUSES = Object.freeze(["watching", "bidding"]);
  const KNOWLEDGE_CAP = 3;
  const PRIOR_DECISION_CAP = 2;

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function pathFor(page) {
    if (!page) return "";
    const raw = page.path || page.source_path || (page.file && page.file.path) || "";
    const core = root.DecisionPacketCore;
    return core && core.canonicalPath ? core.canonicalPath(String(raw)) : String(raw).trim();
  }

  function values(...inputs) {
    const source = inputs.flatMap((value) => Array.isArray(value)
      ? value
      : value && typeof value.array === "function"
        ? value.array()
        : value && typeof value !== "string" && typeof value[Symbol.iterator] === "function"
          ? Array.from(value)
          : [value]);
    return Object.freeze(source.flatMap((item) => {
      if (typeof item === "string") return item.split(",").map((part) => part.trim()).filter(Boolean);
      if (item && typeof item.path === "string") return [item.path.trim()];
      return [];
    }));
  }

  function snapshotCandidate(page) {
    const path = pathFor(page);
    const file = page && page.file && page.file.path
      ? Object.freeze({ path, name: clean(page.file.name) })
      : undefined;
    return Object.freeze({
      path,
      source_path: path,
      file,
      type: clean(page && page.type),
      title: clean(page && page.title),
      created: clean(page && page.created),
      updated: clean(page && page.updated),
      region_sido: clean(page && page.region_sido),
      region_sigungu: clean(page && page.region_sigungu),
      knowledge_topics: values(page && page.knowledge_topics),
      topics: values(page && page.topics),
      connections: values(page && page.connections),
      outlinks: values(page && page.outlinks, page && page.file && page.file.outlinks),
      links: values(page && page.links),
      auction_path: values(page && page.auction_path),
      property_path: values(page && page.property_path)
    });
  }

  /**
   * Snapshot the dashboard's already-loaded Dataview results once. This adapter
   * deliberately does not query Dataview/Vault, call AI, or persist a cache.
   */
  function createDashboardContext(pages) {
    const byPath = Object.create(null);
    const candidates = [];
    (Array.isArray(pages) ? pages : []).forEach((page) => {
      const snapshot = snapshotCandidate(page);
      if (!snapshot.path || byPath[snapshot.path]) return;
      byPath[snapshot.path] = snapshot;
      candidates.push(snapshot);
    });
    return Object.freeze({
      candidates: Object.freeze(candidates),
      index: Object.freeze(byPath)
    });
  }

  function isActionable(page) {
    return ACTIONABLE_STATUSES.includes(clean(page && page.status));
  }

  function emptyPacket(reason) {
    return Object.freeze({
      knowledge: Object.freeze([]),
      region_resource: null,
      prior_decisions: Object.freeze([]),
      empty_state: Object.freeze({
        copy: "결정 패킷을 준비할 수 없습니다.",
        reason: reason || "대시보드의 참고 기록을 불러오지 못했습니다.",
        knowledge: Object.freeze({ copy: "참조할 검증 지식이 없습니다.", reason: "참고 기록을 확인할 수 없습니다." }),
        region_resource: Object.freeze({ copy: "일치하는 지역 분석 자료가 없습니다.", reason: "참고 기록을 확인할 수 없습니다." }),
        prior_decisions: Object.freeze({ copy: "참조할 이전 결정이 없습니다.", reason: "참고 기록을 확인할 수 없습니다." })
      }),
      warnings: Object.freeze([]),
      error: true
    });
  }

  function packetForAuction(context, auction) {
    const core = root.DecisionPacketCore;
    if (!core || typeof core.buildDecisionPacket !== "function") return emptyPacket();
    if (!context || !Array.isArray(context.candidates)) return emptyPacket();
    try {
      const currentPath = pathFor(auction);
      const candidates = context.candidates.filter((candidate) => candidate.path !== currentPath);
      return core.buildDecisionPacket({ auction, candidates });
    } catch (_error) {
      return emptyPacket("참고 기록을 안전하게 정리하지 못했습니다.");
    }
  }

  function openRecord(app, record) {
    if (!record || !record.path || !app || !app.workspace || !app.workspace.openLinkText) return;
    app.workspace.openLinkText(record.path, record.path, false);
  }

  function regionKeyOf(record) {
    if (!record) return "";
    if (typeof record.region_key === "string" && record.region_key.trim()) return record.region_key.trim();
    const sido = typeof record.region_sido === "string" ? record.region_sido.trim() : "";
    const sigungu = typeof record.region_sigungu === "string" ? record.region_sigungu.trim() : "";
    return sido && sigungu ? `${sido}-${sigungu}` : "";
  }

  async function openRegionPopup(app, record) {
    const core = root.RegionIntelligencePopupCore;
    const view = root.RegionIntelligencePopupView;
    if (!core || typeof core.openPopupForApp !== "function" || !view || typeof view.openOverlay !== "function") return false;
    if (typeof document === "undefined" || !document.body) return false;

    const regionKey = regionKeyOf(record);
    if (!regionKey) return false;

    const result = await core.openPopupForApp(app, regionKey, {
      decisionContext: root.AuctionDecisionMirrorDashboardContext || null
    });
    if (!result || !result.ok) return false;
    return Boolean(view.openOverlay(result.state));
  }

  function addRecord(parent, app, record, label) {
    return addRecordWithReasons(parent, app, record, label, null);
  }

  function reasonText(record, reasons) {
    if (Array.isArray(reasons) && reasons.length) return reasons.join(" · ");
    return record && record.reason ? String(record.reason) : "";
  }

  function addRecordWithReasons(parent, app, record, label, reasons) {
    if (!record) return;
    const reason = reasonText(record, reasons);
    const row = parent.createEl("button", {
      text: `${label}: ${record.title || "제목 없음"}${reason ? ` · ${reason}` : ""}`,
      attr: {
        type: "button",
        class: "prodigy-decision-packet-record",
        style: "border:0;background:transparent;color:var(--text-accent);padding:0;text-align:left;cursor:pointer;font:inherit;"
      }
    });
    row.onclick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (label === "지역 분석" && await openRegionPopup(app, record)) return;
      openRecord(app, record);
    };
  }

  function addEmpty(parent, state, label) {
    const detail = state || {};
    parent.createEl("div", {
      text: `${label}: ${detail.copy || "참고 기록이 없습니다."}`,
      attr: { style: "color:var(--text-muted);" }
    });
  }

  /** Render a compact, deterministic, Korean decision packet inline. */
  function renderInline(parent, options) {
    if (!parent || typeof parent.createEl !== "function") return null;
    const opts = options || {};
    const packet = opts.packet || emptyPacket();
    const box = parent.createEl("div", {
      attr: {
        class: "prodigy-auction-decision-packet",
        style: "margin-top:4px;padding:6px 8px;border-left:2px solid var(--text-accent);background:var(--background-primary-alt, var(--background-primary));font-size:0.76em;line-height:1.45;display:flex;flex-direction:column;gap:2px;"
      }
    });
    box.createEl("div", { text: "결정 패킷", attr: { style: "font-weight:700;color:var(--text-normal);" } });

    if (packet.error) {
      box.createEl("div", { text: "결정 패킷을 표시하지 못했습니다. 나중에 다시 확인해주세요.", attr: { style: "color:var(--text-error);" } });
      return box;
    }

    if (opts.includeKnowledge !== false) {
      const knowledge = Array.isArray(packet.knowledge) ? packet.knowledge.slice(0, KNOWLEDGE_CAP) : [];
      if (knowledge.length) knowledge.forEach((record) => {
        const Reasons = root.DecisionPacketReasons;
        const reasons = Reasons && typeof Reasons.auctionReasons === "function"
          ? Reasons.auctionReasons(record.matched, record.matched && record.matched.topics)
          : null;
        addRecordWithReasons(box, opts.app, record, "검증 지식", reasons);
      });
      else addEmpty(box, packet.empty_state && packet.empty_state.knowledge, "검증 지식");
    }

    if (opts.includeRegionResource !== false) {
      if (packet.region_resource) addRecord(box, opts.app, packet.region_resource, "지역 분석");
      else addEmpty(box, packet.empty_state && packet.empty_state.region_resource, "지역 분석");
    }

   if (opts.includePriorDecisions !== false) {
     const decisions = Array.isArray(packet.prior_decisions) ? packet.prior_decisions.slice(0, PRIOR_DECISION_CAP) : [];
     if (decisions.length) decisions.forEach((record) => addRecord(box, opts.app, record, "이전 결정"));
     else addEmpty(box, packet.empty_state && packet.empty_state.prior_decisions, "이전 결정");
   }

    // Knowledge-use record bar (Todo 10 view integration).
    const recordUI = root.KnowledgeUseRecordUI;
    if (recordUI && typeof recordUI.renderRecordBar === "function" && opts.objectPath && opts.objectType) {
      const knowledgeForRecord = Array.isArray(packet.knowledge) ? packet.knowledge.slice(0, KNOWLEDGE_CAP) : [];
      recordUI.renderRecordBar(box, {
        app: opts.app,
        objectPath: opts.objectPath,
        objectType: opts.objectType,
        knowledgeRecords: knowledgeForRecord
      });
    }

    return box;
  }

  /** Render only for active Auction work; terminal cases intentionally return null. */
  function renderForAuction(parent, options) {
    const opts = options || {};
    if (!isActionable(opts.auction)) return null;
    return renderInline(parent, {
      app: opts.app,
      packet: packetForAuction(opts.context, opts.auction),
      objectPath: pathFor(opts.auction),
      objectType: "auction_case"
    });
  }

  const api = Object.freeze({
    ACTIONABLE_STATUSES,
    KNOWLEDGE_CAP,
    PRIOR_DECISION_CAP,
    createDashboardContext,
    isActionable,
    packetForAuction,
    renderInline,
    renderForAuction
  });
  root.AuctionDecisionPacket = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
