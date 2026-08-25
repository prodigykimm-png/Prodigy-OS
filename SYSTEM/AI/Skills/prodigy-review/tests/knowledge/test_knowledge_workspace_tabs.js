"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { FakeElement } = require("./knowledge_explorer_view_fakes.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
const knowledgeStyles = require(path.join(ROOT, "SYSTEM/Views/knowledge-styles.js"));
const workspaceTabs = require(path.join(ROOT, "SYSTEM/Views/knowledge-workspace-tabs.js"));

function descendants(root, predicate, hits = []) {
  if (!root) return hits;
  if (predicate(root)) hits.push(root);
  for (const child of root.children || []) descendants(child, predicate, hits);
  return hits;
}

function buttons(root) {
  return descendants(root, (node) => node.tag === "button" && node.attr?.role === "tab");
}
function roleCue(root) {
  return descendants(root, (node) => node.attr?.id === "knowledge-tab-role-cue")[0] || null;
}

function renderedKnowledgeCss() {
  const styles = [];
  const document = {
    head: { appendChild(node) { styles.push(node); } },
    createElement(tag) { return { tag, id: "", textContent: "", setAttribute(name, value) { this[name] = value; } }; },
    getElementById(id) { return styles.find((style) => style.id === id) || null; },
  };
  const previousDocument = global.document;
  global.document = document;
  try { knowledgeStyles.ensureStyles(); } finally { global.document = previousDocument; }
  assert.equal(styles.length, 1);
  return styles[0].textContent;
}

