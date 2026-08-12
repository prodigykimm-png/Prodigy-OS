"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
const corePath = path.join(ROOT, "SYSTEM/Views/weekly-filter-core.js");
const viewPath = path.join(ROOT, "SYSTEM/Views/weekly-filter-view.js");

function element(tag, options = {}) {
  return {
    tag,
    text: options.text || "",
    textContent: options.text || "",
    attributes: options.attr || {},
    children: [],
    disabled: false,
    value: options.attr && options.attr.value || "",
    empty() { this.children = []; },
    setAttribute(name, value) { this.attributes[name] = value; },
    createEl(childTag, childOptions) {
      const child = element(childTag, childOptions);
      this.children.push(child);
      return child;
    }
  };
}

function find(root, predicate, found = []) {
  if (predicate(root)) found.push(root);
  root.children.forEach((child) => find(child, predicate, found));
  return found;
}

function appForWeek(weekDate) {
  const dailyPath = `DAILY/DAILY/${weekDate}.md`;
  const files = new Map([[dailyPath, {
    path: dailyPath,
    name: `${weekDate}.md`,
    content: `# ${weekDate}\n\n## Evidence\n\n### e01 · 주간 기록\n\nExperience:\n기록했다.\n\nChange:\n바꿨다.\n\nNext Experiment:\n다음에 시험한다.\n`
  }]]);
  const folder = { path: "DAILY/DAILY", children: Array.from(files.values()) };
  return {
    vault: {
      getAbstractFileByPath(target) { return target === folder.path ? folder : files.get(target) || null; },
      cachedRead: async (file) => file.content,
      read: async (file) => file.content
    }
  };
}

async function main() {
  const previous = {
    WeeklyFilterCore: global.WeeklyFilterCore,
    WeeklyFilterRender: global.WeeklyFilterRender,
    WeeklyFilterStyles: global.WeeklyFilterStyles,
    WeeklyReviewStore: global.WeeklyReviewStore
  };
  const saved = [];
  let persisted = null;
  try {
    global.WeeklyFilterCore = require(corePath);
    global.WeeklyFilterRender = { renderWeeklyReview(container, review) {
      container.createEl("p", { text: review.period.week });
      container.createEl("p", { text: review.summary });
    } };
    global.WeeklyFilterStyles = { ensureStyles() {} };
    global.WeeklyReviewStore = {
      read: async (_app, week) => persisted && persisted.period.week === week ? persisted : null,
      save: async (_app, review) => {
        saved.push(review);
        persisted = { ...review, summary: "저장 후에 보존된 요약" };
        return { path: `DAILY/WEEKLY/${review.period.week}.md` };
      }
    };
    delete require.cache[require.resolve(viewPath)];
    const view = require(viewPath);
    const container = element("div");
    const controller = view.mountWeeklyFilter(container, { app: appForWeek("2026-07-13"), initialDate: "2026-07-27" });
    await controller.ready;

    assert.ok(find(container, (node) => node.textContent === "이번 주에 무엇이 반복되었고 무엇을 배웠는지 살펴봅니다.").length, "Weekly role copy is visible");

    const dateInput = find(container, (node) => node.tag === "input" && node.attributes.type === "date")[0];
    assert.ok(dateInput, "the weekly workspace exposes a selected-date control");
    dateInput.value = "2026-07-19";
    await dateInput.onchange();
    assert.ok(find(container, (node) => String(node.textContent).includes("2026-W29")).length, "changing the date loads the prior ISO week");

    const save = find(container, (node) => node.tag === "button" && node.text === "주간 리뷰 저장")[0];
    await save.onclick();
    assert.equal(saved[0].period.week, "2026-W29", "saving uses the week selected through the date control");
    await controller.reload();
    assert.ok(find(container, (node) => node.textContent === "저장 후에 보존된 요약").length, "reloading Weekly reflects the saved review instead of rebuilding only from Daily Evidence");
    console.log("Weekly filter date selection test passed");
  } finally {
    delete require.cache[require.resolve(viewPath)];
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete global[key];
      else global[key] = value;
    });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
