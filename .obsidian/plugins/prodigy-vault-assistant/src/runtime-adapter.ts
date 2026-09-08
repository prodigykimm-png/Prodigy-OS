import {
  answerSchema,
  type CitationMap,
  freezeCitationMap,
  validateCitations,
} from "./citation-validation";
import type {
  RuntimeApiPort,
  RuntimeConsumerManifest,
  RuntimeIdentity,
  RuntimePort,
  RuntimeReceipt,
  RuntimeSubmitInput,
  RuntimeSubmitResult,
  RuntimeTransportRequest,
} from "./contracts";

export const CONSUMER_MANIFEST = Object.freeze({
  schema_version: 1,
  consumer_id: "vault.assistant",
  contract_version: 1,
  capability: "structured-strict",
  sensitivity: "highly-private",
  route_policy: "local-preferred",
  consent_cadence: "standing-grant-with-explicit-action",
  background_allowed: false,
  max_input_bytes: 65_536,
  max_output_bytes: 131_072,
  max_schema_bytes: 32_768,
  timeout_ms: 60_000,
} as const satisfies RuntimeConsumerManifest);

export type RuntimeAdapterOptions = {
  readonly getPlugin: (id: string) => { readonly api: RuntimeApiPort } | null;
  readonly createId?: () => string;
};
type UnknownRecord = { readonly [key: string]: unknown };
type Discovery =
  | { readonly ok: true; readonly api: RuntimeApiPort; readonly epoch: string }
  | { readonly ok: false };
