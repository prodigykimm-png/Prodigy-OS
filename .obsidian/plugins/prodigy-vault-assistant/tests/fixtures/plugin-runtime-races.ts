import type { RuntimeStatus } from "../../src/active-document";
import { commitGuardedAnswer, createRuntimeStatusSource } from "../../src/mentions";

export function labeledRuntimeStatuses(): readonly RuntimeStatus[] {
  let emit: (value: unknown) => void = () => undefined;
  const source = createRuntimeStatusSource({
    getStatus: () => ({
      status: "ready",
      adapters: 1,
      in_flight: 0,
      provider_label: "On-device provider",
      model_label: "Vault model v2",
    }),
    subscribeStatus: (listener) => {
      emit = listener;
      return () => undefined;
    },
  });
  const statuses: RuntimeStatus[] = [];
  source.subscribe((status) => statuses.push(status));
  emit({ status: "unavailable", provider_label: "On-device provider" });
  return statuses;
}

export function actualRuntimeStatuses(): readonly RuntimeStatus[] {
  let emit: (event: unknown) => void = () => undefined;
  const source = createRuntimeStatusSource({
    getStatus: () => ({ status: "ready", adapters: 1, in_flight: 0 }),
    subscribeStatus: (listener) => {
      emit = listener;
      return () => undefined;
    },
  });
  const statuses: RuntimeStatus[] = [];
  source.subscribe((status) => statuses.push(status));
  emit({
    request_id: "request-1",
    consumer_id: "vault.assistant",
    status: "running",
    queue_ms: 0,
  });
  return statuses;
}

export async function answerRaceEffects(): Promise<readonly string[]> {
  let finish: (value: string) => void = () => undefined;
  let markStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const answer = new Promise<string>((resolve) => {
    finish = resolve;
  });
  let generation = 7;
  const effects: string[] = [];
  const pending = commitGuardedAnswer({
    capturedGeneration: 7,
    currentGeneration: () => generation,
    answer: () => {
      markStarted();
      return answer;
    },
    prepare: async (value) => value,
    persist: async (value) => value,
    apply: (value) => effects.push(value),
  });
  await started;
  generation += 1;
  finish("late answer");
  await pending;
  return effects;
}

export async function preparationRaceEffects(): Promise<readonly string[]> {
  let generation = 3;
  let release: () => void = () => undefined;
  let markPreparing: () => void = () => undefined;
  const preparing = new Promise<void>((resolve) => {
    markPreparing = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const effects: string[] = [];
  const pending = commitGuardedAnswer({
    capturedGeneration: 3,
    currentGeneration: () => generation,
    answer: async () => "answer",
    prepare: async () => {
      markPreparing();
      await gate;
      return "exchange";
    },
    persist: async () => {
      effects.push("persist");
      return "history";
    },
    apply: () => effects.push("result"),
  });
  await preparing;
  generation += 1;
  release();
  await pending;
  return effects;
}

export async function persistenceRaceEffects(): Promise<readonly string[]> {
  let generation = 9;
  let release: () => void = () => undefined;
  let markPersisting: () => void = () => undefined;
  const persisting = new Promise<void>((resolve) => {
    markPersisting = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const effects: string[] = [];
  const pending = commitGuardedAnswer({
    capturedGeneration: 9,
    currentGeneration: () => generation,
    answer: async () => "answer",
    prepare: async () => "exchange",
    persist: async (_exchange, isCurrent) => {
      markPersisting();
      await gate;
      if (!isCurrent()) return null;
      effects.push("persist");
      return "history";
    },
    apply: () => effects.push("result"),
  });
  await persisting;
  generation += 1;
  release();
  await pending;
  return effects;
}
