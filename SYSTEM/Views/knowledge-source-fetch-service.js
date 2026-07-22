(function (root) {
  "use strict";

  const DEFAULT_TIMEOUT_MS = 8000;
  const MIN_PLAIN_TEXT_CHARS = 24;
  const ARTICLE_KINDS = new Set(["article", "column"]);
  const BLOCKED_PAGE = /(?:\b(?:login|sign[ -]?in|paywall|subscribe|subscription)\b|로그인(?:\s*후)?|구독(?:이\s*필요|하세요)|유료\s*구독)/i;
  const VIDEO_OR_COURSE_HOST = /(?:^|\.)(?:youtube\.com|youtu\.be|vimeo\.com|coursera\.org|udemy\.com)$/i;

  function clean(value) { return typeof value === "string" ? value.trim().normalize("NFC") : ""; }
  function freeze(value) { return Object.freeze(value); }

  function fallback(itemId, reason, status) {
    return freeze({
      item_id: itemId,
      status: status || "fallback_required",
      applied: true,
      reason,
      user_message: "공개 기사 본문을 가져오지 못했습니다. 사용자 텍스트 또는 메모를 입력해 주세요."
    });
  }

  function stale(result) {
    return freeze({
      item_id: result.item_id,
      status: "stale",
      applied: false,
      reason: "stale_response",
      user_message: "더 최근 요청의 결과를 사용합니다."
    });
  }

  function decodeEntities(value) {
    return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
  }

  function stripHtml(value) {
    return clean(decodeEntities(value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")));
  }

  function attribute(tag, name) {
    const quoted = new RegExp(`${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(tag);
    if (quoted) return clean(decodeEntities(quoted[2]));
    const bare = new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, "i").exec(tag);
    return bare ? clean(decodeEntities(bare[1])) : "";
  }

  function metaContent(html, property) {
    const tags = html.match(/<meta\b[^>]*>/gi) || [];
    for (const tag of tags) {
      const key = attribute(tag, "property") || attribute(tag, "name");
      if (key.toLowerCase() === property.toLowerCase()) return attribute(tag, "content");
    }
    return "";
  }

  function extractArticle(html) {
    const source = typeof html === "string" ? html : "";
    const title = metaContent(source, "og:title") || metaContent(source, "twitter:title") || stripHtml((/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(source) || [])[1] || "");
    const publisher = metaContent(source, "og:site_name") || metaContent(source, "publisher");
    const date = metaContent(source, "article:published_time") || metaContent(source, "date") || attribute((/<time\b[^>]*>/i.exec(source) || [])[0] || "", "datetime");
    const articleMatch = /<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i.exec(source);
    const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(source);
    const text = stripHtml((articleMatch || bodyMatch || ["", ""])[1]);
    if (!title || text.length < MIN_PLAIN_TEXT_CHARS || BLOCKED_PAGE.test(text)) return null;
    return { title, publisher, date, text };
  }

  function ipv4Bytes(hostname) {
    const parts = hostname.split(".");
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
    const bytes = parts.map(Number);
    return bytes.every((byte) => byte >= 0 && byte <= 255) ? bytes : null;
  }

  function isNonPublicIpv4(bytes) {
    const [first, second, third] = bytes;
    if (first === 0 || first === 10 || first === 127 || first >= 224) return true;
    if (first === 100 && second >= 64 && second <= 127) return true;
    if (first === 169 && second === 254) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && (second === 168 || (second === 0 && (third === 0 || third === 2)))) return true;
    if (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) return true;
    return first === 203 && second === 0 && third === 113;
  }

  function ipv6Parts(hostname) {
    let value = hostname.replace(/^\[|\]$/g, "");
    if (value.includes(".")) {
      const boundary = value.lastIndexOf(":");
      const embedded = boundary < 0 ? null : ipv4Bytes(value.slice(boundary + 1));
      if (!embedded) return null;
      value = `${value.slice(0, boundary)}:${((embedded[0] << 8) | embedded[1]).toString(16)}:${((embedded[2] << 8) | embedded[3]).toString(16)}`;
    }
    const separator = value.indexOf("::");
    if (separator !== -1 && value.indexOf("::", separator + 1) !== -1) return null;
    const left = separator === -1 ? value.split(":") : value.slice(0, separator).split(":").filter(Boolean);
    const right = separator === -1 ? [] : value.slice(separator + 2).split(":").filter(Boolean);
    if ((separator === -1 && left.length !== 8) || left.length + right.length >= 8) return null;
    const parts = [...left, ...Array(separator === -1 ? 0 : 8 - left.length - right.length).fill("0"), ...right];
    if (parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
    return parts.map((part) => Number.parseInt(part, 16));
  }

  function isNonPublicIpv6(parts) {
    const isZeroPrefix = (length) => parts.slice(0, length).every((part) => part === 0);
    const asIpv4 = () => [parts[6] >> 8, parts[6] & 255, parts[7] >> 8, parts[7] & 255];
    if (parts.every((part) => part === 0) || (isZeroPrefix(7) && parts[7] === 1)) return true;
    if ((parts[0] & 0xff00) === 0xff00 || (parts[0] & 0xfe00) === 0xfc00 || (parts[0] & 0xffc0) === 0xfe80 || (parts[0] & 0xffc0) === 0xfec0) return true;
    if (parts[0] === 0x2001 && parts[1] === 0x0db8) return true;
    if (isZeroPrefix(6) || (isZeroPrefix(5) && parts[5] === 0xffff)) return isNonPublicIpv4(asIpv4());
    return false;
  }

  function isNonPublicHost(hostname) {
    const host = hostname.toLowerCase().replace(/\.+$/, "");
    const ipv4 = ipv4Bytes(host);
    if (ipv4) return isNonPublicIpv4(ipv4);
    const ipv6 = ipv6Parts(host);
    if (ipv6) return isNonPublicIpv6(ipv6);
    return !host || host === "localhost" || host.endsWith(".localhost") || host === "local" || host.endsWith(".local") || host === "localhost.localdomain" || host.endsWith(".localdomain") || host === "broadcasthost";
  }

  function normalizeInput(input) {
    const item = input && typeof input === "object" ? input : {};
    const itemId = clean(item.item_id);
    const kind = clean(item.source_kind || "article").toLowerCase();
    const rawUrl = clean(item.url);
    if (!itemId) return { itemId: "", invalid: "item_id_invalid" };
    if (!ARTICLE_KINDS.has(kind)) return { itemId, invalid: "unsupported_kind" };
    let parsed;
    try { parsed = new URL(rawUrl); } catch (error) { return { itemId, invalid: "url_invalid" }; }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password || isNonPublicHost(parsed.hostname)) return { itemId, invalid: "url_invalid" };
    if (VIDEO_OR_COURSE_HOST.test(parsed.hostname) || /\/(?:video|videos|course|courses)(?:\/|$)/i.test(parsed.pathname)) return { itemId, invalid: "unsupported_kind" };
    // This deterministic hostname/IP syntax check does not resolve DNS; requestUrl still needs resolver-side SSRF controls for hostile external hostnames or DNS rebinding.
    return { itemId, url: parsed.toString() };
  }

  function responseText(response) {
    if (typeof response === "string") return response;
    if (!response || typeof response !== "object") return "";
    return typeof response.text === "string" ? response.text : typeof response.body === "string" ? response.body : "";
  }

  function responseStatus(response) { return response && Number.isFinite(response.status) ? response.status : 200; }

  function createKnowledgeSourceFetchService(deps) {
    const inputs = deps && typeof deps === "object" ? deps : {};
    const requestUrl = typeof inputs.requestUrl === "function" ? inputs.requestUrl : null;
    const defaultTimeout = Number.isFinite(inputs.timeoutMs) ? Math.max(0, inputs.timeoutMs) : DEFAULT_TIMEOUT_MS;
    let nextRequestId = 0;
    const latestRequestIds = new Map();
    const latestResults = new Map();

    function apply(itemId, requestId, result) {
      if (latestRequestIds.get(itemId) !== requestId) return stale(result);
      latestResults.set(itemId, result);
      return result;
    }

    async function retrieveArticle(input, options) {
      const normalized = normalizeInput(input);
      const itemId = normalized.itemId || "";
      if (!itemId) return fallback("", normalized.invalid || "item_id_invalid");
      const requestId = ++nextRequestId;
      latestRequestIds.set(itemId, requestId);
      if (normalized.invalid) return apply(itemId, requestId, fallback(itemId, normalized.invalid));
      if (!requestUrl) return apply(itemId, requestId, fallback(itemId, "request_unavailable"));

      const settings = options && typeof options === "object" ? options : {};
      const externalSignal = settings.signal;
      if (externalSignal && externalSignal.aborted) return apply(itemId, requestId, fallback(itemId, "cancelled", "cancelled"));
      const controller = new AbortController();
      let timer = null;
      let onAbort = null;
      let cancel;
      const cancelled = new Promise((resolve) => { cancel = resolve; });
      if (externalSignal) {
        onAbort = () => { controller.abort(); cancel({ kind: "cancelled" }); };
        externalSignal.addEventListener("abort", onAbort, { once: true });
      }
      const timeoutMs = Number.isFinite(settings.timeoutMs) ? Math.max(0, settings.timeoutMs) : defaultTimeout;
      const request = Promise.resolve().then(() => requestUrl({
        url: normalized.url,
        method: "GET",
        headers: { Accept: "text/html,application/xhtml+xml" },
        signal: controller.signal
      })).then((value) => ({ ok: true, value }), () => ({ ok: false }));
      const timeout = new Promise((resolve) => {
        if (timeoutMs === 0) { controller.abort(); resolve({ kind: "timeout" }); return; }
        timer = setTimeout(() => { controller.abort(); resolve({ kind: "timeout" }); }, timeoutMs);
      });
      const settled = await Promise.race([request, timeout, cancelled]);
      if (timer) clearTimeout(timer);
      if (externalSignal && onAbort) externalSignal.removeEventListener("abort", onAbort);
      if (settled && settled.kind === "cancelled") return apply(itemId, requestId, fallback(itemId, "cancelled", "cancelled"));
      if (settled && settled.kind === "timeout") return apply(itemId, requestId, fallback(itemId, "timeout", "timeout"));
      if (!settled || !settled.ok) return apply(itemId, requestId, fallback(itemId, "request_failed"));
      const status = responseStatus(settled.value);
      if (status === 401 || status === 403 || status === 429 || status >= 400) return apply(itemId, requestId, fallback(itemId, "access_blocked"));
      const extracted = extractArticle(responseText(settled.value));
      if (!extracted) return apply(itemId, requestId, fallback(itemId, "article_unavailable"));
      const publicResult = freeze({
        item_id: itemId,
        status: "retrieved",
        applied: true,
        title: extracted.title,
        publisher: extracted.publisher,
        date: extracted.date,
        text_origin: "explicit_retrieval"
      });
      if (latestRequestIds.get(itemId) !== requestId) return stale(publicResult);
      try {
        if (typeof settings.onRetrieved === "function") settings.onRetrieved(extracted.text, publicResult);
      } catch (error) {
        return apply(itemId, requestId, fallback(itemId, "consumer_failed"));
      }
      return apply(itemId, requestId, publicResult);
    }

    return freeze({
      retrieveArticle,
      getLatestResult(itemId) { return latestResults.get(clean(itemId)) || null; }
    });
  }

  const api = freeze({ createKnowledgeSourceFetchService, extractArticle });
  root.KnowledgeSourceFetchRuntime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
