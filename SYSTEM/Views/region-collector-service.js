/**
 * region-collector-service.js
 *
 * One versioned Region Intelligence collector singleton.
 *
 * Responsibilities:
 *  - start / resume / manual (지금 수집) dispatch of due providers
 *  - lease + fencing (10m lease, 30s heartbeat, tuple fencing with process_nonce)
 *  - KST daily budget reservation BEFORE each HTTP attempt (never refunded)
 *  - retry / HTTP 429 / cancel / restart handling
 *  - status + 지금 수집 actions
 *
 * Network runs ONLY through Obsidian `requestUrl`; secrets only through
 * `app.secretStorage`. Pure state builders are offline-testable. This module
 * never sends secret values to Node, cache, or logs, and never applies Objects.
 *
 * CommonJS/IIFE compatible.
 */
(function (root) {
  "use strict";

  const VERSION = "1.0.0";

  // ---------------------------------------------------------------------------
  // Runtime paths (exactly as frozen in the plan)
  // ---------------------------------------------------------------------------

  const RUNTIME_ROOT = "SYSTEM/CACHE/region-runtime";
  const RUNTIME_PATHS = Object.freeze({
    capability: `${RUNTIME_ROOT}/capability.json`,
    providerRevisions: `${RUNTIME_ROOT}/provider-revisions.json`,
    lease: (p) => `${RUNTIME_ROOT}/providers/${p}/lease.json`,
    inflight: (p) => `${RUNTIME_ROOT}/providers/${p}/inflight.json`,
    retryIntent: (p) => `${RUNTIME_ROOT}/providers/${p}/retry-intent.json`,
    budget: (kstDate, p) => `${RUNTIME_ROOT}/budgets/${kstDate}/${p}.json`
  });

  const LEASE_DURATION_MS = 10 * 60 * 1000;
  const HEARTBEAT_INTERVAL_MS = 30 * 1000;
  const LOGICAL_TIMEOUT_MS = 30 * 1000;
  const MAX_ATTEMPTS = 3;
  const MAX_CONCURRENT = 3;

  // ---------------------------------------------------------------------------
  // Status enums
  // ---------------------------------------------------------------------------

  const RUN_STATE = Object.freeze({
    ACTIVE: "active",
    COMMIT_RESERVED: "commit_reserved",
    TIMED_OUT_PENDING: "timed_out_pending",
    BLOCKED_INFLIGHT_UNKNOWN: "blocked_inflight_unknown",
    ABANDONED: "failed",
    SETTLED: "settled"
  });

  const BLOCK_REASON = Object.freeze({
    AUTH: "blocked_auth",
    SCHEMA: "blocked_schema",
    RUNTIME: "blocked_runtime",
    INFLIGHT: "blocked_inflight",
    NETWORK: "blocked_network",
    TRANSPORT: "blocked_transport"
  });

  // ---------------------------------------------------------------------------
  // Dependency resolution (scheduler + run-state core)
  // ---------------------------------------------------------------------------

  function resolveScheduler() {
    if (root.RegionCollectorScheduler) return root.RegionCollectorScheduler;
    if (typeof require === "function") {
      try { return require("./region-collector-scheduler.js"); } catch (_e) { /* ignore */ }
    }
    throw new Error("RegionCollectorScheduler is not loaded.");
  }

  function defaultSha256(data) {
    if (typeof require === "function") {
      const crypto = require("crypto");
      return crypto.createHash("sha256").update(data).digest("hex");
    }
    throw new Error("No sha256 implementation available.");
  }

  function defaultRandomUUID() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID().toLowerCase();
    }
    if (typeof require === "function") {
      return require("crypto").randomUUID().toLowerCase();
    }
    throw new Error("No UUID generator available.");
  }

  function redact(value) {
    return String(value == null ? "" : value).replace(/[A-Za-z0-9_-]{16,}/g, "[redacted]");
  }

  // ---------------------------------------------------------------------------
  // Pure lease / fencing builders
  // ---------------------------------------------------------------------------

  /**
   * Build a new lease document. Fencing tuple:
   * (provider, run_id, owner_token, monotonic_generation, process_nonce)
   */
  function buildLease(providerId, runId, ownerToken, monotonicGeneration, processNonce, nowMs) {
    const now = nowMs || Date.now();
    return {
      provider: providerId,
      run_id: runId,
      owner_token: ownerToken,
      monotonic_generation: monotonicGeneration,
      process_nonce: processNonce,
      acquired_at: new Date(now).toISOString(),
      expires_at: new Date(now + LEASE_DURATION_MS).toISOString(),
      heartbeat_interval_ms: HEARTBEAT_INTERVAL_MS,
      state: "active"
    };
  }

  function renewLease(lease, nowMs) {
    if (!lease || lease.state !== "active") throw new Error("Cannot renew non-active lease");
    const now = nowMs || Date.now();
    return Object.assign({}, lease, { expires_at: new Date(now + LEASE_DURATION_MS).toISOString() });
  }

  function isLeaseExpired(lease, nowMs) {
    if (!lease || !lease.expires_at) return true;
    return new Date(lease.expires_at).getTime() <= (nowMs || Date.now());
  }

  /**
   * Verify the full fencing tuple matches. Every mutable-state callback must
   * recheck this before writing.
   */
  function verifyFencing(lease, tuple) {
    return Boolean(lease) &&
      lease.provider === tuple.provider &&
      lease.run_id === tuple.run_id &&
      lease.owner_token === tuple.owner_token &&
      lease.monotonic_generation === tuple.monotonic_generation &&
      lease.process_nonce === tuple.process_nonce;
  }

  // ---------------------------------------------------------------------------
  // Pure budget builders
  // ---------------------------------------------------------------------------

  function buildBudgetState(providerId, kstDate, dailyCap) {
    return { provider: providerId, kst_date: kstDate, daily_cap: dailyCap, reserved: 0, reservations: [] };
  }

  /**
   * Reserve `cost` for identity (run_id, attempt). Replaying the same identity
   * is a no-op. A reservation is NEVER refunded. Throws if capacity unavailable.
   */
  function reserveBudget(budgetState, runId, attempt, cost, nowMs) {
    if (!Number.isInteger(attempt) || attempt < 1) throw new Error("attempt must be >= 1");
    if (!Number.isInteger(cost) || cost < 1) throw new Error("cost must be >= 1");
    const identity = `${runId}:${attempt}`;
    if (budgetState.reservations.some((r) => r.identity === identity)) return budgetState;
    if (budgetState.reserved + cost > budgetState.daily_cap) {
      const err = new Error(`Budget exhausted: reserved=${budgetState.reserved}, cost=${cost}, cap=${budgetState.daily_cap}`);
      err.code = "budget_exhausted";
      throw err;
    }
    return {
      provider: budgetState.provider,
      kst_date: budgetState.kst_date,
      daily_cap: budgetState.daily_cap,
      reserved: budgetState.reserved + cost,
      reservations: budgetState.reservations.concat([{
        identity, run_id: runId, attempt, cost,
        reserved_at: new Date(nowMs || Date.now()).toISOString()
      }])
    };
  }

  // ---------------------------------------------------------------------------
  // Pure restart-recovery decision
  // ---------------------------------------------------------------------------

  /**
   * Decide how to treat an expired, receipt-less inflight run observed at
   * startup/resume. Returns one of:
   *   { action: "untouched" }                 active foreign lease
   *   { action: "blocked_inflight_unknown" }  same process_nonce, cannot abandon
   *   { action: "abandon" }                   different nonce, non-commit_reserved
   *   { action: "reconcile" }                 different nonce, commit_reserved
   *
   * @param {object} lease - persisted lease (may be null)
   * @param {object} inflight - persisted inflight (may be null)
   * @param {string} currentNonce - window.__prodigyRegionProcessNonce
   * @param {number} nowMs
   */
  function decideRecovery(lease, inflight, currentNonce, nowMs) {
    if (!lease && !inflight) return { action: "none" };
    // Active (unexpired) foreign lease is untouched.
    if (lease && !isLeaseExpired(lease, nowMs)) return { action: "untouched" };
    // Expired from here on.
    if (!inflight) return { action: "none" };
    const sameProcess = lease && lease.process_nonce === currentNonce;
    if (sameProcess) {
      // Same renderer process: never abandoned or replaced; requires restart.
      return { action: "blocked_inflight_unknown" };
    }
    // Different nonce after a verified new renderer process: old transport
    // cannot still execute.
    if (inflight.stage === "commit_reserved") return { action: "reconcile" };
    return { action: "abandon" };
  }

  // ---------------------------------------------------------------------------
  // Collector
  // ---------------------------------------------------------------------------

  /**
   * Create a collector instance.
   *
   * @param {object} deps
   * @param {function} deps.readFile - async (path) => string|null
   * @param {function} deps.writeFile - async (path, jsonString) => void
   * @param {function} [deps.requestUrl] - async (request) => { status, headers, arrayBuffer }
   * @param {function} [deps.getSecret] - async (secretId) => string
   * @param {function} [deps.now] - () => number (ms)
   * @param {function} [deps.randomUUID] - () => lowercase uuid
   * @param {function} [deps.sha256] - (data) => 64 hex
   * @param {string} [deps.processNonce] - fixed process nonce (else generated once)
   * @param {object} [deps.registry] - provider registry { providers: [...] }
   */
  function createCollector(deps) {
    deps = deps || {};
    const now = deps.now || (() => Date.now());
    const randomUUID = deps.randomUUID || defaultRandomUUID;
    const sha256 = deps.sha256 || defaultSha256;
    const scheduler = resolveScheduler();
    const processNonce = deps.processNonce || randomUUID();
    const registry = deps.registry || { providers: [] };

    // In-memory record of writer (Object apply) calls — must stay zero.
    let writerCalls = 0;
    // In-memory record of secret values leaked to cache/log/Node — must stay zero.
    let secretLeaks = 0;
    // In-memory record of network requests dispatched.
    let networkRequests = 0;
    // Providers currently dispatched in this process.
    const inflight = new Set();

    function registryProvider(providerId) {
      return registry.providers.find((p) => p.provider_id === providerId) || null;
    }

    async function readJSON(path) {
      const text = await deps.readFile(path);
      if (text == null || text === "") return null;
      try { return JSON.parse(text); } catch (_e) { return null; }
    }

    async function writeJSON(path, value) {
      await deps.writeFile(path, JSON.stringify(value, null, 2) + "\n");
    }

    // ---- secret gate (never reveals or persists values) --------------------

    function requiredSecretIds(provider) {
      const auth = String((provider && provider.auth_placement) || "").toLowerCase();
      const ids = [];
      const S = (root.ProdigyConfigService && root.ProdigyConfigService.REGION_SECRET_IDS) || {};
      if (auth.indexOf("naver") !== -1) { if (S.naverClientId) ids.push(S.naverClientId); if (S.naverClientSecret) ids.push(S.naverClientSecret); }
      if (auth.indexOf("youtube") !== -1 && S.youtube) ids.push(S.youtube);
      if (auth.indexOf("vworld") !== -1 && S.vworld) ids.push(S.vworld);
      if (auth.indexOf("seoul") !== -1 && S.seoulOpenapi) ids.push(S.seoulOpenapi);
      if (auth.indexOf("servicekey") !== -1 && S.dataGoKr) ids.push(S.dataGoKr);
      if (auth.indexOf("kosis") !== -1 && S.kosis) ids.push(S.kosis);
      return ids;
    }

    async function checkSecrets(provider) {
      if (!deps.getSecret) return { ok: true, missing: [] };
      const ids = requiredSecretIds(provider);
      const missing = [];
      for (const id of ids) {
        const value = await deps.getSecret(id);
        if (!value) missing.push(id);
      }
      return { ok: missing.length === 0, missing };
    }

    // ---- lease -------------------------------------------------------------

    async function acquireLease(providerId, runId) {
      const ownerToken = randomUUID();
      const existing = await readJSON(RUNTIME_PATHS.lease(providerId));
      let generation = 0;
      if (existing && Number.isInteger(existing.monotonic_generation)) {
        generation = existing.monotonic_generation + 1;
      }
      const lease = buildLease(providerId, runId, ownerToken, generation, processNonce, now());
      await writeJSON(RUNTIME_PATHS.lease(providerId), lease);
      return lease;
    }

    async function heartbeat(lease) {
      // Recheck full fencing tuple before renewing.
      const persisted = await readJSON(RUNTIME_PATHS.lease(lease.provider));
      if (!verifyFencing(persisted, lease)) {
        throw new Error("Fencing tuple mismatch during heartbeat");
      }
      const renewed = renewLease(persisted, now());
      await writeJSON(RUNTIME_PATHS.lease(lease.provider), renewed);
      return renewed;
    }

    async function releaseLease(lease) {
      const persisted = await readJSON(RUNTIME_PATHS.lease(lease.provider));
      if (!verifyFencing(persisted, lease)) return false;
      await writeJSON(RUNTIME_PATHS.lease(lease.provider), Object.assign({}, persisted, { state: "released" }));
      return true;
    }

    // ---- budget ------------------------------------------------------------

    async function reserveAttempt(providerId, runId, attempt, cost) {
      const kstDate = scheduler.formatKSTDate(now());
      const path = RUNTIME_PATHS.budget(kstDate, providerId);
      const cap = scheduler.getDailyCap(providerId);
      let state = await readJSON(path);
      if (!state) state = buildBudgetState(providerId, kstDate, cap);
      const updated = reserveBudget(state, runId, attempt, cost, now());
      await writeJSON(path, updated);
      return updated;
    }

    // ---- network -----------------------------------------------------------

    function buildRequest(provider) {
      const t = provider.transport;
      const headers = Object.assign({}, t.headers || {});
      const request = { method: t.method || "GET", url: t.url, headers, throw: false };
      if (t.method === "POST" && t.body) {
        const params = new URLSearchParams();
        Object.keys(t.body).forEach((k) => params.append(k, t.body[k]));
        request.body = params.toString();
      }
      return request;
    }

    /**
     * Dispatch one HTTP attempt with a logical timeout. Because requestUrl has
     * no trusted abort receipt, a logical timeout marks the attempt
     * timed_out_pending but does NOT release the lease or schedule a retry
     * until the exact Promise settles.
     */
    async function dispatchAttempt(provider, request) {
      if (typeof deps.requestUrl !== "function") {
        const err = new Error("requestUrl is not available (Obsidian runtime only)");
        err.code = BLOCK_REASON.RUNTIME;
        throw err;
      }
      networkRequests += 1;
      let settled = false;
      let timer = null;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => {
          if (!settled) resolve({ timedOut: true });
        }, LOGICAL_TIMEOUT_MS);
      });
      const real = Promise.resolve()
        .then(() => deps.requestUrl(request))
        .then((res) => ({ timedOut: false, res }))
        .catch((error) => ({ timedOut: false, error }));
      const outcome = await Promise.race([real, timeout]);
      if (outcome.timedOut) {
        // Do not release lease; wait for the real promise to settle later.
        real.catch(() => {}).then(() => { settled = true; if (timer) clearTimeout(timer); });
        return { status: "timed_out_pending" };
      }
      settled = true;
      if (timer) clearTimeout(timer);
      if (outcome.error) {
        return { status: "transport_error", message: redact(outcome.error && outcome.error.message) };
      }
      return { status: "settled", response: outcome.res };
    }

    // ---- dispatch orchestration -------------------------------------------

    /**
     * Pre-dispatch gates. Returns { ok: true } or { ok: false, reason }.
     */
    async function preflight(providerId) {
      const provider = registryProvider(providerId);
      if (!provider) return { ok: false, reason: BLOCK_REASON.SCHEMA };
      if (provider.network_allowed !== true) {
        return { ok: false, reason: BLOCK_REASON.NETWORK, detail: provider.transport_missing_reason || "network not allowed" };
      }
      if (!provider.transport) return { ok: false, reason: BLOCK_REASON.TRANSPORT };
      const secret = await checkSecrets(provider);
      if (!secret.ok) return { ok: false, reason: BLOCK_REASON.AUTH, missing: secret.missing };
      if (inflight.has(providerId)) return { ok: false, reason: BLOCK_REASON.INFLIGHT };
      return { ok: true, provider };
    }

    /**
     * Run collection for one provider (one run, up to MAX_ATTEMPTS).
     * Returns a status object. Never applies Objects.
     */
    async function collectProvider(providerId, options) {
      options = options || {};
      const gate = await preflight(providerId);
      if (!gate.ok) {
        return { provider: providerId, status: gate.reason, dispatched: false, missing: gate.missing || [] };
      }
      if (inflight.size >= MAX_CONCURRENT && !inflight.has(providerId)) {
        return { provider: providerId, status: "deferred_concurrency", dispatched: false };
      }
      const provider = gate.provider;
      const runId = randomUUID();
      const lease = await acquireLease(providerId, runId);
      inflight.add(providerId);
      const result = { provider: providerId, run_id: runId, attempts: [], status: "failed" };
      try {
        await writeJSON(RUNTIME_PATHS.inflight(providerId), {
          provider: providerId, run_id: runId, stage: "started",
          process_nonce: processNonce, started_at: new Date(now()).toISOString()
        });
        let attempt = 0;
        while (attempt < MAX_ATTEMPTS) {
          attempt += 1;
          // Reserve budget BEFORE each HTTP attempt. Never refunded.
          try {
            await reserveAttempt(providerId, runId, attempt, 1);
          } catch (err) {
            if (err.code === "budget_exhausted") {
              result.status = "budget_exhausted";
              result.attempts.push({ attempt, status: "budget_exhausted" });
              break;
            }
            throw err;
          }
          // Persist retry intent freezing the settled predecessor identity.
          await writeJSON(RUNTIME_PATHS.retryIntent(providerId), {
            provider: providerId, run_id: runId, next_attempt: attempt,
            last_status: attempt === 1 ? "none" : (result.attempts[attempt - 2] || {}).status || "unknown",
            predecessor_identity: attempt === 1 ? null : `${runId}:${attempt - 1}`,
            due_at: new Date(now()).toISOString()
          });
          await writeJSON(RUNTIME_PATHS.inflight(providerId), {
            provider: providerId, run_id: runId, stage: "attempt",
            attempt, process_nonce: processNonce
          });
          const request = buildRequest(provider);
          const outcome = await dispatchAttempt(provider, request);
          result.attempts.push({ attempt, status: outcome.status, http: outcome.response && outcome.response.status });

          if (outcome.status === "timed_out_pending") {
            result.status = "timed_out_pending";
            break; // do not retry until the promise settles
          }
          if (outcome.status === "settled") {
            const httpStatus = outcome.response && outcome.response.status;
            if (httpStatus >= 200 && httpStatus < 300) {
              await writeJSON(RUNTIME_PATHS.inflight(providerId), {
                provider: providerId, run_id: runId, stage: "commit_reserved",
                attempt, process_nonce: processNonce
              });
              result.status = "commit_reserved";
              result.response = { status: httpStatus };
              break;
            }
            if (httpStatus === 429) {
              const retryAfter = outcome.response.headers &&
                (outcome.response.headers["retry-after"] || outcome.response.headers["Retry-After"]);
              const delay = scheduler.parseRetryAfter(retryAfter, now());
              result.attempts[result.attempts.length - 1].retry_after_ms = delay;
              if (attempt >= MAX_ATTEMPTS) { result.status = "exhausted_429"; break; }
              await sleep(delay);
              continue;
            }
            // Other transient HTTP failure
            if (attempt >= MAX_ATTEMPTS) { result.status = "exhausted_transient"; break; }
            await sleep(scheduler.computeRetryDelay(attempt, providerId, runId, sha256));
            continue;
          }
          // transport_error
          if (attempt >= MAX_ATTEMPTS) { result.status = "exhausted_transient"; break; }
          await sleep(scheduler.computeRetryDelay(attempt, providerId, runId, sha256));
        }
      } finally {
        await releaseLease(lease).catch(() => {});
        inflight.delete(providerId);
        await writeJSON(RUNTIME_PATHS.inflight(providerId), {
          provider: providerId, run_id: runId, stage: "settled",
          status: result.status, settled_at: new Date(now()).toISOString()
        }).catch(() => {});
      }
      return result;
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Dispatch all currently-due providers, honoring concurrency and ordering.
     */
    async function collectDue(providerStates) {
      const due = scheduler.computeDueSchedule(providerStates || [], now());
      const selected = scheduler.selectDispatch(due, inflight, MAX_CONCURRENT);
      const results = [];
      for (const item of selected) {
        results.push(await collectProvider(item.provider_id));
      }
      return { dispatched: results, due_count: due.length };
    }

    /**
     * Manual 지금 수집 for one provider. Reports blocked_inflight if a transport
     * is unresolved, with one deduplicated retry intent.
     */
    async function collectManual(providerId) {
      if (inflight.has(providerId)) {
        return { provider: providerId, status: BLOCK_REASON.INFLIGHT, dispatched: false };
      }
      return collectProvider(providerId, { manual: true });
    }

    /**
     * Startup/resume recovery sweep across providers in the registry.
     */
    async function recover() {
      const outcomes = [];
      for (const provider of registry.providers) {
        const pid = provider.provider_id;
        const lease = await readJSON(RUNTIME_PATHS.lease(pid));
        const infl = await readJSON(RUNTIME_PATHS.inflight(pid));
        const decision = decideRecovery(lease, infl, processNonce, now());
        if (decision.action === "abandon") {
          await writeJSON(RUNTIME_PATHS.inflight(pid), Object.assign({}, infl, {
            stage: "settled", status: "failed", reason: "abandoned_after_process_restart",
            settled_at: new Date(now()).toISOString()
          }));
        } else if (decision.action === "blocked_inflight_unknown") {
          await writeJSON(RUNTIME_PATHS.inflight(pid), Object.assign({}, infl, {
            stage: "blocked_inflight_unknown"
          }));
        }
        // reconcile / untouched leave bytes for the dedicated reconciliation path.
        outcomes.push({ provider: pid, action: decision.action });
      }
      return outcomes;
    }

    /**
     * Status snapshot for UI. Never reveals secret values.
     */
    async function status() {
      const providers = [];
      for (const provider of registry.providers) {
        const secret = await checkSecrets(provider);
        providers.push({
          provider_id: provider.provider_id,
          status: provider.status,
          network_allowed: provider.network_allowed === true,
          secrets_present: secret.ok,
          missing_secrets: secret.missing.length,
          inflight: inflight.has(provider.provider_id)
        });
      }
      return {
        version: VERSION,
        process_nonce_present: Boolean(processNonce),
        active_inflight: inflight.size,
        writer_calls: writerCalls,
        secret_leaks: secretLeaks,
        network_requests: networkRequests,
        providers
      };
    }

    return {
      version: VERSION,
      processNonce,
      RUNTIME_PATHS,
      collectProvider,
      collectDue,
      collectManual,
      recover,
      status,
      acquireLease,
      heartbeat,
      releaseLease,
      reserveAttempt,
      preflight,
      decideRecovery: (lease, infl) => decideRecovery(lease, infl, processNonce, now()),
      _counters: () => ({ writerCalls, secretLeaks, networkRequests })
    };
  }

  // ---------------------------------------------------------------------------
  // Singleton (Obsidian runtime)
  // ---------------------------------------------------------------------------

  let singleton = null;

  /**
   * Get (or create) the process singleton bound to the Obsidian app.
   * Assigns window.__prodigyRegionProcessNonce once; never replaced while the
   * renderer process lives.
   */
  function getCollector(app, registry) {
    if (singleton) return singleton;
    const win = root;
    if (!win.__prodigyRegionProcessNonce) {
      win.__prodigyRegionProcessNonce = defaultRandomUUID();
    }
    const processNonce = win.__prodigyRegionProcessNonce;

    async function readFile(path) {
      if (!app || !app.vault) return null;
      const file = app.vault.getAbstractFileByPath(path);
      if (!file) return null;
      return app.vault.read(file);
    }
    async function writeFile(path, text) {
      if (!app || !app.vault) throw new Error("Vault access is not available.");
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join("/");
        if (!app.vault.getAbstractFileByPath(dir) && typeof app.vault.createFolder === "function") {
          try { await app.vault.createFolder(dir); } catch (_e) { /* ignore */ }
        }
      }
      const file = app.vault.getAbstractFileByPath(path);
      if (file) await app.vault.modify(file, text);
      else await app.vault.create(path, text);
    }
    async function getSecret(secretId) {
      const svc = root.ProdigyConfigService;
      if (svc && typeof svc.getSecret === "function") return svc.getSecret(app, secretId);
      return "";
    }
    const requestUrl = root.requestUrl || (app && app.requestUrl) || null;

    singleton = createCollector({
      readFile, writeFile, requestUrl, getSecret,
      processNonce, registry: registry || { providers: [] }
    });
    return singleton;
  }

  function resetSingleton() { singleton = null; }

  // ---------------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------------

  const api = {
    VERSION,
    RUNTIME_ROOT,
    RUNTIME_PATHS,
    LEASE_DURATION_MS,
    HEARTBEAT_INTERVAL_MS,
    LOGICAL_TIMEOUT_MS,
    MAX_ATTEMPTS,
    MAX_CONCURRENT,
    RUN_STATE,
    BLOCK_REASON,
    buildLease,
    renewLease,
    isLeaseExpired,
    verifyFencing,
    buildBudgetState,
    reserveBudget,
    decideRecovery,
    createCollector,
    getCollector,
    resetSingleton
  };

  root.RegionCollectorService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
