"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const fetchRuntime = require(path.join(ROOT, "SYSTEM/Views/knowledge-source-fetch-service.js"));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

function articleHtml(title = "공개 칼럼") {
  return [
    "<html><head>",
    `<meta property=\"og:title\" content=\"${title}\">`,
    "<meta property=\"og:site_name\" content=\"테스트 신문\">",
    "<meta property=\"article:published_time\" content=\"2026-07-20\">",
    "</head><body><article><p>공개 기사 본문은 정책의 범위를 설명합니다.</p><p>두 번째 문단입니다.</p></article></body></html>"
  ].join("");
}

async function testExplicitRetrievalUsesOnlyInjectedRequestUrlAndKeepsBodyTransient() {
  const calls = [];
  const service = fetchRuntime.createKnowledgeSourceFetchService({
    requestUrl: async (options) => {
      calls.push(options);
      return { status: 200, text: articleHtml() };
    }
  });
  const observed = [];
  const result = await service.retrieveArticle({ item_id: "article-1", url: "https://news.example.test/a" }, {
    onRetrieved(text, metadata) { observed.push({ text, metadata }); }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://news.example.test/a");
  assert.equal(calls[0].method, "GET");
  assert.equal(result.status, "retrieved");
  assert.equal(result.title, "공개 칼럼");
  assert.equal(result.publisher, "테스트 신문");
  assert.equal(result.date, "2026-07-20");
  assert.equal(result.text_origin, "explicit_retrieval");
  assert.equal(Object.hasOwn(result, "text"), false);
  assert.equal(Object.hasOwn(result, "html"), false);
  assert.equal(Object.hasOwn(service.getLatestResult("article-1"), "text"), false);
  assert.match(observed[0].text, /공개 기사 본문/);
  assert.equal(observed[0].metadata.title, "공개 칼럼");
}

async function testInvalidProtocolAndUnsupportedKindsNeverReachNetwork() {
  let calls = 0;
  const service = fetchRuntime.createKnowledgeSourceFetchService({ requestUrl: async () => { calls += 1; return { status: 200, text: articleHtml() }; } });
  const cases = [
    { item_id: "bad-protocol", url: "<file-uri>/private/note" },
    { item_id: "video", url: "https://youtube.com/watch?v=test" },
    { item_id: "course", url: "https://academy.example.test/course/1", source_kind: "course" },
    { item_id: "unknown", url: "https://news.example.test/a", source_kind: "podcast" }
  ];
  for (const item of cases) {
    const result = await service.retrieveArticle(item);
    assert.equal(result.status, "fallback_required");
    assert.match(result.user_message, /사용자.*텍스트|메모/);
  }
  assert.equal(calls, 0);
}

async function testLocalPrivateAndCredentialedUrlsNeverReachInjectedRequestUrl() {
  let calls = 0;
  const service = fetchRuntime.createKnowledgeSourceFetchService({
    requestUrl: async () => { calls += 1; return { status: 200, text: articleHtml() }; }
  });
  const blockedUrls = [
    "http://localhost:3000/private",
    "http://127.0.0.1:8080/admin",
    "http://[::1]/admin",
    "http://10.0.0.1/admin",
    "http://172.16.0.5/admin",
    "http://192.168.1.10/admin",
    "http://169.254.169.254/latest/meta-data",
    "https://user:password@news.example.test/private"
  ];
  for (const [index, url] of blockedUrls.entries()) {
    const result = await service.retrieveArticle({ item_id: `unsafe-${index}`, url });
    assert.equal(result.status, "fallback_required");
    assert.match(result.user_message, /사용자.*텍스트|메모/);
  }
  assert.equal(calls, 0);

  const externalHttp = await service.retrieveArticle({ item_id: "external-http", url: "http://news.example.test/public" });
  assert.equal(externalHttp.status, "retrieved");
  assert.equal(calls, 1);
}

async function testBlockedLoginPaywallAndParseFailuresUseKoreanFallbackWithoutLeakage() {
  const secret = "sk_live_never_return_this";
  const responses = [
    { status: 401, text: "login required" },
    { status: 403, text: "paywall subscribe" },
    { status: 429, text: "blocked" },
    { status: 200, text: "<html><body><main>로그인 후 계속</main></body></html>" },
    { status: 200, text: "<html><body><main>짧음</main></body></html>" }
  ];
  const service = fetchRuntime.createKnowledgeSourceFetchService({ requestUrl: async () => responses.shift() });
  for (let index = 0; index < 5; index += 1) {
    const result = await service.retrieveArticle({ item_id: `blocked-${index}`, url: `https://news.example.test/${index}` });
    assert.equal(result.status, "fallback_required");
    assert.match(result.user_message, /사용자.*텍스트|메모/);
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
}

async function testRequestFailureTimeoutCancellationAndLaterRequestWinAreSafe() {
  const slow = deferred();
  const calls = [];
  const service = fetchRuntime.createKnowledgeSourceFetchService({
    requestUrl(options) {
      calls.push(options);
      if (calls.length === 1) return slow.promise;
      if (calls.length === 2) return Promise.resolve({ status: 200, text: articleHtml("새 기사") });
      if (calls.length === 3) return new Promise(() => {});
      return Promise.reject(new Error("Authorization: Bearer sk_live_do_not_show"));
    }
  });
  const first = service.retrieveArticle({ item_id: "same", url: "https://news.example.test/old" });
  const second = service.retrieveArticle({ item_id: "same", url: "https://news.example.test/new" });
  const secondResult = await second;
  slow.resolve({ status: 200, text: articleHtml("오래된 기사") });
  const firstResult = await first;
  assert.equal(secondResult.status, "retrieved");
  assert.equal(firstResult.status, "stale");
  assert.equal(firstResult.applied, false);
  assert.equal(service.getLatestResult("same").title, "새 기사");

  const timeout = await service.retrieveArticle({ item_id: "timeout", url: "https://news.example.test/timeout" }, { timeoutMs: 1 });
  assert.equal(timeout.status, "timeout");
  assert.match(timeout.user_message, /사용자.*텍스트|메모/);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await service.retrieveArticle({ item_id: "cancel", url: "https://news.example.test/cancel" }, { signal: controller.signal });
  assert.equal(cancelled.status, "cancelled");

  const failed = await service.retrieveArticle({ item_id: "failure", url: "https://news.example.test/failure" });
  assert.equal(failed.status, "fallback_required");
  assert.equal(JSON.stringify(failed).includes("sk_live"), false);
}

async function main() {
  await testExplicitRetrievalUsesOnlyInjectedRequestUrlAndKeepsBodyTransient();
  await testInvalidProtocolAndUnsupportedKindsNeverReachNetwork();
  await testLocalPrivateAndCredentialedUrlsNeverReachInjectedRequestUrl();
  await testBlockedLoginPaywallAndParseFailuresUseKoreanFallbackWithoutLeakage();
  await testRequestFailureTimeoutCancellationAndLaterRequestWinAreSafe();
  console.log("knowledge source fetch service: 5 tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
