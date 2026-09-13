"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const ui = require("../../../../../Views/prodigy-wiki-workspace-view.js");
const canonical = require("../../../../../Views/llmwiki-document-canonical-review.js");
const hash = require("../../../../../Views/llmwiki-hash.js");
const store = require("../../../../../Views/knowledge-candidate-store.js");
const { mountRoot, walk, click, action, serialize } = require("./llmwiki_lifecycle_view_fixture.js");
const { runHub, buildPages } = require("./knowledge_hub_integration_harness.js");
const { collectText } = require("./knowledge_explorer_view_fakes.js");
const by = (root, key, value) => walk(root, node => node.getAttribute(key) !== null && (value === undefined || node.getAttribute(key) === value));
const visible = node => !node.hidden && (!node.parentElement || visible(node.parentElement));
const enabledPrimary = root => by(root, "data-primary", "true").filter(node => !node.disabled && visible(node));
function memoryVault() {
  const files = new Map(), writes = [];
  const app = { workspace: { openLinkText: async path => path }, vault: {
    getAbstractFileByPath: path => files.get(path) || null,
    getFiles: () => [...files.values()], read: async file => file.bytes,
    createFolder: async () => {},
    create: async (path, bytes) => { const file = { path, bytes, extension: path.endsWith(".md") ? "md" : "json", basename: ui.title(path) }; files.set(path, file); writes.push(path); return file; },
    modify: async (file, bytes) => { file.bytes = bytes; writes.push(file.path); }, delete: async file => files.delete(file.path),
  }, metadataCache: { getFileCache: file => ({ frontmatter: store.parseLifecycleDocument(file.bytes) }) } };
  return { app, files, writes };
}
const fields = { knowledge_kind: "claim", classification: "epistemic", knowledge_domain: "coding", knowledge_topics: "ai", application_trigger: "모형 점검", application_contexts: "coding/ai", conditions: "실내 모형", invalidation_conditions: "원문 변경", relation_status: "resolved", evidence_strength: "sufficient" };
async function reviewFixture() {
  const memory = memoryVault(), bytes = "실내 점검은 10분이다.";
  const source = "INBOX/ux-source.md"; await memory.app.vault.create(source, bytes);
  const item = { review_id: "review_ux_fixture", title: "실내 점검", document_body: `## 점검\n\n${bytes}\n`, grounded_claims: [{ text: bytes, citations: [{ source_id: "source_ux_fixture", source_path: source, locator: `${source}#L1`, content_hash: hash.sha256(bytes), evidence_quote: bytes }] }] };
  const dom = mountRoot(), decision = dom.root.createDiv(), content = dom.root.createDiv(), journeys = [];
  const view = canonical.open({ app: memory.app, item, container: content, decisionContainer: decision, workspace: { setJourney: state => journeys.push(ui.journeyState(state).step), setLocked() {} } });
  await view.ready;
  return { ...memory, ...dom, item, source, content, decision, view, journeys };
}
async function fill(subject, values = fields) {
  const target = by(subject.content, "data-review-field", "target_path")[0]; target.value = "new"; await target.oninput();
  for (const [name, value] of Object.entries(values)) { const input = by(subject.content, "data-review-field", name)[0]; input.value = value; input.oninput(); }
}

test("four retained steps follow outcomes, not the active destination or generation title", () => {
  const matrix = [[{}, 1], [{ status: "source_selected" }, 2], [{ status: "running" }, 2], [{ status: "consent_required" }, 2], [{ status: "interrupted" }, 2], [{ status: "range_required" }, 1], [{ status: "source_changed" }, 1], [{ status: "review_ready" }, 3], [{ status: "blocked" }, 3], [{ status: "preview_acknowledged" }, 3], [{ status: "applying" }, 4], [{ status: "applied" }, 4], [{ status: "complete", golden_wiki: { status: "complete" } }, 3], [{ status: "failed", operation_run: { status: "committed", follow_up: { refresh: { status: "failed" } } }, golden_wiki: { status: "complete" } }, 4], [{ status: "failed", durable_operation_outcomes: [{ status: "committed" }], inbox: { state: "complete", succeeded: 1, failed: 0 } }, 4]];
  for (const [snapshot, expected] of matrix) {
    const { root } = mountRoot(); ui.journey(root, snapshot);
    assert.deepEqual(by(root, "data-step").map(node => node.getAttribute("data-step")), ["1", "2", "3", "4"]);
    assert.equal(by(root, "aria-current", "step")[0].getAttribute("data-step"), String(expected));
    assert.equal(walk(root, node => node.tag === "button").length, 0);
  }
});

