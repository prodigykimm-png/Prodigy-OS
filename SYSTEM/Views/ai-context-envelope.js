(function (root) {
  "use strict";

  const MAX_BYTES = 8192;
  const MAX_SNAPSHOT_ENTRIES = 20;
  const ENVELOPE_KEYS = Object.freeze(["workspace", "tab", "selection", "snapshot", "citations", "locale"]);
  const SELECTION_KEYS = Object.freeze(["path", "type", "title"]);
  const SNAPSHOT_KEYS = Object.freeze(["key", "value"]);
  const FORBIDDEN_CONTEXT_KEY = /^(?:body|content|raw|raw_body|file_body|prompt|messages?|transcript|api[_-]?key|secret|secret_storage|secretStorage|token|authorization)$/i;
  const SECRET_ID = /(?:secretStorage|prodigy-[a-z0-9-]*(?:api-key|token|secret|client-id))/i;
  const SECRET_MATERIAL = /(?:\bBearer\s+\S+|(?:sk|AIza|ghp|xox[baprs])[-_][A-Za-z0-9_-]{8,}|FAKE[_-]?SECRET|TEST[_-]?SECRET)/i;

  if (typeof require === "function" && !root.ProdigyWorkspaceRegistry) {
    root.ProdigyWorkspaceRegistry = require("./workspace-registry.js");
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasExactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
  }

  function isVaultRelativePath(value) {
    if (typeof value !== "string" || !value || value.includes("\\") || /[\r\n\0]/.test(value)) return false;
    if (value.startsWith("/") || /^[A-Za-z]:\//.test(value)) return false;
    return value.split("/").every((part) => part && part !== "." && part !== "..");
  }

  function cloneSafeValue(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(cloneSafeValue);
    if (!isPlainObject(value)) throw new Error("표시된 Property 값은 JSON 데이터여야 합니다.");
    const copy = {};
    Object.keys(value).forEach((key) => {
      if (FORBIDDEN_CONTEXT_KEY.test(key)) throw new Error("비밀 또는 본문 필드는 context에 허용되지 않습니다.");
      copy[key] = cloneSafeValue(value[key]);
    });
    return copy;
  }

  function containsSecretReference(value) {
    if (typeof value === "string") return SECRET_ID.test(value) || SECRET_MATERIAL.test(value);
    if (Array.isArray(value)) return value.some(containsSecretReference);
    if (!isPlainObject(value)) return false;
    return Object.keys(value).some((key) => FORBIDDEN_CONTEXT_KEY.test(key) || containsSecretReference(value[key]));
  }

  function byteLength(value) {
    const serialized = JSON.stringify(value);
    if (typeof TextEncoder === "function") return new TextEncoder().encode(serialized).length;
    if (typeof Buffer !== "undefined") return Buffer.byteLength(serialized, "utf8");
    return unescape(encodeURIComponent(serialized)).length;
  }

  function buildContextEnvelope(input) {
    if (!hasExactKeys(input, ENVELOPE_KEYS)) throw new Error("ContextEnvelope에 허용되지 않은 필드가 있습니다.");
    const registry = root.ProdigyWorkspaceRegistry;
    if (typeof input.workspace !== "string" || !registry || typeof registry.find !== "function" || !registry.find(input.workspace)) {
      throw new Error("등록된 작업공간 id를 사용해 주세요.");
    }
    if (input.tab !== null && typeof input.tab !== "string") throw new Error("tab은 문자열 또는 null이어야 합니다.");
    if (containsSecretReference(input.tab)) throw new Error("비밀 또는 API 키 자료는 context에 허용되지 않습니다.");
    if (input.selection !== null && !hasExactKeys(input.selection, SELECTION_KEYS)) {
      throw new Error("selection은 path, type, title 필드만 가져야 합니다.");
    }
    if (input.selection !== null) {
      if (!isVaultRelativePath(input.selection.path)) throw new Error("selection path는 Vault 상대 경로여야 합니다.");
      if (typeof input.selection.type !== "string" || typeof input.selection.title !== "string") {
        throw new Error("selection의 type과 title은 문자열이어야 합니다.");
      }
      if (Object.values(input.selection).some(containsSecretReference)) {
        throw new Error("비밀 또는 API 키 자료는 context에 허용되지 않습니다.");
      }
    }
    if (!Array.isArray(input.snapshot) || input.snapshot.length > MAX_SNAPSHOT_ENTRIES) {
      throw new Error("snapshot은 최대 20개의 표시된 Property 쌍만 포함할 수 있습니다.");
    }
    const snapshot = input.snapshot.map((entry) => {
      if (!hasExactKeys(entry, SNAPSHOT_KEYS) || typeof entry.key !== "string") {
        throw new Error("snapshot 항목은 key와 value만 가져야 합니다.");
      }
      if (FORBIDDEN_CONTEXT_KEY.test(entry.key) || containsSecretReference(entry.key) || containsSecretReference(entry.value)) {
        throw new Error("비밀 또는 본문 Property는 context에 허용되지 않습니다.");
      }
      return { key: entry.key, value: cloneSafeValue(entry.value) };
    });
    if (!Array.isArray(input.citations) || !input.citations.every(isVaultRelativePath)) {
      throw new Error("citations는 Vault 상대 경로만 포함해야 합니다.");
    }
    if (input.citations.some(containsSecretReference)) throw new Error("비밀 또는 API 키 자료는 context에 허용되지 않습니다.");
    if (input.locale !== "ko") throw new Error("locale은 ko여야 합니다.");

    const envelope = {
      workspace: input.workspace,
      tab: input.tab,
      selection: input.selection === null ? null : {
        path: input.selection.path,
        type: input.selection.type,
        title: input.selection.title
      },
      snapshot,
      citations: input.citations.slice(),
      locale: "ko"
    };
    while (byteLength(envelope) > MAX_BYTES && envelope.snapshot.length) {
      envelope.snapshot.shift();
      envelope.truncated = true;
    }
    if (byteLength(envelope) > MAX_BYTES) {
      throw new Error("현재 선택 정보가 8 KiB를 초과합니다. 선택을 줄인 뒤 다시 시도해 주세요.");
    }
    return envelope;
  }

  function validateContextEnvelope(input) {
    if (hasExactKeys(input, ENVELOPE_KEYS)) return buildContextEnvelope(input);
    if (!hasExactKeys(input, ENVELOPE_KEYS.concat("truncated")) || input.truncated !== true) {
      throw new Error("ContextEnvelope에 허용되지 않은 필드가 있습니다.");
    }
    const base = {};
    ENVELOPE_KEYS.forEach((key) => { base[key] = input[key]; });
    const validated = buildContextEnvelope(base);
    if (validated.truncated === true) throw new Error("전송할 ContextEnvelope가 8 KiB를 초과합니다.");
    validated.truncated = true;
    if (byteLength(validated) > MAX_BYTES) throw new Error("전송할 ContextEnvelope가 8 KiB를 초과합니다.");
    return validated;
  }

  const api = Object.freeze({ MAX_BYTES, MAX_SNAPSHOT_ENTRIES, buildContextEnvelope, validateContextEnvelope });
  root.AIContextEnvelope = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
