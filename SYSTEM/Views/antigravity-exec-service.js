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
  const PROCESS_DRAIN_TIMEOUT_MS = 250;

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

  const PROVIDER_KEYS = new Set([
    "adapter", "name", "description", "hint", "authMode", "command", "model", "models", "sandbox",
    "relayURL", "relayTokenSecret", "chatTimeoutMs", "structuredTimeoutMs", "capabilities", "fallbackProvider"
  ]);
  const STRUCTURED_OPTION_KEYS = new Set(["app", "provider", "prompt", "schema", "signal", "timeoutMs"]);
  const CHAT_OPTION_KEYS = new Set(["app", "provider", "prompt", "signal", "timeoutMs", "contextEnvelope"]);

  function rejectUnknownKeys(source, allowed, label) {
    const unknown = Object.keys(source || {}).filter((key) => !allowed.has(key));
    if (unknown.length) throw new Error(`Antigravity ${label}에 알 수 없는 ${label === "provider" ? "provider 설정" : "공개 옵션"}이 있습니다: ${unknown.join(", ")}`);
  }

  function rejectDirectRelayToken(options) {
    if (options && Object.prototype.hasOwnProperty.call(options, "relayToken")) {
      throw new Error("Antigravity 중계 토큰은 직접 전달할 수 없으며 SecretStorage에서만 읽어야 합니다.");
    }
  }

  function validateRequestOptions(options, kind) {
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Antigravity 공개 옵션은 객체여야 합니다.");
    rejectDirectRelayToken(options);
    rejectUnknownKeys(options, kind === "structured" ? STRUCTURED_OPTION_KEYS : CHAT_OPTION_KEYS, "요청");
  }

  function validateExecutionProvider(provider) {
    const source = provider || DEFAULT_PROVIDER;
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Antigravity provider는 객체여야 합니다.");
    rejectUnknownKeys(source, PROVIDER_KEYS, "provider");
    if (source.command && source.command !== "agy") throw new Error("Antigravity는 공식 agy 명령만 실행할 수 있습니다.");
    if (source.sandbox !== undefined && source.sandbox !== true) throw new Error("Antigravity sandbox는 비활성화할 수 없습니다.");
  }

  function officialCommands() {
    const commands = new Set(["agy"]);
    const nodeRequire = resolveRequire();
    if (nodeRequire) {
      try {
        const home = nodeRequire("os").homedir();
        commands.add(`${home}/.local/bin/agy`);
        commands.add(`${home}/bin/agy`);
      } catch (_error) {}
    }
    return commands;
  }

  function assertOfficialCommand(command, source) {
    const value = String(command || "").trim();
    if (!officialCommands().has(value)) throw new Error(`${source}은(는) 공식 Antigravity 실행 파일만 지정할 수 있습니다.`);
    return value;
  }

  function commandFor(provider, dependencies) {
    const env = root && root.process && root.process.env ? root.process.env : {};
    if (env.AGY_BIN) assertOfficialCommand(env.AGY_BIN, "AGY_BIN");
    if (dependencies && typeof dependencies.getCommand === "function") {
      return assertOfficialCommand(dependencies.getCommand(provider), "Antigravity 실행 seam");
    }
    if (provider && provider.command) return assertOfficialCommand(provider.command, "Antigravity provider command");
    return assertOfficialCommand(env.AGY_BIN || bundledCommand() || "agy", "Antigravity 실행 경로");
  }

  function executionCwd(dependencies) {
    if (dependencies && typeof dependencies.getCwd === "function") return String(dependencies.getCwd() || "").trim() || undefined;
    const nodeRequire = resolveRequire();
    if (!nodeRequire) return undefined;
    try { return nodeRequire("os").tmpdir(); } catch (_error) { return undefined; }
  }

  function abortError() {
    const error = new Error("Antigravity 분석이 취소되었습니다.");
    error.name = "AbortError";
    return error;
  }

  function failedExitError(stdout, stderr, code, signal) {
    let detail = "";
    try {
      const envelope = parseEnvelope(stdout);
      detail = String(envelope && envelope.error || "");
    } catch (_error) {}
    detail = `${detail}\n${String(stderr || "")}`.trim();
    if (/individual\s+quota\s+reached|quota\s+(?:reached|exhausted)|usage\s+limit\s+reached/iu.test(detail)) {
      const reset = /resets?\s+in\s+(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/iu.exec(detail);
      const resetParts = reset
        ? [[reset[1], "시간"], [reset[2], "분"], [reset[3], "초"]].filter(([value]) => value).map(([value, unit]) => `${Number(value)}${unit}`)
        : [];
      const error = new Error(resetParts.length
        ? `Antigravity 사용 한도를 모두 사용했습니다. ${resetParts.join(" ")} 후 다시 시도해 주세요.`
        : "Antigravity 사용 한도를 모두 사용했습니다. 한도가 초기화된 후 다시 시도해 주세요.");
      error.name = "AntigravityQuotaError";
      error.code = "ANTIGRAVITY_QUOTA_EXHAUSTED";
      return error;
    }
    if (/google\s+login|login\s+required|sign[\s-]?in|required\s+authentication|oauth/iu.test(detail)) {
      const error = new Error("Antigravity Google 로그인이 필요합니다. 터미널에서 `agy -p \"연결 확인\"`을 한 번 실행해 로그인한 뒤 지식 INBOX를 다시 확인해 주세요.");
      error.name = "AntigravityAuthError";
      error.code = "ANTIGRAVITY_AUTH_REQUIRED";
      return error;
    }
    if (/permission check failed|user denied permission|sandbox/iu.test(detail)) {
      const error = new Error("Antigravity가 프로젝트 도구 실행을 시도해 안전 모드에서 차단되었습니다. 잠시 후 지식 INBOX를 다시 확인해 주세요.");
      error.name = "AntigravitySandboxError";
      error.code = "ANTIGRAVITY_SANDBOX_BLOCKED";
      return error;
    }
    return new Error(code == null && signal
      ? `Antigravity CLI가 신호 ${signal}로 종료되었습니다. agy 로그인 상태와 권한을 확인해 주세요.`
      : `Antigravity CLI가 종료 코드 ${code == null ? "unknown" : code}로 종료되었습니다. agy 로그인 상태와 권한을 확인해 주세요.`);
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
    const app = options && options.app;
    const secretId = String(provider && provider.relayTokenSecret || RELAY_TOKEN_SECRET).trim();
    if (!app || !app.secretStorage || typeof app.secretStorage.getSecret !== "function") return "";
    return String(await Promise.resolve(app.secretStorage.getSecret(secretId)) || "");
  }

  function isAllowedRelayURL(value) {
    const raw = String(value || "").trim();
    if (!raw) return false;
    try {
      const url = new URL(raw);
      return url.protocol === "https:"
        && url.hostname.endsWith(".ts.net")
        && !url.username
        && !url.password
        && !url.hash;
    } catch (_error) {
      return false;
    }
  }

  function relayURL(provider) {
    return String(provider && provider.relayURL || "").trim().replace(/\/$/, "");
  }

  function relayFailure(message, status, code) {
    const error = new Error(message);
    error.name = "AntigravityRelayError";
    if (status) error.relayStatus = status;
    if (code) error.code = code;
    return error;
  }

  function relayResponseCode(payload) {
    const candidate = payload && typeof payload === "object"
      ? (payload.code || (payload.error && typeof payload.error === "object" && payload.error.code))
      : "";
    const code = String(candidate || "").trim();
    return /^[A-Z0-9_-]{1,64}$/u.test(code) ? code : "";
  }

  async function relayResponsePayload(response) {
    if (response && response.json !== undefined && typeof response.json !== "function") return response.json;
    const text = response && typeof response.text === "function" ? await response.text() : response && response.text;
    return parseJsonPayload(text);
  }

  async function requestRelay(options, kind, schema) {
    validateRequestOptions(options, kind);
    const provider = options.provider || DEFAULT_PROVIDER;
    validateExecutionProvider(provider);
    const url = relayURL(provider);
    if (!isAllowedRelayURL(url)) throw relayFailure("Antigravity 중계 URL은 자격증명·fragment가 없는 HTTPS Tailscale 주소여야 합니다.");
    if (options.signal && options.signal.aborted) throw abortError();
    const body = { kind, prompt: String(options.prompt || ""), model: String(provider.model || "") };
    if (kind === "structured") body.schema = schema || { type: "object" };
    const request = requestUrlAdapter(options.app);
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : (kind === "structured" ? Number(provider.structuredTimeoutMs) : Number(provider.chatTimeoutMs)) || 60000;
    let timer = null;
    let controller = null;
    try {
      const token = await relayToken(options, provider);
      if (!token) throw relayFailure("모바일 Antigravity 중계 토큰이 없습니다. 설정 → AI → Antigravity 구독에서 저장해 주세요.");
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const task = request
        ? request({ url, method: "POST", headers, body: JSON.stringify(body), throw: false })
        : (() => {
            if (typeof fetch !== "function") throw relayFailure("모바일에서 HTTP 요청 기능을 사용할 수 없습니다.");
            controller = typeof AbortController === "function" ? new AbortController() : null;
            return fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller ? controller.signal : undefined });
          })();
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          if (controller) controller.abort();
          reject(relayFailure("Antigravity 중계 서버 응답 시간이 초과되었습니다."));
        }, timeoutMs);
      });
      const response = await Promise.race([task, timeout]);
      const status = Number(response && response.status || 0);
      const payload = await relayResponsePayload(response);
      if (status >= 400) {
        const code = relayResponseCode(payload);
        throw relayFailure(`Antigravity 중계 서버가 요청을 거부했습니다. (HTTP ${status}${code ? `, ${code}` : ""})`, status, code);
      }
      if (!payload || typeof payload !== "object") throw relayFailure("Antigravity 중계 서버 응답 형식이 올바르지 않습니다.");
      if (kind === "structured") {
        if (payload.structured_output === undefined) throw relayFailure("Antigravity 중계 서버가 구조화 결과를 반환하지 않았습니다.");
        return payload.structured_output;
      }
      if (typeof payload.response !== "string") throw relayFailure("Antigravity 중계 서버가 텍스트 결과를 반환하지 않았습니다.");
      return payload.response.trim();
    } catch (error) {
      if (error && (error.name === "AntigravityRelayError" || error.name === "AbortError")) throw error;
      throw relayFailure("Antigravity 중계 요청에 실패했습니다. 네트워크와 중계 서버 상태를 확인해 주세요.");
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
    validateExecutionProvider(provider);
    const spawn = dependencies && dependencies.spawn ? dependencies.spawn : childProcessModule().spawn;
    const command = commandFor(provider, dependencies);
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : (Number(defaultTimeoutMs) > 0 ? Number(defaultTimeoutMs) : 60000);
    const spawnOptions = { cwd: executionCwd(dependencies), shell: false, stdio: ["ignore", "pipe", "pipe"] };

    return new Promise((resolve, reject) => {
      let child;
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timer = null;
      let drainTimer = null;
      let abortHandler = null;
      let completion = null;
      const streamDone = { stdout: false, stderr: false };
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (drainTimer) clearTimeout(drainTimer);
        if (options.signal && abortHandler && typeof options.signal.removeEventListener === "function") options.signal.removeEventListener("abort", abortHandler);
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const fail = (error) => finish(reject, error instanceof Error ? error : new Error(String(error || "Antigravity CLI 실행에 실패했습니다.")));
      const detachOpenHandles = () => {
        [child && child.stdout, child && child.stderr].forEach((stream) => {
          if (!stream) return;
          if (typeof stream.unref === "function") stream.unref();
          if (!stream.destroyed && typeof stream.destroy === "function") stream.destroy();
        });
        if (child && typeof child.unref === "function") child.unref();
      };
      const requestTermination = () => {
        let signalDeliveryReported = false;
        try {
          signalDeliveryReported = Boolean(child && typeof child.kill === "function" && child.kill("SIGTERM"));
        } catch (_error) {}
        return { requestedSignal: "SIGTERM", signalDeliveryReported };
      };
      const finishCompletion = () => {
        if (settled || !completion) return;
        const { code, signal } = completion;
        if (code !== 0 || signal) {
          const error = failedExitError(stdout, stderr, code, signal);
          error.exitCode = code == null ? null : code;
          error.signal = signal || null;
          fail(error);
          return;
        }
        finish(resolve, stdout);
      };
      const streamsDrained = () => streamDone.stdout && streamDone.stderr;
      const markStreamDone = (name) => {
        streamDone[name] = true;
        if (completion && streamsDrained()) finishCompletion();
      };
      const beginCompletion = (code, signal, closeObserved) => {
        if (settled) return;
        if (!completion) completion = { code: code == null ? null : code, signal: signal || null };
        if (timer) { clearTimeout(timer); timer = null; }
        if (closeObserved || streamsDrained()) {
          finishCompletion();
          return;
        }
        if (drainTimer) return;
        const drainTimeoutMs = Number(dependencies && dependencies.drainTimeoutMs) >= 0
          ? Number(dependencies.drainTimeoutMs)
          : PROCESS_DRAIN_TIMEOUT_MS;
        drainTimer = setTimeout(() => {
          drainTimer = null;
          detachOpenHandles();
          finishCompletion();
        }, drainTimeoutMs);
      };

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
      child.stdout.on("data", (chunk) => { if (!settled) stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { if (!settled && stderr.length < 8192) stderr += String(chunk || "").slice(0, 8192 - stderr.length); });
      child.stdout.once("end", () => markStreamDone("stdout"));
      child.stdout.once("close", () => markStreamDone("stdout"));
      child.stderr.once("end", () => markStreamDone("stderr"));
      child.stderr.once("close", () => markStreamDone("stderr"));
      child.once("error", (error) => {
        if (settled) return;
        detachOpenHandles();
        if (error && error.code === "ENOENT") fail(new Error("Antigravity CLI를 찾지 못했습니다. `agy` 설치와 PATH 또는 AGY_BIN 설정을 확인해 주세요."));
        else fail(new Error("Antigravity CLI 프로세스를 실행하지 못했습니다."));
      });
      child.once("exit", (code, signal) => beginCompletion(code, signal, false));
      child.once("close", (code, signal) => beginCompletion(code, signal, true));
      abortHandler = () => {
        const error = abortError();
        error.termination = requestTermination();
        detachOpenHandles();
        fail(error);
      };
      if (options.signal && typeof options.signal.addEventListener === "function") options.signal.addEventListener("abort", abortHandler, { once: true });
      timer = setTimeout(() => {
        const error = new Error("Antigravity 분석 시간이 초과되었습니다. `agy` 로그인 상태와 네트워크를 확인해 주세요.");
        error.termination = requestTermination();
        detachOpenHandles();
        fail(error);
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
        validateRequestOptions(options, "structured");
        const provider = options.provider || DEFAULT_PROVIDER;
        validateExecutionProvider(provider);
        const schema = normalizeSchema(options.schema || { type: "object" });
        if (isMobileRuntime(options.app)) return requestRelay(Object.assign({}, options, { provider }), "structured", schema);
        const args = ["-p", structuredPrompt(options.prompt, schema), "--output-format", "json", ...modelArgs(provider), "--json-schema", JSON.stringify(schema), ...sandboxArgs(provider)];
        const raw = await run(options, deps, "", args, provider.structuredTimeoutMs);
        const value = responseFromEnvelope(parseEnvelope(raw));
        return typeof value === "string" ? parseJsonPayload(value) : value;
      },
      async requestChatText(options) {
        validateRequestOptions(options, "chat");
        const provider = options.provider || DEFAULT_PROVIDER;
        validateExecutionProvider(provider);
        if (isMobileRuntime(options.app)) return requestRelay(Object.assign({}, options, { provider }), "chat");
        const args = ["-p", String(options.prompt || ""), "--output-format", "json", ...modelArgs(provider), ...sandboxArgs(provider)];
        const raw = await run(options, deps, "", args, provider.chatTimeoutMs);
        return String(responseFromEnvelope(parseEnvelope(raw)) || "").trim();
      }
    };
  }

  const api = Object.assign(createService(), { DEFAULT_PROVIDER, RELAY_TOKEN_SECRET, createService, normalizeSchema, parseJsonPayload, parseEnvelope, structuredPrompt, isMobileRuntime, isAllowedRelayURL, relayURL, requestRelay });
  root.AntigravityExecService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
