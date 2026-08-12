(function (root) {
  "use strict";

  // Shared UI for the bounded Knowledge-use experiment (Todo 10 view integration).
  // Renders checkboxes + one-line context input + "판단 근거로 기록" button inside
  // any Decision Packet surface. Calls KnowledgeUseBodyStore.recordKnowledgeUse on
  // explicit user action only — never on display/open.

  function clean(value) { return value === undefined || value === null ? "" : String(value).trim(); }

  function todayISO() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function wikilink(record) {
    var p = clean(record && record.path);
    if (!p) return "";
    return "[[" + p.replace(/\.md$/i, "") + "]]";
  }

  /**
   * Render a record bar inside a Decision Packet box.
   * @param {HTMLElement} parent - container element with createEl
   * @param {object} options
   * @param {object} options.app - Obsidian app instance
   * @param {string} options.objectPath - canonical path of the target Object
   * @param {string} options.objectType - "auction_case" | "reading" | "workout_program"
   * @param {Array} options.knowledgeRecords - packet.knowledge array (records with .path, .title)
   */
  function renderRecordBar(parent, options) {
    if (!parent || typeof parent.createEl !== "function") return null;
    var opts = options || {};
    var records = Array.isArray(opts.knowledgeRecords) ? opts.knowledgeRecords : [];
    if (!records.length) return null;

    var store = root.KnowledgeUseBodyStore;
    if (!store || typeof store.recordKnowledgeUse !== "function") return null;

    var bar = parent.createEl("div", {
      attr: {
        class: "prodigy-knowledge-use-record-bar prodigy-utility-card",
        style: "margin-block-start:var(--ke-space-2);padding:var(--ke-space-3);border-block-start:1px solid var(--ke-color-border,var(--background-modifier-border));font-size:var(--ke-type-label);line-height:var(--ke-leading-body);"
      }
    });

    bar.createEl("div", {
      text: "판단 근거로 기록",
      attr: { style: "font-weight:600;color:var(--ke-color-muted,var(--text-muted));margin-block-end:var(--ke-space-1);" }
    });

    var checkboxes = [];
    records.forEach(function (record) {
      var row = bar.createEl("label", {
        attr: { style: "display:flex;align-items:center;gap:var(--ke-space-2);min-block-size:var(--ke-touch-target);cursor:pointer;overflow-wrap:anywhere;word-break:keep-all;" }
      });
      var cb = row.createEl("input", {
        attr: { type: "checkbox", class: "prodigy-knowledge-use-cb", "data-path": record.path || "" }
      });
      cb.checked = false;
      checkboxes.push({ el: cb, record: record });
      row.createEl("span", {
        text: record.title || record.path || "제목 없음",
        attr: { style: "color:var(--ke-color-text,var(--text-normal));" }
      });
    });

    var inputRow = bar.createEl("div", {
      attr: { style: "display:flex;gap:var(--ke-space-2);align-items:center;margin-block-start:var(--ke-space-2);flex-wrap:wrap;" }
    });
    var ctxInput = inputRow.createEl("input", {
      attr: {
        type: "text",
        class: "prodigy-knowledge-use-ctx",
        placeholder: "판단 맥락 한 줄 (필수)",
        style: "flex:1 1 12rem;min-block-size:var(--ke-touch-target);padding:var(--ke-space-2) var(--ke-space-3);border:1px solid var(--ke-color-border,var(--background-modifier-border));border-radius:var(--ke-radius-control);font:inherit;font-size:var(--ke-type-body);"
      }
    });
    var btn = inputRow.createEl("button", {
      text: "기록",
      attr: {
        type: "button",
        class: "prodigy-btn",
        style: "min-block-size:var(--ke-touch-target);padding:var(--ke-space-2) var(--ke-space-3);font-size:var(--ke-type-label);white-space:nowrap;"
      }
    });

    var statusEl = bar.createEl("div", {
      attr: { class: "prodigy-status-line", "aria-live": "polite", style: "margin-block-start:var(--ke-space-1);min-block-size:var(--ke-touch-target);color:var(--ke-color-muted,var(--text-muted));font-size:var(--ke-type-label);" }
    });

    btn.onclick = async function (event) {
      if (event && event.preventDefault) event.preventDefault();
      if (event && event.stopPropagation) event.stopPropagation();

      var selected = checkboxes.filter(function (item) { return item.el.checked; });
      if (!selected.length) {
        statusEl.setText("기록할 지식을 선택해 주세요.");
        statusEl.attr = statusEl.attr || {};
        statusEl.attr.style = "margin-block-start:var(--ke-space-1);min-block-size:var(--ke-touch-target);color:var(--ke-color-error,var(--text-error));font-size:var(--ke-type-label);";
        return;
      }
      var context = clean(ctxInput.value);
      if (!context) {
        statusEl.setText("판단 맥락을 입력해 주세요.");
        statusEl.attr = statusEl.attr || {};
        statusEl.attr.style = "margin-block-start:var(--ke-space-1);min-block-size:var(--ke-touch-target);color:var(--ke-color-error,var(--text-error));font-size:var(--ke-type-label);";
        return;
      }

      var links = selected.map(function (item) { return wikilink(item.record); }).filter(Boolean);
      if (!links.length) {
        statusEl.setText("유효한 지식 링크가 없습니다.");
        return;
      }

      btn.disabled = true;
      statusEl.setText("기록 중…");
      try {
        var result = await store.recordKnowledgeUse(opts.app, opts.objectPath, opts.objectType, {
          date: todayISO(),
          context: context,
          links: links
        });
        if (result.status === "already_recorded") {
          statusEl.setText("이미 기록된 판단 근거입니다.");
          statusEl.attr = statusEl.attr || {};
          statusEl.attr.style = "margin-block-start:var(--ke-space-1);min-block-size:var(--ke-touch-target);color:var(--ke-color-muted,var(--text-muted));font-size:var(--ke-type-label);";
        } else {
          statusEl.setText("기록 완료 ✓");
          statusEl.attr = statusEl.attr || {};
          statusEl.attr.style = "margin-block-start:var(--ke-space-1);min-block-size:var(--ke-touch-target);color:var(--ke-color-success,var(--text-success));font-size:var(--ke-type-label);";
          checkboxes.forEach(function (item) { item.el.checked = false; });
          ctxInput.value = "";
        }
      } catch (err) {
        statusEl.setText("기록 실패: " + (err && err.message ? err.message : "알 수 없는 오류"));
        statusEl.attr = statusEl.attr || {};
        statusEl.attr.style = "margin-block-start:var(--ke-space-1);min-block-size:var(--ke-touch-target);color:var(--ke-color-error,var(--text-error));font-size:var(--ke-type-label);";
      } finally {
        btn.disabled = false;
      }
    };

    return bar;
  }

  var api = Object.freeze({ renderRecordBar: renderRecordBar });
  root.KnowledgeUseRecordUI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
