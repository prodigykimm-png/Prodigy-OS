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

function nodeRuntime() {
  if (typeof require !== "function") return null;
  try {
    return { fs: require("node:fs"), path: require("node:path") };
  } catch (_error) {
    return null;
  }
}

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

/**
 * Open popup state for a Region.
 * @param {string} vaultRoot
 * @param {string} regionKey - e.g. "부산광역시-사하구"
 * @param {Date} [now]
 * @returns {{ ok: boolean, state?: object, error?: string }}
 */
function openPopup(vaultRoot, regionKey, now) {
  if (!regionKey || typeof regionKey !== "string") {
    return { ok: false, error: "regionKey가 필요합니다." };
  }
  const node = nodeRuntime();
  if (!node) return { ok: false, error: "지역 정보 팝업은 데스크톱 Obsidian에서만 사용할 수 있습니다." };
  const { fs, path } = node;
  const regionDir = path.join(vaultRoot, "PARA/RESOURCES/Auction Regions");
  const nfcName = `${regionKey}.md`.normalize("NFC");
  let targetPath = path.join(regionDir, nfcName);

  // Try NFD fallback for macOS HFS+
  if (!fs.existsSync(targetPath)) {
    const nfdName = `${regionKey}.md`.normalize("NFD");
    const nfdPath = path.join(regionDir, nfdName);
    if (fs.existsSync(nfdPath)) targetPath = nfdPath;
    else return { ok: false, error: `Region Object를 찾을 수 없습니다: ${regionKey}` };
  }

  let content;
  try {
    content = fs.readFileSync(targetPath, "utf8");
  } catch (e) {
    return { ok: false, error: `Region Object 읽기 실패: ${e.message}` };
  }

  const { frontmatter, body } = parseRegionNote(content);
  const projection = viewModel.projectRegionPopup({ frontmatter, body, regionKey }, now);

  return {
    ok: true,
    state: {
      regionKey,
      projection,
      activeTabIndex: 0,
      previousContext: null,
      readOnly: true
    }
  };
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
  isAvailable: Boolean(nodeRuntime()),
  parseRegionNote,
  openPopup,
  switchTab,
  getSourceDrilldown
});

root.RegionIntelligencePopupCore = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
