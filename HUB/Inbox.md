---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# 📥 Inbox

> **미분류 기록 검토함**
> 임시로 캡처된 정보와 빠른 기록(Fleeting Notes)을 검토하는 공간입니다.
> Home의 **+ 새 Object** 또는 아래 각 기록의 **Object로 검토**를 사용하세요.
> 기존 Object Creator가 변환을 담당하며, 이 Inbox는 원본을 변경하거나 보관 정책을 결정하지 않습니다.

---

## 📝 대기 중인 임시 기록 (Fleeting Notes)

```dataviewjs
const inboxRoot = dv.container;
const browserWindow = typeof window !== "undefined" ? window : globalThis;
const creatorPaths = [
  "SYSTEM/Views/object-engine-core.js",
  "SYSTEM/Views/object-creator-core.js",
  "SYSTEM/Views/object-creator-view.js"
];
let creatorLoadPromise = null;

inboxRoot.createEl("style").textContent = `
.inbox-utility-table{width:100%;border-collapse:collapse}
.inbox-utility-table th,.inbox-utility-table td{padding:8px 6px;border-bottom:1px solid var(--background-modifier-border);vertical-align:top;text-align:left}
.inbox-utility-table th{font-size:.78em;color:var(--text-muted)}
.inbox-utility-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.inbox-utility-actions button{min-height:34px;padding:5px 10px;font:inherit}
.inbox-utility-status{font-size:.78em;color:var(--text-muted);min-height:1.3em}
.inbox-utility-status.is-error{color:var(--text-error)}
.inbox-utility-status.is-success{color:var(--text-success,var(--text-accent))}
.inbox-utility-retry{display:none}
`;

const clean = (value) => String(value == null ? "" : value).trim();
const loadCreatorScript = async (path) => {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`필수 스크립트 파일이 없습니다: ${path}`);
  (new Function(await app.vault.read(file)))();
};
const ensureCreator = async () => {
  browserWindow.obsidian = browserWindow.obsidian || (typeof obsidian !== "undefined" ? obsidian : undefined);
  browserWindow.app = app;
  if (browserWindow.ObjectCreatorView && browserWindow.ObjectCreatorCore) return browserWindow.ObjectCreatorView;
  if (!creatorLoadPromise) {
    creatorLoadPromise = (async () => {
      if (!browserWindow.ObjectEngine) await loadCreatorScript(creatorPaths[0]);
      if (!browserWindow.ObjectCreatorCore) await loadCreatorScript(creatorPaths[1]);
      if (!browserWindow.ObjectCreatorView) await loadCreatorScript(creatorPaths[2]);
      if (!browserWindow.ObjectCreatorView || typeof browserWindow.ObjectCreatorView.open !== "function") {
        throw new Error("Object Creator를 불러오지 못했습니다.");
      }
      return browserWindow.ObjectCreatorView;
    })().catch((error) => {
      creatorLoadPromise = null;
      throw error;
    });
  }
  return creatorLoadPromise;
};

const pages = dv.pages('"ZETA/FLEETING"')
  .where((p) => p.file.name !== "FLEETING")
  .sort((p) => p.file.mtime, "desc");

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>대기 중인 임시 기록이 없습니다.</span>");
} else {
  const table = inboxRoot.createEl("table", { attr: { class: "inbox-utility-table" } });
  const head = table.createEl("thead").createEl("tr");
  ["임시 기록명", "최종 수정일시", "Object 검토"].forEach((label) => head.createEl("th", { text: label }));
  const body = table.createEl("tbody");

  pages.forEach((page) => {
    const path = clean(page.file.path);
    const title = clean(page.file.name) || "임시 기록";
    const row = body.createEl("tr");
    const sourceCell = row.createEl("td");
    const sourceLink = sourceCell.createEl("a", {
      text: title,
      attr: { href: "#", "aria-label": `${title} 원본 열기` }
    });
    sourceLink.onclick = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      if (app.workspace && typeof app.workspace.openLinkText === "function") {
        app.workspace.openLinkText(path.replace(/\.md$/i, ""), path, false);
      }
    };
    const time = page.file.mtime && typeof page.file.mtime.toFormat === "function"
      ? page.file.mtime.toFormat("yyyy-MM-dd HH:mm")
      : clean(page.file.mtime) || "-";
    row.createEl("td", { text: time });

    const actions = row.createEl("td", { attr: { class: "inbox-utility-actions" } });
    const open = actions.createEl("button", {
      text: "Object로 검토",
      attr: { type: "button", "aria-label": `${title}를 기존 Object Creator로 검토` }
    });
    const status = actions.createEl("span", {
      text: "검토 대기",
      attr: { class: "inbox-utility-status", role: "status", "aria-live": "polite" }
    });
    let statusMessage = "검토 대기";
    const retry = actions.createEl("button", {
      text: "다시 시도",
      attr: { type: "button", class: "inbox-utility-retry", "aria-label": `${title} Object 검토 다시 시도` }
    });

    const setStatus = (message, state) => {
      statusMessage = message;
      status.setText(message);
      status.removeClass("is-error");
      status.removeClass("is-success");
      if (state === "error") status.addClass("is-error");
      if (state === "success") status.addClass("is-success");
    };
    const setRetry = (visible) => { retry.style.display = visible ? "" : "none"; };
    const launch = async () => {
      if (open.disabled) return;
      open.disabled = true;
      retry.disabled = true;
      setRetry(false);
      setStatus("Object Creator를 불러오는 중…", "pending");
      try {
        await ensureCreator();
        const sourceFile = app.vault && typeof app.vault.getAbstractFileByPath === "function"
          ? app.vault.getAbstractFileByPath(path)
          : null;
        if (!sourceFile || !app.vault || typeof app.vault.read !== "function") {
          throw new Error("Inbox 원본을 읽을 수 없습니다. 다시 시도해 주세요.");
        }
        const sourceText = clean(await app.vault.read(sourceFile)) || title;
        const modal = browserWindow.ObjectCreatorView.open(app, {
          initialText: sourceText,
          source: { path, title, type: "fleeting_note", provenance: "Inbox" },
          openerEl: open,
          keepOpenOnSuccess: true,
          confirmBeforeClose: true,
          onStateChange: (event) => {
            if (!event || !event.state) return;
            if (event.state === "pending") setStatus("만드는 중…", "pending");
            if (event.state === "success") {
              setStatus("저장 완료 · 검증 대기를 열 수 있습니다.", "success");
              setRetry(false);
            }
            if (event.state === "error") {
              setStatus("오류가 발생했습니다. 다시 시도해 주세요.", "error");
              setRetry(true);
            }
            if (event.state === "closed" && event.result && event.result.ok) {
              setStatus("저장 완료 · 원본으로 돌아왔습니다.", "success");
            }
          },
          onSuccess: ({ result }) => {
            if (result && result.ok === false) setStatus("저장에 실패했습니다. 다시 시도해 주세요.", "error");
          },
          onClose: () => {
            open.disabled = false;
            retry.disabled = false;
            if (statusMessage === "검토 창을 열었습니다. 원본은 변경하지 않습니다.") setStatus("닫혔습니다. 다시 열 수 있습니다.", "pending");
          }
        });
        if (!modal) throw new Error("Object Creator 모달을 열 수 없습니다.");
        setStatus("검토 창을 열었습니다. 원본은 변경하지 않습니다.", "pending");
      } catch (error) {
        open.disabled = false;
        retry.disabled = false;
        setRetry(true);
        setStatus(`Object Creator를 열 수 없습니다. ${error.message || String(error)}`, "error");
      }
    };
    open.onclick = launch;
    retry.onclick = launch;
  });
}
```

---

## ⚠️ 정보 보완 필요 (Auction)

```dataviewjs
let pages = dv.pages('"PARA/PROJECTS/Auction"')
  .where(p => p.type === "auction_case" && ["watching", "bidding", "reviewing"].includes(p.status))
  .where(p => !p.next_action || p.next_action === "정보 없음" || !p.expected_bid || p.expected_bid === "정보 없음");

if (pages.length === 0) {
  dv.paragraph("<span style='color:var(--text-muted);font-style:italic;font-size:0.9em;'>보완이 필요한 경매 물건이 없습니다.</span>");
} else {
  const tableData = [];
  pages.forEach(p => {
    const missingFields = [];
    if (!p.next_action || p.next_action === "정보 없음") missingFields.push("Next Action");
    if (!p.expected_bid || p.expected_bid === "정보 없음") missingFields.push("예상입찰가");
    tableData.push([p.file.link, p.status, missingFields.join(", ")]);
  });
  dv.table(["사건번호", "현재 상태", "누락된 정보"], tableData);
}
```

---

<!-- QuickAdd UUID 버튼 제거됨 (2026-07-27): Home Creator가 유일한 Object 생성 진입점입니다. -->