test("one bounded workspace reuses the existing shell and preserves zero pending navigation", () => {
  const { root } = mountRoot();
  const shell = { element: root, workspaceBar: root.createDiv(), body: root.createDiv() };
  shell.title = shell.workspaceBar.createEl("h1"); shell.switcher = shell.workspaceBar.createEl("select");
  const tabs = shell.body.createDiv(), panel = tabs.createDiv(), navigation = [];
  const workspace = ui.mount({ container: tabs, panelHost: panel, shell, onNavigate: (...args) => navigation.push(args) });
  workspace.setActive("llmwiki"); workspace.setPending(0);
  assert.equal(panel.parentElement, workspace.reading);
  assert.equal(by(root, "data-wiki-route", "pending").length, 1); assert.equal(by(root, "data-pending-badge").length, 0);
  assert.equal(by(root, "data-action", "wiki-add-material").length, 1);
  assert.equal(by(root, "data-wiki-decision").length, 1);
  assert.equal(workspace.decision.parentElement, workspace.frame);
  workspace.setPending(3); assert.equal(by(root, "data-pending-badge", "3").length, 1);
  workspace.setActive("para"); assert.equal(panel.parentElement, tabs); assert.equal(workspace.frame.hidden, true);
  workspace.setActive("llmwiki-browse"); assert.equal(panel.parentElement, workspace.reading);
  workspace.setJourney({ status: "review_ready" }); workspace.setActive("llmwiki-browse"); assert.equal(workspace.getJourney().step, 3);
  workspace.setLocked(true); click(by(root, "data-wiki-route", "pending")[0]); assert.deepEqual(navigation, []);
  workspace.dispose();
});

test("exact diff reconstructs both byte sequences without omitting middle changes", () => {
  for (const [before, after] of [["A\nB\nC", "A\nnew\nC"], ["B\nA\nB", "A\nB\nA"], ["", "새 문서"], ["a\nb", ""], [Array(1500).fill("same").join("\n"), Array(1500).fill("same").join("\n") + "\nnew"]]) {
    const rows = ui.diffLines(before, after);
    assert.equal(rows.filter(row => row.kind !== "add").map(row => row.line).join("\n"), before);
    assert.equal(rows.filter(row => row.kind !== "remove").map(row => row.line).join("\n"), after);
  }
  const { root } = mountRoot();
  ui.exactPreview(root, { before: "---\nknowledge_domain: coding\nclaim_set_hash: old\n---\nA\nB\nC", after: "---\nknowledge_domain: reading\nclaim_set_hash: new\n---\nA\nnew\nC", target_path: "ZETA/PERMANENT/exact.md", packet_hash: "packet_fixture" });
  assert.equal(by(root, "data-field-change", "knowledge_domain").length, 1);
  assert.equal(by(root, "data-field-change", "claim_set_hash").length, 0);
  assert.equal(by(root, "data-change", "add").length, 1); assert.equal(by(root, "data-change", "remove").length, 1);
  assert.ok(by(root, "data-unchanged").every(node => !node.open));
  assert.equal(by(root, "data-raw-markdown").length, 2);
});

// A1 supersedes blank mandatory fields, not explicit acknowledgement/approval.
test("three recommendations are visible while advanced fields stay reachable and cleared decisions still block", async () => {
  const subject = await reviewFixture();
  assert.equal(by(subject.content, "data-storage-mode").length, 2);
  assert.equal(by(subject.content, "data-storage-mode", "new")[0].checked, true);
  assert.equal(by(subject.content, "data-review-field", "relation_status")[0].value, "resolved");
  assert.equal(by(subject.content, "data-review-field", "evidence_strength")[0].value, "sufficient");
  assert.equal(Boolean(by(subject.content, "data-review-conditions")[0].open), false);
  assert.equal(by(subject.content, "data-review-group").length, 6);
  assert.equal(by(subject.content, "data-decision-suggestion").length, 3);
  assert.equal(by(subject.decision, "data-review-acknowledgement")[0].checked, false);
  for (const name of ["knowledge_kind", "relation_status", "evidence_strength"]) {
    const input = by(subject.content, "data-review-field", name)[0], previous = input.value;
    input.value = ""; input.oninput();
    await action(subject.decision, "prepare-document-review").onclick();
    assert.equal(subject.document.activeElement, input);
    assert.equal(by(subject.content, "data-field-error", name).length, 1);
    assert.equal(action(subject.decision, "apply-document-review").disabled, true);
    input.value = previous; input.oninput();
  }
  assert.equal(subject.files.size, 1);
});

