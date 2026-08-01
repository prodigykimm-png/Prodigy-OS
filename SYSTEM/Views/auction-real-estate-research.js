(function (root) {
  "use strict";

  const CACHE_ROOT = "SYSTEM/CACHE/real-estate-source-packages";
  const RECEIPT_ROOT = "SYSTEM/CACHE/real-estate-source-approvals";
  const STYLE_ID = "prodigy-auction-real-estate-research-style";

  function core() { return root.AuctionRealEstateResearchCore; }
  function writer() { return root.AuctionSourceApprovalWriter; }
  function clean(value) { return value === undefined || value === null ? "" : String(value).trim(); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function shellQuote(value) { return `"${String(value).replace(/"/gu, '\\"')}` + '"'; }
  function notice(message) { const Notice = root.Notice || root.obsidian?.Notice; if (Notice) new Notice(message); }
  function ensureStyles() {
    if (!root.document || root.document.getElementById(STYLE_ID)) return;
    const style = root.document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .auction-real-estate-research-modal { max-width: min(56rem, 100%); }
      .auction-real-estate-research-modal h2 { margin-block: 0 var(--size-4-3); }
      .auction-real-estate-research-meta, .auction-real-estate-research-empty { color: var(--text-muted); line-height: var(--line-height-normal); overflow-wrap: anywhere; }
      .auction-real-estate-research-section { border-top: 1px solid var(--background-modifier-border); margin-top: var(--size-4-4); padding-top: var(--size-4-3); }
      .auction-real-estate-research-section h3 { margin-block: 0 var(--size-4-2); font-size: var(--font-ui-medium); }
      .auction-real-estate-provider-list { display: grid; gap: var(--size-4-2); }
      .auction-real-estate-provider-row { display: grid; grid-template-columns: minmax(8rem, 0.8fr) minmax(0, 1fr) auto; gap: var(--size-4-2); align-items: center; min-inline-size: 0; padding: var(--size-4-2); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); }
      .auction-real-estate-provider-row > * { min-inline-size: 0; overflow-wrap: anywhere; }
      .auction-real-estate-provider-status { color: var(--text-muted); font-size: var(--font-ui-small); }
      .auction-real-estate-provider-status.is-error { color: var(--text-error); }
      .auction-real-estate-diff { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .auction-real-estate-diff th, .auction-real-estate-diff td { padding: var(--size-4-2); border-bottom: 1px solid var(--background-modifier-border); text-align: start; vertical-align: top; overflow-wrap: anywhere; }
      .auction-real-estate-diff th { color: var(--text-muted); font-size: var(--font-ui-small); }
      .auction-real-estate-diff th:first-child, .auction-real-estate-diff td:first-child { width: 2.4rem; }
      .auction-real-estate-diff th:nth-child(2), .auction-real-estate-diff td:nth-child(2) { width: 8rem; }
      .auction-real-estate-research-warning { color: var(--text-warning); margin-block: var(--size-4-2); overflow-wrap: anywhere; }
      .auction-real-estate-research-actions { display: flex; flex-wrap: wrap; gap: var(--size-4-2); margin-top: var(--size-4-4); }
      @media (max-width: 767px) { .auction-real-estate-provider-row { grid-template-columns: minmax(0, 1fr) auto; } .auction-real-estate-provider-row .auction-real-estate-provider-source { grid-column: 1 / -1; } .auction-real-estate-diff th:nth-child(2), .auction-real-estate-diff td:nth-child(2) { width: 6rem; } }
    `;
    root.document.head.appendChild(style);
  }
  async function readLatestPackage(app, auction) {
    const api = core();
    if (!api || !app?.vault?.getFiles) return null;
    const prefix = `${CACHE_ROOT}/${api.caseKey(auction)}/`;
    const files = app.vault.getFiles().filter((file) => file.path.startsWith(prefix) && file.path.endsWith("/package.json"));
    const packages = [];
    for (const file of files) {
      try { const rawText = await app.vault.read(file); const pkg = JSON.parse(rawText); if (api.isPackageForAuction(pkg, auction)) packages.push({ pkg, path: file.path, package_sha256: await digest(rawText) }); } catch (_error) { }
    }
    packages.sort((left, right) => api.packageTimestamp(right.pkg) - api.packageTimestamp(left.pkg));
    return packages[0] || null;
  }
  async function digest(text) {
    if (!root.crypto?.subtle || !root.TextEncoder) return "";
    const buffer = await root.crypto.subtle.digest("SHA-256", new root.TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function verifyRawFiles(app, packagePath, pkg) {
    if (!app?.vault?.getAbstractFileByPath) return { ok: false, message: "Vault 파일을 확인할 수 없습니다." };
    if (!pkg || pkg.schema_version !== 1 || !pkg.package_id || !pkg.providers) return { ok: false, message: "조사 패키지 계약을 확인할 수 없습니다." };
    for (const provider of core().PROVIDERS) {
      const meta = pkg.providers?.[provider];
      if (!meta || !["success", "empty"].includes(meta.status)) continue;
      if (typeof meta.raw_path !== "string" || !meta.raw_path.startsWith("raw/") || meta.raw_path.includes("..")) return { ok: false, message: `${core().providerLabel(provider)} 원문 경로가 올바르지 않습니다.` };
      const rawPath = `${packagePath.slice(0, packagePath.lastIndexOf("/"))}/${meta.raw_path}`;
      const rawFile = app.vault.getAbstractFileByPath(rawPath);
      if (!rawFile) return { ok: false, message: `${core().providerLabel(provider)} 원문 파일이 없습니다.` };
      const actual = await digest(await app.vault.read(rawFile));
      if (!actual || actual !== meta.raw_sha256) return { ok: false, message: `${core().providerLabel(provider)} 원문 해시가 맞지 않습니다.` };
    }
    return { ok: true };
  }
  async function writeReceipt(app, auction, packageInfo, result) {
    const folderParts = RECEIPT_ROOT.split("/");
    let current = "";
    for (const part of folderParts) { current = current ? `${current}/${part}` : part; if (!app.vault.getAbstractFileByPath(current) && app.vault.createFolder) await app.vault.createFolder(current); }
    const receiptPath = `${RECEIPT_ROOT}/${result.package_id}.json`;
    const before = Object.assign({}, result.existing || {}); const after = Object.assign({}, before, result.fields || {});
    const receipt = { schema_version: 1, package_id: result.package_id, package_sha256: packageInfo.package_sha256 || "", object_path: auction.file.path, approved_at: new Date().toISOString(), selected_fields: result.selected, before, after, package_path: packageInfo.path };
    const existing = app.vault.getAbstractFileByPath(receiptPath);
    if (existing && app.vault.modify) await app.vault.modify(existing, `${JSON.stringify(receipt, null, 2)}\n`);
    else if (app.vault.create) await app.vault.create(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    return receiptPath;
  }
  function commandFor(app, auction) {
    const base = app?.vault?.adapter?.basePath;
    const script = base ? pathJoin(base, "SYSTEM/SCRIPTS/real-estate-source-collect.js") : "SYSTEM/SCRIPTS/real-estate-source-collect.js";
    const objectPath = base ? pathJoin(base, auction.file.path) : auction.file.path;
    return `node ${shellQuote(script)} --vault ${shellQuote(base || ".")} --case ${shellQuote(objectPath)} --providers court,building,transactions,official-price,land-price`;
  }
  function pathJoin(base, relative) { return `${String(base).replace(/\/$/u, "")}/${relative}`; }
  function addProviderRows(parent, pkg) {
    const api = core(); const section = parent.createEl("section", { attr: { class: "auction-real-estate-research-section" } }); section.createEl("h3", { text: "공급자 상태" }); const list = section.createDiv({ attr: { class: "auction-real-estate-provider-list" } });
    api.PROVIDERS.forEach((provider) => { const meta = pkg.providers?.[provider] || {}; const row = list.createDiv({ attr: { class: "auction-real-estate-provider-row" } }); row.createEl("strong", { text: api.providerLabel(provider) }); row.createEl("span", { text: meta.warnings?.[0] || api.statusLabel(meta.status), attr: { class: `auction-real-estate-provider-status${["failed", "needs_identifier", "needs_selection"].includes(meta.status) ? " is-error" : ""}` } }); if (meta.source_url) row.createEl("a", { text: "출처 열기", href: meta.source_url, attr: { class: "auction-real-estate-provider-source", target: "_blank", rel: "noopener" } }); });
  }
  class ResearchModal extends ((root.obsidian && root.obsidian.Modal) || class {}) {
    constructor(app, auction, options) { super(app); this.app = app; this.auction = auction; this.options = options || {}; this.packageInfo = this.options.packageInfo; this.checks = new Map(); }
    onOpen() {
      ensureStyles(); const content = this.contentEl; content.empty(); content.addClass("auction-real-estate-research-modal"); const api = core(); const pkg = this.packageInfo?.pkg;
      content.createEl("h2", { text: "부동산 조사" }); content.createEl("p", { text: `${this.auction.case_number || this.auction.file.name} · ${this.auction.address || "주소 미정"}`, attr: { class: "auction-real-estate-research-meta" } });
      if (!pkg) { content.createEl("p", { text: "저장된 조사 패키지가 없습니다. 외부 조회는 CLI에서 실행한 뒤 이 모달을 다시 여세요.", attr: { class: "auction-real-estate-research-empty" } }); const command = content.createEl("textarea", { attr: { readonly: "true", rows: "4", "aria-label": "조사 실행 명령" } }); command.value = commandFor(this.app, this.auction); const actions = content.createDiv({ attr: { class: "auction-real-estate-research-actions" } }); const copy = actions.createEl("button", { text: "명령 복사", attr: { type: "button", class: "mod-cta" } }); copy.onclick = async () => { await root.navigator?.clipboard?.writeText(command.value); notice("조사 명령을 복사했습니다."); }; return; }
      content.createEl("p", { text: `조회 시각: ${pkg.observed_at} · ${api.evidenceSummary(pkg)}`, attr: { class: "auction-real-estate-research-meta" } }); addProviderRows(content, pkg);
      if (Date.now() - api.packageTimestamp(pkg) > 30 * 24 * 60 * 60 * 1000) content.createEl("p", { text: "이 패키지는 30일보다 오래되어 최신성 확인이 필요합니다.", attr: { class: "auction-real-estate-research-warning", role: "status" } });
      const evidence = content.createEl("section", { attr: { class: "auction-real-estate-research-section" } }); evidence.createEl("h3", { text: "판단 근거" }); const evidenceList = evidence.createEl("ul"); const transactionCount = Array.isArray(pkg.evidence?.transactions?.records) ? pkg.evidence.transactions.records.length : 0; const buildingRecord = pkg.evidence?.building?.record || pkg.evidence?.building; const landLatest = pkg.evidence?.land_price?.latest || pkg.evidence?.["land-price"]?.latest; const officialHistory = pkg.evidence?.official_price?.history || pkg.evidence?.["official-price"]?.history; [`실거래 비교 사례 ${transactionCount}건`, `건축물대장 ${buildingRecord ? "확인됨" : "자료 없음"}`, `공동주택 공시가격 ${Array.isArray(officialHistory) && officialHistory.length ? "이력 확인됨" : "자료 없음"}`, `개별공시지가 ${landLatest ? "최신 값 확인됨" : "자료 없음"}`].forEach((text) => evidenceList.createEl("li", { text }));
      const fields = api.selectableFields(this.auction, pkg); const section = content.createEl("section", { attr: { class: "auction-real-estate-research-section" } }); section.createEl("h3", { text: "Object 반영 후보" });
      if (!fields.length) section.createEl("p", { text: "반영 가능한 기존 사실 필드가 없습니다.", attr: { class: "auction-real-estate-research-empty" } }); else { const table = section.createEl("table", { attr: { class: "auction-real-estate-diff" } }); const head = table.createEl("tr"); ["", "필드", "현재 값", "후보 값"].forEach((text) => head.createEl("th", { text })); fields.forEach((field) => { const row = table.createEl("tr"); const check = row.createEl("input", { attr: { type: "checkbox", "aria-label": `${field.label} 반영` } }); check.checked = field.changed; this.checks.set(field.key, check); row.createEl("td", { text: field.label }); row.createEl("td", { text: api.formatValue(field.key, field.current) }); row.createEl("td", { text: api.formatValue(field.key, field.proposed) }); }); }
      const warningCount = pkg.errors?.length || 0; if (warningCount) content.createEl("p", { text: `확인 필요: ${warningCount}개 공급자에 추가 확인이 있습니다.`, attr: { class: "auction-real-estate-research-warning", role: "status" } });
      const actions = content.createDiv({ attr: { class: "auction-real-estate-research-actions" } }); const cancel = actions.createEl("button", { text: "닫기", attr: { type: "button" } }); cancel.onclick = () => this.close(); const apply = actions.createEl("button", { text: "선택 반영", attr: { type: "button", class: "mod-cta" } }); apply.onclick = () => this.apply(pkg, apply);
    }
    async apply(pkg, button) {
      const keys = [...this.checks.entries()].filter(([, input]) => input.checked).map(([key]) => key); if (!keys.length) { notice("반영할 필드를 선택하세요."); return; }
      button.disabled = true; button.textContent = "검증 중…";
      try { const verified = await verifyRawFiles(this.app, this.packageInfo.path, pkg); if (!verified.ok) throw new Error(verified.message); const options = { execute: true, as_of: today() }; let result = await writer().writeApproved(this.app, this.auction.file.path, pkg, keys, options); if (result.confirmation_required && root.confirm) { if (!root.confirm(`${result.errors[0]}\n기존 결과를 덮어쓰시겠습니까?`)) { button.disabled = false; button.textContent = "선택 반영"; return; } result = await writer().writeApproved(this.app, this.auction.file.path, pkg, keys, Object.assign(options, { confirmed: true })); } if (!result.ok) throw new Error(result.errors.join(" ")); const packageId = pkg.package_id; await writeReceipt(this.app, this.auction, this.packageInfo, Object.assign(result, { package_id: packageId })); Object.assign(this.auction, result.fields); if (this.options.onApplied) await this.options.onApplied(result.fields); notice("부동산 조사 후보를 반영했습니다."); this.close(); } catch (error) { button.disabled = false; button.textContent = "다시 시도"; const message = this.contentEl.createEl("p", { text: error.message || String(error), attr: { class: "auction-real-estate-research-warning", role: "alert" } }); message.scrollIntoView?.({ block: "nearest" }); }
    }
    onClose() { this.contentEl.empty(); if (this.options.returnFocus?.focus) this.options.returnFocus.focus({ preventScroll: true }); }
  }
  async function openForAuction(app, auction, options) { const packageInfo = await readLatestPackage(app, auction); new ResearchModal(app, auction, Object.assign({}, options || {}, { packageInfo })).open(); return packageInfo; }
  const api = Object.freeze({ openForAuction, readLatestPackage, verifyRawFiles }); root.AuctionRealEstateResearch = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
