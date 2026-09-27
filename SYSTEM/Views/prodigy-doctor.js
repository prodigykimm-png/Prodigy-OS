"use strict";

/**
 * Prodigy Doctor — 필수 플러그인·설정 정상 여부 확인 화면
 * Home 또는 명령 팔레트에서 접근 가능.
 * 읽기 전용 검사만 수행하며 Vault를 수정하지 않는다.
 */
(function (root) {
  const T = root.ProdigyTokens || {}; const C = T.COLORS || {};
  var REQUIRED_PLUGINS = Object.freeze([
    Object.freeze({ id: "dataview", label: "Dataview", purpose: "대시보드 데이터 조회" }),
    Object.freeze({ id: "datacore", label: "Datacore", purpose: "Dataview 성능 보강" }),
    Object.freeze({ id: "js-engine", label: "JS Engine", purpose: "대시보드 스크립트 실행" }),
    Object.freeze({ id: "obsidian-meta-bind-plugin", label: "Meta Bind", purpose: "입력·버튼 UI" }),
    Object.freeze({ id: "templater-obsidian", label: "Templater", purpose: "템플릿 적용" }),
    Object.freeze({ id: "quickadd", label: "QuickAdd", purpose: "빠른 캡처" }),
    Object.freeze({ id: "journals", label: "Journals", purpose: "Daily/Weekly/Monthly 노트" }),
    Object.freeze({ id: "obsidian-tasks-plugin", label: "Tasks", purpose: "할 일 관리" })
  ]);

  var OPTIONAL_PLUGINS = Object.freeze([
    Object.freeze({ id: "todoist-sync-plugin", label: "Todoist Sync", purpose: "외부 할 일 동기화" }),
    Object.freeze({ id: "home-tab", label: "Home Tab", purpose: "새 탭 홈 화면" }),
    Object.freeze({ id: "obsidian-view-mode-by-frontmatter", label: "View Mode", purpose: "읽기 모드 자동 전환" }),
    Object.freeze({ id: "kr-book-info-plugin", label: "Korean Book Info", purpose: "한국어 책 정보 검색" })
  ]);

  function checkPlugins(app) {
    var results = [];
    var plugins = app && app.plugins;
    var enabledIds = plugins && plugins.enabledPlugins ? plugins.enabledPlugins : new Set();
    var manifests = plugins && plugins.manifests ? plugins.manifests : {};

    function check(list, required) {
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var installed = !!manifests[p.id];
        var enabled = enabledIds instanceof Set ? enabledIds.has(p.id) : Array.isArray(enabledIds) ? enabledIds.indexOf(p.id) !== -1 : false;
        var version = installed && manifests[p.id] ? manifests[p.id].version || "알 수 없음" : null;
        results.push(Object.freeze({
          id: p.id, label: p.label, purpose: p.purpose, required: required,
          installed: installed, enabled: enabled, version: version,
          status: !installed ? "미설치" : !enabled ? "비활성" : "정상"
        }));
      }
    }

    check(REQUIRED_PLUGINS, true);
    check(OPTIONAL_PLUGINS, false);
    return Object.freeze(results);
  }

  function checkVaultStructure(app) {
    var checks = [];
    var vault = app && app.vault;
    if (!vault) return Object.freeze([{ label: "Vault", status: "오류", detail: "Vault에 접근할 수 없습니다." }]);

    var dirs = ["HUB", "SYSTEM/Views", "SYSTEM/Prodigy/Schema", "SYSTEM/TEMPLATE/FORMAT", "PARA", "ZETA", "DAILY"];
    for (var i = 0; i < dirs.length; i++) {
      var dir = dirs[i];
      var folder = vault.getAbstractFileByPath(dir);
      checks.push(Object.freeze({ label: dir, status: folder ? "정상" : "누락", detail: folder ? "" : "폴더가 존재하지 않습니다." }));
    }
    return Object.freeze(checks);
  }

  var CUSTOM_PLUGINS = Object.freeze([
    Object.freeze({ id: "prodigy-ai-runtime", label: "Prodigy AI Runtime", purpose: "AI 호출 전달·연결 상태" }),
    Object.freeze({ id: "prodigy-llm-wiki", label: "LLM Wiki", purpose: "자료 정리·Wiki 검토" }),
    Object.freeze({ id: "prodigy-vault-assistant", label: "Vault Assistant", purpose: "Vault 기반 답변" })
  ]);

  var HEALTH_STATES = Object.freeze(["ready", "degraded", "blocked", "unavailable"]);

  function freezeHealth(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freezeHealth));
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freezeHealth(value[key]); });
    return Object.freeze(value);
  }

  function checkCustomPlugins(app) {
    var results = [];
    var plugins = app && app.plugins;
    var enabledIds = plugins && plugins.enabledPlugins ? plugins.enabledPlugins : new Set();
    var manifests = plugins && plugins.manifests ? plugins.manifests : {};
    for (var i = 0; i < CUSTOM_PLUGINS.length; i++) {
      var item = CUSTOM_PLUGINS[i];
      var installed = !!manifests[item.id];
      var enabled = enabledIds instanceof Set ? enabledIds.has(item.id) : Array.isArray(enabledIds) ? enabledIds.indexOf(item.id) !== -1 : false;
      var version = installed && manifests[item.id] ? manifests[item.id].version || "알 수 없음" : null;
      results.push({
        id: item.id, label: item.label, purpose: item.purpose, required: false,
        installed: installed, enabled: enabled, version: version,
        status: !installed ? "미설치" : !enabled ? "비활성" : "정상"
      });
    }
    return freezeHealth(results);
  }

  /*
   * Provider configuration state is derived ONLY from the runtime plugin's
   * public status (labels such as provider/model display names). Secret
   * material is never read and raw provider errors are never surfaced:
   * failures collapse into fixed Korean copy.
   */
  function checkProviderRuntime(app) {
    function unavailable(reason) {
      return freezeHealth({ state: "unavailable", configured: null, providerLabel: null, modelLabel: null, detail: reason || "연결 상태를 확인할 수 없습니다." });
    }
    try {
      var plugins = app && app.plugins;
      if (!plugins || typeof plugins.getPlugin !== "function") return unavailable("실행 플러그인 조회가 불가능합니다.");
      var plugin = plugins.getPlugin("prodigy-ai-runtime");
      if (!plugin) return freezeHealth({ state: "missing_plugin", configured: false, providerLabel: null, modelLabel: null, detail: "Prodigy AI Runtime 플러그인이 설치되지 않았습니다." });
      var runtime = plugin.api || plugin;
      if (!runtime || typeof runtime.getStatus !== "function") return unavailable("실행 상태 조회가 불가능합니다.");
      var status = runtime.getStatus();
      if (!status || typeof status !== "object") return unavailable("실행 상태가 올바르지 않습니다.");
      var raw = status.status !== undefined ? status.status : status.state;
      var name = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      var code = typeof status.error_code === "string" ? status.error_code : typeof status.errorCode === "string" ? status.errorCode : "";
      var providerLabel = typeof status.provider_label === "string" ? status.provider_label : typeof status.providerLabel === "string" ? status.providerLabel : null;
      var modelLabel = typeof status.model_label === "string" ? status.model_label : typeof status.modelLabel === "string" ? status.modelLabel : null;
      if (providerLabel !== null) providerLabel = providerLabel.slice(0, 96);
      if (modelLabel !== null) modelLabel = modelLabel.slice(0, 96);
      if (name === "ready") return freezeHealth({ state: "ready", configured: true, providerLabel: providerLabel, modelLabel: modelLabel, detail: "설정됨" });
      if (code === "configuration_missing" || code === "secret_missing" || code === "login_required" || name === "not_configured" || name === "unconfigured" || name === "missing") {
        return freezeHealth({ state: "not_configured", configured: false, providerLabel: providerLabel, modelLabel: modelLabel, detail: "AI 연결 설정이 필요합니다. AI 설정에서 연결을 확인해 주세요." });
      }
      return freezeHealth({ state: "error", configured: false, providerLabel: providerLabel, modelLabel: modelLabel, detail: "AI 실행 상태에 문제가 있습니다. AI 설정에서 연결을 확인해 주세요." });
    } catch (_) {
      return unavailable("연결 상태를 확인할 수 없습니다.");
    }
  }

  /* Typed review rollup: pending fleeting blocks plus interrupted operations. Absent or malformed input is "unavailable", never a throw. */
  function summarizeReview(fleeting, operations) {
    try {
      var pending = null;
      /* A blocked snapshot means the state file itself is unreadable: its zero is not a count. */
      var blocked = fleeting && typeof fleeting === "object" && fleeting.status === "blocked";
      if (!blocked && fleeting && typeof fleeting === "object" && Number.isInteger(fleeting.pending_count) && fleeting.pending_count >= 0) pending = fleeting.pending_count;
      var interrupted = null;
      if (operations !== undefined && operations !== null) {
        var list = Array.isArray(operations) ? operations : [operations];
        var valid = list.every(function (item) { return item && typeof item === "object" && typeof item.status === "string"; });
        if (valid) interrupted = list.filter(function (item) { return item.status === "interrupted"; }).length;
      }
      var state = pending === null || interrupted === null ? "unavailable" : pending > 0 || interrupted > 0 ? "attention" : "ok";
      var detail = state === "unavailable" ? "검토 상태를 확인할 수 없습니다. 지식 화면을 열어 상태를 불러오세요."
        : state === "attention" ? "미검토 " + pending + "건, 중단됨 " + interrupted + "건이 있습니다. 지식 화면에서 검토를 이어가세요."
        : "미검토· 중단된 항목이 없습니다.";
      return freezeHealth({ state: state, pending: pending, interrupted: interrupted, detail: detail });
    } catch (_) {
      return freezeHealth({ state: "unavailable", pending: null, interrupted: null, detail: "검토 상태를 확인할 수 없습니다." });
    }
  }

  /* Typed quarantine rollup: counts quarantined items only. Never throws. */
  function summarizeQuarantine(input) {
    try {
      var count = null;
      if (input !== undefined && input !== null) {
        if (Array.isArray(input)) {
          if (input.every(function (item) { return item && typeof item === "object" && typeof item.status === "string"; })) {
            count = input.filter(function (item) { return item.status === "quarantined"; }).length;
          }
        } else if (typeof input === "object") {
          if (Number.isInteger(input.count) && input.count >= 0) count = input.count;
          else if (Array.isArray(input.items) && input.items.every(function (item) { return item && typeof item === "object" && typeof item.status === "string"; })) {
            count = input.items.filter(function (item) { return item.status === "quarantined"; }).length;
          }
        }
      }
      var state = count === null ? "unavailable" : count > 0 ? "attention" : "ok";
      var detail = state === "unavailable" ? "격리 상태를 확인할 수 없습니다."
        : state === "attention" ? "격리된 항목 " + count + "건이 있습니다. 격리 사유를 확인한 뒤 복구하세요."
        : "격리된 항목이 없습니다.";
      return freezeHealth({ state: state, count: count, detail: detail });
    } catch (_) {
      return freezeHealth({ state: "unavailable", count: null, detail: "격리 상태를 확인할 수 없습니다." });
    }
  }

  /* Typed last-release rollup: verdict labels only, never paths or raw errors. */
  function summarizeRelease(input) {
    try {
      if (!input || typeof input !== "object") return freezeHealth({ state: "unavailable", verdict: null, detail: "최근 릴리스 기록을 확인할 수 없습니다." });
      var raw = input.state !== undefined ? input.state : input.status !== undefined ? input.status : input.verdict;
      var verdict = typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 64) : "";
      if (!verdict) return freezeHealth({ state: "unavailable", verdict: null, detail: "최근 릴리스 기록을 확인할 수 없습니다." });
      var ok = ["ok", "pass", "passed", "success", "ready", "released", "green"].indexOf(verdict) !== -1;
      var failed = ["fail", "failed", "failure", "error", "blocked", "red"].indexOf(verdict) !== -1;
      var state = ok ? "ok" : failed ? "failed" : "unavailable";
      var detail = state === "ok" ? "최근 릴리스가 정상입니다 (" + verdict + ")."
        : state === "failed" ? "최근 릴리스에 실패가 있습니다 (" + verdict + "). 릴리스 기록을 확인해 주세요."
        : "최근 릴리스 기록을 확인할 수 없습니다.";
      return freezeHealth({ state: state, verdict: verdict, detail: detail });
    } catch (_) {
      return freezeHealth({ state: "unavailable", verdict: null, detail: "최근 릴리스 기록을 확인할 수 없습니다." });
    }
  }

  function readWorkspaceHealth(app, sources) {
    try {
      var loader = root.ProdigyHubLoader;
      if ((!loader || typeof loader.checkReadiness !== "function") && typeof require === "function") {
        try { loader = require("./prodigy-hub-loader.js"); } catch (_) { loader = null; }
      }
      if (!loader || typeof loader.checkReadiness !== "function") {
        return freezeHealth({ state: "unavailable", detail: "작업 공간 상태를 확인할 수 없습니다.", summary: null });
      }
      var target = sources && (sources.workspaceId !== undefined ? sources.workspaceId : sources.workspaces) || undefined;
      var summary = loader.checkReadiness(app, target);
      var state = summary.blocked ? "blocked" : summary.degraded ? "degraded" : "ready";
      return freezeHealth({ state: state, detail: summary.message, summary: summary });
    } catch (_) {
      return freezeHealth({ state: "unavailable", detail: "작업 공간 상태를 확인할 수 없습니다.", summary: null });
    }
  }

  function collectHealth(app, sources) {
    var input = sources && typeof sources === "object" ? sources : {};
    var workspace = readWorkspaceHealth(app, input);
    var custom = checkCustomPlugins(app);
    var provider = checkProviderRuntime(app);
    var fleeting = input.fleeting !== undefined ? input.fleeting : input.review !== undefined ? input.review : null;
    var review = summarizeReview(fleeting, input.operations);
    var quarantine = summarizeQuarantine(input.quarantine);
    var release = summarizeRelease(input.release);
    var blocked = workspace.state === "blocked";
    var degraded = !blocked && (workspace.state === "degraded" || provider.state === "not_configured" || provider.state === "error"
      || review.state === "attention" || quarantine.state === "attention" || release.state === "failed"
      || custom.some(function (item) { return item.status !== "정상"; }));
    var overall = blocked ? "blocked" : degraded ? "degraded" : "ready";
    var message = overall === "blocked" ? "작업을 계속할 수 없는 문제가 있습니다. 아래 항목을 확인해 주세요."
      : overall === "degraded" ? "주의가 필요한 항목이 있습니다. 문제는 있지만 계속 사용할 수 있습니다."
      : "모든 상태가 정상입니다.";
    return freezeHealth({ workspace: workspace, custom: custom, provider: provider, review: review, quarantine: quarantine, release: release, overall: overall, message: message });
  }

  /* Async read-only detail reader: only vault reads, never writes. Fleeting pending count reuses the Home review-state pattern. */
  function readFleetingSnapshot(app) {
    try {
      var reviewApi = root.KnowledgeFleetingReviewState;
      if ((!reviewApi || typeof reviewApi.createFleetingReviewState !== "function") && typeof require === "function") {
        try { reviewApi = require("./knowledge-fleeting-review-state.js"); } catch (_) { reviewApi = null; }
      }
      if (!reviewApi || typeof reviewApi.createFleetingReviewState !== "function") return Promise.resolve(null);
      if (!app || !app.vault || typeof app.vault.getMarkdownFiles !== "function" || typeof app.vault.getAbstractFileByPath !== "function") return Promise.resolve(null);
      var state = reviewApi.createFleetingReviewState({
        vault: app.vault,
        analyze: function () { return Promise.resolve({ ok: false, reason: "doctor_read_only", completed_block_ids: [], reviews: [] }); }
      });
      return Promise.resolve(state.refresh()).then(function (snapshot) {
        if (!snapshot || typeof snapshot.pending_count !== "number") return null;
        return snapshot;
      }, function () { return null; });
    } catch (_) {
      return Promise.resolve(null);
    }
  }

  function readHealthDetails(app, options) {
    var input = options && typeof options === "object" ? options : {};
    return Promise.resolve(readFleetingSnapshot(app)).then(function (fleeting) {
      var merged = {};
      Object.keys(input).forEach(function (key) { merged[key] = input[key]; });
      if (merged.fleeting === undefined && merged.review === undefined) merged.fleeting = fleeting;
      return collectHealth(app, merged);
    });
  }

  function healthBadgeText(state) {
    if (state === "ready" || state === "ok") return "정상";
    if (state === "degraded" || state === "attention") return "주의";
    if (state === "blocked" || state === "failed" || state === "error" || state === "not_configured") return "문제";
    return "확인 불가";
  }

  function renderHealthRow(list, label, state, detail) {
    var li = list.createEl("li");
    li.createEl("span", { text: label + ": " });
    var badge = li.createEl("span", { text: healthBadgeText(state) });
    badge.setAttribute("style", state === "ready" || state === "ok"
      ? "color:var(--text-success);font-weight:700;"
      : state === "degraded" || state === "attention" ? "color:var(--text-warning);font-weight:700;"
      : state === "blocked" || state === "failed" || state === "error" || state === "not_configured" ? "color:var(--text-error);font-weight:700;"
      : "color:var(--text-muted);font-weight:700;");
    if (detail) li.createEl("span", { text: " — " + detail });
    return li;
  }

  function renderHealth(section, app, options) {
    var input = options && typeof options === "object" ? options : {};
    var health = input.health && typeof input.health === "object" ? input.health : collectHealth(app, input.sources);
    section.createEl("h3", { text: "작업 공간 상태" });
    section.createEl("p", { text: "준비 상태·사용 플러그인·검토·연결·격리·릴리스를 한 화면에서 확인합니다. 이 화면은 읽기 전용입니다.", attr: { class: "setting-item-description" } });
    var list = section.createEl("ul");
    renderHealthRow(list, "전체", health.overall, health.message);
    renderHealthRow(list, "워크스페이스", health.workspace.state, health.workspace.detail);
    var customBad = health.custom.filter(function (item) { return item.status !== "정상"; });
    renderHealthRow(list, "사용 플러그인", customBad.length ? "degraded" : "ready",
      customBad.length ? customBad.map(function (item) { return item.label + "(" + item.status + ")"; }).join(", ") : "Runtime·LLM Wiki·Vault Assistant 정상");
    renderHealthRow(list, "AI 연결", health.provider.state, health.provider.detail
      + (health.provider.providerLabel ? " (" + health.provider.providerLabel + (health.provider.modelLabel ? "/" + health.provider.modelLabel : "") + ")" : ""));
    var reviewDetail = health.review.state === "unavailable" ? health.review.detail
      : "미검토 " + health.review.pending + "건 · 중단됨 " + health.review.interrupted + "건";
    renderHealthRow(list, "검토", health.review.state, reviewDetail);
    renderHealthRow(list, "격리", health.quarantine.state, health.quarantine.state === "unavailable" ? health.quarantine.detail : "격리 " + health.quarantine.count + "건");
    renderHealthRow(list, "최근 릴리스", health.release.state, health.release.detail);
    return health;
  }

  function renderDoctor(container, app, options) {
    if (!container) return;
    if (typeof container.empty === "function") container.empty();

    var section = container.createEl ? container.createEl("section", { attr: { class: "prodigy-doctor", "aria-label": "Prodigy Doctor" } }) : null;
    if (!section) return;

    section.createEl("h2", { text: "🩺 Prodigy Doctor" });
    section.createEl("p", { text: "필수 플러그인과 Vault 구조를 확인합니다. 이 화면은 읽기 전용입니다.", attr: { class: "setting-item-description" } });

    // 플러그인 검사
    section.createEl("h3", { text: "플러그인" });
    var pluginResults = checkPlugins(app);
    var table = section.createEl("table", { attr: { class: "prodigy-doctor-table" } });
    var thead = table.createEl("thead");
    var headRow = thead.createEl("tr");
    ["플러그인", "용도", "버전", "상태"].forEach(function (h) { headRow.createEl("th", { text: h }); });
    var tbody = table.createEl("tbody");
    var failCount = 0;
    pluginResults.forEach(function (p) {
      var row = tbody.createEl("tr");
      row.createEl("td", { text: (p.required ? "★ " : "") + p.label });
      row.createEl("td", { text: p.purpose });
      row.createEl("td", { text: p.version || "—" });
      var statusCell = row.createEl("td", { text: p.status });
      if (p.status !== "정상") {
        statusCell.setAttribute("style", "color:var(--text-error);font-weight:700;");
        if (p.required) failCount++;
      } else {
        statusCell.setAttribute("style", "color:var(--text-success);");
      }
    });

    // Vault 구조 검사
    section.createEl("h3", { text: "Vault 구조" });
    var vaultResults = checkVaultStructure(app);
    var vList = section.createEl("ul");
    vaultResults.forEach(function (v) {
      var li = vList.createEl("li");
      li.createEl("span", { text: v.label + ": " });
      var badge = li.createEl("span", { text: v.status });
      badge.setAttribute("style", v.status === "정상" ? "color:var(--text-success);font-weight:700;" : "color:var(--text-error);font-weight:700;");
      if (v.detail) li.createEl("span", { text: " — " + v.detail });
    });

    renderHealth(section, app, options);

    // 종합 판정
    var verdict = section.createEl("div", { attr: { style: "margin-top:16px;padding:12px;border-radius:8px;font-weight:700;" } });
    if (failCount === 0) {
      verdict.textContent = "✅ 모든 필수 플러그인이 정상입니다.";
      verdict.setAttribute("style", "margin-top:16px;padding:12px;border-radius:8px;font-weight:700;background:rgba(34,197,94,0.1);color:var(--text-success);");
    } else {
      verdict.textContent = "⚠️ 필수 플러그인 " + failCount + "개가 비정상입니다. 활성화하거나 설치해 주세요.";
      verdict.setAttribute("style", "margin-top:16px;padding:12px;border-radius:8px;font-weight:700;background:rgba(239,68,68,0.1);color:var(--text-error);");
    }

    return section;
  }

  var api = Object.freeze({
    REQUIRED_PLUGINS: REQUIRED_PLUGINS,
    OPTIONAL_PLUGINS: OPTIONAL_PLUGINS,
    CUSTOM_PLUGINS: CUSTOM_PLUGINS,
    checkPlugins: checkPlugins,
    checkCustomPlugins: checkCustomPlugins,
    checkProviderRuntime: checkProviderRuntime,
    checkVaultStructure: checkVaultStructure,
    summarizeReview: summarizeReview,
    summarizeQuarantine: summarizeQuarantine,
    summarizeRelease: summarizeRelease,
    collectHealth: collectHealth,
    readFleetingSnapshot: readFleetingSnapshot,
    readHealthDetails: readHealthDetails,
    renderDoctor: renderDoctor
  });
  root.ProdigyDoctor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
