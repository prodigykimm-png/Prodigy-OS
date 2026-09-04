(function (root) {
  "use strict";

  const artifactApi = root.ProdigyWikiArtifactContract
    || (typeof require === "function" ? require("./prodigy-wiki-artifact-contract.js") : null);
  const VERSION = "llmwiki_golden_wiki_orchestrator_v3";
  const MAX_DIRECT_PACKS = 30;

  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function safePath(value) {
    return typeof value === "string" && value.startsWith("INBOX/") && value.endsWith(".md")
      && !value.includes("\\") && !value.split("/").some((part) => !part || part === "." || part === "..");
  }
  function fileTitle(path) { return path.split("/").pop().replace(/\.md$/u, ""); }
  function safeTitle(value) {
    return text(value).replace(/[\\/:*?"<>|#^[\]]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 120) || "읽기용 Wiki";
  }
  function publicationText(value) {
    return text(value)
      .replace(/공동주택\s*공시가격\s*\(\s*공주가\s*\)/gu, "공동주택공시가격")
      .replace(/공동주택공시가격\s*\(\s*공동주택\s*공시가격\s*\)/gu, "공동주택공시가격")
      .replace(/공주가/gu, "공동주택공시가격")
      .replace(/물건\s*선주의\s*시/gu, "물건 선정 시")
      .replace(/물건\s*선주의/gu, "물건 선정의");
  }
  function packCount(chunks, limits) {
    const encoder = new TextEncoder();
    let packs = 0, count = 0, bytes = 0;
    for (const chunk of chunks) {
      const size = encoder.encode(String(chunk.text || "")).length;
      if (count && (count === limits.max_chunks || bytes + size > limits.max_bytes)) {
        packs += 1; count = 0; bytes = 0;
      }
      count += 1; bytes += size;
    }
    return packs + (count ? 1 : 0);
  }
  function rangeRecord(row) {
    return {
      scope_id: row.scope_id,
      range_id: row.scope_id,
      title: row.title,
      level: row.level,
      start: row.start,
      end: row.end,
      size: row.size,
      preview: row.preview,
    };
  }
  function flattenRanges(tree) {
    return tree.flatMap((row) => [rangeRecord(row), ...flattenRanges(row.children || [])]);
  }
  function flattenRangeNodes(tree) {
    return tree.flatMap((row) => [row, ...flattenRangeNodes(row.children || [])]);
  }
  function headingRangeTree(sourceText) {
    const source = String(sourceText);
    const matches = [...source.matchAll(/^(#{1,3})\s+(.+)$/gmu)];
    const rows = matches.map((match, index) => {
      const level = match[1].length;
      const boundary = matches.slice(index + 1).find((candidate) => candidate[1].length <= level);
      const end = boundary ? boundary.index : source.length;
      const body = source.slice(match.index + match[0].length, end).replace(/\s+/gu, " ").trim();
      const chars = Math.max(0, end - match.index);
      return {
        scope_id: `heading_${String(index + 1).padStart(3, "0")}`,
        title: text(match[2]),
        level,
        start: match.index,
        end,
        size: chars < 4_000 ? "short" : chars < 16_000 ? "medium" : "large",
        preview: body.slice(0, 220),
        children: [],
      };
    });
    const roots = [];
    const stack = [];
    for (const row of rows) {
      while (stack.length && stack.at(-1).level >= row.level) stack.pop();
      if (stack.length) stack.at(-1).children.push(row);
      else roots.push(row);
      stack.push(row);
    }
    function prune(row) {
      const children = row.children.map(prune).filter(Boolean);
      const ownText = source.slice(row.start, row.end).replace(/^#{1,3}\s+.+$/gmu, "").trim();
      if (ownText.length < 120 && children.length === 0) return null;
      return { ...row, children };
    }
    return freeze(roots.map(prune).filter(Boolean));
  }
  function headingScopes(sourceText) {
    return freeze(flattenRanges(headingRangeTree(sourceText)));
  }
  function renderDocument(document, sourcePath) {
    const sourceName = fileTitle(sourcePath);
    const sections = (document.sections || []).map((section) => {
      const paragraphs = Array.isArray(section.paragraphs)
        ? section.paragraphs.map((paragraph) => text(paragraph.text)).filter(Boolean)
        : [];
      const body = paragraphs.length ? paragraphs.join("\n\n") : text(section.summary);
      return body ? `## ${publicationText(section.heading) || "핵심 내용"}\n\n${publicationText(body)}` : "";
    }).filter(Boolean).join("\n\n");
    const overview = text(document.purpose)
      || text(document.sections && document.sections[0] && document.sections[0].summary)
      || "원문 근거를 독자가 판단하고 적용하는 순서로 정리한 문서입니다.";
    const checklist = (document.sections || [])
      .map((section) => `- [ ] ${publicationText(section.heading)}의 조건과 예외를 확인했다.`)
      .join("\n");
    return `---\ntype: wiki-preview\nstatus: review\nsource: "[[${sourceName}]]"\n---\n\n# ${safeTitle(publicationText(document.title))}\n\n> [!warning] 문서 성격\n> Prodigy Wiki가 선택한 원문 내용을 정리한 결과이며 외부 사실 확인은 수행하지 않았습니다. 경험값과 시점 의존 정보는 현재 상황에 그대로 적용하지 말고 원문과 최신 기준을 함께 확인해야 합니다.\n\n## 한눈에 보기\n\n${publicationText(overview)}\n\n${sections}\n\n## 주요 위험\n\n- 원문의 경험적 판단을 모든 상황에 적용하지 않습니다.\n- 법률·규정·가격·비율처럼 달라질 수 있는 내용은 현재 기준을 다시 확인합니다.\n- 아래 원문 링크에서 문맥과 예외를 함께 확인합니다.\n\n## 실전 체크리스트\n\n${checklist || "- [ ] 문서의 적용 범위와 예외를 확인했다."}\n\n## 원문\n\n- [[${sourceName}]]\n`;
  }
  function mergeTopicDocuments(documents, sourcePath) {
    const claims = [], citations = [], seen = new Set(), seenCitations = new Set(), sections = [];
    for (const document of documents) {
      for (const claim of document.claims || []) {
        if (!claim || seen.has(claim.claim_id)) continue;
        seen.add(claim.claim_id);
        claims.push(claim);
      }
      for (const citation of document.citations || []) {
        if (!citation || seenCitations.has(citation.citation_id)) continue;
        seenCitations.add(citation.citation_id);
        citations.push(citation);
      }
      const paragraphs = (document.sections || []).flatMap((section) => section.paragraphs || []);
      if (paragraphs.length) sections.push({
        heading: publicationText(document.title),
        paragraphs,
      });
    }
    return freeze({
      document_kind: "topic_article",
      title: `${fileTitle(sourcePath)} 실전 Wiki`,
      purpose: "핵심 주제를 판단과 확인 순서에 따라 통합한 읽기용 가이드입니다.",
      sections,
      claims,
      citations,
    });
  }
  function paragraphClaimIds(sections) {
    return (sections || []).flatMap((section) => (section.paragraphs || []).flatMap((paragraph) => (
      Array.isArray(paragraph.claim_ids) ? paragraph.claim_ids.filter((claimId) => typeof claimId === "string") : []
    )));
  }
  function uniqueRows(rows, key) {
    const seen = new Set();
    return rows.filter((row) => row && typeof row[key] === "string" && !seen.has(row[key]) && seen.add(row[key]));
  }
  function composeFinalDocument(allDocuments, sourcePath) {
    const documents = Array.isArray(allDocuments) ? allDocuments.filter(Boolean) : [];
    const guide = documents.find((document) => document.document_kind === "source_guide") || null;
    const topics = documents.filter((document) => document.document_kind === "topic_article");
    const claimById = new Map(uniqueRows(documents.flatMap((document) => document.claims || []), "claim_id")
      .map((claim) => [claim.claim_id, claim]));
    const citationById = new Map(uniqueRows(documents.flatMap((document) => document.citations || []), "citation_id")
      .map((citation) => [citation.citation_id, citation]));
    const approvedClaimIds = guide
      ? (guide.claims || []).map((claim) => claim && claim.claim_id).filter((claimId) => typeof claimId === "string")
      : paragraphClaimIds(topics.flatMap((document) => document.sections || []));
    const expected = new Set(approvedClaimIds);
    const topicDocument = topics.length > 1 ? mergeTopicDocuments(topics, sourcePath) : topics[0] || null;
    const topicClaimIds = topicDocument ? paragraphClaimIds(topicDocument.sections) : [];
    const used = new Set(topicClaimIds);
    const finalClaimIds = [...topicClaimIds];
    let document;
    if (!topicDocument && guide) {
      const guideClaimIds = paragraphClaimIds(guide.sections);
      document = {
        ...guide,
        claims: guideClaimIds.map((claimId) => claimById.get(claimId)).filter(Boolean),
        citations: uniqueRows(guideClaimIds.flatMap((claimId) => (claimById.get(claimId)?.citation_ids || [])
          .map((citationId) => citationById.get(citationId))), "citation_id"),
      };
      finalClaimIds.push(...guideClaimIds);
    } else if (topicDocument) {
      const residualSections = [];
      for (const section of guide?.sections || []) {
        const paragraphs = (section.paragraphs || []).filter((paragraph) => {
          const claimIds = Array.isArray(paragraph.claim_ids) ? paragraph.claim_ids : [];
          return claimIds.length > 0 && claimIds.every((claimId) => expected.has(claimId) && !used.has(claimId));
        });
        if (!paragraphs.length) continue;
        for (const paragraph of paragraphs) {
          for (const claimId of paragraph.claim_ids) {
            used.add(claimId);
            finalClaimIds.push(claimId);
          }
        }
        residualSections.push({
          heading: `원문 전용: ${publicationText(section.heading) || "자료"}`,
          paragraphs,
        });
      }
      const finalClaims = uniqueRows(finalClaimIds.map((claimId) => claimById.get(claimId)), "claim_id");
      document = {
        ...topicDocument,
        sections: [...(topicDocument.sections || []), ...residualSections],
        claims: finalClaims,
        citations: uniqueRows(finalClaims.flatMap((claim) => (claim.citation_ids || [])
          .map((citationId) => citationById.get(citationId))), "citation_id"),
      };
    } else return null;
    const finalSet = new Set(finalClaimIds);
    const duplicateClaimIds = finalClaimIds.filter((claimId, index) => finalClaimIds.indexOf(claimId) !== index);
    return freeze({
      document: freeze(document),
      partition: freeze({
        approved_claim_ids: [...expected],
        final_claim_ids: [...finalSet],
        missing_claim_ids: [...expected].filter((claimId) => !finalSet.has(claimId)),
        unexpected_claim_ids: [...finalSet].filter((claimId) => !expected.has(claimId)),
        duplicate_claim_ids: [...new Set(duplicateClaimIds)],
      }),
    });
  }

  function create(options = {}) {
    const vault = options.vault;
    const hash = options.hash;
    const analysisScope = options.analysisScope;
    const chunkManifest = options.chunkManifest;
    const gate = options.gate;
    const runPlan = options.runPlan;
    const compilePlan = options.compilePlan;
    const getDocuments = options.getDocuments;
    const limits = options.limits || {};
    if (!vault || typeof vault.cachedRead !== "function" || typeof hash?.sha256 !== "function"
      || typeof analysisScope?.createAnalysisScope !== "function" || typeof chunkManifest?.createChunkManifest !== "function"
      || typeof gate?.evaluate !== "function" || typeof runPlan !== "function"
      || typeof compilePlan !== "function" || typeof getDocuments !== "function"
      || !artifactApi || typeof artifactApi.createPreviewArtifact !== "function"
      || !Number.isSafeInteger(limits.max_chunks) || !Number.isSafeInteger(limits.max_bytes)) {
      throw new TypeError("golden_wiki_orchestrator_dependencies_required");
    }
    const notify = (stage, extra = {}) => {
      if (typeof options.onProgress === "function") options.onProgress(freeze({ stage, ...extra }));
    };
    async function ensureFolder(path) {
      if (vault.getAbstractFileByPath(path)) return;
      await vault.createFolder(path);
    }
    async function writeExact(path, bytes) {
      const file = vault.getAbstractFileByPath(path);
      if (file) {
        const current = await vault.cachedRead(file);
        if (current !== bytes) throw new Error("immutable_preview_conflict");
        return false;
      }
      await vault.create(path, bytes);
      return true;
    }
    async function ensureParent(path) {
      const parts = path.split("/").slice(0, -1);
      for (let index = 1; index <= parts.length; index += 1) {
        await ensureFolder(parts.slice(0, index).join("/"));
      }
    }
    async function preflight(input) {
      if (!safePath(input && input.source_path)) return freeze({ ok: false, reason: "invalid_source_path" });
      const file = vault.getAbstractFileByPath(input.source_path);
      if (!file) return freeze({ ok: false, reason: "source_missing" });
      const sourceText = await vault.cachedRead(file);
      const sourceHash = hash.sha256(sourceText);
      if (text(input.expected_content_hash) && input.expected_content_hash !== sourceHash) {
        return freeze({ ok: false, reason: "source_revision_changed" });
      }
      const rangeTree = headingRangeTree(sourceText);
      const availableScopes = flattenRangeNodes(rangeTree);
      const requestedScope = input && input.scope;
      const selectedScope = requestedScope
        ? availableScopes.find((row) => row.scope_id === requestedScope.scope_id
          || (row.start === requestedScope.start && row.end === requestedScope.end))
        : null;
      if (requestedScope && !selectedScope) return freeze({ ok: false, reason: "invalid_source_scope" });
      const scopedText = selectedScope ? sourceText.slice(selectedScope.start, selectedScope.end) : sourceText;
      const sourceId = `source_golden_${hash.sha256(`${input.source_path}:${selectedScope ? selectedScope.scope_id : "full"}`).slice(0, 24)}`;
      const scope = analysisScope.createAnalysisScope({
        source_id: sourceId, source_path: input.source_path,
        content_hash: hash.sha256(scopedText), source_text: scopedText,
      });
      const manifest = chunkManifest.createChunkManifest(scope);
      const packs = packCount(manifest.chunks, limits);
      return freeze({
        ok: true, source_path: input.source_path, source_text: scopedText,
        source_hash: sourceHash, source_id: sourceId,
        source_bytes: new TextEncoder().encode(scopedText).length,
        chunks: manifest.chunks.length, packs,
        scope: selectedScope ? rangeRecord(selectedScope) : null,
        scopes: packs > MAX_DIRECT_PACKS
          ? flattenRanges(selectedScope ? selectedScope.children || [] : rangeTree) : [],
        range_tree: packs > MAX_DIRECT_PACKS
          ? (selectedScope ? selectedScope.children || [] : rangeTree) : [],
      });
    }
    async function run(input) {
      notify("preflight");
      const prepared = await preflight(input);
      if (!prepared.ok) return prepared;
      if (prepared.packs > MAX_DIRECT_PACKS) {
        return freeze({
          ok: false, status: "scope_required",
          reason: prepared.scope ? "selected_range_too_large" : "large_source_scope_required",
          source_bytes: prepared.source_bytes, chunks: prepared.chunks,
          packs: prepared.packs, scopes: prepared.scopes, range_tree: prepared.range_tree,
          provider_calls: 0, canonical_writes: 0, source_writes: 0,
        });
      }
      notify("planning", { packs: prepared.packs, chunks: prepared.chunks });
      const planned = await runPlan(prepared.source_path, {
        ...(prepared.scope ? { scope: prepared.scope } : {}),
        expected_source_hash: prepared.source_hash,
      });
      if (!planned || planned.ok !== true) return freeze({ ...(planned || {}), ok: false, stage: "planning" });
      notify("compiling", { pages: planned.pages || 0 });
      const compiled = await compilePlan();
      if (!compiled || compiled.ok !== true) return freeze({ ...(compiled || {}), ok: false, stage: "compiling" });
      const composed = composeFinalDocument(getDocuments(), prepared.source_path);
      if (!composed) return freeze({ ok: false, reason: "compiled_documents_unavailable", stage: "compiling", preview_writes: 0, receipt_writes: 0 });
      const { document, partition } = composed;
      if (partition.missing_claim_ids.length || partition.unexpected_claim_ids.length || partition.duplicate_claim_ids.length) {
        return freeze({
          ok: false, status: "review_required", reason: "claim_partition_incomplete", stage: "gating",
          claim_partition: partition, gate_calls: 0, preview_writes: 0, receipt_writes: 0,
          canonical_writes: 0, source_writes: 0,
        });
      }
      notify("gating", { documents: 1 });
      const sourceFile = vault.getAbstractFileByPath(prepared.source_path);
      const fullSourceText = sourceFile ? await vault.cachedRead(sourceFile) : "";
      if (hash.sha256(fullSourceText) !== prepared.source_hash) {
        return freeze({ ok: false, reason: "source_revision_changed", stage: "gating", provider_calls: 0, gate_calls: 0, preview_writes: 0, receipt_writes: 0, canonical_writes: 0, source_writes: 0 });
      }
      const documentText = renderDocument(document, prepared.source_path);
      const evaluated = gate.evaluate({
        source_text: prepared.source_text,
        document_text: documentText,
        source_path: prepared.source_path,
      });
      if (!evaluated.ok) {
        return freeze({
          ok: false, status: "review_required", reason: "golden_gate_failed", stage: "gating",
          title: document.title, issues: evaluated.issues, metrics: evaluated.metrics,
          claim_partition: partition, gate_calls: 1, preview_writes: 0, receipt_writes: 0,
          provider_calls: Number(planned.map_provider_calls || 0), canonical_writes: 0, source_writes: 0,
        });
      }
      const operationId = /^[0-9a-f]{64}$/u.test(text(input && input.operation_id))
        ? text(input.operation_id)
        : hash.sha256(stable({
          source_path: prepared.source_path,
          source_revision: prepared.source_hash,
          scope: prepared.scope || null,
          orchestrator_version: VERSION,
        }));
      const artifact = artifactApi.createPreviewArtifact({
        operation_id: operationId,
        orchestrator_version: VERSION,
        gate_receipt_hash: evaluated.receipt.receipt_hash,
        source: {
          source_id: prepared.source_id,
          source_path: prepared.source_path,
          source_revision: prepared.source_hash,
          source_text: fullSourceText,
        },
        scope: prepared.scope || null,
        document,
        document_bytes: documentText,
        refresh_context: input && input.refresh_context || null,
      });
      notify("saving", { documents: 1 });
      const scopedClaimIds = partition.final_claim_ids;
      const orchestrationReceipt = {
        orchestrator_version: VERSION,
        document_path: artifact.document_path,
        source_path: prepared.source_path,
        source_revision: prepared.source_hash,
        scope: prepared.scope || null,
        source_bytes: prepared.source_bytes,
        chunk_count: prepared.chunks,
        pack_count: prepared.packs,
        scoped_claim_ids: scopedClaimIds,
        gate_receipt_hash: evaluated.receipt.receipt_hash,
      };
      const receipt = {
        ...evaluated,
        ...artifact.receipt,
        ...orchestrationReceipt,
        artifact_receipt_hash: artifact.receipt.receipt_hash,
        orchestration_receipt_hash: hash.sha256(stable(orchestrationReceipt)),
      };
      await ensureParent(artifact.document_path);
      const previewWrites = await writeExact(artifact.document_path, documentText) ? 1 : 0;
      const receiptWrites = await writeExact(artifact.receipt_path, `${JSON.stringify(receipt, null, 2)}\n`) ? 1 : 0;
      const row = freeze({
        title: safeTitle(publicationText(document.title)),
        artifact_id: artifact.artifact_id,
        document_path: artifact.document_path,
        receipt_path: artifact.receipt_path,
        refresh_context: artifact.receipt.refresh_context,
        status: evaluated.status,
        metrics: evaluated.metrics,
      });
      notify("complete", { documents: 1 });
      return freeze({
        ok: true, status: "publishable_preview", source_path: prepared.source_path,
        source_hash: prepared.source_hash, source_bytes: prepared.source_bytes,
        chunks: prepared.chunks, packs: prepared.packs, previews: [row], claim_partition: partition,
        gate_calls: 1, preview_writes: previewWrites, receipt_writes: receiptWrites,
        provider_calls: Number(planned.map_provider_calls || 0)
          + Number(planned.plan_provider_calls || 0)
          + Number(compiled.provider_calls || 0),
        canonical_writes: 0, source_writes: 0,
      });
    }
    return freeze({ preflight, run });
  }

  const api = freeze({ VERSION, MAX_DIRECT_PACKS, packCount, headingRangeTree, headingScopes, flattenRanges, publicationText, renderDocument, mergeTopicDocuments, create });
  root.LLMWikiGoldenWikiOrchestrator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
