import type { RuntimeReceipt } from "../../src/contracts";

export const runtimeReceipt = {
  providerLabel: "local-runtime",
  modelLabel: "configured-model-v2",
  routeClass: "local",
} as const satisfies RuntimeReceipt;
