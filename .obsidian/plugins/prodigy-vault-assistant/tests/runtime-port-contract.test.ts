import { expect, test } from "bun:test";
import type {
  ResolvedCitation,
  RuntimeApiPort,
  RuntimeConsumerManifest,
  RuntimeIdentity,
  RuntimePort,
  RuntimeSubmitResult,
  RuntimeTransportRequest,
} from "../src/contracts";

const manifest: RuntimeConsumerManifest = {
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
};
const identity: RuntimeIdentity = {
  consumerId: { kind: "consumer_id", value: "vault.assistant" },
  sessionId: { kind: "session_id", value: "session" },
  operationId: { kind: "operation_id", value: "operation" },
  attemptId: { kind: "attempt_id", value: "attempt" },
};
type CitationWithRequiredStatus =
  Omit<ResolvedCitation, "status"> extends ResolvedCitation ? never : ResolvedCitation;

const citations = [
  {
    status: "current",
    id: "source-current",
    path: "current.md",
    startLine: 1,
    endLine: 2,
    revision: { algorithm: "sha256", hash: "current-revision", capturedAt: 1 },
    locator: "[[current]]",
  },
  {
    status: "stale",
    id: "source-stale",
    path: "stale.md",
    startLine: 3,
    endLine: 5,
    revision: { algorithm: "sha256", hash: "stale-revision", capturedAt: 1 },
    locator: "[[stale]]",
  },
  {
    status: "missing",
    id: "source-missing",
    path: "missing.md",
    startLine: 8,
    endLine: 13,
    revision: { algorithm: "sha256", hash: "missing-revision", capturedAt: 1 },
    locator: "[[missing]]",
  },
] as const satisfies readonly CitationWithRequiredStatus[];
const transportRequest: RuntimeTransportRequest = {
  protocol_version: "1.0.0",
  consumer_id: "vault.assistant",
  owner_session_id: identity.sessionId.value,
  operation_id: identity.operationId.value,
  attempt_id: identity.attemptId.value,
  request_id: "request",
  consumer_manifest: manifest,
  prompt: "prompt",
  schema: {},
};
const runtimeApi: RuntimeApiPort = {
  getHandshake: () => ({ protocol_version: "1.0.0" }),
  getStatus: () => ({ status: "ready" }),
  requestStructured: async (request) => ({ request_id: request.request_id }),
  cancel: (requestId) => ({ request_id: requestId }),
};
const success: RuntimeSubmitResult = {
  ok: true,
  identity,
  blocks: [{ kind: "paragraph", text: "Answer", citationIds: citations.map(({ id }) => id) }],
  citations,
  receipt: { providerLabel: "Local", modelLabel: "Grounded", routeClass: "local" },
};
const runtimePort: RuntimePort = {
  createIdentity: () => identity,
  submit: async () => success,
};

test("represents runtime handshake, transport, recovery, and resolved citations", async () => {
  const submitted = await runtimeApi.requestStructured(transportRequest);
  const result = await runtimePort.submit({
    identity: runtimePort.createIdentity(),
    question: "Question",
    dialogue: [],
    chunks: [],
    signal: new AbortController().signal,
  });
  const failure: RuntimeSubmitResult = {
    ok: false,
    code: "runtime_unavailable",
    recovery: { action: "settings" },
  };

  expect(runtimeApi.getHandshake()).toEqual({ protocol_version: "1.0.0" });
  expect(submitted).toEqual({ request_id: "request" });
  expect(transportRequest.consumer_manifest).toEqual(manifest);
  expect(result).toEqual(success);
  expect(result.ok && result.citations.map(({ status }) => status)).toEqual([
    "current",
    "stale",
    "missing",
  ]);
  expect(failure.recovery.action).toBe("settings");
});
