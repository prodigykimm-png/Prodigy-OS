"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const path = require("node:path");
const antigravity = require("../Views/antigravity-exec-service.js");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const DEFAULT_PATH = "/v1/antigravity";
const DEFAULT_MODEL = "gemini-3.6-flash-medium";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MODEL_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

class RelayError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "RelayError";
    this.status = status;
  }
}

function configFromEnv(env) {
  const source = env || process.env;
  const token = String(source.ANTIGRAVITY_RELAY_TOKEN || "").trim();
  if (!token) throw new Error("ANTIGRAVITY_RELAY_TOKEN must be set.");
  const port = Number(source.ANTIGRAVITY_RELAY_PORT || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("ANTIGRAVITY_RELAY_PORT must be a valid TCP port.");
  return Object.freeze({
    host: String(source.ANTIGRAVITY_RELAY_HOST || DEFAULT_HOST).trim() || DEFAULT_HOST,
    port,
    path: String(source.ANTIGRAVITY_RELAY_PATH || DEFAULT_PATH).trim() || DEFAULT_PATH,
    token,
    model: String(source.ANTIGRAVITY_RELAY_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    agyBin: String(source.AGY_BIN || "agy").trim() || "agy",
    cwd: String(source.ANTIGRAVITY_RELAY_CWD || process.cwd()).trim() || process.cwd()
  });
}

function jsonHeaders() {
  return { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
}

function sendJson(response, status, payload, extraHeaders) {
  const body = JSON.stringify(payload);
  response.writeHead(status, Object.assign({}, jsonHeaders(), extraHeaders || {}, { "Content-Length": Buffer.byteLength(body) }));
  response.end(body);
}

function isAuthorized(request, expectedToken) {
  const header = String(request.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const received = Buffer.from(match[1], "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes <= MAX_BODY_BYTES) body += chunk;
    });
    request.on("end", () => {
      if (bytes > MAX_BODY_BYTES) {
        reject(new RelayError(413, "요청 본문이 너무 큽니다."));
        return;
      }
      try {
        const parsed = JSON.parse(body || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
        resolve(parsed);
      } catch (_error) {
        reject(new RelayError(400, "요청 본문이 유효한 JSON이 아닙니다."));
      }
    });
    request.on("error", () => reject(new RelayError(400, "요청을 읽지 못했습니다.")));
  });
}

function validateRequest(payload, configuredModel) {
  const kind = String(payload.kind || "").trim();
  if (kind !== "chat" && kind !== "structured") throw new RelayError(400, "kind는 chat 또는 structured여야 합니다.");
  const prompt = String(payload.prompt || "").trim();
  if (!prompt || prompt.length > MAX_BODY_BYTES) throw new RelayError(400, "prompt가 없거나 너무 깁니다.");
  const model = String(payload.model || configuredModel).trim();
  if (!MODEL_PATTERN.test(model)) throw new RelayError(400, "model 형식이 올바르지 않습니다.");
  if (kind === "structured" && (!payload.schema || typeof payload.schema !== "object" || Array.isArray(payload.schema))) {
    throw new RelayError(400, "structured 요청에는 schema가 필요합니다.");
  }
  return { kind, prompt, model, schema: payload.schema };
}

function createRelayServer(options) {
  const settings = options && options.config ? options.config : configFromEnv(options && options.env);
  const service = options && options.service
    ? options.service
    : antigravity.createService({ getCommand: () => settings.agyBin });
  const logger = options && typeof options.logger === "function" ? options.logger : (line) => console.error(line);
  const app = { vault: { adapter: { basePath: settings.cwd || path.dirname(process.cwd()) } } };
  let active = false;

  async function execute(payload) {
    const request = validateRequest(payload, settings.model);
    const provider = {
      adapter: "antigravity-exec",
      authMode: "antigravity-login",
      model: request.model,
      command: settings.agyBin,
      sandbox: true,
      chatTimeoutMs: 30000,
      structuredTimeoutMs: 60000
    };
    if (active) throw new RelayError(429, "중계 서버가 다른 분석을 처리 중입니다.");
    active = true;
    try {
      if (request.kind === "structured") {
        const value = await service.requestStructuredJson({ app, provider, prompt: request.prompt, schema: request.schema });
        return { structured_output: value };
      }
      const value = await service.requestChatText({ app, provider, prompt: request.prompt });
      return { response: String(value || "") };
    } catch (error) {
      throw new RelayError(502, "Antigravity CLI 분석에 실패했습니다. 맥미니의 agy 로그인 상태를 확인해 주세요.");
    } finally {
      active = false;
    }
  }

  const server = http.createServer(async (request, response) => {
    const startedAt = Date.now();
    const pathname = new URL(request.url || "/", "http://relay.local").pathname;
    let status = 200;
    try {
      if (request.method === "GET" && pathname === "/healthz") {
        sendJson(response, 200, { ok: true, service: "antigravity-relay" });
        return;
      }
      if (request.method !== "POST" || pathname !== settings.path) {
        status = 404;
        sendJson(response, status, { error: "Not found" });
        return;
      }
      if (!isAuthorized(request, settings.token)) {
        status = 401;
        sendJson(response, status, { error: "인증 토큰이 없습니다." });
        return;
      }
      const payload = await readJson(request);
      const result = await execute(payload);
      sendJson(response, 200, result);
    } catch (error) {
      status = Number(error && error.status) || 500;
      sendJson(response, status, { error: error && error.message ? error.message : "중계 서버 오류가 발생했습니다." }, status === 429 ? { "Retry-After": "2" } : undefined);
    } finally {
      logger(`${request.method} ${pathname} ${status} ${Date.now() - startedAt}ms`);
    }
  });
  return { server, settings, execute };
}

function start() {
  const relay = createRelayServer();
  relay.server.listen(relay.settings.port, relay.settings.host, () => {
    console.error(`Antigravity relay listening on ${relay.settings.host}:${relay.settings.port}${relay.settings.path}`);
  });
  const stop = () => relay.server.close(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (require.main === module) start();

module.exports = { DEFAULT_PATH, DEFAULT_PORT, MAX_BODY_BYTES, RelayError, configFromEnv, isAuthorized, createRelayServer };
