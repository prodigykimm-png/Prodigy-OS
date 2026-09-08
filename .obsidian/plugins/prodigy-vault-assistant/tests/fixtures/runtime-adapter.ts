import type { AnswerBlock, RuntimeApiPort, RuntimeTransportRequest } from "../../src/contracts";
import { createRuntimeAdapter } from "../../src/runtime-adapter";

export const expectedManifest = {
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
} as const;

export const revision = {
  algorithm: "sha256",
  hash: "a".repeat(64),
  capturedAt: 1,
} as const;
export const chunks = [
  {
    id: "People/민수.md#만남:10-14",
    sourceId: "source-1",
    status: "stale",
    path: "People/민수.md",
    heading: "만남",
    startLine: 10,
    endLine: 14,
    text: "민수와 금요일에 술을 마셨다.",
    revision,
  },
] as const;
export const statusChunks = (["current", "stale", "missing"] as const).map((status, index) => ({
  ...chunks[0],
  id: `path-bearing-${index}`,
  status,
}));

export function blocksFor(citationId: string): readonly AnswerBlock[] {
  return [{ kind: "paragraph", text: "금요일에 민수와 만났습니다.", citationIds: [citationId] }];
}

export function completed(request: RuntimeTransportRequest) {
  const citationId = request.prompt.match(/"id":"([^"]+)"/u)?.[1] ?? "missing-citation";
  return {
    protocol_version: "1.0.0",
    runtime_epoch: "epoch-1",
    request_id: request.request_id,
    status: "completed",
    payload: { blocks: blocksFor(citationId) },
    receipt: {
      consumer_id: "vault.assistant",
      attempt_id: request.attempt_id,
      provider_key: "local-runtime",
      model: "configured-model",
      route_class: "local",
    },
  } as const;
}

type RuntimeOverrides = {
  readonly getHandshake?: () => unknown;
  readonly getStatus?: () => unknown;
  readonly cancel?: (requestId: string) => unknown;
};

export function fakeRuntime(
  requests: RuntimeTransportRequest[],
  respond?: (request: RuntimeTransportRequest) => Promise<unknown>,
  overrides: RuntimeOverrides = {},
): RuntimeApiPort {
  return {
    getHandshake:
      overrides.getHandshake ??
      (() => ({
        plugin_id: "prodigy-ai-runtime",
        runtime_version: "0.2.0",
        protocol_version: "1.0.0",
        consumer_manifest_range: ">=1 <2",
        runtime_epoch: "epoch-1",
        capabilities: ["chat-text", "structured-strict"],
      })),
    getStatus: overrides.getStatus ?? (() => ({ status: "ready", adapters: 1, in_flight: 0 })),
    requestStructured: (request) => {
      requests.push(request);
      return (respond ?? ((value) => Promise.resolve(completed(value))))(request);
    },
    cancel: overrides.cancel ?? (() => Promise.resolve({ status: "cancel_requested" })),
  };
}

export function adapterFor(
  api: RuntimeApiPort | null,
  ids = ["session-1", "operation-1", "attempt-1"],
) {
  let index = 0;
  return createRuntimeAdapter({
    getPlugin: (id) => (id === "prodigy-ai-runtime" && api ? { api } : null),
    createId: () => ids[index++] ?? `generated-${index}`,
  });
}
