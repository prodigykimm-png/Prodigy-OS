(function (root) {
  "use strict";
  // Presentation only. Callers retain packet, source, write and recovery authority.
  function el(parent, tag, text = "", attr = {}) {
    if (parent.createEl) return parent.createEl(tag, { text, attr });
    const node = parent.ownerDocument.createElement(tag);
    node.textContent = text;
    Object.entries(attr).forEach(([key, value]) => node.setAttribute(key, value));
    parent.appendChild(node); return node;
  }
  function empty(node) { if (node.empty) node.empty(); else node.replaceChildren(); }
  function attr(node, key, value) { if (node.setAttr) node.setAttr(key, String(value)); else node.setAttribute(key, String(value)); }
  function button(parent, label, action, callback, primary = false) {
    const node = el(parent, "button", label, { type: "button", "data-action": action, "data-primary": String(primary) });
    node.onclick = callback; return node;
  }
  function title(path) { return String(path || "").split("/").pop().replace(/\.md$/u, ""); }
  function journeyState(snapshot = {}) {
    const status = snapshot.status || "idle", wiki = snapshot.prodigy_wiki || {}, op = snapshot.operation_run || {};
    // A write/readback outcome always wins over retained generation completion.
    const durableApplied = snapshot.inbox?.state === "complete" && snapshot.inbox.succeeded > 0 && snapshot.inbox.failed === 0
      && snapshot.durable_operation_outcomes?.length > 0 && snapshot.durable_operation_outcomes.every(row => row.status === "committed");
    if (/^(applying|applied|committ|compensat|operation_refresh|git_)/u.test(status) || ["completed", "processed", "no_change"].includes(status)
      || status === "complete" && !snapshot.golden_wiki && wiki.status !== "review_ready"
      || op.status === "committed" || snapshot.already_written === true || durableApplied) return { step: 4 };
    if (["source_changed", "range_required", "change_range_required"].includes(wiki.status || status)
      || snapshot.golden_wiki?.status === "scope_required" || wiki.picker_open) return { step: 1 };
    if (["review", "review_only", "review_ready", "exact_preview", "stale_reconfirm_required", "blocked", "preview_acknowledged"].includes(status)
      || wiki.status === "review_ready" || snapshot.golden_wiki?.status === "complete") return { step: 3 };
    if (["interrupted", "failed", "cancelled"].includes(wiki.status || status)) return { step: 2, interrupted: true };
    if (wiki.source || snapshot.source_selection?.selected || ["source_selected", "consent_required", "running"].includes(status)) return { step: 2 };
    return { step: 1 };
  }
  function journey(parent, snapshot) {
    empty(parent);
    const state = journeyState(snapshot);
    const list = el(parent, "ol", "", { class: "wiki-journey", "aria-label": "문서 정리 단계" });
    ["선택", "정리", "확인", "적용"].forEach((label, index) => {
      const step = index + 1;
      const row = el(list, "li", "", { "data-step": String(step), "data-complete": String(step < state.step), ...(step === state.step ? { "aria-current": "step" } : {}) });
      el(row, "span", String(step), { class: "wiki-step-number" });
      el(row, "span", label);
      if (step < state.step) el(row, "span", "✓", { "aria-label": "완료" });
      if (step === state.step && state.interrupted) el(row, "span", "중단됨");
      if (step !== 4) el(row, "span", "→", { "aria-hidden": "true", class: "wiki-step-arrow" });
    });
    return state;
  }
  function splitDocument(bytes) {
    const text = String(bytes || "");
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text);
    return { body: match ? text.slice(match[0].length) : text, metadata: match ? match[1] : "" };
  }
  function markdown(parent, bytes, renderMarkdown) {
    const body = splitDocument(bytes).body;
    const node = el(parent, "div", "", { class: "wiki-document-body", "data-document-body": "" });
    if (renderMarkdown) {
      Promise.resolve(renderMarkdown(body, node)).catch(error => el(node, "p", `! 본문 표시 실패: ${error.message}`, { role: "alert" }));
    } else {
      // Safe DOM fallback for fixtures/hosts without Obsidian's MarkdownRenderer.
      for (const block of body.split(/\n\s*\n/u)) {
        const heading = /^(#{1,6}) (.*)$/u.exec(block);
        el(node, heading ? `h${heading[1].length}` : "p", heading ? heading[2] : block);
      }
    }
    return node;
  }
  const FIELD_LABELS = Object.freeze({ knowledge_kind: "지식 종류", classification: "내용 성격", knowledge_domain: "분야", knowledge_topics: "주제", application_trigger: "사용할 때", application_contexts: "사용 맥락", conditions: "적용 범위", invalidation_conditions: "다시 검토할 조건", exclusions: "예외·금지사항", rationale: "원칙의 근거", steps: "절차", outcome: "기대 결과", definition: "개념 정의", relation_status: "기존 지식과의 관계", evidence_strength: "근거 수준" });
  function metadataEntries(raw) {
    const entries = new Map(); let key = "";
    for (const line of String(raw).split("\n")) {
      const match = /^([\w-]+):\s*(.*)$/u.exec(line);
      if (match) { key = match[1]; entries.set(key, match[2]); }
      else if (key) entries.set(key, `${entries.get(key)}\n${line}`.trim());
    }
    return entries;
  }
  // Ordered exact line matching, O(n + m), without truncating changed bytes.
  function diffLines(before, after) {
    const a = String(before).split("\n"), b = String(after).split("\n");
    const positions = new Map(); b.forEach((line, i) => { if (!positions.has(line)) positions.set(line, []); positions.get(line).push(i); });
    const cursors = new Map(), rows = []; let next = 0;
    a.forEach(line => {
      const matches = positions.get(line) || []; let cursor = cursors.get(line) || 0;
      while (cursor < matches.length && matches[cursor] < next) cursor++;
      cursors.set(line, cursor);
      if (cursor === matches.length) { rows.push({ kind: "remove", line }); return; }
      const at = matches[cursor];
      while (next < at) rows.push({ kind: "add", line: b[next++] });
      rows.push({ kind: "same", line }); next++;
    });
    while (next < b.length) rows.push({ kind: "add", line: b[next++] });
    return rows;
  }
  function exactPreview(parent, preview, options = {}) {
    empty(parent);
    attr(parent, "data-exact-preview", "true");
    const before = splitDocument(preview.before), after = splitDocument(preview.after);
    el(parent, "p", `대상: ${preview.target_path}`, { "data-output-target": preview.target_path });
    const fields = el(parent, "table", "", { "data-metadata-changes": "", "aria-label": "분류와 저장 조건 변경" });
    const head = el(fields, "tr"); ["항목", "변경 전", "변경 후"].forEach(label => el(head, "th", label));
    const previous = metadataEntries(before.metadata), next = metadataEntries(after.metadata);
    for (const key of new Set([...previous.keys(), ...next.keys()])) {
      if (previous.get(key) === next.get(key) || /(?:_hash|_id|revision|^sources$|^relations$|^created$|^updated$|^schema_version$)/u.test(key)) continue;
      const row = el(fields, "tr", "", { "data-field-change": key });
      el(row, "th", FIELD_LABELS[key] || key); el(row, "td", previous.get(key) || "없음"); el(row, "td", next.get(key) || "없음");
    }
    if (options.reviewFields) {
      const reviewed = el(parent, "table", "", { "aria-label": "검토한 저장 조건", "data-reviewed-fields": "" });
      for (const key of ["classification"]) {
        const label = FIELD_LABELS[key];
        if (!options.reviewFields[key]) continue;
        const row = el(reviewed, "tr", "", { "data-reviewed-field": key }); el(row, "th", label); el(row, "td", options.reviewFields[key]);
      }
    }
    const views = el(parent, "div", "", { class: "wiki-view-switch", "aria-label": "미리보기 방식" });
    const body = el(parent, "section", "", { "data-exact-body": "" });
    const show = mode => {
      empty(body);
      attr(diff, "aria-pressed", mode === "diff"); attr(full, "aria-pressed", mode === "document");
      if (mode === "document") markdown(body, preview.after, options.renderMarkdown);
      else {
        let unchanged = null;
        for (const row of diffLines(before.body, after.body)) {
          if (row.kind === "same") {
            if (!unchanged) { unchanged = el(body, "details", "", { "data-unchanged": "" }); el(unchanged, "summary", "변경 없는 내용 펼치기"); }
            el(unchanged, "div", row.line, { class: "wiki-diff-line" });
          } else {
            unchanged = null;
            el(body, row.kind === "add" ? "ins" : "del", `${row.kind === "add" ? "+" : "-"} ${row.line}`, { class: "wiki-diff-line", "data-change": row.kind });
          }
        }
      }
    };
    const diff = button(views, "변경 내용", "show-diff", () => show("diff"));
    const full = button(views, "저장될 문서", "show-document", () => show("document"));
    const details = el(parent, "details", "", { "data-disclosure": "exact-details" }); el(details, "summary", "상세 정보");
    el(details, "p", preview.packet_hash || "");
    el(details, "pre", preview.before || "", { "data-raw-markdown": "before" });
    el(details, "pre", preview.after || "", { "data-raw-markdown": "after" });
    show(preview.before ? "diff" : "document");
  }
  function mount({ container, panelHost, shell, onNavigate }) {
    const frame = el(container, "section", "", { class: "wiki-workspace", "data-wiki-workspace": "" });
    const journeyHost = el(frame, "div", "", { class: "wiki-journey-row" });
    const middle = el(frame, "div", "", { class: "wiki-workspace-middle" });
    const sidebar = el(middle, "aside", "", { class: "wiki-sidebar" });
    const nav = el(sidebar, "nav", "", { "aria-label": "지식 탐색", class: "wiki-navigation" });
    const navButtons = new Map();
    for (const [route, label, destination] of [["zettelkasten", "제텔카스텐", "zettelkasten"], ["para", "PARA", "para"], ["prepare", "자료 정리", "llmwiki"], ["pending", "승인 대기", "llmwiki"], ["library", "문서 보관함", "llmwiki-browse"]]) {
      const control = button(nav, label, `wiki-nav-${route}`, () => onNavigate(destination, route));
      attr(control, "data-wiki-route", route); navButtons.set(route, control);
      if (route === "library") { empty(control); el(control, "span", label, { class: "wiki-library-label-full" }); el(control, "span", "보관함", { class: "wiki-library-label-narrow" }); }
    }
    const proposals = el(sidebar, "div", "", { class: "wiki-proposal-list" });
    const reading = el(middle, "div", "", { class: "wiki-reading-pane" });
    const selectorHost = el(reading, "div", "", { class: "wiki-proposal-selector" });
    reading.appendChild(panelHost);
    const decision = el(frame, "footer", "", { class: "wiki-decision-bar", "aria-label": "다음 작업", "data-wiki-decision": "" });
    const toolbar = el(shell.workspaceBar, "div", "", { class: "wiki-toolbar-actions" });
    const add = button(toolbar, "＋ 자료 추가", "wiki-add-material", () => api.onCapture?.());
    const more = el(toolbar, "details", "", { class: "wiki-more" }); el(more, "summary", "더 보기");
    const moreBody = el(more, "div", "", { class: "wiki-more-body" });
    // Extend the existing 지식 switcher, rather than inventing another menu.
    const oldSwitch = shell.switcher.onchange;
    [["zettelkasten", "제텔카스텐"], ["para", "PARA"]].forEach(([id, label]) => el(shell.switcher, "option", label, { value: `knowledge:${id}` }));
    shell.switcher.onchange = event => {
      if (shell.switcher.value.startsWith("knowledge:")) { onNavigate(shell.switcher.value.slice(10)); shell.switcher.value = "knowledge"; }
      else return oldSwitch?.(event);
    };
    let active = "prepare", currentSnapshot = {}, locked = false;
    const api = {
      frame, decision, more: moreBody, reading, panelHost, onCapture: null, add,
      setActive(tab, route) {
        const enabled = ["llmwiki", "llmwiki-browse"].includes(tab);
        frame.hidden = !enabled; toolbar.hidden = !enabled;
        attr(shell.element, "data-wiki-active", enabled);
        if (shell.title.setText) shell.title.setText(enabled ? "Prodigy Wiki" : "지식"); else shell.title.textContent = enabled ? "Prodigy Wiki" : "지식";
        active = route || (tab === "llmwiki-browse" ? "library" : "prepare");
        navButtons.forEach((control, key) => attr(control, "aria-current", key === active ? "page" : "false"));
        if (enabled) reading.appendChild(panelHost); else container.appendChild(panelHost);
      },
      setJourney(snapshot) { currentSnapshot = snapshot; return journey(journeyHost, snapshot); },
      getJourney() { return journeyState(currentSnapshot); },
      setLocked(value) { locked = value; navButtons.forEach(control => control.disabled = value); add.disabled = value; },
      setPending(count) { const control = navButtons.get("pending"); empty(control); el(control, "span", "승인 대기"); if (count > 0) el(control, "span", String(count), { "data-pending-badge": String(count) }); },
      setProposals(rows, selectedId, onSelect) {
        empty(proposals); empty(selectorHost);
        if (!rows.length) return;
        el(proposals, "p", "이번 정리");
        const label = el(selectorHost, "label", "", { class: "wiki-selector-label" });
        const index = Math.max(0, rows.findIndex(row => row.id === selectedId));
        el(label, "span", `제안 ${index + 1} / ${rows.length}`);
        const select = el(label, "select", "", { "aria-label": "제안 선택", "data-proposal-select": "" });
        rows.forEach(row => {
          const control = button(proposals, "", "select-proposal", () => { if (!locked) onSelect(row.id); });
          attr(control, "data-proposal-id", row.id); attr(control, "aria-current", row.id === selectedId);
          el(control, "span", row.title, { class: "wiki-proposal-title" }); el(control, "small", row.status);
          el(select, "option", row.title, { value: row.id });
          control.disabled = locked;
        });
        select.value = selectedId; select.disabled = locked;
        select.onchange = () => { if (!locked) onSelect(select.value); };
      },
      dispose() { shell.switcher.onchange = oldSwitch; toolbar.remove?.(); frame.remove?.(); }
    };
    journey(journeyHost, {});
    return api;
  }
  const api = Object.freeze({ el, empty, attr, button, title, journeyState, journey, markdown, splitDocument, diffLines, exactPreview, FIELD_LABELS, mount });
  root.ProdigyWikiWorkspaceView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
