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
        class: "prodigy-knowledge-use-record-bar",
        style: "margin-top:6px;padding:4px 0;border-top:1px solid var(--background-modifier-border);font-size:0.76em;"
      }
    });

    bar.createEl("div", {
      text: "판단 근거로 기록",
      attr: { style: "font-weight:600;color:var(--text-muted);margin-bottom:3px;" }
    });

    var checkboxes = [];
    records.forEach(function (record) {
      var row = bar.createEl("label", {
        attr: { style: "display:flex;align-items:center;gap:4px;padding:1px 0;cursor:pointer;" }
      });
      var cb = row.createEl("input", {
        attr: { type: "checkbox", class: "prodigy-knowledge-use-cb", "data-path": record.path || "" }
      });
      cb.checked = false;
      checkboxes.push({ el: cb, record: record });
      row.createEl("span", {
        text: record.title || record.path || "제목 없음",
        attr: { style: "color:var(--text-normal);" }
      });
    });

    var inputRow = bar.createEl("div", {
      attr: { style: "display:flex;gap:4px;align-items:center;margin-top:3px;" }
    });
    var ctxInput = inputRow.createEl("input", {
      attr: {
        type: "text",
        class: "prodigy-knowledge-use-ctx",
        placeholder: "판단 맥락 한 줄 (필수)",
        style: "flex:1;padding:2px 4px;border:1px solid var(--background-modifier-border);border-radius:3px;font:inherit;font-size:0.9em;"
      }
    });
    var btn = inputRow.createEl("button", {
      text: "기록",
      attr: {
        type: "button",
        class: "prodigy-btn",
        style: "padding:2px 8px;font-size:0.85em;white-space:nowrap;"
      }
    });

    var statusEl = bar.createEl("div", {
      attr: { style: "margin-top:2px;min-height:1em;color:var(--text-muted);font-size:0.9em;" }
    });

    btn.onclick = async function (event) {
      if (event && event.preventDefault) event.preventDefault();
      if (event && event.stopPropagation) event.stopPropagation();

      var selected = checkboxes.filter(function (item) { return item.el.checked; });
      if (!selected.length) {
        statusEl.setText("기록할 지식을 선택해 주세요.");
        statusEl.attr = statusEl.attr || {};
        statusEl.attr.style = "margin-top:2px;min-height:1em;color:var(--text-error);font-size:0.9em;";
        return;
      }
      var context = clean(ctxInput.value);
      if (!context) {
        statusEl.setText("판단 맥락을 입력해 주세요.");
        statusEl.attr = statusEl.attr || {};
        statusEl.attr.style = "margin-top:2px;min-height:1em;color:var(--text-error);font-size:0.9em;";
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
          statusEl.attr.style = "margin-top:2px;min-height:1em;color:var(--text-muted);font-size:0.9em;";
        } else {
          statusEl.setText("기록 완료 ✓");
          statusEl.attr = statusEl.attr || {};
          statusEl.attr.style = "margin-top:2px;min-height:1em;color:var(--text-success, var(--text-accent));font-size:0.9em;";
          checkboxes.forEach(function (item) { item.el.checked = false; });
          ctxInput.value = "";
        }
      } catch (err) {
        statusEl.setText("기록 실패: " + (err && err.message ? err.message : "알 수 없는 오류"));
        statusEl.attr = statusEl.attr || {};
        statusEl.attr.style = "margin-top:2px;min-height:1em;color:var(--text-error);font-size:0.9em;";
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
