"use strict";

/**
 * region-intelligence-popup-core.js
 * Modal controller logic for the Region decision popup.
 * No direct DOM manipulation — that's the view's job.
 * NEVER writes to Objects. NEVER recommends bids.
 * Contract: .omo/plans/prodigy-region-workspace-consolidation.md Todo 14
 */

const root = typeof window !== "undefined" ? window : globalThis;
const viewModel = root.RegionDecisionViewModel || (typeof require === "function" ? require("./region-decision-view-model.js") : null);
const decisionMirrorCore = root.AuctionDecisionMirrorCore || (typeof require === "function" ? require("./auction-decision-mirror-core.js") : null);
const popupStore = root.RegionIntelligencePopupStore || (typeof require === "function" ? require("./region-intelligence-popup-store.js") : null);
const decisionContextCore = root.RegionDecisionContextCore || (typeof require === "function" ? require("./region-decision-context-core.js") : null);
const regionProjectionCore = root.RegionExplorerProjection || (typeof require === "function" ? require("./region-explorer-projection.js") : null);
const siteVisitIndex = () => root.AuctionSiteVisitIndex || null;

/**
 * Parse a Region Object markdown file into frontmatter + body sections.
 * @param {string} content - raw markdown
 * @returns {{ frontmatter: object, body: object }}
 */
function parseRegionNote(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  const frontmatter = {};
  if (fmMatch) {
    for (const line of fmMatch[1].split("\n")) {
      const kv = line.match(/^(\w[\w_]*):\s*(.*)\s*$/);
      if (kv) {
        const key = kv[1];
        let val = kv[2].trim();
        if (val === "" || val === "null") val = null;
        else if (/^\d+$/.test(val)) val = parseInt(val, 10);
        else if (/^\d+\.\d+$/.test(val)) val = parseFloat(val);
        frontmatter[key] = val;
      }
    }
  }

  const body = {};

  // Transit block
  const transitMatch = content.match(/<!-- AUTO:REGION_TRANSIT:START -->([\s\S]*?)<!-- AUTO:REGION_TRANSIT:END -->/);
  if (transitMatch) {
    const inner = transitMatch[1].trim();
    if (inner === "") {
      body.transit_block = { available: false, lines: [], malformed: false };
    } else {
      const lines = [];
      const lineMatches = inner.matchAll(/^-\s+(.+?)\s+·\s+(.+)$/gm);
      for (const m of lineMatches) {
        const lineName = m[1].trim();
        const stations = m[2].split(",").map((s) => s.trim()).filter(Boolean);
        lines.push({ line_name: lineName, stations, count: stations.length });
      }
      if (lines.length > 0) {
        body.transit_block = { available: true, lines, malformed: false };
      } else {
        body.transit_block = { available: false, lines: [], malformed: true };
      }
    }
  }

  // Source count from research block
  const sourceMatches = content.match(/source_ids?:\s*\[([^\]]*)\]/g);
  body.source_count = sourceMatches ? sourceMatches.length : 0;

  // Comparables (from body if present)
  body.comparables = [];

  // Thesis / knowledge
  const thesisMatch = content.match(/<!-- HUMAN: summary[^>]*-->\n([\s\S]*?)(?=\n##|\n<!--)/);
  if (thesisMatch && thesisMatch[1].trim()) {
    body.thesis = thesisMatch[1].trim();
  }
  body.knowledge_links = [];
  const wikiLinks = content.matchAll(/\[\[PARA\/RESOURCES\/Auction Regions\/([^\]]+)\]\]/g);
  for (const wl of wikiLinks) {
    body.knowledge_links.push(wl[1]);
  }

  // Site visits
  body.site_visits = [];

  return { frontmatter, body };
}

function loadCollectionHealth(vaultRoot, regionKey, now) {
  return popupStore ? popupStore.loadCollectionHealth(vaultRoot, regionKey, now) : null;
}

function withDecisionMirror(projection, decisionMirror) {
  if (!decisionMirror) return projection;
  const decisionTab = Object.freeze({
    id: "decision_outcome",
    label: "판단·결과",
    available: true,
    content: decisionMirror,
    unavailableReason: null
  });
  const tabs = projection.tabs.length > 0
    ? [projection.tabs[0], decisionTab, ...projection.tabs.slice(1)]
    : [decisionTab];
  return Object.freeze({ ...projection, tabs: Object.freeze(tabs), decisionMirror });
}

function withConnectedAuctions(projection, snapshot) {
  if (!snapshot) return projection;
  const auctionTab = Object.freeze({
    id: "connected_auctions",
    label: "연결 경매",
    available: true,
    content: snapshot,
    unavailableReason: null
  });
  const tabs = projection.tabs.length > 0 ? [auctionTab, ...projection.tabs] : [auctionTab];
  return Object.freeze({ ...projection, tabs: Object.freeze(tabs), connectedAuctions: snapshot });
}

function popupArguments(nowOrOptions, maybeOptions) {
  const hasExplicitDate = nowOrOptions instanceof Date;
  const options = hasExplicitDate ? (maybeOptions || {}) : (nowOrOptions || {});
  const now = hasExplicitDate ? nowOrOptions : (options.now instanceof Date ? options.now : undefined);
  return { options, now };
}

