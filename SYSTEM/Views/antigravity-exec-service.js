(function (root) {
  "use strict";

  const DEFAULT_PROVIDER = Object.freeze({
    adapter: "antigravity-exec",
    name: "Antigravity 구독",
    description: "공식 Antigravity CLI가 저장된 Google 로그인 세션을 사용합니다.",
    authMode: "antigravity-login",
    command: "",
    model: "gemini-3.6-flash-medium",
    models: Object.freeze([
      { id: "gemini-3.6-flash-high", label: "Gemini 3.6 Flash · High" },
      { id: "gemini-3.6-flash-medium", label: "Gemini 3.6 Flash · Medium" },
      { id: "gemini-3.6-flash-low", label: "Gemini 3.6 Flash · Low" },
      { id: "gemini-3.5-flash-medium", label: "Gemini 3.5 Flash · Medium" },
      { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro · High" },
      { id: "gemini-3.1-pro-low", label: "Gemini 3.1 Pro · Low" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 · Thinking" },
      { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B · Medium" }
    ]),
    sandbox: true,
    chatTimeoutMs: 30000,
    structuredTimeoutMs: 120000,
    capabilities: Object.freeze({
      structuredOutput: "json-schema",
      strictStructuredOutput: true,
      conservativeProposal: true
    })
  });

  const RELAY_TOKEN_SECRET = "prodigy-antigravity-relay-token";

  function resolveRequire() {
    if (typeof require === "function") return require;
    if (root && typeof root.require === "function") return root.require.bind(root);
    if (root && root.window && typeof root.window.require === "function") return root.window.require.bind(root.window);
    return null;
  }

  function childProcessModule() {
    const nodeRequire = resolveRequire();
    if (!nodeRequire) throw new Error("Antigravity CLI는 Obsidian 데스크톱 환경에서만 실행할 수 있습니다.");
    try {
      return nodeRequire("child_process");
    } catch (_error) {
      throw new Error("Obsidian 데스크톱에서 Antigravity CLI 실행 권한을 사용할 수 없습니다.");
    }
  }

  function isMobileRuntime(app) {
    if (app && typeof app.isMobile === "boolean") return app.isMobile;
    const platform = root.obsidian && root.obsidian.Platform;
    return Boolean(platform && (platform.isMobileApp || platform.isMobile));
  }

  function requestUrlAdapter(app) {
    if (root.requestUrl) return root.requestUrl;
    if (root.obsidian && root.obsidian.requestUrl) return root.obsidian.requestUrl;
    if (app && app.requestUrl) return app.requestUrl;
    return null;
  }

  function processEnv() {
    return root && root.process && root.process.env ? root.process.env : {};
  }

  function bundledCommand() {
    const nodeRequire = resolveRequire();
    if (!nodeRequire) return "";
    try {
      const fs = nodeRequire("fs");
      const os = nodeRequire("os");
      const home = os.homedir();
      return [`${home}/.local/bin/agy`, `${home}/bin/agy`].find((candidate) => fs.existsSync(candidate)) || "";
    } catch (_error) {
      return "";
    }
  }

  function commandFor(provider, dependencies) {
    if (dependencies && typeof dependencies.getCommand === "function") return dependencies.getCommand(provider);
    return String(provider && provider.command || processEnv().AGY_BIN || bundledCommand() || "agy").trim() || "agy";
  }

  function cwdFor(app) {
    const adapter = app && app.vault && app.vault.adapter;
    if (!adapter) return undefined;
    if (typeof adapter.basePath === "string" && adapter.basePath) return adapter.basePath;
    if (typeof adapter.getBasePath === "function") return adapter.getBasePath();
    return undefined;
  }

  function abortError() {
    const error = new Error("Antigravity 분석이 취소되었습니다.");
    error.name = "AbortError";
    return error;
  }

  function parseJsonPayload(text) {
    const raw = String(text || "").trim();
    if (!raw) throw new Error("Antigravity가 빈 응답을 반환했습니다.");
    try { return JSON.parse(raw); } catch (_error) {
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced) return JSON.parse(fenced[1].trim());
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Antigravity가 유효한 JSON을 반환하지 않았습니다.");
      return JSON.parse(match[0]);
    }
  }

  function parseEnvelope(raw) {
    const parsed = parseJsonPayload(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Antigravity CLI 응답 형식을 해석하지 못했습니다.");
    return parsed;
  }

  function normalizeSchema(value) {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(normalizeSchema);
    const normalized = {};
    Object.entries(value).forEach(([key, child]) => {
      if (key !== "enum") normalized[key] = normalizeSchema(child);
    });
    return normalized;
  }

  function structuredPrompt(prompt, schema) {
    return [
      String(prompt || "").trim(),
      "",
      "Return only the JSON value required by the schema.",
      "Do not use tools, modify files, create tasks, or add commentary.",
      `Schema: ${JSON.stringify(schema || { type: "object" })}`
    ].join("\n");
  }

  async function relayToken(options, provider) {
    if (options && options.relayToken) return String(options.relayToken);
    const app = options && options.app;
    const secretId = String(provider && provider.relayTokenSecret || RELAY_TOKEN_SECRET).trim();
    if (!app || !app.secretStorage || typeof app.secretStorage.getSecret !== "function") return "";
    return String(await Promise.resolve(app.secretStorage.getSecret(secretId)) || "");
  }

  function relayURL(provider) {
    return String(provider && provider.relayURL || "").trim().replace(/\/$/, "");
  }

  async function relayResponsePayload(response) {
    if (response && response.json !== undefined && typeof response.json !== "function") return response.json;
    const text = response && typeof response.text === "function" ? await response.text() : response && response.text;
    return parseJsonPayload(text);
  }

  async function requestRelay(options, kind, schema) {
    const provider = options.provider || DEFAULT_PROVIDER;
    const url = relayURL(provider);
    if (!url) throw new Error("모바일에서는 Antigravity 중계 URL을 설정해야 합니다.");
    const token = await relayToken(options, provider);
    if (!token) throw new Error("모바일 Antigravity 중계 토큰이 없습니다. 설정 → AI → Antigravity 구독에서 저장해 주세요.");
    if (options.signal && options.signal.aborted) throw abortError();
    const body = { kind, prompt: String(options.prompt || ""), model: String(provider.model || "") };
    if (kind === "structured") body.schema = schema || { type: "object" };
    const request = requestUrlAdapter(options.app);
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : (kind === "structured" ? Number(provider.structuredTimeoutMs) : Number(provider.chatTimeoutMs)) || 60000;
    let timer = null;
    let controller = null;
    try {
      const task = request
        ? request({ url, method: "POST", headers, body: JSON.stringify(body), throw: false })
        : (() => {
            if (typeof fetch !== "function") throw new Error("모바일에서 HTTP 요청 기능을 사용할 수 없습니다.");
            controller = typeof AbortController === "function" ? new AbortController() : null;
            return fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller ? controller.signal : undefined });
          })();
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          if (controller) controller.abort();
          reject(new Error("Antigravity 중계 서버 응답 시간이 초과되었습니다."));
        }, timeoutMs);
      });
      const response = await Promise.race([task, timeout]);
      const status = Number(response && response.status || 0);
      const payload = await relayResponsePayload(response);
      if (status >= 400) throw new Error(String(payload && payload.error || "Antigravity 중계 서버가 요청을 거부했습니다."));
      if (!payload || typeof payload !== "object") throw new Error("Antigravity 중계 서버 응답 형식이 올바르지 않습니다.");
      if (kind === "structured") {
        if (payload.structured_output === undefined) throw new Error("Antigravity 중계 서버가 구조화 결과를 반환하지 않았습니다.");
        return payload.structured_output;
      }
      if (typeof payload.response !== "string") throw new Error("Antigravity 중계 서버가 텍스트 결과를 반환하지 않았습니다.");
      return payload.response.trim();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function sandboxArgs(provider) {
    return provider && provider.sandbox === false ? ["--disable-slash-commands"] : ["--sandbox", "--disable-slash-commands"];
  }

  function modelArgs(provider) {
    const model = String(provider && provider.model || "").trim();
    return model ? ["--model", model] : [];
  }

  function run(options, dependencies, input, args, defaultTimeoutMs) {
    const provider = options.provider || DEFAULT_PROVIDER;
    const spawn = dependencies && dependencies.spawn ? dependencies.spawn : childProcessModule().spawn;
    const command = commandFor(provider, dependencies);
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : (Number(defaultTimeoutMs) > 0 ? Number(defaultTimeoutMs) : 60000);
    const spawnOptions = { cwd: cwdFor(options.app), shell: false, stdio: ["ignore", "pipe", "pipe"] };

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
      const fail = (error) => finish(reject, error instanceof Error ? error : new Error(String(error || "Antigravity CLI 실행에 실패했습니다.")));

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
      if (!child || !child.stdout || !child.stderr || typeof child.on !== "function") {
        fail(new Error("Antigravity CLI 프로세스 인터페이스를 사용할 수 없습니다."));
        return;
      }
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", () => {});
      child.once("error", (error) => {
        if (error && error.code === "ENOENT") fail(new Error("Antigravity CLI를 찾지 못했습니다. `agy` 설치와 PATH 또는 AGY_BIN 설정을 확인해 주세요."));
        else fail(new Error("Antigravity CLI 프로세스를 실행하지 못했습니다."));
      });
      child.once("close", (code) => {
        if (code !== 0) {
          fail(new Error(`Antigravity CLI가 종료 코드 ${code == null ? "unknown" : code}로 종료되었습니다. ` + "agy" + " 로그인 상태와 권한을 확인해 주세요."));
          return;
        }
        finish(resolve, stdout);
      });
      abortHandler = () => {
        if (child && typeof child.kill === "function") child.kill("SIGTERM");
        fail(abortError());
      };
      if (options.signal && typeof options.signal.addEventListener === "function") options.signal.addEventListener("abort", abortHandler, { once: true });
      timer = setTimeout(() => {
        if (child && typeof child.kill === "function") child.kill("SIGTERM");
        fail(new Error("Antigravity 분석 시간이 초과되었습니다. `agy` 로그인 상태와 네트워크를 확인해 주세요."));
      }, timeoutMs);
    });
  }

  function responseFromEnvelope(envelope) {
    if (envelope.structured_output !== undefined) return envelope.structured_output;
    if (typeof envelope.response === "string") return envelope.response.trim();
    if (typeof envelope.output === "string") return envelope.output.trim();
    throw new Error("Antigravity가 분석 결과를 반환하지 않았습니다.");
  }

  function createService(dependencies) {
    const deps = dependencies || {};
    return {
      async requestStructuredJson(options) {
        const provider = options.provider || DEFAULT_PROVIDER;
        const schema = normalizeSchema(options.schema || { type: "object" });
        if (isMobileRuntime(options.app)) return requestRelay(Object.assign({}, options, { provider }), "structured", schema);
        const args = ["-p", structuredPrompt(options.prompt, schema), "--output-format", "json", ...modelArgs(provider), "--json-schema", JSON.stringify(schema), ...sandboxArgs(provider)];
        const raw = await run(options, deps, "", args, provider.structuredTimeoutMs);
        const value = responseFromEnvelope(parseEnvelope(raw));
        return typeof value === "string" ? parseJsonPayload(value) : value;
      },
      async requestChatText(options) {
        const provider = options.provider || DEFAULT_PROVIDER;
        if (isMobileRuntime(options.app)) return requestRelay(Object.assign({}, options, { provider }), "chat");
        const args = ["-p", String(options.prompt || ""), "--output-format", "json", ...modelArgs(provider), ...sandboxArgs(provider)];
        const raw = await run(options, deps, "", args, provider.chatTimeoutMs);
        return String(responseFromEnvelope(parseEnvelope(raw)) || "").trim();
      }
    };
  }

  const api = Object.assign(createService(), { DEFAULT_PROVIDER, RELAY_TOKEN_SECRET, createService, normalizeSchema, parseJsonPayload, parseEnvelope, structuredPrompt, isMobileRuntime, relayURL, requestRelay });
  root.AntigravityExecService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