test("inline approval binds exact bytes, resets acknowledgement on edit, and never treats stale apply as success", async () => {
  const subject = await reviewFixture(); await fill(subject);
  const prepare = action(subject.decision, "prepare-document-review"); await prepare.onclick();
  assert.equal(by(subject.content, "data-exact-preview", "true").length, 1);
  let apply = action(subject.decision, "apply-document-review"), ack = by(subject.decision, "data-review-acknowledgement")[0];
  assert.equal(ack.checked, false); assert.equal(apply.disabled, true); assert.equal(enabledPrimary(subject.root).length, 0);
  click(ack); assert.equal(apply.disabled, false); assert.equal(subject.files.size, 1);
  const conditions = by(subject.content, "data-review-field", "conditions")[0]; conditions.value = "다시 검토한 실내 조건"; conditions.oninput();
  assert.equal(ack.checked, false); assert.equal(apply.disabled, true); assert.equal(by(subject.content, "data-exact-preview", "true").length, 0);
  await prepare.onclick(); click(ack);
  subject.files.get(subject.source).bytes += "\n바뀐 원문";
  await apply.onclick(); assert.equal(apply.disabled, true); assert.equal(ack.checked, false);
  assert.equal(by(subject.content, "data-applied-document").length, 0);
  assert.equal([...subject.files.keys()].some(path => path.startsWith("ZETA/PERMANENT/")), false);
  assert.equal(subject.journeys.at(-1), 3);
});

test("successful application keeps the exact proposal and exposes the actual saved Markdown", async () => {
  const subject = await reviewFixture(); await fill(subject);
  await action(subject.decision, "prepare-document-review").onclick();
  const expected = by(subject.content, "data-raw-markdown", "after")[0].text;
  click(by(subject.decision, "data-review-acknowledgement")[0]);
  await action(subject.decision, "apply-document-review").onclick();
  const saved = by(subject.content, "data-applied-document")[0].getAttribute("data-applied-document");
  assert.equal(subject.files.get(saved).bytes, expected);
  assert.equal(subject.journeys.at(-1), 4); assert.equal(by(subject.content, "data-exact-preview", "true").length, 1);
  assert.equal(enabledPrimary(subject.root).length, 1); assert.equal(enabledPrimary(subject.root)[0].getAttribute("data-action"), "open-applied-document");
  assert.ok(by(subject.content, "data-review-field").every(node => node.disabled));
});

test("real Hub entry mounts the shell and tentative picker without dispatching a provider or replacing source on cancel", { timeout: 5000 }, async () => {
  const ready = Promise.withResolvers();
  const path = "INBOX/Hub UX fixture.md", source = "# 합성 자료\n\n실내 모형 점검은 10분이며 경고등이 켜지면 즉시 중단한다.\n";
  const runtime = await runHub({ pages: buildPages(), extraFiles: { [path]: source }, llmWikiControllerOptions: { loadDynamicGoldenModules: true, onLifecycleAction: result => { if (result.intent.action === "select_source" && result.intent.source_path) ready.resolve(result); } } });
  const hub = runtime.window.KnowledgeExplorerHub; assert.ok(hub.tabs);
  await hub.whenKnowledgeInboxSettled(); hub.tabs.select("llmwiki");
  const workspace = hub.tabs.wikiWorkspace;
  assert.equal(workspace.frame.hidden, false); assert.equal(enabledPrimary(workspace.frame).length, 1);
  const initialCounters = JSON.stringify(hub.llmWikiRunController.getSnapshot().counters);
  action(runtime.container, "select-source").onclick();
  const row = by(runtime.container, "data-source-option", path)[0]; assert.ok(row); row.onclick();
  assert.equal(hub.prodigyWikiSnapshot().source, null);
  action(runtime.container, "confirm-source-selection").onclick();
  assert.equal((await ready.promise).response.ok, true);
  assert.equal(hub.prodigyWikiSnapshot().source.path, path);
  action(runtime.container, "select-source").onclick(); action(runtime.container, "cancel-source-picker").onclick();
  assert.equal(hub.prodigyWikiSnapshot().source.path, path);
  assert.equal(JSON.stringify(hub.llmWikiRunController.getSnapshot().counters), initialCounters);
  workspace.onCapture();
  const input = runtime.container.querySelector("textarea"); assert.ok(input); input.value = "사용자가 붙여 넣은 자료"; input.oninput();
  input.onkeydown({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.equal(input.value, "사용자가 붙여 넣은 자료"); assert.ok(action(runtime.container, "discard-material"));
  assert.equal(hub.prodigyWikiSnapshot().source.path, path);
  action(runtime.container, "discard-material").onclick();
  assert.equal(hub.prodigyWikiSnapshot().source.path, path);
  assert.ok(collectText(workspace.frame).length > 0);
  assert.ok(serialize(workspace.frame).includes("data-wiki-decision"));
  runtime.window.ProdigyHubLoader.disposeWorkspace(runtime.container);
});
