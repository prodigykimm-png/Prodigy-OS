const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../../");

function createElement(tag, options) {
  const element = {
    tag,
    text: options && options.text || "",
    attr: options && options.attr || {},
    children: [],
    style: {},
    classList: { add() {} },
    empty() { this.children = []; },
    createEl(childTag, childOptions) {
      const child = createElement(childTag, childOptions || {});
      this.children.push(child);
      return child;
    },
    setText(value) { this.text = String(value); }
  };
  return element;
}

function findButton(element, label) {
  if (element.tag === "button" && element.text === label) return element;
  for (const child of element.children) {
    const found = findButton(child, label);
    if (found) return found;
  }
  return null;
}

function findElement(element, predicate) {
  if (predicate(element)) return element;
  for (const child of element.children) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

async function main() {
  const files = {};
  const secrets = {};
  const app = {
    vault: {
      getAbstractFileByPath: (filePath) => Object.prototype.hasOwnProperty.call(files, filePath) ? { path: filePath } : null,
      read: async (file) => files[file.path],
      createFolder: async (folderPath) => { files[folderPath] = "__folder__"; },
      create: async (filePath, text) => { files[filePath] = text; },
      modify: async (file, text) => { files[file.path] = text; }
    },
    secretStorage: {
      getSecret: async (secretId) => secrets[secretId] || "",
      setSecret: async (secretId, value) => { secrets[secretId] = value; },
      deleteSecret: async (secretId) => { delete secrets[secretId]; }
    }
  };

  global.obsidian = {
    Modal: class Modal {
      constructor(appInstance) { this.app = appInstance; this.contentEl = createElement("div"); this.modalEl = { addClass() {} }; }
      open() { this.opened = true; this.onOpen(); }
      close() { this.closed = true; this.onClose(); }
    }
  };
  global.ProdigyUI = { button: (parent, text) => parent.createEl("button", { text }) };
  global.Notice = class Notice {};
  global.ProdigyConfigService = require(path.join(ROOT, "SYSTEM/Views/prodigy-config-service.js"));
  global.ProjectWorkflowDraftService = require(path.join(ROOT, "SYSTEM/Views/project-workflow-draft-service.js"));
  const settings = require(path.join(ROOT, "SYSTEM/Views/prodigy-settings-modal.js"));

  const source = fs.readFileSync(path.join(ROOT, "SYSTEM/Views/prodigy-settings-modal.js"), "utf8");
  assert.match(source, /width: min\(920px, calc\(100vw - 48px\)\) !important/);
  assert.match(source, /width: calc\(100vw - 24px\) !important/);

  const modal = settings.open(app);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(modal.opened, true);
  assert.ok(findButton(modal.contentEl, "설정 저장"));
  assert.ok(findButton(modal.contentEl, "취소"));
  assert.ok(JSON.stringify(modal.contentEl).includes("Todoist"));
  assert.ok(JSON.stringify(modal.contentEl).includes("REB OpenAPI"));
  assert.ok(JSON.stringify(modal.contentEl).includes("Groq"));
  assert.ok(JSON.stringify(modal.contentEl).includes("OpenRouter"));
  assert.ok(JSON.stringify(modal.contentEl).includes("Codex 구독"));
  assert.ok(JSON.stringify(modal.contentEl).includes("codex login"));
  assert.ok(JSON.stringify(modal.contentEl).includes("공식 Codex CLI"));
  assert.ok(JSON.stringify(modal.contentEl).includes("Antigravity 구독"));
  assert.ok(JSON.stringify(modal.contentEl).includes("Tailscale 맥미니 중계"));
  assert.ok(JSON.stringify(modal.contentEl).includes("모바일 중계 URL"));
  assert.ok(JSON.stringify(modal.contentEl).includes("모바일 중계 토큰"));
  assert.ok(findElement(modal.contentEl, (element) => element.tag === "select" && element.attr["aria-label"] === "Antigravity 구독 모델"));
  assert.ok(JSON.stringify(modal.contentEl).includes("실패 시 보조 AI 제공자"));

  const providerSelect = findElement(modal.contentEl, (element) => element.tag === "select" && element.attr["aria-label"] === "기본 AI 제공자");
  providerSelect.value = "antigravity";
  providerSelect.onchange();
  assert.equal(modal.state.config.defaultProvider, "antigravity");
  providerSelect.value = "codex";
  providerSelect.onchange();
  assert.equal(modal.state.config.defaultProvider, "codex");
  await findButton(modal.contentEl, "설정 저장").onclick();
  assert.ok(files["SYSTEM/PRIVATE/prodigy.local.json"], modal.state.status);
  assert.equal(JSON.parse(files["SYSTEM/PRIVATE/prodigy.local.json"]).defaultProvider, "codex");
  assert.equal(files["SYSTEM/PRIVATE/prodigy.local.json"].includes("api-key"), true);
  console.log("ProdigySettingsModal tests passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
