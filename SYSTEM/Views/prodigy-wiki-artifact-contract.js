(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash
    || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  if (!hashApi || typeof hashApi.sha256 !== "function") {
    throw new Error("LLMWikiHash is required.");
  }

  const VERSION = "prodigy_wiki_artifact_v1";
  const NAVIGATION_VERSION = "prodigy_wiki_navigation_v1";
  const OUTLINE_VERSION = "prodigy_wiki_source_outline_v1";
  const RECEIPT_VERSION = "prodigy_wiki_artifact_receipt_v1";
  const PREVIEW_ROOT = "SYSTEM/CACHE/llmwiki/previews";
  const REVIEWED_ROOT = "PARA/RESOURCES/Prodigy Wiki";
  const REVIEWED_RECEIPT_ROOT = `${REVIEWED_ROOT}/.receipts`;
  const HASH = /^[0-9a-f]{64}$/u;
  const CLAIM_ID = /^(?:claim|guide_claim)_[a-zA-Z0-9_-]{1,127}$/u;
  const CITATION_ID = /^citation_[a-zA-Z0-9_-]{1,127}$/u;
  const SOURCE_ID = /^[a-z][a-z0-9_-]{2,127}$/u;

  function plain(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freeze(child)]),
    ));
  }
  function clean(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
  }
  function safeTitle(value) {
    return clean(value).replace(/[\\/:*?"<>|#^[\]]/gu, " ").replace(/\s+/gu, " ").slice(0, 96).trim() || "Prodigy Wiki";
  }
  function safeSourcePath(value) {
    if (typeof value !== "string" || !value.endsWith(".md") || value.includes("\\") || value.startsWith("/")) return false;
    if (!["INBOX/", "ZETA/LITERATURE/"].some((prefix) => value.startsWith(prefix))) return false;
    return value.split("/").every((part) => part && part !== "." && part !== "..");
  }
  function sha(value) {
    return hashApi.sha256(typeof value === "string" ? value : stable(value));
  }
  function unique(values) {
    return [...new Set(values)];
  }
  function fail(reason) {
    return freeze({ ok: false, status: "invalid", reason });
  }
  function validScope(scope, sourceLength) {
    if (scope === null || scope === undefined) return null;
    if (!plain(scope) || !Number.isSafeInteger(scope.start) || !Number.isSafeInteger(scope.end)
      || scope.start < 0 || scope.end <= scope.start || scope.end > sourceLength) {
      throw new TypeError("invalid_artifact_scope");
    }
    return freeze({
      scope_id: clean(scope.scope_id),
      range_key: clean(scope.range_key),
      title: clean(scope.title),
      start: scope.start,
      end: scope.end,
    });
  }
  function headingRows(sourceText) {
    const source = String(sourceText);
    const matches = [...source.matchAll(/^(#{1,3})\s+(.+?)\s*$/gmu)];
    const stack = [];
    const occurrences = new Map();
    return matches.map((match, index) => {
      const level = match[1].length;
      while (stack.length && stack.at(-1).level >= level) stack.pop();
      const heading = clean(match[2]);
      const ancestry = [...stack.map((row) => row.heading), heading];
      const ancestryToken = ancestry.map((row) => row.normalize("NFC").toLowerCase()).join("\u001f");
      const occurrence = (occurrences.get(ancestryToken) || 0) + 1;
      occurrences.set(ancestryToken, occurrence);
      const boundary = matches.slice(index + 1).find((candidate) => candidate[1].length <= level);
      const end = boundary ? boundary.index : source.length;
      const row = {
        range_key: `range_${sha(stable({ ancestry: ancestryToken, occurrence })).slice(0, 24)}`,
        heading,
        heading_path: ancestry,
        occurrence,
        level,
        start: match.index,
        end,
        body_hash: sha(source.slice(match.index, end)),
      };
      stack.push(row);
      return freeze(row);
    });
  }
  function createSourceOutline(source) {
    if (!plain(source) || !safeSourcePath(source.source_path)
      || !SOURCE_ID.test(source.source_id || "") || !HASH.test(source.source_revision || "")
      || typeof source.source_text !== "string" || sha(source.source_text) !== source.source_revision) {
      throw new TypeError("valid_artifact_source_required");
    }
    const body = {
      outline_version: OUTLINE_VERSION,
      source_id: source.source_id,
      source_path: source.source_path,
      source_revision: source.source_revision,
      rows: headingRows(source.source_text),
    };
    return freeze({ ...body, outline_hash: sha(body) });
  }
  function citationSpan(citation, source) {
    const locators = Array.isArray(citation.locators)
      ? citation.locators.map(clean).filter(Boolean)
      : clean(citation.locator) ? [clean(citation.locator)] : [];
    for (const locator of locators) {
      const marker = locator.lastIndexOf("#");
      if (marker < 0 || locator.slice(0, marker) !== source.source_path) continue;
      const match = /^(\d+)-(\d+)$/u.exec(locator.slice(marker + 1));
      if (!match) continue;
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (Number.isSafeInteger(start) && Number.isSafeInteger(end)
        && start >= 0 && end > start && end <= source.source_text.length) {
        return { start, end, locators };
      }
    }
    const quote = clean(citation.evidence_quote);
    const start = quote ? source.source_text.indexOf(quote) : -1;
    if (start < 0) throw new TypeError("citation_source_span_required");
    return {
      start,
      end: start + quote.length,
      locators: [`${source.source_path}#${start}-${start + quote.length}`],
    };
  }
  function normalizeCitation(citation, source) {
    if (!plain(citation) || !CITATION_ID.test(citation.citation_id || "")) {
      throw new TypeError("valid_navigation_citation_required");
    }
    const span = citationSpan(citation, source);
    const evidenceQuote = clean(citation.evidence_quote)
      || source.source_text.slice(span.start, span.end);
    if (!evidenceQuote || source.source_text.slice(span.start, span.end) !== evidenceQuote) {
      throw new TypeError("citation_quote_mismatch");
    }
    return freeze({
      citation_id: citation.citation_id,
      source_id: source.source_id,
      source_path: source.source_path,
      source_revision: source.source_revision,
      analysis_content_hash: HASH.test(citation.content_hash || "") ? citation.content_hash : "",
      content_hash: source.source_revision,
      locators: span.locators,
      evidence_quote: evidenceQuote,
      span: freeze({ start: span.start, end: span.end }),
      span_digest: sha(evidenceQuote),
      confidence: clean(citation.confidence) || "explicit",
    });
  }
  function createNavigationManifest(document, source) {
    if (!plain(document) || !["source_guide", "topic_article"].includes(document.document_kind)
      || !clean(document.title) || !Array.isArray(document.sections)
      || !Array.isArray(document.claims) || !Array.isArray(document.citations)) {
      throw new TypeError("valid_navigation_document_required");
    }
    const citationById = new Map(document.citations.map((citation) => {
      const normalized = normalizeCitation(citation, source);
      return [normalized.citation_id, normalized];
    }));
    const claimById = new Map(document.claims.map((claim) => {
      if (!plain(claim) || !CLAIM_ID.test(claim.claim_id || "")) {
        throw new TypeError("valid_navigation_claim_required");
      }
      return [claim.claim_id, claim];
    }));
    const sections = document.sections.map((section, sectionIndex) => {
      if (!plain(section) || !clean(section.heading)) {
        throw new TypeError("valid_navigation_section_required");
      }
      const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs : [];
      const claimIds = unique([
        ...(Array.isArray(section.claim_ids) ? section.claim_ids : []),
        ...paragraphs.flatMap((paragraph) => Array.isArray(paragraph.claim_ids) ? paragraph.claim_ids : []),
      ]);
      if (claimIds.length === 0 || claimIds.some((claimId) => !CLAIM_ID.test(claimId))) {
        throw new TypeError("section_claim_binding_required");
      }
      const citationIds = unique([
        ...(Array.isArray(section.citation_ids) ? section.citation_ids : []),
        ...claimIds.flatMap((claimId) => {
          const claim = claimById.get(claimId);
          return Array.isArray(claim && claim.citation_ids) ? claim.citation_ids : [];
        }),
      ]);
      const citations = citationIds.map((citationId) => citationById.get(citationId)).filter(Boolean);
      if (citations.length === 0) throw new TypeError("section_citation_binding_required");
      return freeze({
        section_id: `section_${sha(stable({
          document_kind: document.document_kind,
          title: document.title,
          heading: section.heading,
          section_index: sectionIndex,
          claim_ids: claimIds,
        })).slice(0, 24)}`,
        heading: clean(section.heading),
        claim_ids: claimIds,
        citations,
        paragraphs: paragraphs.map((paragraph, paragraphIndex) => freeze({
          paragraph_id: `paragraph_${sha(stable({
            section_index: sectionIndex,
            paragraph_index: paragraphIndex,
            text: clean(paragraph.text),
          })).slice(0, 24)}`,
          text: clean(paragraph.text),
          claim_ids: Array.isArray(paragraph.claim_ids) ? [...paragraph.claim_ids] : [],
        })),
      });
    });
    const body = {
      navigation_version: NAVIGATION_VERSION,
      source_id: source.source_id,
      source_path: source.source_path,
      source_revision: source.source_revision,
      document_kind: document.document_kind,
      title: clean(document.title),
      purpose: clean(document.purpose),
      tags: unique(Array.isArray(document.tags) ? document.tags.map(clean).filter(Boolean) : []),
      sections,
    };
    return freeze({ ...body, navigation_hash: sha(body) });
  }
  function receiptBody(input) {
    return {
      receipt_version: RECEIPT_VERSION,
      artifact_version: VERSION,
      artifact_id: input.artifact_id,
      operation_id: input.operation_id,
      orchestrator_version: input.orchestrator_version,
      document_path: input.document_path,
      document_kind: input.document_kind,
      title: input.title,
      document_hash: input.document_hash,
      source_id: input.source_id,
      source_path: input.source_path,
      source_revision: input.source_revision,
      scope: input.scope,
      navigation_manifest: input.navigation_manifest,
      navigation_hash: input.navigation_manifest.navigation_hash,
      source_outline: input.source_outline,
      source_outline_hash: input.source_outline.outline_hash,
      gate_receipt_hash: input.gate_receipt_hash,
    };
  }
  function createPreviewArtifact(input) {
    if (!plain(input) || !HASH.test(input.operation_id || "")
      || !clean(input.orchestrator_version) || !HASH.test(input.gate_receipt_hash || "")
      || typeof input.document_bytes !== "string") {
      throw new TypeError("valid_artifact_input_required");
    }
    const sourceOutline = createSourceOutline(input.source);
    const scope = validScope(input.scope, input.source.source_text.length);
    const navigationManifest = createNavigationManifest(input.document, input.source);
    const documentHash = sha(input.document_bytes);
    const identityBody = {
      operation_id: input.operation_id,
      source_id: input.source.source_id,
      source_path: input.source.source_path,
      source_revision: input.source.source_revision,
      scope,
      document_kind: input.document.document_kind,
      title: clean(input.document.title),
      document_hash: documentHash,
      navigation_hash: navigationManifest.navigation_hash,
    };
    const artifactId = `prodigy_artifact_${sha(identityBody).slice(0, 24)}`;
    const sourceKey = sha(input.source.source_path).slice(0, 16);
    const fileName = `${safeTitle(input.document.title)}--${artifactId.slice(-8)}.md`;
    const documentPath = `${PREVIEW_ROOT}/${sourceKey}/${input.source.source_revision.slice(0, 12)}/${fileName}`;
    const body = receiptBody({
      artifact_id: artifactId,
      operation_id: input.operation_id,
      orchestrator_version: clean(input.orchestrator_version),
      document_path: documentPath,
      document_kind: input.document.document_kind,
      title: clean(input.document.title),
      document_hash: documentHash,
      source_id: input.source.source_id,
      source_path: input.source.source_path,
      source_revision: input.source.source_revision,
      scope,
      navigation_manifest: navigationManifest,
      source_outline: sourceOutline,
      gate_receipt_hash: input.gate_receipt_hash,
    });
    const receipt = freeze({ ...body, receipt_hash: sha(body) });
    return freeze({
      artifact_id: artifactId,
      document_path: documentPath,
      receipt_path: documentPath.replace(/\.md$/u, ".receipt.json"),
      document_bytes: input.document_bytes,
      navigation_manifest: navigationManifest,
      source_outline: sourceOutline,
      receipt,
      write_counts: freeze({
        preview: 0,
        reviewed: 0,
        canonical: 0,
        source: 0,
        provider: 0,
      }),
    });
  }
  function inspectPreviewArtifact(input) {
    if (!plain(input) || !plain(input.receipt) || typeof input.document_bytes !== "string"
      || !plain(input.navigation_manifest) || !plain(input.source_outline)) return fail("malformed_artifact");
    const receipt = input.receipt;
    if (receipt.receipt_version !== RECEIPT_VERSION || receipt.artifact_version !== VERSION
      || receipt.document_path !== input.document_path
      || receipt.document_hash !== sha(input.document_bytes)
      || receipt.navigation_hash !== sha(Object.fromEntries(
        Object.entries(input.navigation_manifest).filter(([key]) => key !== "navigation_hash"),
      ))
      || receipt.navigation_hash !== input.navigation_manifest.navigation_hash
      || receipt.source_outline_hash !== sha(Object.fromEntries(
        Object.entries(input.source_outline).filter(([key]) => key !== "outline_hash"),
      ))
      || receipt.source_outline_hash !== input.source_outline.outline_hash
      || stable(receipt.navigation_manifest) !== stable(input.navigation_manifest)
      || stable(receipt.source_outline) !== stable(input.source_outline)
      || receipt.receipt_hash !== sha(receiptBody(receipt))) return fail("artifact_receipt_mismatch");
    const identityBody = {
      operation_id: receipt.operation_id,
      source_id: receipt.source_id,
      source_path: receipt.source_path,
      source_revision: receipt.source_revision,
      scope: receipt.scope,
      document_kind: receipt.document_kind,
      title: receipt.title,
      document_hash: receipt.document_hash,
      navigation_hash: receipt.navigation_hash,
    };
    if (receipt.artifact_id !== `prodigy_artifact_${sha(identityBody).slice(0, 24)}`) {
      return fail("artifact_identity_mismatch");
    }
    return freeze({ ok: true, status: "verified", artifact_id: receipt.artifact_id });
  }

  const api = freeze({
    VERSION,
    NAVIGATION_VERSION,
    OUTLINE_VERSION,
    RECEIPT_VERSION,
    PREVIEW_ROOT,
    REVIEWED_ROOT,
    REVIEWED_RECEIPT_ROOT,
    createSourceOutline,
    createNavigationManifest,
    createPreviewArtifact,
    inspectPreviewArtifact,
  });
  root.ProdigyWikiArtifactContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
