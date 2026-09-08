import { expect, test } from "bun:test";
import { type AssistantResult, assertNever, type Coverage } from "../src/contracts";

type AnsweredResult = Extract<AssistantResult, { readonly state: "answered" }>;
type PartialResult = Extract<AssistantResult, { readonly state: "partial" }>;
type AnsweredWithRequiredReceipt = "receipt" extends keyof AnsweredResult
  ? Omit<AnsweredResult, "receipt"> extends AnsweredResult
    ? never
    : AnsweredResult
  : never;
type PartialWithRequiredReceipt = "receipt" extends keyof PartialResult
  ? Omit<PartialResult, "receipt"> extends PartialResult
    ? never
    : PartialResult
  : never;
type RecoverableError = Extract<
  AssistantResult,
  { readonly state: "error"; readonly recovery: unknown }
>;
type ErrorWithRequiredRecovery = "recovery" extends keyof RecoverableError
  ? Omit<RecoverableError, "recovery"> extends RecoverableError
    ? never
    : RecoverableError
  : never;

const completeCoverage = {
  status: "complete",
  filesConsidered: 1,
  filesRead: 1,
} as const satisfies Coverage;
const partialCoverage = {
  status: "partial",
  filesConsidered: 2,
  filesRead: 1,
  issues: [{ path: "offloaded.md", reason: "unreadable" }],
} as const satisfies Coverage;
const results = [
  {
    state: "answered",
    operationId: "answered-operation",
    blocks: [],
    sources: [],
    coverage: completeCoverage,
    receipt: {
      providerLabel: "Answer Provider",
      modelLabel: "Answer Model",
      routeClass: "local",
    },
  } as const satisfies AnsweredWithRequiredReceipt,
  {
    state: "partial",
    operationId: "partial-operation",
    blocks: [],
    sources: [],
    coverage: partialCoverage,
    receipt: {
      providerLabel: "Partial Provider",
      modelLabel: "Partial Model",
      routeClass: "remote",
    },
  } as const satisfies PartialWithRequiredReceipt,
  {
    state: "error",
    operationId: "settings-operation",
    code: "runtime_unavailable",
    message: "runtime_unavailable",
    recovery: { action: "settings" },
  } as const satisfies ErrorWithRequiredRecovery,
  {
    state: "error",
    operationId: "retry-operation",
    code: "provider_error",
    message: "provider_error",
    recovery: { action: "retry" },
  } as const satisfies ErrorWithRequiredRecovery,
  {
    state: "error",
    operationId: "later-operation",
    code: "provider_error",
    message: "provider_error",
    recovery: { action: "later" },
  } as const satisfies ErrorWithRequiredRecovery,
  {
    state: "error",
    operationId: "read-operation",
    code: "read_error",
    message: "read_error",
  } as const satisfies AssistantResult,
] as const;

function observableMetadata(result: AssistantResult): readonly string[] {
  switch (result.state) {
    case "answered":
    case "partial":
      return [
        "runtime_success",
        result.state,
        result.receipt.providerLabel,
        result.receipt.modelLabel,
        result.receipt.routeClass,
      ];
    case "error":
      switch (result.code) {
        case "runtime_unavailable":
        case "provider_error":
        case "invalid_response":
          return ["runtime_error", result.code, result.recovery.action];
        case "read_error":
          return ["local_error", result.code];
        default:
          return assertNever(result);
      }
    case "idle":
    case "retrieving":
    case "answering":
    case "no_evidence":
    case "cancelled":
      return ["no_runtime_data", result.state];
    default:
      return assertNever(result);
  }
}

test("projects canonical metadata from each runtime-backed result variant", () => {
  expect(results.map(observableMetadata)).toEqual([
    ["runtime_success", "answered", "Answer Provider", "Answer Model", "local"],
    ["runtime_success", "partial", "Partial Provider", "Partial Model", "remote"],
    ["runtime_error", "runtime_unavailable", "settings"],
    ["runtime_error", "provider_error", "retry"],
    ["runtime_error", "provider_error", "later"],
    ["local_error", "read_error"],
  ]);
});
