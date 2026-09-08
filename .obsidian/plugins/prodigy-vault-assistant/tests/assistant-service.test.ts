import { describe, expect, test } from "bun:test";
import { AssistantService } from "../src/assistant-service";
import { VaultRetriever } from "../src/vault-retriever";
import {
  chunk,
  FakeRetriever,
  FakeRuntime,
  identity,
  input,
  partialCoverage,
  retrievalResult,
  success,
} from "./fixtures/assistant-service";
import { FakePort, file, mention } from "./fixtures/retrieval";

describe("assistant orchestration", () => {
  test.each([
    ["current_document", { path: "INBOX/live.md", content: "unsaved" }],
    ["whole_vault", null],
  ] as const)(
    "answers a %s scope with one retrieval and one runtime call",
    async (mode, currentDocument) => {
      const retriever = new FakeRetriever();
      const runtime = new FakeRuntime();
      const service = new AssistantService({ retriever, runtime });

      const result = await service.answer(input({ scope: { mode, currentDocument } }));

      expect(retriever.calls).toHaveLength(1);
      expect(runtime.calls).toHaveLength(1);
      expect(Object.isFrozen(runtime.calls[0]?.chunks)).toBe(true);
      expect(Object.isFrozen(runtime.calls[0]?.chunks[0]?.revision)).toBe(true);
      expect(retriever.calls[0]?.mode).toBe(mode);
      expect(retriever.calls[0]?.currentDocument).toEqual(currentDocument);
      expect(result.state).toBe("answered");
    },
  );

  test("propagates the successful runtime receipt unchanged", async () => {
    const receipt = Object.freeze({
      providerLabel: "configured",
      modelLabel: "local",
      routeClass: "local",
    });
    const runtime = new FakeRuntime((request) => Promise.resolve({ ...success(request), receipt }));
    const service = new AssistantService({ retriever: new FakeRetriever(), runtime });

    const result = await service.answer(input());

    expect(result.state).toBe("answered");
    if (result.state === "answered") expect(result.receipt).toBe(receipt);
  });

  test("keeps runtime receipt with partial coverage", async () => {
    const receipt = Object.freeze({
      providerLabel: "configured",
      modelLabel: "local",
      routeClass: "local",
    });
    const retriever = new FakeRetriever(() =>
      Promise.resolve(retrievalResult([chunk], partialCoverage)),
    );
    const runtime = new FakeRuntime((request) => Promise.resolve({ ...success(request), receipt }));
    const service = new AssistantService({ retriever, runtime });

    const result = await service.answer(input());

    expect(result.state).toBe("partial");
    if (result.state === "partial") {
      expect(result.coverage).toEqual(partialCoverage);
      expect(result.receipt).toBe(receipt);
    }
  });

  test("answers a follow-up only from freshly retrieved evidence", async () => {
    const retriever = new FakeRetriever();
    const runtime = new FakeRuntime();
    const service = new AssistantService({ retriever, runtime });

    const result = await service.answer(input());

    expect(retriever.calls[0]?.question).toBe(
      "지난 대화의 사람은 민수였다.\n그 사람과 언제 마셨지?",
    );
    expect(runtime.calls[0]?.question).toBe("그 사람과 언제 마셨지?");
    expect(runtime.calls[0]?.dialogue).toEqual([
      { role: "assistant", text: "지난 대화의 사람은 민수였다." },
    ]);
    expect(result).toMatchObject({
      state: "answered",
      sources: [{ path: "Daily/2026-09-01.md", revision: chunk.revision }],
    });
  });

  test("uses only a self-contained current question for retrieval despite contaminated dialogue", async () => {
    const contents = {
      "DAILY/2026-09-04.md": "# 2026-09-04\n민수와 OO홀 촬영 일정을 금요일 오전으로 확정했다.",
      "HUB/경매-탐색-code.md":
        "# 확인 요약\n" +
        "함께 방법 장소 현재 초안 내용을 확인해 줘 ".repeat(10) +
        "\n\n# 현재 초안 내용을 확인해 줘 함께 요약 방법 장소 지난 대화 답변\n" +
        "현재 초안 답변을 함께 요약해 줘 ".repeat(10),
      "HUB/지역-명령-code.md":
        "# 방법 장소\n" +
        "확인 요약 함께 방법 장소 지난 대화 답변을 확인해 줘 ".repeat(10) +
        "\n\n# 지난 대화 내용을 함께 확인해 줘 현재 초안 요약 방법 장소 답변\n" +
        "지난 대화 내용을 함께 확인해 줘 ".repeat(10),
      "OO홀.md": "# OO홀\nOO홀은 자연광이 좋은 촬영 장소다.",
      "People/민수.md": "# 민수\n민수는 금요일 촬영 준비를 맡고 조명 장비를 확인한다.",
      "Projects/금요일-촬영-일정.md": "# 공통 일정\n금요일 촬영 일정 체크리스트를 준비한다.",
      "촬영법.md": "# 촬영법\nOO홀 촬영은 50mm 렌즈와 확산광을 사용한다.",
    } as const;
    const runtime = new FakeRuntime();
    const service = new AssistantService({
      retriever: new VaultRetriever(
        new FakePort({ files: Object.keys(contents).map((path) => file(path)), contents }),
      ),
      runtime,
    });

    await service.answer(
      input({
        question: "민수의 금요일 촬영 일정은?",
        mentions: [mention("촬영법.md")],
        scope: {
          mode: "whole_vault",
          currentDocument: {
            path: "OO홀.md",
            content: "# OO홀\n현재 초안 촬영 계획.\n\n# 주의\nOO홀 촬영 방법과 장소를 확인한다.",
          },
        },
        dialogue: [
          { role: "user", text: "현재 초안 내용을 확인해 줘" },
          { role: "assistant", text: "현재 초안을 확인했습니다." },
          { role: "user", text: "OO홀 촬영 방법은?" },
          { role: "assistant", text: "OO홀 장소와 촬영법을 함께 확인했습니다." },
          { role: "user", text: "OO홀 장소와 촬영법을 함께 요약해 줘" },
          { role: "assistant", text: "OO홀 장소와 촬영법을 함께 확인했습니다." },
        ],
      }),
    );

    expect(runtime.calls[0]?.chunks.map(({ path }) => path)).toEqual(
      expect.arrayContaining(["People/민수.md", "DAILY/2026-09-04.md"]),
    );
  });

  test("does not add dialogue to a self-contained retrieval query", async () => {
    const retriever = new FakeRetriever();
    const service = new AssistantService({ retriever, runtime: new FakeRuntime() });

    await service.answer(
      input({
        question: "민수의 금요일 촬영 일정은?",
        dialogue: [
          { role: "user", text: "OO홀 촬영법을 요약해 줘" },
          { role: "assistant", text: "이전 촬영 대화입니다." },
        ],
      }),
    );

    expect(retriever.calls[0]?.question).toBe("민수의 금요일 촬영 일정은?");
  });

  test("does not call runtime with no evidence", async () => {
    const retriever = new FakeRetriever(() => Promise.resolve(retrievalResult([])));
    const runtime = new FakeRuntime();
    const service = new AssistantService({ retriever, runtime });

    const result = await service.answer(input());

    expect(result).toEqual({
      state: "no_evidence",
      operationId: identity.operationId.value,
      coverage: retrievalResult([]).coverage,
    });
    expect(runtime.calls).toHaveLength(0);
  });

  test("does not treat dialogue as evidence when fresh retrieval is empty", async () => {
    const retriever = new FakeRetriever(() => Promise.resolve(retrievalResult([])));
    const runtime = new FakeRuntime();
    const service = new AssistantService({ retriever, runtime });

    const result = await service.answer(
      input({ dialogue: [{ role: "assistant", text: "민수와 금요일에 마셨다." }] }),
    );

    expect(result.state).toBe("no_evidence");
    expect(runtime.calls).toHaveLength(0);
  });

  test("preserves partial coverage on a validated answer", async () => {
    const retriever = new FakeRetriever(() =>
      Promise.resolve(retrievalResult([chunk], partialCoverage)),
    );
    const service = new AssistantService({ retriever, runtime: new FakeRuntime() });

    const result = await service.answer(input());

    expect(result).toMatchObject({ state: "partial", coverage: partialCoverage });
  });

  test("bounds recent dialogue before retrieval and runtime", async () => {
    const dialogue = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `${index}:${"x".repeat(1_000)}`,
    }));
    const retriever = new FakeRetriever();
    const runtime = new FakeRuntime();
    const service = new AssistantService({ retriever, runtime });

    await service.answer(input({ dialogue }));

    expect(runtime.calls[0]?.dialogue.length).toBeLessThanOrEqual(6);
    expect(JSON.stringify(runtime.calls[0]?.dialogue).length).toBeLessThanOrEqual(4_300);
    expect(retriever.calls[0]?.question).not.toContain("0:");
    expect(retriever.calls[0]?.question).toContain("9:");
  });
});