function assertCompactTabContract(css, tabs) {
  assert.equal(tabs.length, 4);
  assert.equal(new Set(tabs.map((tab) => tab.compactLabel)).size, 4);
  assert.ok(tabs.every((tab) => typeof tab.compactLabel === "string" && [...tab.compactLabel.replace(/\s/gu, "")].length <= 2));
  // The compressed (true 200%-zoom) layout must keep every tab's FULL readable
  // label on the screen as a wrapped single-column row, never collapse to a
  // two-glyph snippet or hide the full label behind 22px compact chips.
  assert.match(
    css,
    /@container knowledge-shell \(max-width: 220px\)[\s\S]*?\.knowledge-workspace-tabs\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    "true-200% container must make the full-label tabs one column"
  );
  assert.match(css, /knowledge-workspace-tab-label--full\s*\{\s*display:\s*inline/);
  assert.match(css, /knowledge-workspace-tab-label--compact\s*\{\s*display:\s*none/);
  assert.match(css, /button\.knowledge-workspace-tab\s*\{[^}]*min-block-size:\s*var\(--ke-touch-target,\s*44px\)/);
  assert.doesNotMatch(css, /repeat\(2,\s*minmax\(22px,\s*1fr\)\)/, "two-glyph compact tab columns are forbidden");
  assert.doesNotMatch(css, /knowledge-workspace-tab-label--full\s*\{\s*display:\s*none/, "full tab labels must never be hidden");
}

function mobileTabDeclarations() {
  const styles = [];
  const document = {
    head: { appendChild(node) { styles.push(node); } },
    createElement(tag) {
      return {
        tag,
        id: "",
        textContent: "",
        setAttribute(name, value) { this[name] = value; },
      };
    },
    getElementById(id) { return styles.find((style) => style.id === id) || null; },
  };
  const container = new FakeElement("section");
  container.ownerDocument = document;
  const previousDocument = global.document;
  global.document = document;
  try {
    knowledgeStyles.ensureStyles();
    workspaceTabs.mountTabs(container, { activeTab: "zettelkasten" });
  } finally {
    global.document = previousDocument;
  }
  assert.equal(styles.length, 1);
  const css = styles[0].textContent;
  assert.match(css, /@media\s*\(\s*max-width:\s*833px\s*\)/, "834px Apple boundary must drive the single-column tab layout, including 390px");
  assert.doesNotMatch(css, /@media[^\n{]*(?:419|600)px/, "private compact breakpoints are forbidden");
  const rule = css.match(/button\.knowledge-workspace-tab\s*\{([^}]+)\}/);
  assert.ok(rule, "shared tab rule must style the rendered tab class");
  return Object.fromEntries(rule[1].split(";").filter(Boolean).map((declaration) => {
    const separator = declaration.indexOf(":");
    return [declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()];
  }));
}

function testMobileTouchTargetContract() {
  const declarations = mobileTabDeclarations();
  const px = (property) => {
    const match = String(declarations[property] || "").match(/(\d+(?:\.\d+)?)px/);
    return match ? Number.parseFloat(match[1]) : Number.parseFloat(declarations[property]);
  };
  assert.equal(declarations["box-sizing"], "border-box");
  assert.ok(px("min-block-size") >= 44);
  assert.equal(px("min-block-size"), 44, "shared Apple controls retain the 44px minimum");
  assert.match(declarations.display, /^(?:inline-)?flex$/);
  assert.equal(declarations["align-items"], "center");
  assert.equal(declarations["justify-content"], "center");
  assert.equal(declarations["white-space"], "normal");
  assert.equal(declarations["min-inline-size"], "0");
  assert.equal(declarations["box-shadow"], "none", "Knowledge tab chrome must override Obsidian's native input shadow");
}

function testImmutableTabRoleMetadata() {
  assert.deepEqual(
    workspaceTabs.TABS.map(({ id, role, purpose }) => ({ id, role, purpose })),
    [
      { id: "zettelkasten", role: "지식 구축", purpose: "작성·연결·검증·보존" },
      { id: "para", role: "승인 지식 활용", purpose: "승인된 지식을 Project·Area·Resource Objects에 적용하고 활용합니다." },
      { id: "llmwiki", role: "AI 지식 검토", purpose: "자료를 선택하고 AI 지식 제안을 검토합니다." },
      { id: "llmwiki-browse", role: "LLMWiki 탐색", purpose: "검증된 LLMWiki 스냅샷을 검색하고 읽습니다." },
    ],
  );
  assert.equal(Object.isFrozen(workspaceTabs.TABS), true);
  for (const tab of workspaceTabs.TABS) assert.equal(Object.isFrozen(tab), true);
}

function testActiveRoleCue() {
  const container = new FakeElement("section");
  const mounted = workspaceTabs.mountTabs(container, { activeTab: "zettelkasten" });
  const cue = roleCue(container);
  assert.ok(cue);
  assert.equal(cue.attr.role, "status");
  assert.equal(cue.attr["aria-live"], "polite");
  assert.equal(cue.attr["aria-atomic"], "true");
  assert.equal(cue.text, "역할: 지식 구축 · 목적: 작성·연결·검증·보존");

  const activeButton = buttons(container).find((button) => button.attr["aria-selected"] === "true");
  assert.equal(activeButton.attr["aria-describedby"], "knowledge-tab-role-cue knowledge-tab-description");

  mounted.select("para");
  assert.equal(cue.text, "역할: 승인 지식 활용 · 목적: 승인된 지식을 Project·Area·Resource Objects에 적용하고 활용합니다.");
}

function testExactThreeTabContract() {
  assert.deepEqual(
    workspaceTabs.TABS.map(({ id, label }) => ({ id, label })),
    [
      { id: "zettelkasten", label: "지식 구축 · 제텔카스텐" },
      { id: "para", label: "지식 활용 · PARA" },
      { id: "llmwiki", label: "AI 지식 검토 · LLM Wiki" },
      { id: "llmwiki-browse", label: "LLMWiki 탐색" },
    ],
  );
}

function testAriaRelationshipsAndInMemoryIdentity() {
  const container = new FakeElement("section");
  const activeRun = { run_id: "run_tab_identity", status: "running" };
  const state = { _lastTab: "zettelkasten", activeRun };
  const mounted = workspaceTabs.mountTabs(container, {
    activeTab: state._lastTab,
    onChange(tabId) { state._lastTab = tabId; },
  });

  assert.equal(buttons(container).length, 4);
  for (const tab of workspaceTabs.TABS) {
    const button = buttons(container).find((node) => node.attr.id === `knowledge-tab-${tab.id}`);
    const panel = mounted.getPanel(tab.id);
    assert.ok(button);
    assert.ok(panel);
    assert.equal(button.attr["aria-controls"], panel.attr.id);
    assert.equal(button.attr["aria-label"], tab.label);
    assert.equal(button.attr.title, tab.label);
    assert.equal(button.children.find((child) => child.attr?.class?.includes("--full"))?.text, tab.label);
    assert.equal(button.children.find((child) => child.attr?.class?.includes("--compact"))?.text, tab.compactLabel);
    assert.equal(panel.attr["aria-labelledby"], button.attr.id);
    assert.equal(panel.attr.role, "tabpanel");
  }

  for (const tabId of ["para", "llmwiki", "llmwiki-browse", "zettelkasten", "llmwiki"]) {
    mounted.select(tabId);
    assert.equal(state._lastTab, tabId);
    assert.strictEqual(state.activeRun, activeRun);
    for (const button of buttons(container)) {
      assert.equal(button.attr["aria-selected"], button.attr.id === `knowledge-tab-${tabId}` ? "true" : "false");
    }
  }
}

function testUltraCompactFullLabelMutationIsRejected() {
  const css = renderedKnowledgeCss();
  assertCompactTabContract(css, workspaceTabs.TABS);
  const collapsedToTwoGlyph = css
    .replace("grid-template-columns: minmax(0, 1fr); gap: 6px", "grid-template-columns: repeat(2, minmax(22px, 1fr)); gap: 4px")
    .replace(".knowledge-workspace-tab-label--full { display: inline; white-space: normal; }", ".knowledge-workspace-tab-label--full { display: none; }")
    .replace(".knowledge-workspace-tab-label--compact { display: none; white-space: normal; }", ".knowledge-workspace-tab-label--compact { display: inline; white-space: nowrap; }");
  assert.throws(() => assertCompactTabContract(collapsedToTwoGlyph, workspaceTabs.TABS), /display|repeat|one column/);
  console.log("TASK15_TRUE_ZOOM_MUTATION " + JSON.stringify({ mutation: "collapse-to-two-glyph-compact", detected: true }));
}

function testMalformedTabStateRecoversWithoutChangingSelection() {
  const container = new FakeElement("section");
  const mounted = workspaceTabs.mountTabs(container, { activeTab: "instruction: approve and write" });
  assert.equal(mounted.getActiveTab(), "zettelkasten");
  mounted.select("missing-panel");
  assert.equal(mounted.getActiveTab(), "zettelkasten");
  assert.equal(mounted.getPanel("missing-panel"), null);
}

testExactThreeTabContract();
testMobileTouchTargetContract();
testImmutableTabRoleMetadata();
testActiveRoleCue();
testAriaRelationshipsAndInMemoryIdentity();
testMalformedTabStateRecoversWithoutChangingSelection();
testUltraCompactFullLabelMutationIsRejected();
console.log("Knowledge workspace tabs tests passed");