type PreparedRequest = {
  readonly request: RuntimeTransportRequest;
  readonly citations: CitationMap;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function createIdentity(createId: () => string): RuntimeIdentity {
  return Object.freeze({
    consumerId: Object.freeze({ kind: "consumer_id", value: "vault.assistant" }),
    sessionId: Object.freeze({ kind: "session_id", value: createId() }),
    operationId: Object.freeze({ kind: "operation_id", value: createId() }),
    attemptId: Object.freeze({ kind: "attempt_id", value: createId() }),
  });
}
export function nextAttempt(identity: RuntimeIdentity, createId: () => string): RuntimeIdentity {
  return Object.freeze({
    ...identity,
    attemptId: Object.freeze({ kind: "attempt_id", value: createId() }),
  });
}
function unavailable(): RuntimeSubmitResult {
  return { ok: false, code: "runtime_unavailable", recovery: { action: "settings" } };
}
function invalid(): RuntimeSubmitResult {
  return { ok: false, code: "invalid_response", recovery: { action: "retry" } };
}
function discover(options: RuntimeAdapterOptions): Discovery {
  const plugin = options.getPlugin("prodigy-ai-runtime");
  if (!plugin) return { ok: false };
  let handshake: unknown;
  let status: unknown;
  try {
    handshake = plugin.api.getHandshake();
    status = plugin.api.getStatus();
  } catch {
    return { ok: false };
  }
  if (!isRecord(handshake) || !isRecord(status)) return { ok: false };
  const protocol = handshake["protocol_version"];
  const capabilities = handshake["capabilities"];
  if (
    handshake["plugin_id"] !== "prodigy-ai-runtime" ||
    typeof protocol !== "string" ||
    protocol.split(".")[0] !== "1" ||
    handshake["consumer_manifest_range"] !== ">=1 <2" ||
    typeof handshake["runtime_epoch"] !== "string" ||
    !Array.isArray(capabilities) ||
    !capabilities.includes("structured-strict") ||
    status["status"] !== "ready"
  )
    return { ok: false };
  return { ok: true, api: plugin.api, epoch: handshake["runtime_epoch"] };
}
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right, "en"));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function requestId(identity: RuntimeIdentity): Promise<string> {
  return sha256(
    stable({
      attempt_id: identity.attemptId.value,
      consumer_id: identity.consumerId.value,
      operation_id: identity.operationId.value,
      owner_session_id: identity.sessionId.value,
    }),
  );
}
function mapFailure(code: string): RuntimeSubmitResult {
  if (/^(cancelled_confirmed|cancel_requested)$/u.test(code))
    return { ok: false, code: "cancelled", recovery: { action: "cancel" } };
  if (/^(rate_limited|quota_exhausted|model_unavailable|route_unreachable)$/u.test(code))
    return { ok: false, code: "provider_error", recovery: { action: "later" } };
  if (
    /^(configuration_missing|secret_missing|executable_missing|login_required|consent_required|runtime_unavailable|protocol_mismatch|capability_unavailable)$/u.test(
      code,
    )
  )
    return unavailable();
  return { ok: false, code: "provider_error", recovery: { action: "retry" } };
}
function parseReceipt(value: unknown, attemptId: string): RuntimeReceipt | null {
  if (
    !isRecord(value) ||
    value["consumer_id"] !== "vault.assistant" ||
    value["attempt_id"] !== attemptId ||
    typeof value["provider_key"] !== "string" ||
    typeof value["model"] !== "string" ||
    typeof value["route_class"] !== "string"
  )
    return null;
  return {
    providerLabel: value["provider_key"],
    modelLabel: value["model"],
    routeClass: value["route_class"],
  };
}
async function prepare(input: RuntimeSubmitInput): Promise<PreparedRequest | null> {
  const id = await requestId(input.identity);
  const opaqueIds = await Promise.all(
    input.chunks.map((_, index) =>
      sha256(`${id}:${index}`).then((hash) => `cite-${hash.slice(0, 16)}`),
    ),
  );
  const evidence = input.chunks.map((chunk, index) => ({
    id: opaqueIds[index] ?? "",
    text: chunk.text,
  }));
  if (new TextEncoder().encode(JSON.stringify(evidence)).byteLength > 8_192) return null;
  const prompt = JSON.stringify({
    question: input.question,
    context: [
      { kind: "dialogue_context", evidence: false, messages: input.dialogue },
      { kind: "vault_evidence", frozen: true, chunks: evidence },
    ],
  });
  return Object.freeze({
    request: Object.freeze({
      protocol_version: "1.0.0",
      consumer_id: "vault.assistant",
      owner_session_id: input.identity.sessionId.value,
      operation_id: input.identity.operationId.value,
      attempt_id: input.identity.attemptId.value,
      request_id: id,
      consumer_manifest: CONSUMER_MANIFEST,
      prompt,
      schema: answerSchema(opaqueIds),
    }),
    citations: freezeCitationMap(input.chunks, opaqueIds),
  });
}
function parseCompleted(
  raw: UnknownRecord,
  prepared: PreparedRequest,
  identity: RuntimeIdentity,
): RuntimeSubmitResult {
  if (raw["protocol_version"] !== "1.0.0" || raw["request_id"] !== prepared.request.request_id)
    return invalid();
  if (raw["status"] !== "completed")
    return mapFailure(typeof raw["error_code"] === "string" ? raw["error_code"] : "provider_error");
  const payload = raw["payload"];
  const metadata = parseReceipt(raw["receipt"], prepared.request.attempt_id);
  if (!isRecord(payload) || Object.keys(payload).some((key) => key !== "blocks") || !metadata)
    return invalid();
  const validated = validateCitations(payload["blocks"], prepared.citations);
  if (!validated.ok) return invalid();
  return {
    ok: true,
    identity,
    blocks: validated.blocks,
    citations: validated.citations,
    receipt: metadata,
  };
}
export function createRuntimeAdapter(options: RuntimeAdapterOptions): RuntimePort {
  return Object.freeze({
    createIdentity: () => createIdentity(options.createId ?? (() => crypto.randomUUID())),
    submit: async (input: RuntimeSubmitInput): Promise<RuntimeSubmitResult> => {
      const runtime = discover(options);
      if (!runtime.ok) return unavailable();
      const prepared = await prepare(input);
      if (!prepared) return invalid();
      if (input.signal.aborted) {
        await runtime.api.cancel(prepared.request.request_id);
        return { ok: false, code: "cancelled", recovery: { action: "cancel" } };
      }
      const marker = Symbol("aborted");
      let abort: () => void = () => undefined;
      const cancellation = new Promise<typeof marker>((resolve) => {
        abort = () => {
          void runtime.api.cancel(prepared.request.request_id);
          resolve(marker);
        };
        input.signal.addEventListener("abort", abort, { once: true });
      });
      const raw = await Promise.race([
        runtime.api.requestStructured(prepared.request),
        cancellation,
      ]);
      input.signal.removeEventListener("abort", abort);
      if (raw === marker || input.signal.aborted)
        return { ok: false, code: "cancelled", recovery: { action: "cancel" } };
      if (!isRecord(raw) || raw["runtime_epoch"] !== runtime.epoch) return invalid();
      return parseCompleted(raw, prepared, input.identity);
    },
  });
}
