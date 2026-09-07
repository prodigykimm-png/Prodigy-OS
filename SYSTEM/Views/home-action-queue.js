(function (root) {
  "use strict";

  const ACTIVE_CONTINUE = new Set(["active", "bidding", "doing", "in_progress", "reading", "running"]);

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function normalizedPath(value) { return clean(value).replace(/^\.\/+/u, "").replace(/\/{2,}/gu, "/").toLowerCase(); }
  function workspaceId(value) {
    const raw = clean(value).toLowerCase();
    if (/경매|auction/u.test(raw)) return "auction";
    if (/독서|reading/u.test(raw)) return "reading";
    if (/프로젝트|project/u.test(raw)) return "project";
    if (/운동|workout|running/u.test(raw)) return "workout";
    if (/저널|journal|personal/u.test(raw)) return "journal";
    if (/지식|knowledge/u.test(raw)) return "knowledge";
    return raw;
  }
  function localDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function dateDistance(fromDate, due) {
    const source = new Date(`${localDate(fromDate)}T00:00:00`);
    const target = new Date(`${clean(due).slice(0, 10)}T00:00:00`);
    if (!Number.isFinite(target.getTime())) return null;
    return Math.round((target.getTime() - source.getTime()) / 86400000);
  }
  function ddayLabel(days) {
    if (days == null) return "";
    if (days === 0) return "D-day";
    return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
  }
  function keyFor(item) {
    const path = normalizedPath(item.object_path);
    if (path) return `path:${path}`;
    return `title:${clean(item.title).replace(/\s+/gu, " ").toLowerCase()}`;
  }
  function targetFor(workspace, objectPath, supplied, pathFor) {
    return clean(supplied) || clean(pathFor(workspace)) || clean(objectPath);
  }

  function buildActionQueue(options) {
    const opts = options || {};
    const pkg = opts.pkg || {};
    const context = pkg.context || {};
    const now = opts.now instanceof Date ? opts.now : new Date();
    const pathFor = typeof opts.workspacePathFor === "function" ? opts.workspacePathFor : () => "";
    const rows = [];
    const positions = new Map();
    let sequence = 0;

    const add = (input) => {
      if (!input || !clean(input.title) || !Number.isFinite(input.priority)) return;
      const row = Object.assign({ sequence: sequence++ }, input);
      const key = keyFor(row);
      if (positions.has(key)) {
        const index = positions.get(key);
        if (rows[index].priority >= row.priority) return;
        rows[index] = row;
        return;
      }
      positions.set(key, rows.length);
      rows.push(row);
    };

    (Array.isArray(context.auctions) ? context.auctions : []).forEach((auction) => {
      const status = clean(auction && auction.status).toLowerCase();
      if (status !== "bidding" && status !== "입찰") return;
      const days = dateDistance(now, auction.auction_datetime || auction.due_date);
      if (days == null) return;
      const priority = days <= 0 ? 115 : days === 1 ? 110 : days <= 3 ? 100 : 82;
      const title = clean(auction.case_number || auction.title || auction.address) || "입찰 물건";
      add({
        kind: "auction",
        priority,
        title,
        reason: `${ddayLabel(days)} · 입찰 판단과 준비 상태를 확인합니다.`,
        workspace: "auction",
        action_label: "경매 열기",
        target_path: targetFor("auction", auction.path, "", pathFor),
        object_path: clean(auction.path),
        due_date: clean(auction.auction_datetime || auction.due_date),
      });
    });

    (Array.isArray(opts.attention) ? opts.attention : []).forEach((item) => {
      const level = clean(item && item.attention_level).toLowerCase();
      const priority = level === "critical" ? 105 : level === "high" ? 95 : 0;
      if (!priority) return;
      const workspace = workspaceId(item.workspace || item.workspace_label);
      add({
        kind: "attention",
        priority,
        title: clean(item.label) || "주의가 필요한 Object",
        reason: clean(item.reason) || "오늘 확인이 필요합니다.",
        workspace,
        action_label: "확인하기",
        target_path: targetFor(workspace, item.object_path, item.dashboard_path, pathFor),
        object_path: clean(item.object_path),
      });
    });

    (Array.isArray(opts.focusItems) ? opts.focusItems : []).slice(0, 3).forEach((item, index) => {
      const approved = opts.focusApproved === true;
      const workspace = workspaceId(item.source_type || item.workspace);
      add({
        kind: approved ? "approved_focus" : "focus_proposal",
        priority: (approved ? 88 : 74) - index,
        title: clean(item.label || item.title) || "오늘의 집중",
        reason: clean(item.next_action || item.reason) || "AI가 오늘의 다음 행동으로 제안했습니다.",
        workspace,
        action_label: approved ? "시작하기" : "집중으로 승인",
        target_path: targetFor(workspace, item.object_path, "", pathFor),
        object_path: clean(item.object_path),
        focus_item: item,
      });
    });

    const fleetingCount = Number(opts.fleetingCount) || 0;
    if (fleetingCount > 0) {
      add({
        kind: "fleeting",
        priority: 81,
        title: `미정리 생각 ${fleetingCount}개`,
        reason: "직접 저장한 생각 중 아직 검토하지 않은 블록입니다.",
        workspace: "knowledge",
        action_label: "생각 정리",
        target_path: pathFor("knowledge") || "HUB/50 Knowledge.md",
        object_path: "",
      });
    }

    const inboxCount = Number(opts.inboxCount) || 0;
    if (inboxCount >= 3) {
      add({
        kind: "inbox",
        priority: inboxCount >= 10 ? 92 : 80,
        title: `INBOX ${inboxCount}개 검토`,
        reason: "새 자료를 정리·태깅·연결할 제안을 확인합니다.",
        workspace: "knowledge",
        action_label: "지식함 열기",
        target_path: pathFor("knowledge") || "HUB/50 Knowledge.md",
        object_path: "",
        pending_count: inboxCount,
        pending_priority: inboxCount >= 10 ? "backlog" : "emphasized",
      });
    }

    const journalStatus = clean(opts.journalStatus).toLowerCase();
    if (!journalStatus || ["empty", "missing", "incomplete"].includes(journalStatus)) {
      const evening = now.getHours() >= 18 || now.getHours() < 5;
      add({
        kind: "journal",
        priority: evening ? 100 : 58,
        title: evening ? "오늘을 2분으로 마무리" : "오늘 저널 비어 있음",
        reason: evening ? "오늘의 판단과 다음 실험을 짧게 남깁니다." : "필요할 때 오늘의 판단 근거를 남깁니다.",
        workspace: "journal",
        action_label: "2분 성찰",
        target_path: pathFor("journal") || "HUB/70 Journal.md",
        object_path: "",
      });
    }

    (Array.isArray(opts.continueCards) ? opts.continueCards : []).forEach((card) => {
      const status = clean(card && card.status).toLowerCase();
      const next = clean(card && card.next_action);
      if (!ACTIVE_CONTINUE.has(status) || !next) return;
      const workspace = workspaceId(card.workspace || card.workspace_label);
      add({
        kind: "continue",
        priority: 65,
        title: clean(card.title),
        reason: next,
        workspace,
        action_label: "이어하기",
        target_path: targetFor(workspace, card.object_path, card.dashboard_path, pathFor),
        object_path: clean(card.object_path),
      });
    });

    const sortedRows = rows.sort((left, right) => right.priority - left.priority || clean(left.due_date).localeCompare(clean(right.due_date)) || left.sequence - right.sequence);
    const limited = sortedRows.slice(0, 5);
    const knowledgePending = sortedRows.find((item) => item.kind === "inbox");
    if (knowledgePending && !limited.includes(knowledgePending)) limited[limited.length - 1] = knowledgePending;
    return Object.freeze(limited.map((item, index) => Object.freeze(Object.assign({}, item, { rank: index + 1 }))));
  }

  function renderActionQueue(options) {
    const opts = options || {};
    const parent = opts.parent;
    const actions = Array.isArray(opts.actions) ? opts.actions : [];
    const activate = typeof opts.onAction === "function" ? opts.onAction : () => {};
    if (!parent || typeof parent.createEl !== "function") throw new Error("Home action queue requires a parent.");
    const section = parent.createEl("section", {
      attr: { class: "home-action-queue home-native-group", "aria-label": "오늘의 다음 행동" },
    });
    const head = section.createEl("div", { attr: { class: "home-action-queue-head" } });
    const title = head.createEl("div");
    title.createEl("p", { text: "오늘의 지휘부", attr: { class: "home-action-queue-kicker" } });
    title.createEl("h2", { text: "다음 행동", attr: { class: "home-action-queue-title" } });
    head.createEl("span", {
      text: opts.aiBacked === false ? "실제 상태 기준" : "실제 상태 + AI 제안",
      attr: { class: "badge badge-gray home-action-queue-mode" },
    });
    if (!actions.length) {
      section.createEl("p", {
        text: "지금 처리할 다음 행동이 없습니다. 생각이나 자료를 추가해도 됩니다.",
        attr: { class: "home-action-queue-empty" },
      });
      return section;
    }
    const list = section.createEl("div", { attr: { class: "home-action-list" } });
    actions.forEach((action, index) => {
      const row = list.createEl("article", {
        attr: {
          class: `home-action-row${index === 0 ? " is-primary" : ""}`,
          "data-action-kind": action.kind,
          ...(action.kind === "inbox" ? {
            "data-pending-count": String(action.pending_count),
            "data-pending-priority": action.pending_priority,
          } : {}),
        },
      });
      row.createEl("span", { text: String(action.rank), attr: { class: "home-action-rank", "aria-hidden": "true" } });
      const copy = row.createEl("div", { attr: { class: "home-action-copy" } });
      const top = copy.createEl("div", { attr: { class: "home-action-title-line" } });
      top.createEl("strong", { text: action.title, attr: { class: "home-action-title" } });
      if (action.workspace) top.createEl("span", { text: workspaceId(action.workspace), attr: { class: "badge badge-gray home-action-workspace" } });
      copy.createEl("p", { text: action.reason, attr: { class: "home-action-reason" } });
      const button = row.createEl("button", {
        text: action.action_label,
        attr: { type: "button", class: index === 0 ? "action-btn action-btn-primary home-action-button" : "action-btn home-action-button", "aria-label": `${action.title} · ${action.action_label}` },
      });
      button.onclick = () => activate(action);
    });
    return section;
  }

  const api = Object.freeze({ buildActionQueue, renderActionQueue, dateDistance, ddayLabel, workspaceId });
  root.HomeActionQueue = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
