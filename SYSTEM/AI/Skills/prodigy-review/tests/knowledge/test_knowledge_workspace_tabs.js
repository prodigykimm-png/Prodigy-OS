"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { FakeElement } = require("./knowledge_explorer_view_fakes.js");

const ROOT = path.resolve(__dirname, "../../../../../..");
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

function testExactThreeTabContract() {
  assert.deepEqual(
    workspaceTabs.TABS.map(({ id, label }) => ({ id, label })),
    [
      { id: "zettelkasten", label: "지식 구축 · 제텔카스텐" },
      { id: "para", label: "지식 활용 · PARA" },
      { id: "llmwiki", label: "AI 지식 검토 · LLM Wiki" },
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

  assert.equal(buttons(container).length, 3);
  for (const tab of workspaceTabs.TABS) {
    const button = buttons(container).find((node) => node.attr.id === `knowledge-tab-${tab.id}`);
    const panel = mounted.getPanel(tab.id);
    assert.ok(button);
    assert.ok(panel);
    assert.equal(button.attr["aria-controls"], panel.attr.id);
    assert.equal(panel.attr["aria-labelledby"], button.attr.id);
    assert.equal(panel.attr.role, "tabpanel");
  }

  for (const tabId of ["para", "llmwiki", "zettelkasten", "llmwiki"]) {
    mounted.select(tabId);
    assert.equal(state._lastTab, tabId);
    assert.strictEqual(state.activeRun, activeRun);
    for (const button of buttons(container)) {
      assert.equal(button.attr["aria-selected"], button.attr.id === `knowledge-tab-${tabId}` ? "true" : "false");
    }
  }
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
testAriaRelationshipsAndInMemoryIdentity();
testMalformedTabStateRecoversWithoutChangingSelection();
console.log("Knowledge workspace tabs tests passed");
