(function (root) {
  "use strict";

  const KNOWLEDGE_CAP = 3;
  const VERIFIED_KNOWLEDGE_TYPES = new Set(["knowledge", "permanent_note"]);

  function clean(value) {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function pathFor(reading) {
    const file = reading && reading.file;
    return clean(reading && (reading.path || reading.source_path || (file && file.path)));
  }

  function linksFor(candidate) {
    return Array.isArray(candidate && candidate.knowledge_links)
      ? candidate.knowledge_links.map(clean).filter(Boolean)
      : [];
  }

  function titleFor(file, frontmatter, fallback) {
    return clean(frontmatter && frontmatter.title) || clean(file && file.basename) || clean(fallback).split("/").pop().replace(/\.md$/i, "") || "제목 없음";
  }

  function reasonFor(candidate) {
    const labels = Array.isArray(candidate && candidate.relation_labels) ? candidate.relation_labels.map(clean).filter(Boolean) : [];
    const evidence = clean(candidate && candidate.evidence_line);
    return [...labels, evidence].join(" · ");
  }

  function resolveKnowledge(app, link, sourcePath) {
    const metadata = app && app.metadataCache;
    if (!metadata || typeof metadata.getFirstLinkpathDest !== "function" || typeof metadata.getFileCache !== "function") return null;
    const file = metadata.getFirstLinkpathDest(link, sourcePath);
    if (!file || !clean(file.path)) return null;
    const cache = metadata.getFileCache(file) || {};
    const frontmatter = cache.frontmatter && typeof cache.frontmatter === "object" ? cache.frontmatter : {};
    const type = clean(frontmatter.type).toLocaleLowerCase("en-US");
    if (!VERIFIED_KNOWLEDGE_TYPES.has(type)) return null;
    return Object.freeze({ path: clean(file.path), title: titleFor(file, frontmatter, link), type });
  }

  function emptyPacket() {
    return Object.freeze({
      knowledge: Object.freeze([]),
      region_resource: null,
      prior_decisions: Object.freeze([]),
      empty_state: Object.freeze({
        copy: "결정 패킷에 표시할 검증 지식이 없습니다.",
        reason: "이 책과 연결된 검증 지식이 아직 없습니다.",
        knowledge: Object.freeze({ copy: "참조할 검증 지식이 없습니다.", reason: "관련 독서 기록에 연결된 검증 지식이 없습니다." })
      }),
      warnings: Object.freeze([]),
      error: false
    });
  }

  function errorPacket() {
    return Object.freeze({ ...emptyPacket(), error: true });
  }

  /** Keep Reading Memory's deterministic candidate and reason order; do not rank again. */
  function packetForMemory(candidates, app) {
    const records = [];
    const seen = new Set();
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const sourcePath = clean(candidate && candidate.source_path);
      for (const link of linksFor(candidate)) {
        const record = resolveKnowledge(app, link, sourcePath);
        if (!record || seen.has(record.path)) continue;
        seen.add(record.path);
        records.push(Object.freeze({ ...record, reason: reasonFor(candidate) }));
        if (records.length === KNOWLEDGE_CAP) break;
      }
      if (records.length === KNOWLEDGE_CAP) break;
    }
    if (!records.length) return emptyPacket();
    return Object.freeze({
      knowledge: Object.freeze(records),
      region_resource: null,
      prior_decisions: Object.freeze([]),
      empty_state: Object.freeze({ copy: null, reason: null, knowledge: null }),
      warnings: Object.freeze([]),
      error: false
    });
  }

  function button(parent) {
    return parent.createEl("button", {
      text: "결정 패킷",
      attr: { type: "button", class: "prodigy-btn" }
    });
  }

  /** Current-reading only: delegates retrieval to Reading Memory and rendering to the shared packet surface. */
  function renderForReading(parent, options) {
    const opts = options || {};
    const reading = opts.reading || {};
    const sourcePath = pathFor(reading);
    if (clean(reading.status) !== "reading" || !sourcePath || !parent || typeof parent.createEl !== "function") return null;
    const trigger = button(parent);
    const slot = parent.createEl("div", { attr: { class: "prodigy-reading-decision-packet", style: "width:100%;" } });
    trigger.onclick = async (event) => {
      if (event && event.preventDefault) event.preventDefault();
      if (event && event.stopPropagation) event.stopPropagation();
      if (slot.empty) slot.empty();
      trigger.disabled = true;
      let packet;
      try {
        if (!root.ReadingMemoryView || typeof root.ReadingMemoryView.loadForSource !== "function") throw new Error("Reading Memory is unavailable.");
        const memory = await root.ReadingMemoryView.loadForSource(opts.app, sourcePath);
        packet = packetForMemory(memory && memory.candidates, opts.app);
      } catch (_error) {
        packet = errorPacket();
      } finally {
        trigger.disabled = false;
      }
      const presentation = root.AuctionDecisionPacket;
      if (presentation && typeof presentation.renderInline === "function") {
        presentation.renderInline(slot, { app: opts.app, packet, includeRegionResource: false, includePriorDecisions: false });
      }
    };
    return trigger;
  }

  const api = Object.freeze({ KNOWLEDGE_CAP, VERIFIED_KNOWLEDGE_TYPES, packetForMemory, renderForReading });
  root.ReadingDecisionPacket = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
