(function (root) {
  "use strict";

  const CACHE_ROOT = "SYSTEM/CACHE/real-estate-source-packages";
  const RECEIPT_ROOT = "SYSTEM/CACHE/real-estate-source-approvals";
  const STYLE_ID = "prodigy-auction-real-estate-research-style";
  const packageIndexes = new WeakMap();

  function core() { return root.AuctionRealEstateResearchCore; }
  function consumerRuntime() { return root.ProdigyAIConsumerRuntime || (typeof require === "function" ? require("./prodigy-ai-consumer-runtime.js") : null); }
  function writer() { return root.AuctionSourceApprovalWriter || (typeof require === "function" ? require("./auction-source-approval-writer.js") : null); }
  function packageCore() { return root.RealEstateSourcePackageCore || (typeof require === "function" ? require("../SCRIPTS/real-estate-source-package-core.js") : null); }
  function clean(value) { return value === undefined || value === null ? "" : String(value).trim(); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function shellQuote(value) { return `'${String(value).replace(/'/gu, `'"'"'`)}'`; }
  function notice(message) { const Notice = root.Notice || root.obsidian?.Notice; if (Notice) new Notice(message); }
  async function readVaultText(app, path) {
    const file = app?.vault?.getAbstractFileByPath?.(path);
    if (file && app.vault.read) return app.vault.read(file);
    if (app?.vault?.adapter?.read) return app.vault.adapter.read(path);
    throw new Error("Vault 파일을 확인할 수 없습니다.");
  }
  function vaultRelativePath(app, candidate) {
    const value = String(candidate || "").replaceAll("\\", "/").trim();
    if (!value) return "";
    if (!value.startsWith("/")) return value;
    const adapter = app?.vault?.adapter;
    const base = String(adapter?.basePath || (typeof adapter?.getBasePath === "function" ? adapter.getBasePath() : "")).replaceAll("\\", "/").replace(/\/+$/u, "");
    if (!base || !value.startsWith(`${base}/`)) return "";
    return value.slice(base.length + 1);
  }
  function packageIndexOwner(app) {
    const scope = root.__prodigyAuctionMountScope;
    if (scope && (typeof scope === "object" || typeof scope === "function")) return scope;
    return app?.vault || null;
  }
  function packageCaseKey(path) {
    const prefix = `${CACHE_ROOT}/`;
    const value = clean(path).replaceAll("\\", "/");
    if (!value.startsWith(prefix) || !value.endsWith("/package.json")) return "";
    return value.slice(prefix.length).split("/")[0] || "";
  }
  function addPackagePath(index, path) {
    const key = packageCaseKey(path);
    if (!key) return;
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(path);
  }
  async function buildPackageIndex(app) {
    const index = new Map();
    (app?.vault?.getFiles?.() || []).forEach((file) => addPackagePath(index, file.path));
    const adapter = app?.vault?.adapter;
    if (!adapter?.list) return index;
    let queue = [CACHE_ROOT];
    const visited = new Set();
    for (let count = 0; queue.length && count < 200;) {
      const batch = queue.splice(0, Math.min(queue.length, 32)).filter((path) => !visited.has(path));
      batch.forEach((path) => visited.add(path));
      count += batch.length;
      const listings = await Promise.all(batch.map(async (path) => {
        try { return { path, listing: await adapter.list(path) }; }
        catch (_error) { return { path, listing: null }; }
      }));
      const next = [];
      listings.forEach(({ listing }) => {
        if (!listing) return;
        const packageFiles = (listing.files || []).filter((path) => path.startsWith(`${CACHE_ROOT}/`) && path.endsWith("/package.json"));
        packageFiles.forEach((path) => addPackagePath(index, path));
        if (packageFiles.length) return;
        (listing.folders || [])
          .filter((path) => path.startsWith(`${CACHE_ROOT}/`))
          .forEach((path) => { if (!visited.has(path)) next.push(path); });
      });
      queue = next;
    }
    return index;
  }
  function packageIndex(app) {
    const owner = packageIndexOwner(app);
    if (!owner) return Promise.resolve(new Map());
    if (!packageIndexes.has(owner)) {
      const pending = buildPackageIndex(app).catch((error) => {
        packageIndexes.delete(owner);
        throw error;
      });
      packageIndexes.set(owner, pending);
    }
    return packageIndexes.get(owner);
  }
  function invalidatePackageIndex(app) {
    const owner = packageIndexOwner(app);
    return owner ? packageIndexes.delete(owner) : false;
  }
  async function packagePaths(app, prefix) {
    const key = prefix.replace(`${CACHE_ROOT}/`, "").replace(/\/+$/u, "").split("/")[0];
    const index = await packageIndex(app);
    return [...(index.get(key) || [])];
  }
  function ensureStyles() {
    if (!root.document || root.document.getElementById(STYLE_ID)) return;
    const tokens = root.ProdigyTokens || {};
    const compactBreakpoint = Number(tokens.RESPONSIVE_BREAKPOINTS && tokens.RESPONSIVE_BREAKPOINTS.compactMax);
    if (!Number.isFinite(compactBreakpoint)) throw new Error("Auction research requires the shared compact breakpoint.");
    const style = root.document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .auction-real-estate-research-modal { max-width: min(60rem, 100%); }
      .auction-real-estate-research-modal h2 { margin-block: 0 var(--size-4-3); }
      .auction-real-estate-research-modal, .auction-real-estate-research-modal * { word-break: keep-all; }
      .auction-real-estate-research-meta, .auction-real-estate-research-empty { color: var(--text-muted); line-height: var(--line-height-normal); overflow-wrap: anywhere; }
      .auction-real-estate-research-section { border-top: 1px solid var(--background-modifier-border); margin-top: var(--size-4-4); padding-top: var(--size-4-3); }
      .auction-real-estate-research-section h3 { margin-block: 0 var(--size-4-2); font-size: var(--font-ui-medium); }
      .auction-real-estate-overview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--size-4-2); }
      .auction-real-estate-overview-card { min-inline-size: 0; padding: var(--size-4-2); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); background: var(--background-secondary); }
      .auction-real-estate-overview-label { display: block; color: var(--text-muted); font-size: var(--font-ui-small); margin-bottom: var(--size-4-1); }
      .auction-real-estate-overview-value { display: block; overflow-wrap: anywhere; font-weight: var(--font-weight-semibold); }
      .auction-real-estate-overview-source { display: block; margin-top: var(--size-4-1); color: var(--text-faint); font-size: var(--font-ui-smaller); }
      .auction-real-estate-summary { padding: var(--size-4-3); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); background: var(--background-secondary); line-height: var(--line-height-normal); }
      .auction-real-estate-summary p { margin: 0; overflow-wrap: anywhere; }
      .auction-real-estate-summary ul { margin-block: var(--size-4-2) 0; padding-inline-start: var(--size-4-5); }
      .auction-real-estate-summary li { margin-block: var(--size-4-1); overflow-wrap: anywhere; }
      .auction-real-estate-evidence-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--size-4-2); }
      .auction-real-estate-evidence-card { min-inline-size: 0; padding: var(--size-4-2); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); }
      .auction-real-estate-evidence-card strong, .auction-real-estate-evidence-card span { display: block; overflow-wrap: anywhere; }
      .auction-real-estate-evidence-card span { margin-top: var(--size-4-1); color: var(--text-muted); font-size: var(--font-ui-small); }
      .auction-real-estate-provider-list { display: grid; gap: var(--size-4-2); }
      .auction-real-estate-provider-row { display: grid; grid-template-columns: minmax(8rem, 0.8fr) minmax(0, 1fr) auto; gap: var(--size-4-2); align-items: center; min-inline-size: 0; padding: var(--size-4-2); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); }
      .auction-real-estate-provider-row > * { min-inline-size: 0; overflow-wrap: anywhere; }
      .auction-real-estate-provider-status { color: var(--text-muted); font-size: var(--font-ui-small); }
      .auction-real-estate-provider-status.is-error { color: var(--text-error); }
      .auction-real-estate-provider-badge { display: inline-flex; align-items: center; justify-content: center; min-height: 1.5rem; padding-inline: var(--size-4-2); border-radius: var(--radius-s); background: var(--background-modifier-hover); white-space: nowrap; }
      .auction-real-estate-attention { margin-top: var(--size-4-3); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); }
      .auction-real-estate-attention summary { min-height: var(--ke-touch-target, 44px); padding: var(--size-4-2) var(--size-4-3); cursor: pointer; color: var(--text-warning); display: flex; align-items: center; }
      .auction-real-estate-attention .auction-real-estate-provider-list { padding: 0 var(--size-4-3) var(--size-4-3); }
      .auction-real-estate-attention .auction-real-estate-provider-row { border-color: var(--background-modifier-border-hover); }
      .auction-real-estate-diff-wrap { overflow-x: auto; }
      .auction-real-estate-diff { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .auction-real-estate-diff th, .auction-real-estate-diff td { padding: var(--size-4-2); border-bottom: 1px solid var(--background-modifier-border); text-align: start; vertical-align: top; overflow-wrap: anywhere; }
      .auction-real-estate-diff th { color: var(--text-muted); font-size: var(--font-ui-small); }
      .auction-real-estate-diff th:first-child, .auction-real-estate-diff td:first-child { width: 2.4rem; }
      .auction-real-estate-diff th:nth-child(2), .auction-real-estate-diff td:nth-child(2) { width: 8rem; }
      .auction-real-estate-research-warning { color: var(--text-warning); margin-block: var(--size-4-2); overflow-wrap: anywhere; }
      .auction-real-estate-research-actions { display: flex; flex-wrap: wrap; gap: var(--size-4-2); margin-top: var(--size-4-4); }
      .auction-real-estate-research-actions button { min-height: var(--ke-touch-target, 44px); }
      .auction-real-estate-research-modal textarea.auction-real-estate-research-command { width: 100%; margin-top: var(--size-4-3); font-family: var(--font-monospace); font-size: var(--font-ui-small); word-break: break-all; }
      .auction-real-estate-refresh-hint { flex: 1 1 100%; color: var(--text-muted); font-size: var(--font-ui-small); overflow-wrap: anywhere; }
      .auction-real-estate-match-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--size-4-2); }
      .auction-real-estate-match-card { min-inline-size: 0; padding: var(--size-4-2); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); background: var(--background-secondary); }
      .auction-real-estate-match-card strong, .auction-real-estate-match-card span { display: block; overflow-wrap: anywhere; }
      .auction-real-estate-match-card span { margin-top: var(--size-4-1); color: var(--text-muted); font-size: var(--font-ui-small); }
      .auction-real-estate-match-card.is-blocked { border-color: var(--text-warning); }
      .auction-real-estate-match-form { display: grid; gap: var(--size-4-2); margin-top: var(--size-4-3); }
      .auction-real-estate-match-form label { display: grid; gap: var(--size-4-1); color: var(--text-muted); font-size: var(--font-ui-small); }
      .auction-real-estate-match-form input[type="text"] { min-height: var(--ke-touch-target, 44px); }
      .auction-real-estate-match-candidates { display: flex; flex-wrap: wrap; gap: var(--size-4-1); margin-top: var(--size-4-2); }
      .auction-real-estate-match-candidates button { min-height: var(--ke-touch-target, 44px); }
      .auction-real-estate-match-command { width: 100%; margin-top: var(--size-4-2); font-family: var(--font-monospace); font-size: var(--font-ui-small); word-break: break-all; }
      @media (max-width: ${compactBreakpoint}px) { .auction-real-estate-match-grid { grid-template-columns: minmax(0, 1fr); } }
      @media (max-width: ${compactBreakpoint}px) { .auction-real-estate-overview, .auction-real-estate-evidence-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .auction-real-estate-provider-row { grid-template-columns: minmax(0, 1fr) auto; } .auction-real-estate-provider-row .auction-real-estate-provider-source { grid-column: 1 / -1; } .auction-real-estate-diff-wrap { overflow: visible; } .auction-real-estate-diff, .auction-real-estate-diff thead, .auction-real-estate-diff tbody, .auction-real-estate-diff tr, .auction-real-estate-diff td { display: block; width: 100%; } .auction-real-estate-diff thead { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; } .auction-real-estate-diff tr { margin-block: var(--size-4-2); padding: var(--size-4-2); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); } .auction-real-estate-diff td { display: grid; grid-template-columns: minmax(5.5rem, auto) minmax(0, 1fr); gap: var(--size-4-2); border-bottom: 0; padding: var(--size-4-1) 0; } .auction-real-estate-diff td::before { content: attr(data-label); color: var(--text-muted); font-size: var(--font-ui-small); } .auction-real-estate-diff td:first-child { display: flex; align-items: center; min-block-size: var(--ke-touch-target, 44px); } .auction-real-estate-diff td:first-child::before { content: none; } }
    `;
    root.document.head.appendChild(style);
  }
  async function readLatestPackage(app, auction, preferredPath) {
    const api = core();
    if (!api || !app?.vault) return null;
    const prefix = `${CACHE_ROOT}/${api.caseKey(auction)}/`;
    const preferred = vaultRelativePath(app, preferredPath);
    const files = [...new Set([preferred, ...(await packagePaths(app, prefix))].filter((path) => path && path.startsWith(prefix) && path.endsWith("/package.json")))];
    const packages = [];
    for (const path of files) {
      try { const rawText = await readVaultText(app, path); const pkg = JSON.parse(rawText); if (api.isPackageForAuction(pkg, auction)) packages.push({ pkg, path, package_sha256: await digest(rawText) }); } catch (_error) { }
    }
    packages.sort((left, right) => api.packageTimestamp(right.pkg) - api.packageTimestamp(left.pkg));
    return packages[0] || null;
  }
  async function digest(text) {
    if (!root.crypto?.subtle || !root.TextEncoder) return "";
    const buffer = await root.crypto.subtle.digest("SHA-256", new root.TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function verifyRawFiles(app, packagePath, pkg, expectedPackageSha256) {
    if (!app?.vault) return { ok: false, message: "Vault 파일을 확인할 수 없습니다." };
    if (!pkg || pkg.schema_version !== 1 || !pkg.package_id || !pkg.providers) return { ok: false, message: "조사 패키지 계약을 확인할 수 없습니다." };
    try { packageCore()?.validatePackage(pkg); } catch (error) { return { ok: false, message: `조사 패키지 검증 실패: ${error.message}` }; }
    const candidateGate = packageCore()?.canApplyCandidatePatch(pkg);
    if (!candidateGate?.ok) return { ok: false, message: candidateGate?.errors?.join(" ") || "조사 후보의 exact identity 매칭을 확인할 수 없습니다." };
    if (expectedPackageSha256) {
      let packageText;
      try { packageText = await readVaultText(app, packagePath); } catch (_error) { return { ok: false, message: "조사 패키지 원문이 없습니다." }; }
      const actualPackageSha256 = await digest(packageText);
      if (!actualPackageSha256 || actualPackageSha256 !== expectedPackageSha256) return { ok: false, message: "조사 패키지가 변경되어 승인을 차단했습니다." };
    }
    for (const provider of core().PROVIDERS) {
      const meta = pkg.providers?.[provider];
      if (!meta || !["success", "empty"].includes(meta.status)) continue;
      if (typeof meta.raw_path !== "string" || !meta.raw_path.startsWith("raw/") || meta.raw_path.includes("..")) return { ok: false, message: `${core().providerLabel(provider)} 원문 경로가 올바르지 않습니다.` };
      const rawPath = `${packagePath.slice(0, packagePath.lastIndexOf("/"))}/${meta.raw_path}`;
      let rawText;
      try { rawText = await readVaultText(app, rawPath); } catch (_error) { return { ok: false, message: `${core().providerLabel(provider)} 원문 파일이 없습니다.` }; }
      const actual = await digest(rawText);
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
  function commandFor(app, auction, selection, allowProxy) {
    const base = app?.vault?.adapter?.basePath;
    const script = base ? pathJoin(base, "SYSTEM/SCRIPTS/real-estate-source-collect.js") : "SYSTEM/SCRIPTS/real-estate-source-collect.js";
    const objectPath = base ? pathJoin(base, auction.file.path) : auction.file.path;
    const runner = root.AuctionRealEstateSourceRunner;
    const args = runner?.commandArgs ? runner.commandArgs(base || ".", auction, selection) : [script, "--vault", base || ".", "--case", objectPath, "--providers", "court,building,transactions,official-price,land-price"];
    const command = ["node", ...args].map((value, index) => index === 0 || String(value).startsWith("--") ? String(value) : shellQuote(value)).join(" ");
    return `${allowProxy ? "PRODIGY_REAL_ESTATE_ALLOW_PROXY=1 " : ""}${command}`;
  }
  function addMatchResolution(parent, pkg, modal) {
    const api = core();
    const section = parent.createEl("section", { attr: { class: "auction-real-estate-research-section" } });
    section.createEl("h3", { text: "식별자 매칭" });
    section.createEl("p", { text: "각 자료가 같은 사건·필지·건물·호실을 가리키는지 먼저 확인합니다. 자동 확정은 유일한 정확 매칭에만 적용하고, 애매한 대상은 선택 후 다시 조사합니다.", attr: { class: "auction-real-estate-research-meta" } });
    const grid = section.createDiv({ attr: { class: "auction-real-estate-match-grid" } });
    const rows = api.matchResolutionRows(pkg);
    rows.forEach((row) => {
      const card = grid.createDiv({ attr: { class: `auction-real-estate-match-card${row.verified ? "" : " is-blocked"}` } });
      card.createEl("strong", { text: `${row.label} · ${row.status}` });
      if (row.scope) card.createEl("span", { text: `범위: ${row.scope === "region" || row.scope === "region_comparison" ? "동일 지역 비교" : row.scope === "parcel" ? "동일 필지" : row.scope}` });
      if (row.method) card.createEl("span", { text: `방식: ${row.method}` });
      if (row.reason) card.createEl("span", { text: row.reason });
      if (row.candidates.length) {
        const candidates = card.createDiv({ attr: { class: "auction-real-estate-match-candidates" } });
        row.candidates.slice(0, 8).forEach((candidate) => {
          const value = candidate.code || candidate.aptCode || candidate.apt_code || candidate.name || candidate.complexName || "후보";
          const button = candidates.createEl("button", { text: `${candidate.name || candidate.complexName || "후보"} ${value}`, attr: { type: "button" } });
          button.onclick = () => modal.selectMatchCandidate(row.provider, candidate);
        });
      }
    });
    const blockers = api.matchBlockers(pkg);
    if (!blockers.length) return;
    const form = section.createDiv({ attr: { class: "auction-real-estate-match-form" } });
    const queryIdentity = pkg.query_identity || {};
    const inputs = [
      ["court_code", "법원사무소 코드", queryIdentity.court_code, blockers.some((row) => row.provider === "court")],
      ["pnu", "PNU 19자리", queryIdentity.pnu, blockers.some((row) => ["building", "official-price", "land-price"].includes(row.provider))],
      ["lot_address", "지번 주소", queryIdentity.lot_address, blockers.some((row) => row.provider === "land-price")],
      ["building_name", "공동주택 단지명", queryIdentity.building_name, blockers.some((row) => row.provider === "official-price")],
      ["building_dong", "공동주택 동", queryIdentity.building_dong, blockers.some((row) => row.provider === "official-price")],
      ["unit_number", "공동주택 호", queryIdentity.unit_number, blockers.some((row) => row.provider === "official-price")],
      ["apt_code", "공동주택 코드", queryIdentity.apt_code, blockers.some((row) => row.provider === "official-price")],
      ["apt_notice_date", "공시 기준일", queryIdentity.apt_notice_date, blockers.some((row) => row.provider === "official-price")],
      ["dong_code", "공동주택 동 코드", queryIdentity.dong_code, blockers.some((row) => row.provider === "official-price")],
      ["ho_code", "공동주택 호 코드", queryIdentity.ho_code, blockers.some((row) => row.provider === "official-price")],
      ["lawd_cd", "법정동 코드", queryIdentity.lawd_cd, blockers.some((row) => row.provider === "transactions")]
    ];
    modal.matchInputs = new Map();
    inputs.filter(([, , , visible]) => visible).forEach(([key, label, value]) => {
      const labelEl = form.createEl("label", { text: label });
      const input = labelEl.createEl("input", { attr: { type: "text", "aria-label": label } });
      input.value = value || "";
      input.oninput = () => modal.updateMatchCommand();
      modal.matchInputs.set(key, input);
    });
    if (blockers.some((row) => row.provider === "transactions")) {
      const proxyLabel = form.createEl("label", { text: "실거래 비교 프록시 허용" });
      const proxy = proxyLabel.createEl("input", { attr: { type: "checkbox", "aria-label": "실거래 비교 프록시 허용" } });
      proxy.onchange = () => modal.updateMatchCommand();
      modal.proxyInput = proxy;
      form.createEl("p", { text: "프록시는 이 실행에만 사용합니다. 비밀값과 환경변수는 패키지·로그·노트에 저장하지 않습니다.", attr: { class: "auction-real-estate-research-warning" } });
    }
    const command = form.createEl("textarea", { attr: { readonly: "true", rows: "3", "aria-label": "선택값 포함 데스크톱 조사 명령", class: "auction-real-estate-match-command" } });
    modal.matchCommand = command;
    modal.updateMatchCommand();
    const actions = form.createDiv({ attr: { class: "auction-real-estate-research-actions" } });
    const retry = actions.createEl("button", { text: "선택값으로 다시 조사", attr: { type: "button", class: "mod-cta" } });
    retry.disabled = modal.collecting || !root.AuctionRealEstateSourceRunner?.isAvailable?.(modal.app);
    retry.onclick = () => modal.runCollection(retry, modal.getMatchSelection(), Boolean(modal.proxyInput?.checked));
    const copy = actions.createEl("button", { text: "명령 복사", attr: { type: "button" } });
    copy.onclick = async () => { if (root.navigator?.clipboard?.writeText) { await root.navigator.clipboard.writeText(modal.matchCommand.value); notice("선택값 포함 조사 명령을 복사했습니다."); } else notice("이 환경에서는 명령을 복사할 수 없습니다."); };
  }
  function pathJoin(base, relative) { return `${String(base).replace(/\/$/u, "")}/${relative}`; }
  function addProviderRows(parent, pkg) {
    const api = core();
    const section = parent.createEl("section", { attr: { class: "auction-real-estate-research-section" } });
    section.createEl("h3", { text: "확인된 출처" });
    const list = section.createDiv({ attr: { class: "auction-real-estate-provider-list" } });
    const renderRow = (listEl, provider, meta, isAttention) => {
      const row = listEl.createDiv({ attr: { class: "auction-real-estate-provider-row" } });
      row.createEl("strong", { text: api.providerLabel(provider) });
      const status = row.createEl("span", { text: api.statusLabel(meta.status), attr: { class: `auction-real-estate-provider-status auction-real-estate-provider-badge${isAttention ? " is-error" : ""}` } });
      const message = Array.isArray(meta.warnings) && meta.warnings.length ? meta.warnings[0] : meta.error;
      if (message) row.createEl("span", { text: String(message), attr: { class: "auction-real-estate-provider-status" } });
      if (meta.source_url) row.createEl("a", { text: "출처 열기", href: meta.source_url, attr: { class: "auction-real-estate-provider-source", target: "_blank", rel: "noopener" } });
      if (!status.textContent) status.textContent = api.statusLabel(meta.status);
    };
    const available = api.PROVIDERS.filter((provider) => ["success", "empty"].includes(pkg.providers?.[provider]?.status));
    if (!available.length) list.createEl("p", { text: "이번 조사에서 확인 가능한 외부 출처가 없습니다.", attr: { class: "auction-real-estate-research-empty" } });
    available.forEach((provider) => renderRow(list, provider, pkg.providers[provider], false));
    const attention = api.PROVIDERS.filter((provider) => {
      const meta = pkg.providers?.[provider] || {};
      return !["success", "empty"].includes(meta.status) || (Array.isArray(meta.warnings) && meta.warnings.length > 0);
    });
    const packageErrors = Array.isArray(pkg.errors) ? pkg.errors.filter(Boolean) : [];
    if (attention.length || packageErrors.length) {
      const details = section.createEl("details", { attr: { class: "auction-real-estate-attention" } });
      details.createEl("summary", { text: `확인 필요 ${attention.length + packageErrors.length}건` });
      const attentionList = details.createDiv({ attr: { class: "auction-real-estate-provider-list" } });
      attention.forEach((provider) => renderRow(attentionList, provider, pkg.providers?.[provider] || {}, true));
      packageErrors.forEach((error) => {
        const row = attentionList.createDiv({ attr: { class: "auction-real-estate-provider-row" } });
        row.createEl("strong", { text: "조사 패키지" });
        row.createEl("span", { text: String(error.message || error), attr: { class: "auction-real-estate-provider-status is-error" } });
      });
    }
  }
  function addEvidence(parent, pkg) {
    const section = parent.createEl("section", { attr: { class: "auction-real-estate-research-section" } });
    section.createEl("h3", { text: "확인된 조사 근거" });
    const grid = section.createDiv({ attr: { class: "auction-real-estate-evidence-grid" } });
    const cards = core().evidenceCards(pkg);
    if (!cards.length) {
      grid.createEl("p", { text: "이번 조사에서 추가 확인된 비교·공시 자료가 없습니다.", attr: { class: "auction-real-estate-research-empty" } });
      return;
    }
    cards.forEach((item) => {
      const card = grid.createDiv({ attr: { class: "auction-real-estate-evidence-card" } });
      card.createEl("strong", { text: item.label });
      card.createEl("span", { text: item.value });
    });
  }
  function addSummary(parent, summary, provider, loading, error) {
    const section = parent.createEl("section", { attr: { class: "auction-real-estate-research-section" } });
    section.createEl("h3", { text: "조사 요약" });
    const box = section.createDiv({ attr: { class: "auction-real-estate-summary" } });
    if (loading) {
      box.createEl("p", { text: "연결된 AI가 조사 자료를 읽기 쉬운 한국어로 정리하는 중입니다." });
      return;
    }
    if (summary) {
      box.createEl("p", { text: summary.summary });
      if (provider) box.createEl("p", { text: `요약 제공자: ${provider.name || "연결된 AI"}`, attr: { class: "auction-real-estate-research-meta" } });
      if (summary.key_points.length) {
        const list = box.createEl("ul");
        summary.key_points.forEach((item) => list.createEl("li", { text: item }));
      }
      if (summary.cautions.length) {
        const list = box.createEl("ul");
        summary.cautions.forEach((item) => list.createEl("li", { text: `확인 필요: ${item}` }));
      }
      return;
    }
    box.createEl("p", { text: error || "필요할 때 아래의 AI 요약 생성 버튼을 누르세요. Modal을 여는 것만으로는 외부 전송하지 않습니다." });
  }
  async function requestAiSummary(app, auction, pkg) {
    const runtime = consumerRuntime();
    if (!runtime) return { summary: null, provider: null, error: "AI Runtime을 사용할 수 없습니다." };
    const input = core().buildAiSummaryInput(auction, pkg);
    const response = await runtime.requestStructured({
      app,
      consumerId: "auction.research_summary",
      prompt: [
        "다음은 부동산 조사 패키지에서 정규화된 사실과 출처 상태다.",
        "한국어로 짧고 명확하게 요약하라.",
        "원문에 없는 낙찰 결과, 투자 판단, 적정 입찰가를 추론하지 말라.",
        "확인된 사실과 확인 필요 항목을 분리하라.",
        "경매 카드에 이미 표시되는 사건번호, 주소, 매각기일, 감정가, 최저매각가, 상태를 반복하지 말라.",
        "이번 외부 조사에서 새로 확인된 자료와 확인이 필요한 항목만 정리하라.",
        "새로 확인된 외부 자료가 없으면 '이번 조사에서 추가 확인된 외부 자료가 없습니다'라고만 말하라.",
        JSON.stringify(input)
      ].join("\n"),
      schema: core().AI_SUMMARY_SCHEMA
    });
    const payload = response.payload;
    const summary = core().normalizeAiSummary(payload);
    if (!summary) throw new Error("AI가 표시 가능한 요약을 반환하지 않았습니다.");
    return { summary, provider: { name: runtime.providerMetadata(response).provider || "AI Runtime" }, error: "" };
  }
  class ResearchModal extends ((root.obsidian && root.obsidian.Modal) || class {}) {
    constructor(app, auction, options) {
      super(app);
      this.app = app;
      this.auction = auction;
      this.options = options || {};
      this.packageInfo = this.options.packageInfo;
      this.checks = new Map();
      this.aiSummaryPackageId = "";
      this.aiSummary = null;
      this.aiSummaryProvider = null;
      this.aiSummaryError = "";
      this.aiSummaryLoading = false;
      this.collecting = false;
      this.closed = false;
      this.matchInputs = new Map();
      this.proxyInput = null;
      this.matchCommand = null;
    }
    onOpen() { this.closed = false; this.render(); }
    render() {
      ensureStyles();
      const content = this.contentEl;
      content.empty();
      content.addClass("auction-real-estate-research-modal");
      const api = core();
      const pkg = this.packageInfo?.pkg;
      this.applyButton = null;
      this.checks.clear();
      this.matchInputs = new Map();
      this.proxyInput = null;
      this.matchCommand = null;
      content.createEl("h2", { text: "부동산 조사" });
      content.createEl("p", { text: `${this.auction.case_number || this.auction.file.name} · 외부 출처 추가 확인`, attr: { class: "auction-real-estate-research-meta" } });
      content.createEl("p", { text: "경매 카드의 기본 정보는 반복하지 않고, 이번 조사에서 새로 확인된 자료와 확인 필요 항목만 보여줍니다.", attr: { class: "auction-real-estate-research-meta" } });
      if (!pkg) {
        this.renderEmpty(content);
        return;
      }
      content.createEl("p", { text: `최근 조사: ${api.formatValue("auction_datetime", pkg.observed_at)} · ${api.evidenceSummary(pkg)}`, attr: { class: "auction-real-estate-research-meta" } });
      if (Date.now() - api.packageTimestamp(pkg) > 30 * 24 * 60 * 60 * 1000) content.createEl("p", { text: "이 조사는 30일보다 오래되어 최신성 확인이 필요합니다.", attr: { class: "auction-real-estate-research-warning", role: "status" } });
      addSummary(content, this.aiSummary, this.aiSummaryProvider, this.aiSummaryLoading, this.aiSummaryError);
      addMatchResolution(content, pkg, this);
      addProviderRows(content, pkg);
      addEvidence(content, pkg);
      this.renderCandidateDiff(content, pkg);
      const actions = content.createDiv({ attr: { class: "auction-real-estate-research-actions" } });
      const summarize = actions.createEl("button", { text: this.aiSummaryLoading ? "AI 요약 생성 중…" : "AI 요약 생성", attr: { type: "button" } });
      summarize.disabled = this.aiSummaryLoading;
      summarize.onclick = () => {
        if (this.aiSummaryLoading) return;
        this.aiSummaryPackageId = pkg.package_id;
        this.aiSummaryLoading = true;
        this.aiSummaryError = "";
        this.render();
        void this.loadAiSummary(pkg);
      };
      const refresh = actions.createEl("button", { text: "최신 조사 다시 실행", attr: { type: "button", class: "mod-cta" } });
      const runnerAvailable = Boolean(root.AuctionRealEstateSourceRunner?.isAvailable?.(this.app));
      refresh.disabled = this.collecting || !runnerAvailable;
      if (!runnerAvailable) {
        const refreshHint = actions.createEl("span", { text: "최신 조사는 Obsidian 데스크톱에서만 실행할 수 있습니다.", attr: { class: "auction-real-estate-refresh-hint", id: "auction-real-estate-refresh-hint", role: "status" } });
        refresh.setAttribute("aria-describedby", refreshHint.id);
      }
      refresh.onclick = () => this.runCollection(refresh);
      const cancel = actions.createEl("button", { text: "닫기", attr: { type: "button" } });
      cancel.onclick = () => this.close();
      const apply = actions.createEl("button", { text: "선택 반영", attr: { type: "button", class: "mod-cta" } });
      apply.disabled = this.collecting;
      this.applyButton = apply;
      apply.onclick = () => this.apply(pkg, apply);
    }
    renderEmpty(content) {
      const runner = root.AuctionRealEstateSourceRunner;
      content.createEl("p", { text: "아직 이 물건의 조사 패키지가 없습니다. 데스크톱에서는 아래 버튼으로 자동 조사를 시작할 수 있습니다.", attr: { class: "auction-real-estate-research-empty" } });
      const actions = content.createDiv({ attr: { class: "auction-real-estate-research-actions" } });
      const collect = actions.createEl("button", { text: "자동 조사 실행", attr: { type: "button", class: "mod-cta" } });
      const available = Boolean(runner && runner.isAvailable && runner.isAvailable(this.app));
      collect.disabled = this.collecting || !available;
      collect.onclick = () => this.runCollection(collect);
      const copy = actions.createEl("button", { text: "명령 복사", attr: { type: "button" } });
      copy.onclick = async () => { const command = commandFor(this.app, this.auction); if (root.navigator?.clipboard?.writeText) { await root.navigator.clipboard.writeText(command); notice("데스크톱 조사 명령을 복사했습니다."); } else notice("이 환경에서는 명령을 복사할 수 없습니다."); };
      if (!available) content.createEl("p", { text: "모바일 또는 실행 권한이 없는 환경에서는 명령을 데스크톱에서 실행하세요.", attr: { class: "auction-real-estate-research-warning", role: "status" } });
      if (!this.collecting && this.aiSummaryError) content.createEl("p", { text: `마지막 실행 결과: ${this.aiSummaryError}`, attr: { class: "auction-real-estate-research-warning", role: "alert" } });
      const command = content.createEl("textarea", { attr: { readonly: "true", rows: "3", "aria-label": "데스크톱 조사 실행 명령", class: "auction-real-estate-research-command" } });
      command.value = commandFor(this.app, this.auction);
      if (this.collecting) content.createEl("p", { text: "공식 출처를 조회하고 조사 패키지를 저장하는 중입니다. 이 창을 닫지 않아도 됩니다.", attr: { class: "auction-real-estate-research-meta", role: "status" } });
    }
    renderCandidateDiff(content, pkg) {
      const api = core();
      const fields = api.selectableFields(this.auction, pkg);
      const section = content.createEl("section", { attr: { class: "auction-real-estate-research-section" } });
      section.createEl("h3", { text: "반영할 사실 선택" });
      section.createEl("p", { text: "선택한 항목만 기존 Auction Object에 반영됩니다. 상태와 개인 판단은 변경하지 않습니다.", attr: { class: "auction-real-estate-research-meta" } });
      if (!fields.length) {
        section.createEl("p", { text: "새로 반영할 사실이 없습니다. 기존 카드 값과 조사 후보가 같습니다.", attr: { class: "auction-real-estate-research-empty" } });
        return;
      }
      const wrap = section.createDiv({ attr: { class: "auction-real-estate-diff-wrap" } });
      const table = wrap.createEl("table", { attr: { class: "auction-real-estate-diff" } });
      const thead = table.createEl("thead");
      const head = thead.createEl("tr");
      ["선택", "항목", "현재 기록", "조사 후보"].forEach((text) => head.createEl("th", { text, attr: { scope: "col" } }));
      const tbody = table.createEl("tbody");
      fields.forEach((field) => {
        const row = tbody.createEl("tr");
        const selectCell = row.createEl("td", { attr: { "data-label": "선택" } });
        const check = selectCell.createEl("input", { attr: { type: "checkbox", "aria-label": `${field.label} 반영` } });
        check.checked = field.changed;
        this.checks.set(field.key, check);
        row.createEl("td", { text: field.label, attr: { "data-label": "항목" } });
        row.createEl("td", { text: api.formatValue(field.key, field.current), attr: { "data-label": "현재 기록" } });
        row.createEl("td", { text: api.formatValue(field.key, field.proposed), attr: { "data-label": "조사 후보" } });
      });
    }
    getMatchSelection() {
      return Object.fromEntries([...this.matchInputs.entries()].map(([key, input]) => [key, String(input.value || "").trim()]).filter(([, value]) => value));
    }
    updateMatchCommand() {
      if (this.matchCommand) this.matchCommand.value = commandFor(this.app, this.auction, this.getMatchSelection(), Boolean(this.proxyInput?.checked));
    }
    selectMatchCandidate(provider, candidate) {
      const values = provider === "court"
        ? { court_code: candidate.code || candidate.courtCode || candidate.cortOfcCd }
        : provider === "official-price"
          ? { apt_code: candidate.aptCode || candidate.apt_code, apt_notice_date: candidate.noticeDate || candidate.notice_date, building_name: candidate.complexName || candidate.complex_name || candidate.name }
          : provider === "transactions"
            ? { lawd_cd: candidate.lawd_cd || candidate.lawdCd || candidate.code }
          : {};
      Object.entries(values).forEach(([key, value]) => {
        const input = this.matchInputs.get(key);
        if (input && value) input.value = value;
      });
      this.updateMatchCommand();
      notice("식별자 선택값을 조사 명령에 반영했습니다.");
    }
    async runCollection(button, selection, allowProxy) {
      const runner = root.AuctionRealEstateSourceRunner;
      if (!runner || typeof runner.collectForAuction !== "function" || this.collecting) return;
      this.collecting = true;
      button.disabled = true;
      button.textContent = "조사 실행 중…";
      if (this.applyButton) this.applyButton.disabled = true;
      try {
        const result = await runner.collectForAuction(this.app, this.auction, { selection: selection || {}, allowProxy: Boolean(allowProxy) });
        invalidatePackageIndex(this.app);
        const packageInfo = await readLatestPackage(this.app, this.auction, result.package_path);
        if (!packageInfo || (result.package_id && packageInfo.pkg.package_id !== result.package_id)) throw new Error("조사 패키지를 다시 읽지 못했습니다.");
        this.packageInfo = packageInfo;
        this.aiSummaryPackageId = "";
        this.aiSummary = null;
        this.aiSummaryProvider = null;
        this.aiSummaryError = "";
        notice("부동산 조사가 완료되었습니다.");
      } catch (error) {
        this.aiSummaryError = error.message || String(error);
        notice(`부동산 조사 실패: ${this.aiSummaryError}`);
      } finally {
        this.collecting = false;
        if (!this.closed) this.render();
      }
    }
    async loadAiSummary(pkg) {
      try {
        const result = await requestAiSummary(this.app, this.auction, pkg);
        this.aiSummary = result.summary;
        this.aiSummaryProvider = result.provider;
        this.aiSummaryError = result.error;
      } catch (error) {
        this.aiSummary = null;
        this.aiSummaryProvider = null;
        this.aiSummaryError = error.message || String(error);
      } finally {
        this.aiSummaryLoading = false;
        if (!this.closed) this.render();
      }
    }
    async apply(pkg, button) {
      if (this.collecting) { notice("조사가 끝난 뒤 반영할 수 있습니다."); return; }
      const keys = [...this.checks.entries()].filter(([, input]) => input.checked).map(([key]) => key);
      if (!keys.length) { notice("반영할 필드를 선택하세요."); return; }
      button.disabled = true;
      button.textContent = "검증 중…";
      try {
        const verified = await verifyRawFiles(this.app, this.packageInfo.path, pkg, this.packageInfo.package_sha256);
        if (!verified.ok) throw new Error(verified.message);
        const options = { execute: true, as_of: today(), object_path: this.auction.file.path };
        let result = await writer().writeApproved(this.app, this.auction.file.path, pkg, keys, options);
        if (result.confirmation_required && root.confirm) {
          if (!root.confirm(`${result.errors[0]}\n기존 결과를 덮어쓰시겠습니까?`)) { button.disabled = false; button.textContent = "선택 반영"; return; }
          result = await writer().writeApproved(this.app, this.auction.file.path, pkg, keys, Object.assign(options, { confirmed: true }));
        }
        if (!result.ok) throw new Error(result.errors.join(" "));
        await writeReceipt(this.app, this.auction, this.packageInfo, Object.assign(result, { package_id: pkg.package_id }));
        Object.assign(this.auction, result.fields);
        if (this.options.onApplied) await this.options.onApplied(result.fields);
        notice("부동산 조사 후보를 반영했습니다.");
        this.close();
      } catch (error) {
        button.disabled = false;
        button.textContent = "다시 시도";
        const message = this.contentEl.createEl("p", { text: error.message || String(error), attr: { class: "auction-real-estate-research-warning", role: "alert" } });
        message.scrollIntoView?.({ block: "nearest" });
      }
    }
    onClose() { this.closed = true; this.contentEl.empty(); if (this.options.returnFocus?.focus) this.options.returnFocus.focus({ preventScroll: true }); }
  }
  async function openForAuction(app, auction, options) { const packageInfo = await readLatestPackage(app, auction); new ResearchModal(app, auction, Object.assign({}, options || {}, { packageInfo })).open(); return packageInfo; }
  const api = Object.freeze({ commandFor, invalidatePackageIndex, openForAuction, readLatestPackage, shellQuote, verifyRawFiles }); root.AuctionRealEstateResearch = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
