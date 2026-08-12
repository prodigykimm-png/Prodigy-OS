(function (root) {
  "use strict";

  const FOLDER = "PARA/INBOX/Place Candidates";
  const TEMPLATE_PATH = "SYSTEM/TEMPLATE/FORMAT/template_fleeting_note.md";
  const PLACE_KINDS = Object.freeze({
    cafe: "카페",
    restaurant: "식당",
    retail: "상점",
    attraction: "관광지",
    accommodation: "숙소",
    travel_spot: "여행지",
    other: "기타"
  });
  const PLACE_KIND_VALUES = Object.freeze(Object.keys(PLACE_KINDS));
  const candidateWriteQueues = new Map();

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function oneLine(value) {
    return clean(value).replace(/\s+/g, " ");
  }

  function normalizedFilename(value) {
    return oneLine(value)
      .normalize("NFC")
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("ko-KR");
  }

  function safeFilename(value) {
    const filename = oneLine(value)
      .normalize("NFC")
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!filename || filename === "." || filename === "..") return "";
    return filename;
  }

  function candidatePathForName(name) {
    const filename = safeFilename(name);
    if (!filename) throw new Error("장소 이름은 필수입니다.");
    return `${FOLDER}/${filename}.md`;
  }

  function normalizeDailyPath(value) {
    const dailyPath = clean(value).replace(/\\/g, "/");
    if (!dailyPath || !dailyPath.startsWith("DAILY/DAILY/") || !/\.md$/i.test(dailyPath) || dailyPath.startsWith("/") || dailyPath.split("/").includes("..")) {
      throw new Error("연결할 Daily 경로가 필요합니다.");
    }
    return dailyPath;
  }

  function dailyLinkForPath(value) {
    return `[[${normalizeDailyPath(value).replace(/\.md$/i, "")}]]`;
  }

  function normalizeCandidateInput(input) {
    const source = input || {};
    const name = oneLine(source.name);
    const placeKind = clean(source.place_kind).toLowerCase();
    if (!name) throw new Error("장소 이름은 필수입니다.");
    if (!Object.prototype.hasOwnProperty.call(PLACE_KINDS, placeKind)) {
      throw new Error("장소 종류를 선택해주세요.");
    }
    const address = oneLine(source.address);
    const memo = oneLine(source.memo);
    const verifiedAddress = Boolean(source.verified_address) && Boolean(address);
    const revisitMemo = Boolean(source.revisit_memo) && Boolean(memo);
    return Object.freeze({
      name,
      filename: safeFilename(name),
      place_kind: placeKind,
      address,
      memo,
      verified_address: verifiedAddress,
      revisit_memo: revisitMemo,
      daily_path: normalizeDailyPath(source.daily_path)
    });
  }

  function isReviewReady(input, dailyLinks) {
    const normalized = input && input.filename ? input : normalizeCandidateInput(input || {});
    const distinctDailyLinks = new Set((dailyLinks || []).map(normalizeDailyLinkTarget).filter(Boolean));
    return distinctDailyLinks.size >= 2 || normalized.verified_address || normalized.revisit_memo;
  }

  function reviewReason(input, dailyLinks) {
    const normalized = input && input.filename ? input : normalizeCandidateInput(input || {});
    const distinctDailyLinks = new Set((dailyLinks || []).map(normalizeDailyLinkTarget).filter(Boolean));
    if (distinctDailyLinks.size >= 2) return "daily_evidence";
    if (normalized.verified_address) return "verified_address";
    if (normalized.revisit_memo) return "revisit_memo";
    return "none";
  }

  function escapeInline(value) {
    return oneLine(value).replace(/`/g, "\\`");
  }

  function materializeTemplate(template, input, now) {
    const created = now instanceof Date ? now.toISOString() : new Date().toISOString();
    const title = escapeInline(input.name);
    const source = String(template || "");
    if (!/^---\n[\s\S]*?\n---(?:\n|$)/.test(source)) {
      throw new Error("Fleeting Note 템플릿의 frontmatter를 읽을 수 없습니다.");
    }
    const frontmatter = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)[1];
    if (!/^type:\s*fleeting_note\s*$/m.test(frontmatter)) {
      throw new Error("Fleeting Note 템플릿은 type: fleeting_note 여야 합니다.");
    }
    return source
      .replace(/<%\s*tp\.file\.title\s*%>/g, title)
      .replace(/<%\s*tp\.file\.creation_date\(\)\s*%>/g, created)
      .replace(/<%\s*tp\.file\.cursor\(\)\s*%>/g, "")
      .replace(/\s+$/, "");
  }

  function buildCandidateBody(input, dailyLinks) {
    const normalized = input && input.daily_path ? input : normalizeCandidateInput(input || {});
    const links = uniqueDailyLinks((dailyLinks || []).concat([normalized.daily_path]));
    const ready = isReviewReady(normalized, links);
    const reason = reviewReason(normalized, links);
    const lines = [
      "## 장소 후보",
      "",
      "- 라이프사이클: `candidate`",
      `- 장소 종류: \`${normalized.place_kind}\` (${PLACE_KINDS[normalized.place_kind]})`,
      `- 주소: ${normalized.address ? escapeInline(normalized.address) : "없음"}`,
      `- 메모: ${normalized.memo ? escapeInline(normalized.memo) : "없음"}`,
      `- 검증 근거: \`${reason}\``,
      `- 검토 준비: \`${ready ? "review_ready" : "candidate"}\``,
      "",
      "## Daily Evidence",
      ""
    ];
    links.forEach((path) => lines.push(`- ${dailyLinkForPath(path)}`));
    return lines.join("\n");
  }

  function renderCandidateContent(template, input, options) {
    const normalized = input && input.daily_path ? input : normalizeCandidateInput(input || {});
    const base = materializeTemplate(template, normalized, options && options.now);
    return `${base}\n\n${buildCandidateBody(normalized, [normalized.daily_path])}\n`;
  }

  function normalizeDailyLinkTarget(value) {
    const raw = clean(value)
      .replace(/^\[\[/, "")
      .replace(/\]\]$/, "")
      .split("|")[0]
      .replace(/\\/g, "/");
    if (!raw) return "";
    const withExtension = /\.md$/i.test(raw) ? raw : `${raw}.md`;
    if (withExtension.startsWith("/") || withExtension.split("/").includes("..")) return "";
    return withExtension.normalize("NFC");
  }

  function uniqueDailyLinks(values) {
    const result = [];
    const seen = new Set();
    (values || []).forEach((value) => {
      const path = normalizeDailyLinkTarget(value);
      const key = path.toLocaleLowerCase("ko-KR");
      if (path && !seen.has(key)) {
        seen.add(key);
        result.push(path);
      }
    });
    return result;
  }

  function dailyEvidenceSection(content) {
    const source = String(content || "");
    const heading = /^## Daily Evidence\s*$/m.exec(source);
    if (!heading) return null;
    const start = heading.index + heading[0].length;
    const rest = source.slice(start);
    const nextHeading = /\n##\s+/.exec(rest);
    return { start, end: nextHeading ? start + nextHeading.index : source.length };
  }

  function extractDailyEvidenceLinks(content) {
    const section = dailyEvidenceSection(content);
    if (!section) return [];
    const source = String(content || "").slice(section.start, section.end);
    const links = [];
    const pattern = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = pattern.exec(source))) links.push(normalizeDailyLinkTarget(match[1]));
    return uniqueDailyLinks(links);
  }

  function hasStoredHumanReviewEvidence(content) {
    return /- 검증 근거:\s*`(?:verified_address|revisit_memo)`\s*$/m.test(String(content || ""));
  }

  function updateReviewReady(content, dailyLinks) {
    const ready = new Set(uniqueDailyLinks(dailyLinks)).size >= 2 || hasStoredHumanReviewEvidence(content);
    const next = String(content || "").replace(
      /^- 검토 준비:\s*`(?:candidate|review_ready)`\s*$/m,
      `- 검토 준비: \`${ready ? "review_ready" : "candidate"}\``
    );
    return next;
  }

  function appendDistinctDailyLink(content, dailyPath) {
    const normalizedDailyPath = normalizeDailyPath(dailyPath);
    const existing = extractDailyEvidenceLinks(content);
    const target = normalizeDailyLinkTarget(normalizedDailyPath);
    if (existing.some((value) => value.toLocaleLowerCase("ko-KR") === target.toLocaleLowerCase("ko-KR"))) {
      return { changed: false, content: String(content || ""), dailyLinks: existing };
    }
    const section = dailyEvidenceSection(content);
    if (!section) throw new Error("장소 후보의 Daily Evidence 섹션이 없습니다.");
    const source = String(content || "");
    const before = source.slice(0, section.end).replace(/\s*$/, "");
    const after = source.slice(section.end);
    const dailyLinks = uniqueDailyLinks(existing.concat([normalizedDailyPath]));
    const appended = `${before}\n- ${dailyLinkForPath(normalizedDailyPath)}${after}`;
    return { changed: true, content: updateReviewReady(appended, dailyLinks), dailyLinks };
  }

  function markdownFilesInFolder(app, folder) {
    if (!app || !app.vault) return [];
    if (typeof app.vault.getMarkdownFiles === "function") {
      return app.vault.getMarkdownFiles().filter((file) => file && String(file.path || "").startsWith(`${folder}/`));
    }
    const node = typeof app.vault.getAbstractFileByPath === "function" ? app.vault.getAbstractFileByPath(folder) : null;
    return node && Array.isArray(node.children) ? node.children.filter((file) => file && file.extension === "md") : [];
  }

  function findExactCandidate(app, name) {
    const expected = normalizedFilename(name);
    if (!expected) return null;
    const file = markdownFilesInFolder(app, FOLDER).find((item) => {
      const basename = item.basename || String(item.path || "").split("/").pop().replace(/\.md$/i, "");
      return normalizedFilename(basename) === expected;
    });
    if (file) return file;
    const path = candidatePathForName(name);
    return app && app.vault && typeof app.vault.getAbstractFileByPath === "function"
      ? app.vault.getAbstractFileByPath(path)
      : null;
  }

  async function ensureFolder(app, folder) {
    if (!app || !app.vault || typeof app.vault.getAbstractFileByPath !== "function") {
      throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    }
    const parts = String(folder || "").split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current)) {
        if (typeof app.vault.createFolder !== "function") throw new Error("후보함 폴더를 만들 수 없습니다.");
        try { await app.vault.createFolder(current); } catch (_error) { /* another write may have created it */ }
      }
    }
  }

  async function readTemplate(app) {
    if (!app || !app.vault || typeof app.vault.getAbstractFileByPath !== "function" || typeof app.vault.read !== "function") {
      throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    }
    const file = app.vault.getAbstractFileByPath(TEMPLATE_PATH);
    if (!file) throw new Error("Fleeting Note 템플릿을 찾을 수 없습니다.");
    return app.vault.read(file);
  }

  function requireHumanConfirmation(options, action) {
    if (!options || options.human_confirmed !== true) {
      throw new Error(`${action}하려면 사람의 명시적 확인이 필요합니다.`);
    }
  }

  function requireExistingDailyFile(app, dailyPath) {
    const path = normalizeDailyPath(dailyPath);
    if (!app || !app.vault || typeof app.vault.getAbstractFileByPath !== "function") {
      throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    }
    const file = app.vault.getAbstractFileByPath(path);
    const extension = clean(file && file.extension).toLowerCase();
    if (!file || extension !== "md" || !/\.md$/i.test(String(file.path || path))) {
      throw new Error("연결할 Daily 파일을 찾을 수 없습니다.");
    }
    return file;
  }

  async function queueCandidateWrite(path, operation) {
    const previous = candidateWriteQueues.get(path) || Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    candidateWriteQueues.set(path, next);
    try {
      return await next;
    } finally {
      if (candidateWriteQueues.get(path) === next) candidateWriteQueues.delete(path);
    }
  }

  async function createCandidate(app, input, options) {
    requireHumanConfirmation(options, "장소 후보를 저장");
    const normalized = normalizeCandidateInput(input);
    requireExistingDailyFile(app, normalized.daily_path);
    const existing = findExactCandidate(app, normalized.name);
    if (existing) return { ok: false, status: "collision", path: existing.path, file: existing };
    await ensureFolder(app, FOLDER);
    const raced = findExactCandidate(app, normalized.name);
    if (raced) return { ok: false, status: "collision", path: raced.path, file: raced };
    const template = await readTemplate(app);
    const path = candidatePathForName(normalized.name);
    const content = renderCandidateContent(template, normalized, options);
    try {
      const file = await app.vault.create(path, content);
      return { ok: true, status: "created", path: file.path, file, content };
    } catch (error) {
      const collision = findExactCandidate(app, normalized.name);
      if (collision) return { ok: false, status: "collision", path: collision.path, file: collision };
      throw error;
    }
  }

  async function appendDailyLinkToCandidate(app, input, options) {
    requireHumanConfirmation(options, "기존 후보에 Daily를 연결");
    const normalized = normalizeCandidateInput(input);
    requireExistingDailyFile(app, normalized.daily_path);
    const existing = findExactCandidate(app, normalized.name);
    if (!existing) return { ok: false, status: "missing" };
    if (!app || !app.vault || typeof app.vault.read !== "function" || typeof app.vault.modify !== "function") {
      throw new Error("Obsidian Vault를 사용할 수 없습니다.");
    }
    return queueCandidateWrite(existing.path, async () => {
      const current = findExactCandidate(app, normalized.name);
      if (!current) return { ok: false, status: "missing" };
      const previous = await app.vault.read(current);
      if (!/^---\n[\s\S]*?^type:\s*fleeting_note\s*$/m.test(previous)) {
        throw new Error("기존 후보가 fleeting_note 형식이어서만 Daily를 연결할 수 있습니다.");
      }
      const appended = appendDistinctDailyLink(previous, normalized.daily_path);
      if (!appended.changed) return { ok: true, status: "unchanged", path: current.path, no_op: true, content: previous };
      await app.vault.modify(current, appended.content);
      return {
        ok: true,
        status: "appended",
        path: current.path,
        content: appended.content,
        review_ready: /- 검토 준비:\s*`review_ready`\s*$/m.test(appended.content)
      };
    });
  }

  function notice(message) {
    if (root.obsidian && typeof root.obsidian.Notice === "function") new root.obsidian.Notice(message);
  }

  function inputRow(container, label, value, options) {
    const row = container.createDiv({ cls: "place-candidate-field" });
    row.createEl("label", { text: label });
    const input = options && options.multiline ? row.createEl("textarea") : row.createEl("input", { type: (options && options.type) || "text" });
    input.value = value || "";
    if (options && options.placeholder) input.placeholder = options.placeholder;
    return input;
  }

  function openConfirmation(app, options) {
    const host = app || root.app;
    const Modal = root.obsidian && root.obsidian.Modal;
    if (!host || !Modal) {
      notice("장소 후보 저장 창을 열 수 없습니다.");
      return Promise.resolve({ ok: false, status: "unavailable" });
    }
    const seed = options || {};
    return new Promise((resolve) => {
      class PlaceCandidateModal extends Modal {
        constructor() {
          super(host);
          this.busy = false;
          this.finished = false;
        }

        finish(result) {
          if (this.finished) return;
          this.finished = true;
          this.close();
          resolve(result);
        }

        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.createEl("h2", { text: "장소 후보 보관" });
          contentEl.createEl("p", { text: "확인한 정보만 후보함에 저장합니다. 이 작업은 Place 또는 Resource를 만들지 않습니다." });
          const name = inputRow(contentEl, "장소 이름", seed.name, { placeholder: "예: 성수 카페" });
          const kindRow = contentEl.createDiv({ cls: "place-candidate-field" });
          kindRow.createEl("label", { text: "장소 종류" });
          const kind = kindRow.createEl("select");
          kind.createEl("option", { text: "선택", value: "" });
          PLACE_KIND_VALUES.forEach((value) => kind.createEl("option", { text: PLACE_KINDS[value], value }));
          kind.value = clean(seed.place_kind).toLowerCase();
          const address = inputRow(contentEl, "주소 (선택)", seed.address, { placeholder: "확인한 주소만 입력" });
          const memo = inputRow(contentEl, "메모 (선택)", seed.memo, { multiline: true, placeholder: "재방문 이유 또는 관찰" });
          const verifiedAddress = contentEl.createEl("label", { cls: "place-candidate-check" });
          const verifiedAddressInput = verifiedAddress.createEl("input", { type: "checkbox" });
          verifiedAddressInput.checked = Boolean(seed.verified_address);
          verifiedAddress.appendText(" 주소를 직접 확인했습니다");
          const revisitMemo = contentEl.createEl("label", { cls: "place-candidate-check" });
          const revisitMemoInput = revisitMemo.createEl("input", { type: "checkbox" });
          revisitMemoInput.checked = Boolean(seed.revisit_memo);
          revisitMemo.appendText(" 재방문 메모를 직접 확인했습니다");
          contentEl.createEl("p", { text: `연결 Daily: ${clean(seed.daily_path) || "없음"}`, cls: "place-candidate-daily" });
          const actions = contentEl.createDiv({ cls: "modal-button-container" });
          const cancel = actions.createEl("button", { text: "취소" });
          const save = actions.createEl("button", { text: "후보 보관", cls: "mod-cta" });
          cancel.addEventListener("click", () => this.finish({ ok: false, status: "cancelled" }));
          save.addEventListener("click", async () => {
            if (this.busy) return;
            this.busy = true;
            save.disabled = true;
            try {
              const input = {
                name: name.value,
                place_kind: kind.value,
                address: address.value,
                memo: memo.value,
                verified_address: verifiedAddressInput.checked,
                revisit_memo: revisitMemoInput.checked,
                daily_path: seed.daily_path
              };
              const result = await createCandidate(host, input, { human_confirmed: true });
              if (result.status === "collision") {
                this.finished = true;
                this.close();
                openCollisionConfirmation(host, input, result).then(resolve);
                return;
              }
              this.finish(result);
            } catch (error) {
              notice(error && error.message ? error.message : "장소 후보를 저장하지 못했습니다.");
              this.busy = false;
              save.disabled = false;
            }
          });
        }

        onClose() {
          this.contentEl.empty();
          if (!this.finished) this.finish({ ok: false, status: "cancelled" });
        }
      }
      new PlaceCandidateModal().open();
    });
  }

  function openCollisionConfirmation(app, input, collision) {
    const Modal = root.obsidian && root.obsidian.Modal;
    if (!Modal) return Promise.resolve({ ok: false, status: "unavailable" });
    return new Promise((resolve) => {
      class CollisionModal extends Modal {
        constructor() { super(app); this.busy = false; this.finished = false; }
        finish(result) {
          if (this.finished) return;
          this.finished = true;
          this.close();
          resolve(result);
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          contentEl.createEl("h2", { text: "같은 이름의 장소 후보가 있습니다" });
          contentEl.createEl("p", { text: "기존 노트는 덮어쓰지 않습니다. 이번 Daily만 연결할 수 있습니다." });
          const actions = contentEl.createDiv({ cls: "modal-button-container" });
          const cancel = actions.createEl("button", { text: "취소" });
          const append = actions.createEl("button", { text: "이번 Daily 연결", cls: "mod-cta" });
          cancel.addEventListener("click", () => this.finish({ ok: false, status: "cancelled", path: collision.path }));
          append.addEventListener("click", async () => {
            if (this.busy) return;
            this.busy = true;
            append.disabled = true;
            try {
              const result = await appendDailyLinkToCandidate(app, input, { human_confirmed: true });
              this.finish(result);
            } catch (error) {
              notice(error && error.message ? error.message : "Daily를 연결하지 못했습니다.");
              this.busy = false;
              append.disabled = false;
            }
          });
        }
        onClose() {
          this.contentEl.empty();
          if (!this.finished) this.finish({ ok: false, status: "cancelled", path: collision.path });
        }
      }
      new CollisionModal().open();
    });
  }

  const api = Object.freeze({
    FOLDER,
    TEMPLATE_PATH,
    PLACE_KINDS,
    PLACE_KIND_VALUES,
    normalizedFilename,
    candidatePathForName,
    normalizeCandidateInput,
    normalizeDailyPath,
    dailyLinkForPath,
    normalizeDailyLinkTarget,
    uniqueDailyLinks,
    isReviewReady,
    reviewReason,
    materializeTemplate,
    buildCandidateBody,
    renderCandidateContent,
    extractDailyEvidenceLinks,
    appendDistinctDailyLink,
    findExactCandidate,
    requireExistingDailyFile,
    createCandidate,
    appendDailyLinkToCandidate,
    openConfirmation,
    openCollisionConfirmation
  });

  root.PlaceCandidateStore = api;
  root.openPlaceCandidateConfirmation = openConfirmation;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
