import { describe, expect, test } from "bun:test";
import { tokenize } from "../src/retrieval-ranking";
import { VaultRetriever } from "../src/vault-retriever";
import { FakePort, file, mention } from "./fixtures/retrieval";

describe("Korean retrieval ranking", () => {
  test("returns People and Daily evidence for a particle-suffixed person schedule query", async () => {
    const contents = {
      "DAILY/2026-09-04.md": "# 2026-09-04\n민수와 OO홀 촬영 일정을 금요일 오전으로 확정했다.",
      "HUB/스튜디오-브리핑.md": "금요일 촬영 일정 공통 브리핑을 준비하고 금요일 담당자를 지정한다.",
      "PARA/공용-장비.md": "금요일 촬영 일정에 필요한 공용 장비를 금요일마다 점검한다.",
      "People/민수.md": "# 민수\n민수는 금요일 촬영 준비를 맡고 조명 장비를 확인한다.",
      "Projects/현장-체크리스트.md": "금요일 촬영 일정 체크리스트를 금요일마다 갱신한다.",
      "Reference/운영-가이드.md": "금요일 촬영 일정 운영 가이드를 금요일마다 정리한다.",
      "ZETA/강제-멘션.md": "분기별 세금 신고 자료이며 촬영과 무관하다.",
    } as const;
    const question = "민수의 금요일 촬영 일정은?";
    const port = new FakePort({
      files: Object.keys(contents).map((path) => file(path)),
      contents,
    });

    const result = await new VaultRetriever(port).retrieve({
      mode: "whole_vault",
      question,
      mentions: [mention("ZETA/강제-멘션.md")],
      currentDocument: null,
      signal: new AbortController().signal,
    });
    const evidenceIdentities = JSON.parse(result.envelope).chunks.map(
      (chunk: { readonly path: string }) => chunk.path,
    );

    expect(evidenceIdentities).toEqual(
      expect.arrayContaining(["People/민수.md", "DAILY/2026-09-04.md"]),
    );
    expect(tokenize(question)).toEqual(expect.arrayContaining(["민수", "일정"]));
    expect(evidenceIdentities[0]).toBe("ZETA/강제-멘션.md");
    expect(result.chunks).toHaveLength(6);
  });

  test("keeps Daily when three stronger files each have a second chunk", async () => {
    const contents = {
      "DAILY/2026-09-04.md": "# 2026-09-04\n민수와 OO홀 촬영 일정을 금요일 오전으로 확정했다.",
      "OO홀.md":
        "# OO홀\n금요일 촬영 일정의 현재 장소다.\n\n# 주의\n금요일 촬영 일정에는 역광을 피한다.",
      "People/민수.md":
        "# 민수\n민수는 금요일 촬영 준비를 맡는다.\n\n# 장비\n민수는 금요일 촬영 조명을 확인한다.",
      "촬영법.md":
        "# 촬영법\n금요일 촬영 일정에는 50mm 렌즈를 쓴다.\n\n# 노출\n금요일 촬영 일정에는 노출을 고정한다.",
    } as const;
    const result = await new VaultRetriever(
      new FakePort({ files: Object.keys(contents).map((path) => file(path)), contents }),
    ).retrieve({
      mode: "whole_vault",
      question: "민수의 금요일 촬영 일정은?",
      mentions: [mention("OO홀.md")],
      currentDocument: null,
      signal: new AbortController().signal,
    });
    const evidenceIdentities = JSON.parse(result.envelope).chunks.map(
      (chunk: { readonly path: string }) => chunk.path,
    );

    expect(evidenceIdentities).toEqual([
      "OO홀.md",
      "OO홀.md",
      "People/민수.md",
      "촬영법.md",
      "People/민수.md",
      "DAILY/2026-09-04.md",
    ]);
    expect(result.chunks).toHaveLength(6);
    expect(
      Math.max(
        ...evidenceIdentities.map(
          (path: string) => evidenceIdentities.filter((item: string) => item === path).length,
        ),
      ),
    ).toBe(2);
  });

  test("preserves title then path then body weighting", async () => {
    const contents = {
      "A/우선.md": "무관한 본문",
      "우선/B.md": "무관한 본문",
      "Z/C.md": "우선",
    } as const;
    const result = await new VaultRetriever(
      new FakePort({ files: Object.keys(contents).map((path) => file(path)), contents }),
    ).retrieve({
      mode: "whole_vault",
      question: "우선",
      mentions: [],
      currentDocument: null,
      signal: new AbortController().signal,
    });

    expect(result.chunks.map((chunk) => chunk.path)).toEqual(["A/우선.md", "우선/B.md", "Z/C.md"]);
  });

  test("does not strip lexical endings from short Korean words", () => {
    expect(tokenize("회의 지은 가을 서울 마늘 하늘")).toEqual([
      "회의",
      "지은",
      "가을",
      "서울",
      "마늘",
      "하늘",
    ]);
  });
});
