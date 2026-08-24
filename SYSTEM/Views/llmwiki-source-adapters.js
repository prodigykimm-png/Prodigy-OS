(function (root) {
  "use strict";

  const hashApi = root.LLMWikiHash || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  const lineageApi = root.LLMWikiSourceLineage || (typeof require === "function" ? require("./llmwiki-source-lineage.js") : null);

  const SNAPSHOT_VERSION = "llmwiki_source_adapter_snapshot_v1";
  const FIXTURE_REVISION = "llmwiki_source_adapters_fixture_v1";
  const DEFAULT_MAX_SOURCE_BYTES = 1024 * 1024;
  const DEFAULT_MAX_RECORD_NODES = 10000;
  const MAX_DEPTH = 32;
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;
  const HASH = /^[0-9a-f]{64}$/u;
  const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;
  const SUPPORTED_SOURCE_KINDS = Object.freeze([
    "markdown", "plain_text", "current_note", "current_selection", "saved_web_snapshot",
    "text_layer_pdf", "transcript", "reading_session", "daily_evidence", "knowledge_candidate",
  ]);
  const ACQUISITION_KINDS = Object.freeze(["url"]);
  const UNSUPPORTED_SOURCE_KINDS = new Set(["raw_ocr", "ocr", "audio", "video", "email", "chat"]);
  const EXTRACTORS = Object.freeze({
    markdown: ["extractor_markdown", "1.0.0", "text/markdown"],
    plain_text: ["extractor_plain_text", "1.0.0", "text/plain"],
    current_note: ["extractor_current_note", "1.0.0", "text/markdown"],
    current_selection: ["extractor_current_selection", "1.0.0", "text/plain"],
    saved_web_snapshot: ["extractor_saved_web", "1.0.0", "text/html"],
    text_layer_pdf: ["extractor_pdf_text_layer", "1.0.0", "application/pdf"],
    transcript: ["extractor_transcript_text", "1.0.0", "text/plain"],
    reading_session: ["extractor_reading_session", "1.0.0", "application/json"],
    daily_evidence: ["extractor_daily_evidence", "1.0.0", "application/json"],
    knowledge_candidate: ["extractor_knowledge_candidate", "1.0.0", "application/json"],
  });
  const sourceBrands = new WeakSet();
  const snapshotBrands = new WeakSet();
  const transportTasks = new WeakMap();

  function plain(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype) return true;
    const parent = Object.getPrototypeOf(prototype);
    const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor");
    return parent === null && constructor && Object.hasOwn(constructor, "value")
      && typeof constructor.value === "function" && constructor.value.name === "Object";
  }
  function trim(value) { return typeof value === "string" ? value.trim().normalize("NFC") : ""; }
  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Array.isArray(value) ? value : Object.values(value)) deepFreeze(child);
    return value;
  }
  function stable(value) {
    if (value === undefined) return "null";
    if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function sha256(value) {
    if (value instanceof Uint8Array && lineageApi && typeof lineageApi.sha256 === "function") return lineageApi.sha256(value);
    if (!hashApi || typeof hashApi.sha256 !== "function") throw new Error("hash_unavailable");
    return hashApi.sha256(String(value));
  }
  function utf8Length(value) { return new TextEncoder().encode(value).length; }
  function codeError(code) { const error = new TypeError(code); error.code = code; return error; }
  function counters(attempts, successes) {
    return { source: 0, archive: 0, canonical: 0, network: successes, network_attempts: attempts, network_successes: successes };
  }

  function cloneParsedData(value, limits, state, depth) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw codeError("non_data_input");
      return value;
    }
    if (typeof value !== "object" || depth > MAX_DEPTH) throw codeError(depth > MAX_DEPTH ? "resource_limit" : "non_data_input");
    if (state.seen.has(value)) throw codeError("cyclic_input");
    if (!Array.isArray(value) && !plain(value)) throw codeError("non_data_input");
    state.nodes += 1;
    if (state.nodes > limits.max_record_nodes) throw codeError("resource_limit");
    state.seen.add(value);
    const output = Array.isArray(value) ? [] : {};
    for (const key of Object.keys(value)) output[key] = cloneParsedData(value[key], limits, state, depth + 1);
    state.seen.delete(value);
    return output;
  }

  function parseJsonData(serialized, limits) {
    if (typeof serialized !== "string") return { ok: false, reason: "serialized_payload_required" };
    const envelopeLimit = Math.min(DEFAULT_MAX_SOURCE_BYTES * 2, limits.max_source_bytes + 65536);
    if (utf8Length(serialized) > envelopeLimit) return { ok: false, reason: "source_too_large" };
    let parsed;
    try { parsed = JSON.parse(serialized); } catch (_error) { return { ok: false, reason: "malformed_serialized_payload" }; }
    try {
      const value = cloneParsedData(parsed, limits, { seen: new Set(), nodes: 0 }, 0);
      return plain(value) ? { ok: true, value } : { ok: false, reason: "malformed_input" };
    } catch (error) { return { ok: false, reason: error && error.code || "non_data_input" }; }
  }

  function recovery(reason, field, action, attempts = 0, successes = 0) {
    const selectedAction = action || (reason === "source_too_large" || reason === "resource_limit" ? "reduce_source"
      : reason === "network_consent_required" ? "grant_network_consent"
        : reason === "transport_required" || reason === "transport_failed" ? "configure_transport"
          : reason === "stale_extractor_revision" || reason === "stale_source_revision" ? "refresh_source"
            : reason === "source_extraction_aborted" || reason === "consent_revoked" ? "retry_extraction"
              : reason === "unsupported_source_kind" || reason === "binary_input" || reason === "malformed_pdf" ? "install_extractor" : "repair_source");
    return deepFreeze({
      ok: false, status: "extractor_required", state: "extractor_required", field: field || "source", reason,
      recovery: { action: selectedAction, retryable: true }, recovery_actions: [selectedAction], writer_count: 0,
      network_attempts: attempts, network_successes: successes, write_counters: counters(attempts, successes),
    });
  }
  function parsedSuccess(value) { return deepFreeze({ ok: true, value }); }
  function createTransportTask(executor) {
    if (typeof executor !== "function") throw new TypeError("transport_task_executor_required");
    const task = new Promise((resolve, reject) => executor(resolve, reject));
    const handle = Object.freeze(Object.create(null));
    transportTasks.set(handle, task);
    return handle;
  }
  function snapshotSuccess(value) {
    snapshotBrands.add(value);
    deepFreeze(value);
    return deepFreeze({ ok: true, status: "ready", state: "ready", value });
  }

  function parseSourcePayload(serialized, options = {}) {
    const maxBytes = Number.isSafeInteger(options.max_source_bytes) && options.max_source_bytes > 0
      ? Math.min(options.max_source_bytes, DEFAULT_MAX_SOURCE_BYTES) : DEFAULT_MAX_SOURCE_BYTES;
    const parsed = parseJsonData(serialized, { max_source_bytes: maxBytes, max_record_nodes: DEFAULT_MAX_RECORD_NODES });
    if (!parsed.ok) return recovery(parsed.reason, "source");
    sourceBrands.add(parsed.value);
    return parsedSuccess(deepFreeze(parsed.value));
  }

  function sourceInput(value, settings) {
    if (value && typeof value === "object" && sourceBrands.has(value)) return { ok: true, value };
    const parsed = parseJsonData(value, settings);
    if (!parsed.ok) return parsed;
    sourceBrands.add(parsed.value);
    deepFreeze(parsed.value);
    return parsed;
  }

  function normalizedKind(value) {
    const kind = trim(value).toLocaleLowerCase("en-US").replace(/[ -]+/gu, "_");
    return ({
      markdown_file: "markdown", text: "plain_text", plain: "plain_text", note: "current_note",
      selection: "current_selection", web_snapshot: "saved_web_snapshot", saved_url_snapshot: "saved_web_snapshot",
      pdf_text_layer: "text_layer_pdf", pdf_text: "text_layer_pdf", transcript_text: "transcript",
    })[kind] || kind;
  }
  function sourceReference(input) {
    if (!lineageApi || typeof lineageApi.validateSourceReference !== "function") return recovery("lineage_unavailable", "source_reference");
    const result = lineageApi.validateSourceReference({ source_path: input.source_path || input.path, source_url: input.source_url });
    return result && result.ok === false ? recovery(result.reason, result.field) : result.value;
  }
  function sourceBytes(value) {
    if (value === undefined || value === null) return null;
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => !Number.isSafeInteger(item) || item < 0 || item > 255)) return false;
    return Uint8Array.from(value);
  }
  function validText(value) { return typeof value === "string" && value.length > 0; }
  function nonText(value) {
    if (typeof value !== "string" || !value.trim()) return true;
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)) return true;
    const characters = [...value];
    const replacements = characters.filter((character) => character === "\ufffd").length;
    if (replacements > Math.floor(characters.length * 0.01)) return true;
    return !/[\p{L}\p{N}]/u.test(value);
  }
  function decodeText(value) {
    if (!value) return null;
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(value); }
    catch (_error) { return recovery("binary_input", "source_bytes"); }
    return nonText(text) ? recovery("binary_input", "source_bytes") : text;
  }
  function ascii(value, start, end) {
    let output = "";
    for (let index = start; index < end; index += 1) output += String.fromCharCode(value[index]);
    return output;
  }
  function validPdf(value) {
    if (!(value instanceof Uint8Array) || value.length < 16) return false;
    const header = ascii(value, 0, Math.min(value.length, 10));
    if (!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r\n|\r|\n)/u.test(header)) return false;
    const tail = ascii(value, Math.max(0, value.length - 32), value.length);
    return /(?:\r\n|\r|\n)%%EOF(?:\r\n|\r|\n)?$/u.test(tail);
  }
  function contentHashFor(input, bytes, text) {
    const actual = bytes ? sha256(bytes) : sha256(text);
    const supplied = trim(input.content_hash);
    if (supplied && (!HASH.test(supplied) || supplied !== actual)) return recovery("content_hash_mismatch", "content_hash");
    return supplied || actual;
  }
  function recordFor(input) {
    if (plain(input.record)) return input.record;
    const controls = new Set([
      "source_kind", "kind", "source_path", "path", "source_url", "source_bytes", "raw_bytes", "content_hash",
      "modified_revision", "extractor_version", "expected_extractor_revision", "expected_source_revision", "current_source_revision",
      "privacy_class", "provider_eligibility", "consent", "instructions",
    ]);
    return Object.fromEntries(Object.entries(input).filter(([key]) => !controls.has(key)));
  }
  function textForRecord(input, kind) {
    const record = recordFor(input);
    if (kind === "reading_session" && trim(record.type) !== "reading_session") return recovery("invalid_reading_session", "record.type");
    if (kind === "daily_evidence" && !trim(record.evidence_id)) return recovery("invalid_daily_evidence", "record.evidence_id");
    if (kind === "knowledge_candidate" && (trim(record.type) !== "knowledge_candidate" || !trim(record.candidate_id))) return recovery("invalid_knowledge_candidate", "record");
    return stable(record);
  }
  function selectedText(input) {
    if (!plain(input.selection)) return recovery("malformed_selection", "selection");
    const { start, end, text } = input.selection;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || !validText(text)) return recovery("invalid_selection", "selection");
    if (validText(input.text) && (end > input.text.length || input.text.slice(start, end) !== text)) return recovery("selection_mismatch", "selection");
    return { text, start, end };
  }
  function locatorFor(input, kind, reference, selection) {
    const base = reference.source_path || reference.source_url;
    const record = recordFor(input);
    if (kind === "current_selection") return `${base}#selection=${selection.start}-${selection.end}`;
    if (kind === "daily_evidence") return `${base}#evidence=${trim(record.evidence_id)}`;
    if (kind === "knowledge_candidate") return `${base}#candidate=${trim(record.candidate_id)}`;
    if (kind === "reading_session" && trim(record.session_id)) return `${base}#session=${trim(record.session_id)}`;
    return base;
  }
  function metadataFor(input, selection) {
    const record = recordFor(input);
    let requestedUrl = null;
    if (trim(input.requested_url)) {
      const normalized = sourceReference({ source_url: input.requested_url });
      if (normalized && normalized.ok === false) return normalized;
      requestedUrl = normalized.source_url;
    }
    return {
      title: trim(input.title || record.title || record.book_title) || null,
      requested_url: requestedUrl, fetched_at: trim(input.fetched_at) || null,
      evidence_id: trim(record.evidence_id) || null, candidate_id: trim(record.candidate_id) || null,
      session_id: trim(record.session_id) || null,
      page_count: Number.isSafeInteger(input.page_count) && input.page_count > 0 ? input.page_count : null,
      selection: selection ? { start: selection.start, end: selection.end } : null,
    };
  }

  function normalizeLocal(input, settings, networkAttempts, networkSuccesses) {
    const kind = normalizedKind(input.source_kind || input.kind || input.type);
    if (UNSUPPORTED_SOURCE_KINDS.has(kind) || !SUPPORTED_SOURCE_KINDS.includes(kind)) return recovery("unsupported_source_kind", "source_kind", null, networkAttempts, networkSuccesses);
    if (trim(input.expected_source_revision) && trim(input.current_source_revision) && trim(input.expected_source_revision) !== trim(input.current_source_revision)) {
      return recovery("stale_source_revision", "expected_source_revision", null, networkAttempts, networkSuccesses);
    }
    const reference = sourceReference(input);
    if (reference && reference.ok === false) return recovery(reference.reason, reference.field, null, networkAttempts, networkSuccesses);
    const extractor = EXTRACTORS[kind];
    const bytesValue = sourceBytes(input.source_bytes !== undefined ? input.source_bytes : input.raw_bytes);
    if (bytesValue === false) return recovery("malformed_source_bytes", "source_bytes", null, networkAttempts, networkSuccesses);
    if (bytesValue && bytesValue.byteLength > settings.max_source_bytes) return recovery("source_too_large", "source_bytes", null, networkAttempts, networkSuccesses);

    let text;
    let selection = null;
    if (["reading_session", "daily_evidence", "knowledge_candidate"].includes(kind)) text = textForRecord(input, kind);
    else if (kind === "current_selection") {
      selection = selectedText(input);
      if (selection && selection.ok === false) return selection;
      text = selection.text;
    } else if (kind === "text_layer_pdf") text = input.extracted_text || input.text_layer || input.text;
    else if (kind === "transcript") text = input.transcript_text || input.extracted_text || input.text;
    else if (kind === "saved_web_snapshot") text = input.extracted_text || input.text;
    else text = input.text;
    if (text && text.ok === false) return text;
    if (!validText(text) && bytesValue && kind !== "text_layer_pdf") text = decodeText(bytesValue);
    if (text && text.ok === false) return text;
    if (!validText(text) || !text.trim()) return recovery(kind === "text_layer_pdf" ? "text_layer_required" : "source_text_required", "text", null, networkAttempts, networkSuccesses);
    if (nonText(text)) return recovery("non_text_payload", "text", null, networkAttempts, networkSuccesses);
    if (utf8Length(text) > settings.max_source_bytes) return recovery("source_too_large", "text", null, networkAttempts, networkSuccesses);
    if (kind === "text_layer_pdf" && !bytesValue) return recovery("source_bytes_required", "source_bytes", null, networkAttempts, networkSuccesses);
    if (kind === "text_layer_pdf" && !validPdf(bytesValue)) return recovery("malformed_pdf", "source_bytes", null, networkAttempts, networkSuccesses);
    if (kind === "saved_web_snapshot" && trim(input.fetched_at) && !Number.isFinite(Date.parse(trim(input.fetched_at)))) return recovery("invalid_fetched_at", "fetched_at", null, networkAttempts, networkSuccesses);

    const contentHash = contentHashFor(input, bytesValue, text);
    if (contentHash && contentHash.ok === false) return contentHash;
    const extractorVersion = trim(input.extractor_version) || extractor[1];
    if (!VERSION.test(extractorVersion)) return recovery("invalid_extractor_version", "extractor_version", null, networkAttempts, networkSuccesses);
    const extractorRevision = sha256(stable({ extractor_id: extractor[0], extractor_version: extractorVersion, source_kind: kind }));
    if (input.expected_extractor_revision !== undefined && trim(input.expected_extractor_revision) !== extractorRevision) return recovery("stale_extractor_revision", "expected_extractor_revision", null, networkAttempts, networkSuccesses);
    const locator = locatorFor(input, kind, reference, selection);
    const suppliedSourceId = trim(input.source_id);
    if (suppliedSourceId && !ID.test(suppliedSourceId)) return recovery("invalid_source_id", "source_id", null, networkAttempts, networkSuccesses);
    const sourceId = suppliedSourceId || `source_${sha256(stable({ kind, locator })).slice(0, 24)}`;
    const modifiedRevision = trim(input.modified_revision) || `content_${contentHash.slice(0, 24)}`;
    const metadata = metadataFor(input, selection);
    if (metadata && metadata.ok === false) return metadata;
    const snapshotBody = {
      source: { source_id: sourceId, source_kind: kind, source_path: reference.source_path, source_url: reference.source_url, media_kind: extractor[2], modified_revision: modifiedRevision },
      content: { text, source_length: text.length, content_hash: contentHash, text_hash: sha256(text), locator },
      extractor: { extractor_id: extractor[0], extractor_version: extractorVersion, extractor_revision: extractorRevision }, metadata,
    };
    return snapshotSuccess({
      snapshot_version: SNAPSHOT_VERSION, snapshot_id: `source_snapshot_${sha256(stable(snapshotBody)).slice(0, 24)}`,
      ...snapshotBody, source_data_untrusted: true, write_counters: counters(networkAttempts, networkSuccesses),
    });
  }

  function snapshotInput(value) {
    if (value && typeof value === "object" && snapshotBrands.has(value)) return { ok: true, value };
    return parseJsonData(value, { max_source_bytes: DEFAULT_MAX_SOURCE_BYTES * 2, max_record_nodes: DEFAULT_MAX_RECORD_NODES });
  }
  function validateSourceSnapshot(value) {
    const bounded = snapshotInput(value);
    if (!bounded.ok) return recovery(bounded.reason, "snapshot");
    const snapshot = bounded.value;
    const exact = (item, expected) => plain(item) && Object.keys(item).length === expected.length && expected.every((key) => Object.hasOwn(item, key));
    if (!exact(snapshot, ["snapshot_version", "snapshot_id", "source", "content", "extractor", "metadata", "source_data_untrusted", "write_counters"])) return recovery("invalid_snapshot_schema", "snapshot");
    if (snapshot.snapshot_version !== SNAPSHOT_VERSION || !/^source_snapshot_[0-9a-f]{24}$/u.test(snapshot.snapshot_id)) return recovery("invalid_snapshot_identity", "snapshot");
    if (!exact(snapshot.source, ["source_id", "source_kind", "source_path", "source_url", "media_kind", "modified_revision"])
      || !ID.test(trim(snapshot.source.source_id)) || !SUPPORTED_SOURCE_KINDS.includes(snapshot.source.source_kind)) return recovery("invalid_snapshot_source", "source");
    const reference = sourceReference(snapshot.source);
    if (reference && reference.ok === false) return reference;
    if (!exact(snapshot.content, ["text", "source_length", "content_hash", "text_hash", "locator"])
      || !validText(snapshot.content.text) || snapshot.content.source_length !== snapshot.content.text.length
      || !HASH.test(snapshot.content.content_hash) || snapshot.content.text_hash !== sha256(snapshot.content.text) || !trim(snapshot.content.locator)) return recovery("invalid_snapshot_content", "content");
    if (!exact(snapshot.extractor, ["extractor_id", "extractor_version", "extractor_revision"])
      || !ID.test(trim(snapshot.extractor.extractor_id)) || !VERSION.test(trim(snapshot.extractor.extractor_version)) || !HASH.test(snapshot.extractor.extractor_revision)) return recovery("invalid_snapshot_extractor", "extractor");
    if (!exact(snapshot.metadata, ["title", "requested_url", "fetched_at", "evidence_id", "candidate_id", "session_id", "page_count", "selection"])
      || !exact(snapshot.write_counters, ["source", "archive", "canonical", "network", "network_attempts", "network_successes"])
      || snapshot.source_data_untrusted !== true || snapshot.write_counters.source !== 0 || snapshot.write_counters.archive !== 0
      || snapshot.write_counters.canonical !== 0 || !Number.isSafeInteger(snapshot.write_counters.network_attempts)
      || !Number.isSafeInteger(snapshot.write_counters.network_successes) || snapshot.write_counters.network !== snapshot.write_counters.network_successes) return recovery("invalid_snapshot_policy", "snapshot");
    const body = { source: snapshot.source, content: snapshot.content, extractor: snapshot.extractor, metadata: snapshot.metadata };
    if (snapshot.snapshot_id !== `source_snapshot_${sha256(stable(body)).slice(0, 24)}`) return recovery("invalid_snapshot_identity", "snapshot_id");
    return parsedSuccess(snapshot);
  }

  function ownDataValue(value, key) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return undefined;
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch (_error) { return undefined; }
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  }
  function consentState(policy) {
    if (!policy || typeof policy !== "object") return null;
    const consent = policy.consent;
    const provider = policy.provider_consent;
    const source = policy.source_consent;
    if (!plain(consent) || consent.granted !== true || !trim(consent.revision)
      || !plain(provider) || provider.granted !== true || !trim(provider.revision)
      || !plain(source) || source.granted !== true || !trim(source.revision)) return null;
    return stable({ consent: trim(consent.revision), provider: trim(provider.revision), source: trim(source.revision) });
  }
  function bindingToken(value) {
    if (value && value.ok === true && value.value) value = value.value;
    if (!value) return null;
    const source = value.source || {};
    const extractor = value.extractor || {};
    return stable({
      snapshot_id: trim(value.snapshot_id), modified_revision: trim(source.modified_revision || value.modified_revision),
      extractor_id: trim(extractor.extractor_id || value.extractor_id), extractor_version: trim(extractor.extractor_version || value.extractor_version),
      extractor_revision: trim(value.extractor_revision || extractor.extractor_revision),
    });
  }

  function createSourceAdapters(options = {}) {
    const suppliedMaxBytes = ownDataValue(options, "max_source_bytes");
    const suppliedMaxNodes = ownDataValue(options, "max_record_nodes");
    const settings = {
      max_source_bytes: Number.isSafeInteger(suppliedMaxBytes) && suppliedMaxBytes > 0 && suppliedMaxBytes <= DEFAULT_MAX_SOURCE_BYTES ? suppliedMaxBytes : DEFAULT_MAX_SOURCE_BYTES,
      max_record_nodes: Number.isSafeInteger(suppliedMaxNodes) && suppliedMaxNodes > 0 && suppliedMaxNodes <= DEFAULT_MAX_RECORD_NODES ? suppliedMaxNodes : DEFAULT_MAX_RECORD_NODES,
    };
    const transportOption = ownDataValue(options, "transport");
    const transport = typeof transportOption === "function" ? transportOption
      : transportOption && typeof ownDataValue(transportOption, "fetch") === "function" ? ownDataValue(transportOption, "fetch").bind(transportOption) : null;
    const readerOption = ownDataValue(options, "getCurrentSourceSnapshot");
    const registry = ownDataValue(options, "registry");
    const revisionReader = typeof readerOption === "function" ? readerOption
      : registry && typeof registry.listSnapshots === "function" ? sourceId => {
        const values = registry.listSnapshots(sourceId);
        return Array.isArray(values) && values.length ? values[values.length - 1] : null;
      } : null;

    async function readBinding(sourceId) {
      if (!revisionReader) return { ok: true, token: null };
      try { return { ok: true, token: bindingToken(await revisionReader(sourceId)) }; }
      catch (_error) { return { ok: false, result: recovery("source_revision_unavailable", "source_revision") }; }
    }
    async function unchanged(sourceId, token, attempts, successes) {
      const current = await readBinding(sourceId);
      if (!current.ok) return current.result;
      return current.token === token ? null : recovery("stale_source_revision", "source_revision", null, attempts, successes);
    }

    async function extract(rawInput, policy = {}) {
      const bounded = sourceInput(rawInput, settings);
      if (!bounded.ok) return recovery(bounded.reason, "source");
      const input = bounded.value;
      const kind = normalizedKind(input.source_kind || input.kind || input.type);
      const reference = sourceReference(kind === "url" ? { source_url: input.source_url } : input);
      if (reference && reference.ok === false) return reference;
      const sourceId = trim(input.source_id) || `source_${sha256(stable({ kind, locator: reference.source_path || reference.source_url })).slice(0, 24)}`;
      const initialBinding = await readBinding(sourceId);
      if (!initialBinding.ok) return initialBinding.result;

      if (kind !== "url") {
        const result = normalizeLocal(input, settings, 0, 0);
        if (!result.ok) return result;
        const stale = await unchanged(sourceId, initialBinding.token, 0, 0);
        return stale || result;
      }

      const initialConsent = consentState(policy);
      if (!initialConsent) return recovery("network_consent_required", "consent");
      if (!transport) return recovery("transport_required", "transport");
      const signal = policy && policy.signal;
      let aborted = Boolean(signal && signal.aborted);
      let settleAbort;
      const abortOutcome = new Promise(resolve => { settleAbort = resolve; });
      const onAbort = () => { aborted = true; settleAbort({ kind: "aborted" }); };
      if (signal && typeof signal.addEventListener === "function") signal.addEventListener("abort", onAbort, { once: true });
      if (aborted) {
        if (signal && typeof signal.removeEventListener === "function") signal.removeEventListener("abort", onAbort);
        return recovery("source_extraction_aborted", "signal");
      }

      const attempts = 1;
      const request = Object.freeze({
        source_url: reference.source_url, max_bytes: settings.max_source_bytes,
        consent: Object.freeze({ revision: initialConsent }), signal: signal || null,
      });
      let handle;
      try { handle = transport(request); }
      catch (_error) {
        if (signal && typeof signal.removeEventListener === "function") signal.removeEventListener("abort", onAbort);
        return recovery("transport_failed", "transport", null, attempts, 0);
      }
      if ((!handle || (typeof handle !== "object" && typeof handle !== "function")) || !transportTasks.has(handle)) {
        if (signal && typeof signal.removeEventListener === "function") signal.removeEventListener("abort", onAbort);
        return recovery("transport_handle_required", "transport", null, attempts, 0);
      }
      const transportWork = transportTasks.get(handle).then(
        value => ({ kind: "success", value }),
        error => ({ kind: "failure", error }),
      );
      const outcome = await Promise.race([transportWork, abortOutcome]);
      if (signal && typeof signal.removeEventListener === "function") signal.removeEventListener("abort", onAbort);
      if (aborted || outcome.kind === "aborted") return recovery("source_extraction_aborted", "signal", null, attempts, 0);
      if (outcome.kind === "failure") return recovery("transport_failed", "transport", null, attempts, 0);
      const successes = 1;
      if (consentState(policy) !== initialConsent) return recovery("consent_revoked", "consent", null, attempts, successes);
      const staleBeforeParse = await unchanged(sourceId, initialBinding.token, attempts, successes);
      if (staleBeforeParse) return staleBeforeParse;
      const fetchedBoundary = sourceInput(outcome.value, settings);
      if (!fetchedBoundary.ok) return recovery(fetchedBoundary.reason, "transport", null, attempts, successes);
      const fetched = fetchedBoundary.value;
      const result = normalizeLocal({
        ...fetched, source_kind: "saved_web_snapshot", source_url: fetched.source_url || reference.source_url,
        requested_url: fetched.requested_url || reference.source_url, source_id: input.source_id,
        modified_revision: input.modified_revision, expected_extractor_revision: input.expected_extractor_revision,
        expected_source_revision: input.expected_source_revision, current_source_revision: input.current_source_revision,
      }, settings, attempts, successes);
      if (!result.ok) return result;
      if (aborted || (signal && signal.aborted)) return recovery("source_extraction_aborted", "signal", null, attempts, successes);
      if (consentState(policy) !== initialConsent) return recovery("consent_revoked", "consent", null, attempts, successes);
      const staleAtReturn = await unchanged(sourceId, initialBinding.token, attempts, successes);
      return staleAtReturn || result;
    }

    return deepFreeze({ extract, validateSourceSnapshot });
  }

  async function extractSourceSnapshot(input, options = {}) {
    const adapters = ownDataValue(options, "adapters") || options;
    const context = ownDataValue(options, "context") || options;
    return createSourceAdapters(adapters).extract(input, context);
  }

  const api = deepFreeze({
    SNAPSHOT_VERSION, FIXTURE_REVISION, DEFAULT_MAX_SOURCE_BYTES, DEFAULT_MAX_RECORD_NODES,
    SUPPORTED_SOURCE_KINDS, ACQUISITION_KINDS, parseSourcePayload, createTransportTask,
    createSourceAdapters, createSourceAdapter: createSourceAdapters,
    extractSourceSnapshot, extract: extractSourceSnapshot, adaptSource: extractSourceSnapshot,
    validateSourceSnapshot, validateSnapshot: validateSourceSnapshot, stable,
  });
  root.LLMWikiSourceAdapters = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