function projectPopup(regionKey, content, options, now, collectionHealth) {
  const { frontmatter, body } = parseRegionNote(content);
  if (Array.isArray(options.siteVisits)) body.site_visits = options.siteVisits;
  const decisionMirror = decisionMirrorCore ? decisionMirrorCore.projectDecisionMirror({
    regionKey,
    auction: options.auction || {},
    context: options.decisionContext || null,
    cases: options.cases || []
  }) : null;
  const auctionRows = Array.isArray(options.auctionRows) ? options.auctionRows : null;
  const auctionSnapshot = auctionRows && root.AuctionRegionCore && typeof root.AuctionRegionCore.getRegionAuctionSnapshot === "function"
    ? root.AuctionRegionCore.getRegionAuctionSnapshot(frontmatter.region_sido, frontmatter.region_sigungu, auctionRows, { now })
    : null;
  const projectedRows = regionProjectionCore && typeof regionProjectionCore.projectRegionSources === "function"
    ? regionProjectionCore.projectRegionSources([{ path: `PARA/RESOURCES/Auction Regions/${regionKey}.md`, body: content, metadata_available: true }]).rows
    : [];
  const region = projectedRows.find((row) => row && row.identity && row.identity.region_key === regionKey) || null;
  const decisionContext = decisionContextCore && typeof decisionContextCore.projectRegionDecisionContext === "function"
    ? decisionContextCore.projectRegionDecisionContext({
        region,
        auction: options.auction || null,
        outcome: decisionMirror && decisionMirror.bid_rate_summary
          ? { sample_count: decisionMirror.bid_rate_summary.sample_count, period_label: "정규 경매 결과" }
          : null
      })
    : null;
  const finalProjection = viewModel.projectRegionPopup({
    frontmatter,
    body,
    regionKey,
    decisionContext,
    connectedAuctions: auctionSnapshot,
    decisionMirror
  }, now);
  return {
    ok: true,
    state: {
      regionKey,
      projection: Object.freeze({ ...finalProjection, collectionHealth }),
      activeTabIndex: 0,
      previousContext: null,
      readOnly: true
    }
  };
}

/**
 * Open popup state for a Region.
 * @param {string} vaultRoot
 * @param {string} regionKey - e.g. "부산광역시-사하구"
 * @param {Date} [now]
 * @returns {{ ok: boolean, state?: object, error?: string }}
 */
function openPopup(vaultRoot, regionKey, nowOrOptions, maybeOptions) {
  if (!regionKey || typeof regionKey !== "string") {
    return { ok: false, error: "regionKey가 필요합니다." };
  }
  if (!popupStore) return { ok: false, error: "지역 정보 로더를 사용할 수 없습니다." };
  const source = popupStore.readRegionFromDisk(vaultRoot, regionKey);
  if (!source.ok) return source;
  const { options, now } = popupArguments(nowOrOptions, maybeOptions);
  return projectPopup(regionKey, source.content, options, now, loadCollectionHealth(vaultRoot, regionKey, now));
}

async function openPopupForApp(app, regionKey, nowOrOptions, maybeOptions) {
  if (!regionKey || typeof regionKey !== "string") {
    return { ok: false, error: "regionKey가 필요합니다." };
  }
  if (!popupStore) return { ok: false, error: "지역 정보 로더를 사용할 수 없습니다." };
  const source = await popupStore.readRegionFromApp(app, regionKey);
  if (!source.ok) return source;
  const { options, now } = popupArguments(nowOrOptions, maybeOptions);
  let siteVisits = Array.isArray(options.siteVisits) ? options.siteVisits : null;
  const visitIndex = siteVisitIndex();
  if (!siteVisits && visitIndex && typeof visitIndex.readRegionVisits === "function") {
    try {
      siteVisits = await visitIndex.readRegionVisits(app, regionKey, options.regionDong);
    } catch (error) {
      console.error("Region site visit index read failed:", error);
      siteVisits = [];
    }
  }
  const vaultRoot = app && app.vault && app.vault.adapter && app.vault.adapter.basePath || "";
  return projectPopup(regionKey, source.content, { ...options, siteVisits: siteVisits || [] }, now, loadCollectionHealth(vaultRoot, regionKey, now));
}

/**
 * Switch active tab with focus persistence.
 * @param {object} state - popup state from openPopup
 * @param {number} tabIndex
 * @returns {object} updated state
 */
function switchTab(state, tabIndex) {
  if (tabIndex < 0 || tabIndex >= state.projection.tabs.length) return state;
  return { ...state, activeTabIndex: tabIndex };
}

/**
 * Get source drilldown for a specific metric.
 * @param {object} projection
 * @param {string} metricKey
 * @returns {{ provider: string|null, source_id: string|null }}
 */
function getSourceDrilldown(projection, metricKey) {
  // In a full implementation this would map to the source registry
  return { provider: null, source_id: null, note: "출처 정보는 수집 데이터에서 제공됩니다." };
}

const api = Object.freeze({
  isAvailable: Boolean(popupStore),
  parseRegionNote,
  loadCollectionHealth,
  openPopup,
  openPopupForApp,
  switchTab,
  getSourceDrilldown
});

root.RegionIntelligencePopupCore = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
