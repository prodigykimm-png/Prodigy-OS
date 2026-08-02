(function (root) {
  "use strict";

  const COLLECTOR_SCRIPT = "SYSTEM/SCRIPTS/real-estate-source-collect.js";
  const PROVIDERS = Object.freeze(["court", "building", "transactions", "official-price", "land-price"]);
  const DEFAULT_TIMEOUT_MS = 180000;

  function resolveRequire() {
    if (typeof require === "function") return require;
    if (root && typeof root.require === "function") return root.require.bind(root);
    if (root && root.window && typeof root.window.require === "function") return root.window.require.bind(root.window);
    return null;
  }

  function isMobileRuntime(app) {
    if (app && typeof app.isMobile === "boolean") return app.isMobile;
    const platform = root.obsidian && root.obsidian.Platform;
    return Boolean(platform && (platform.isMobileApp || platform.isMobile));
  }

  function childProcessModule() {
    const nodeRequire = resolveRequire();
    if (!nodeRequire) throw new Error("자동 조사는 Obsidian 데스크톱 환경에서만 실행할 수 있습니다.");
    try {
      return nodeRequire("child_process");
    } catch (_error) {
      throw new Error("Obsidian 데스크톱에서 로컬 수집기를 실행할 수 없습니다.");
    }
  }

  function nodeCommand() {
    const env = processEnvironment();
    const nodeRequire = resolveRequire();
    let exists = null;
    if (nodeRequire) {
      try { exists = nodeRequire("fs").existsSync; } catch (_error) { exists = null; }
    }
    return resolveNodeCommand(env, exists);
  }

  function processEnvironment() {
    const processObject = root && root.process ? root.process : (typeof process !== "undefined" ? process : null);
    return processObject && processObject.env ? Object.assign({}, processObject.env) : {};
  }

  function resolveNodeCommand(env, exists) {
    const values = env || {};
    const override = String(values.PRODIGY_NODE_BIN || "").trim();
    if (override && /^\/(?:Users|opt|usr|bin)\/.*\/node$/u.test(override) && (!exists || exists(override))) return override;
    const pathEntries = String(values.PATH || "").split(":").filter(Boolean).map((entry) => `${entry.replace(/\/$/u, "")}/node`);
    const home = String(values.HOME || "").trim().replace(/\/$/u, "");
    const candidates = [
      ...pathEntries,
      home ? `${home}/.hermes/node/bin/node` : "",
      home ? `${home}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node` : "",
      home ? `${home}/.local/bin/node` : "",
      "/opt/homebrew/bin/node",
      "/usr/local/bin/node",
      "/usr/bin/node"
    ].filter(Boolean);
    if (typeof exists !== "function") return candidates[0] || "node";
    return candidates.find((candidate) => exists(candidate)) || "node";
  }

  function runtimePath(command, env) {
    const values = env || {};
    const home = String(values.HOME || "").trim().replace(/\/$/u, "");
    const commandPath = String(command || "").trim();
    const commandDirectory = commandPath.includes("/") ? commandPath.replace(/\/[^/]*$/u, "") : "";
    const pathEntries = String(values.PATH || "").split(":").filter(Boolean);
    const candidates = [
      commandDirectory,
      ...pathEntries,
      home ? `${home}/.hermes/node/bin` : "",
      home ? `${home}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin` : "",
      home ? `${home}/.local/bin` : "",
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin"
    ].filter(Boolean);
    return [...new Set(candidates)].join(":");
  }

  function runtimeEnvironment(command, extra) {
    const source = processEnvironment();
    const env = {};
    ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "NO_COLOR", "NODE_ENV", "KSKILL_API_KEY", "DATA_GO_KR_API_KEY", "DATA_GO_KR_SERVICE_KEY", "REALTY_PRICE_API_KEY"].forEach((key) => { if (source[key] !== undefined) env[key] = source[key]; });
    env.PATH = runtimePath(command, env);
    env.PRODIGY_REAL_ESTATE_ALLOW_PROXY = extra?.allowProxy === true ? "1" : "0";
    if (extra?.proxyBaseUrl) env.KSKILL_PROXY_BASE_URL = String(extra.proxyBaseUrl);
    return env;
  }

  function vaultBasePath(app) {
    const adapter = app && app.vault && app.vault.adapter;
    const base = adapter && (adapter.basePath || (typeof adapter.getBasePath === "function" ? adapter.getBasePath() : ""));
    return String(base || "").trim();
  }

  function safeVaultPath(base, relative) {
    const rootPath = String(base || "").replace(/[\\/]$/u, "");
    const child = String(relative || "").replace(/^[\\/]+/u, "");
    if (!rootPath || !child || child.split(/[\\/]+/u).includes("..") || /^[A-Za-z]:[\\/]/u.test(child) || child.startsWith("/")) {
      throw new Error("자동 조사 대상 경로가 올바르지 않습니다.");
    }
    return `${rootPath}/${child}`;
  }

  function selectionArgs(selection) {
    const values = selection || {};
    const mapping = [["court_code", "--court-code"], ["pnu", "--pnu"], ["lot_address", "--lot-address"], ["building_name", "--building-name"], ["building_dong", "--building-dong"], ["unit_number", "--unit-number"], ["apt_code", "--apt-code"], ["apt_notice_date", "--apt-notice-date"], ["dong_code", "--dong-code"], ["ho_code", "--ho-code"], ["lawd_cd", "--lawd-cd"]];
    const args = [];
    mapping.forEach(([key, flag]) => { const value = String(values[key] || "").trim(); if (value) { if (/[\r\n]/u.test(value) || value.length > 240) throw new Error("매칭 선택값이 올바르지 않습니다."); args.push(flag, value); } });
    return args;
  }
  function commandArgs(base, auction, selection) {
    const objectPath = auction && auction.file && auction.file.path;
    if (!objectPath) throw new Error("경매 Object 경로를 확인할 수 없습니다.");
    return [
      safeVaultPath(base, COLLECTOR_SCRIPT),
      "--vault", base,
      "--case", safeVaultPath(base, objectPath),
      "--providers", PROVIDERS.join(","),
      ...selectionArgs(selection)
    ];
  }

  function jsonObjectCandidates(text) {
    const candidates = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (start < 0) {
        if (character === "{") { start = index; depth = 1; }
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') { inString = true; continue; }
      if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, index + 1));
          start = -1;
        }
      }
    }
    return candidates;
  }

  function parseCollectorResult(stdout) {
    const text = String(stdout || "").trim();
    const candidates = [text, ...text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean), ...jsonObjectCandidates(text)].reverse();
    for (const candidate of candidates) {
      try {
        const result = JSON.parse(candidate);
        if (result && typeof result === "object" && result.package_path && result.package_id) return result;
      } catch (_error) {}
    }
    throw new Error("부동산 조사 결과 패키지 위치를 확인하지 못했습니다.");
  }

  function abortError() {
    const error = new Error("부동산 조사가 취소되었습니다.");
    error.name = "AbortError";
    return error;
  }

  function run(options, dependencies) {
    const opts = options || {};
    const deps = dependencies || {};
    const spawn = deps.spawn || childProcessModule().spawn;
    const base = String(opts.basePath || "").trim();
    const args = Array.isArray(opts.args) ? opts.args.slice() : commandArgs(base, opts.auction, opts.selection);
    const command = deps.nodeCommand || nodeCommand();
    const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
    const spawnOptions = { cwd: base, env: runtimeEnvironment(command, { allowProxy: opts.allowProxy === true, proxyBaseUrl: opts.proxyBaseUrl }), shell: false, stdio: ["ignore", "pipe", "pipe"] };

    return new Promise((resolve, reject) => {
      let child;
      let stdout = "";
      let settled = false;
      let timer = null;
      let abortHandler = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (opts.signal && abortHandler && typeof opts.signal.removeEventListener === "function") opts.signal.removeEventListener("abort", abortHandler);
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const fail = (error) => finish(reject, error instanceof Error ? error : new Error(String(error || "부동산 조사 실행에 실패했습니다.")));

      if (!base) {
        fail(new Error("Vault의 데스크톱 경로를 확인할 수 없습니다."));
        return;
      }
      if (opts.signal && opts.signal.aborted) {
        fail(abortError());
        return;
      }
      try {
        child = spawn(command, args, spawnOptions);
      } catch (error) {
        fail(error);
        return;
      }
      if (!child || !child.stdout || !child.stderr || typeof child.once !== "function") {
        fail(new Error("수집기 프로세스 인터페이스를 사용할 수 없습니다."));
        return;
      }
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", () => {});
      child.once("error", (error) => {
        if (error && error.code === "ENOENT") fail(new Error("Node 실행 파일을 찾지 못했습니다. Obsidian 데스크톱 설치를 확인해 주세요."));
        else fail(new Error("부동산 조사 수집기를 실행하지 못했습니다."));
      });
      child.once("close", (code) => {
        if (code !== 0) {
          fail(new Error("부동산 조사 수집기가 완료되지 않았습니다. 공급자 설정과 환경변수를 확인해 주세요."));
          return;
        }
        try { finish(resolve, parseCollectorResult(stdout)); } catch (error) { fail(error); }
      });
      abortHandler = () => {
        if (child && typeof child.kill === "function") child.kill("SIGTERM");
        fail(abortError());
      };
      if (opts.signal && typeof opts.signal.addEventListener === "function") opts.signal.addEventListener("abort", abortHandler, { once: true });
      timer = setTimeout(() => {
        if (child && typeof child.kill === "function") child.kill("SIGTERM");
        fail(new Error("부동산 조사 시간이 초과되었습니다. 나중에 다시 시도해 주세요."));
      }, timeoutMs);
    });
  }

  function isAvailable(app) {
    return !isMobileRuntime(app) && Boolean(vaultBasePath(app)) && Boolean(resolveRequire());
  }

  async function collectForAuction(app, auction, options) {
    if (!isAvailable(app)) throw new Error("자동 조사는 Obsidian 데스크톱에서만 사용할 수 있습니다. 아래 명령을 데스크톱에서 실행해 주세요.");
    const base = vaultBasePath(app);
    return run(Object.assign({}, options || {}, { basePath: base, auction }), options && options.dependencies);
  }

  const api = Object.freeze({ COLLECTOR_SCRIPT, DEFAULT_TIMEOUT_MS, PROVIDERS, collectForAuction, commandArgs, isAvailable, nodeCommand, parseCollectorResult, resolveNodeCommand, run, runtimeEnvironment, runtimePath, safeVaultPath, selectionArgs, vaultBasePath });
  root.AuctionRealEstateSourceRunner = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
