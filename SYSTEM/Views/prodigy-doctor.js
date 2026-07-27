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

  function renderDoctor(container, app) {
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
    checkPlugins: checkPlugins,
    checkVaultStructure: checkVaultStructure,
    renderDoctor: renderDoctor
  });
  root.ProdigyDoctor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
