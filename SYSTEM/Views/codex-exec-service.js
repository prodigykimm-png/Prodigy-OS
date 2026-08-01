(function (root) {
  "use strict";

  const DEFAULT_PROVIDER = Object.freeze({
    adapter: "codex-exec",
    name: "Codex 구독",
    description: "공식 Codex CLI가 저장된 ChatGPT 로그인 세션을 사용합니다.",
    authMode: "codex-login",
    command: "",
    model: "",
    sandbox: "read-only",
    chatTimeoutMs: 30000,
    structuredTimeoutMs: 60000,
    capabilities: Object.freeze({
      structuredOutput: "json-prompt",
      strictStructuredOutput: true,
      conservativeProposal: true
    })
  });

  function resolveRequire() {
    if (typeof require === "function") return require;
    if (root && typeof root.require === "function") return root.require.bind(root);
    if (root && root.window && typeof root.window.require === "function") return root.window.require.bind(root.window);
    return null;
  }

  function childProcessModule() {
    const nodeRequire = resolveRequire();
    if (!nodeRequire) throw new Error("Codex CLI는 Obsidian 데스크톱 환경에서만 실행할 수 있습니다.");
    try {
      return nodeRequire("child_process");
    } catch (_error) {
      throw new Error("Obsidian 데스크톱에서 Codex CLI 실행 권한을 사용할 수 없습니다.");
    }
  }

  function processEnv() {
    return root && root.process && root.process.env ? root.process.env : {};
  }

  function bundledCommand() {
    const nodeRequire = resolveRequire();
    if (!nodeRequire) return "";
    try {
      const fs = nodeRequire("fs");
      return [
        "/Applications/ChatGPT.app/Contents/Resources/codex",
        "/Applications/Codex.app/Contents/Resources/codex"
      ].find((candidate) => fs.existsSync(candidate)) || "";
    } catch (_error) {
      return "";
    }
  }

  function commandFor(provider, dependencies) {
    if (dependencies && typeof dependencies.getCommand === "function") return dependencies.getCommand(provider);
    return String(provider && provider.command || processEnv().CODEX_BIN || bundledCommand() || "codex").trim() || "codex";
  }

  function cwdFor(app) {
    const adapter = app && app.vault && app.vault.adapter;
    if (!adapter) return undefined;
    if (typeof adapter.basePath === "string" && adapter.basePath) return adapter.basePath;
    if (typeof adapter.getBasePath === "function") return adapter.getBasePath();
    return undefined;
  }

  function abortError() {
    const error = new Error("Codex 분석이 취소되었습니다.");
    error.name = "AbortError";
    return error;
  }

  function extractEventText(raw) {
    const messages = [];
    String(raw || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
      try {
        const event = JSON.parse(line);
        const item = event && event.item;
        if (item && item.type === "agent_message" && typeof item.text === "string") messages.push(item.text);
        else if (event && event.type === "agent_message" && typeof event.text === "string") messages.push(event.text);
      } catch (_error) {}
    });
    return messages.length ? messages[messages.length - 1] : String(raw || "").trim();
  }

  function parseJsonPayload(text) {
    const raw = String(text || "").trim();
    if (!raw) throw new Error("Codex가 빈 응답을 반환했습니다.");
    try { return JSON.parse(raw); } catch (_error) {
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced) return JSON.parse(fenced[1].trim());
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Codex가 유효한 JSON을 반환하지 않았습니다.");
      return JSON.parse(match[0]);
    }
  }

  function structuredPrompt(prompt, schema) {
    return [
      String(prompt || "").trim(),
      "",
      "Structured output requirements:",
      "Return exactly one JSON value and no markdown or commentary.",
      "The JSON must conform to this schema:",
      JSON.stringify(schema || { type: "object" })
    ].join("\n");
  }

  function run(options, dependencies, input, args, defaultTimeoutMs) {
    const provider = options.provider || DEFAULT_PROVIDER;
    const spawn = dependencies && dependencies.spawn
      ? dependencies.spawn
      : childProcessModule().spawn;
    const command = commandFor(provider, dependencies);
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : (Number(defaultTimeoutMs) > 0 ? Number(defaultTimeoutMs) : 60000);
    const spawnOptions = { cwd: cwdFor(options.app), shell: false, stdio: ["pipe", "pipe", "pipe"] };

    return new Promise((resolve, reject) => {
      let child;
      let stdout = "";
      let settled = false;
      let timer = null;
      let abortHandler = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (options.signal && abortHandler && typeof options.signal.removeEventListener === "function") options.signal.removeEventListener("abort", abortHandler);
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const fail = (error) => finish(reject, error instanceof Error ? error : new Error(String(error || "Codex CLI 실행에 실패했습니다.")));

      if (options.signal && options.signal.aborted) {
        fail(abortError());
        return;
      }

      try {
        child = spawn(command, args, spawnOptions);
      } catch (error) {
        fail(error);
        return;
      }

      if (!child || !child.stdout || !child.stderr || !child.stdin || typeof child.on !== "function") {
        fail(new Error("Codex CLI 프로세스 인터페이스를 사용할 수 없습니다."));
        return;
      }
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", () => {});
      child.once("error", (error) => {
        if (error && error.code === "ENOENT") fail(new Error("Codex CLI를 찾지 못했습니다. Codex CLI 설치와 PATH 또는 CODEX_BIN 설정을 확인해 주세요."));
        else fail(new Error("Codex CLI 프로세스를 실행하지 못했습니다."));
      });
      child.once("close", (code) => {
        if (code !== 0) {
          fail(new Error(`Codex CLI가 종료 코드 ${code == null ? "unknown" : code}로 종료되었습니다. codex login status를 확인해 주세요.`));
          return;
        }
        finish(resolve, extractEventText(stdout));
      });

      abortHandler = () => {
        if (child && typeof child.kill === "function") child.kill("SIGTERM");
        fail(abortError());
      };
      if (options.signal && typeof options.signal.addEventListener === "function") options.signal.addEventListener("abort", abortHandler, { once: true });
      timer = setTimeout(() => {
        if (child && typeof child.kill === "function") child.kill("SIGTERM");
        fail(new Error("Codex 분석 시간이 초과되었습니다. Codex CLI 상태와 네트워크를 확인해 주세요."));
      }, timeoutMs);

      try {
        child.stdin.write(input);
        child.stdin.end();
      } catch (error) {
        fail(new Error("Codex CLI에 분석 요청을 전달하지 못했습니다."));
      }
    });
  }

  function createService(dependencies) {
    const deps = dependencies || {};
    return {
      async requestStructuredJson(options) {
        const input = structuredPrompt(options.prompt, options.schema);
        const args = ["exec", "--json", "--ephemeral", "--sandbox", options.provider && options.provider.sandbox || "read-only", "--skip-git-repo-check", "-"];
        const text = await run(options, deps, input, args, options.provider && options.provider.structuredTimeoutMs);
        return parseJsonPayload(text);
      },
      async requestChatText(options) {
        const args = ["exec", "--json", "--ephemeral", "--sandbox", options.provider && options.provider.sandbox || "read-only", "--skip-git-repo-check", "-"];
        return (await run(options, deps, String(options.prompt || ""), args, options.provider && options.provider.chatTimeoutMs)).trim();
      }
    };
  }

  const api = Object.assign(createService(), { DEFAULT_PROVIDER, createService, extractEventText, parseJsonPayload, structuredPrompt });
  root.CodexExecService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
