"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../../../..");
global.window = global.window || {};
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-state.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-core.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-policy.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-service.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-brief-render.js"));
require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-render.js"));
const responsive = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-responsive.js"));
const view = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-view.js"));
const { FakeElement, collectText } = require("./knowledge_explorer_view_fakes.js");
const { catalog, flattenCatalog } = require("./knowledge_explorer_fixtures.js");
const registry = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-registry.js"));
const core = require(path.join(ROOT, "SYSTEM/Views/knowledge-explorer-core.js"));

function walk(node, predicate, hits = []) {
  if (!node) return hits;
  if (predicate(node)) hits.push(node);
  for (const child of node.children || []) walk(child, predicate, hits);
  return hits;
}

function button(root, group) {
  return walk(root, (node) => node.tag === "button" && node.attr && node.attr["data-group"] === group)[0] || null;
}

function assertScrollOwners(root, expectedOwners) {
  const owners = walk(root, (node) => node.attr && node.attr["data-scroll-owner"]);
  assert.equal(owners.length, expectedOwners.length, "each visible pane must expose exactly one scroll owner");
  for (const [owner, className] of expectedOwners) {
    const matches = owners.filter((node) => node.attr["data-scroll-owner"] === owner);
    assert.equal(matches.length, 1, `${owner} must have exactly one rendered scroll owner`);
    assert.ok(matches[0].attr.class.split(/\s+/).includes(className), `${owner} must use ${className}`);
  }
}

function click(target) {
  target.onclick({ preventDefault() {} });
}

function model() {
  return core.projectKnowledgeExplorer(flattenCatalog(catalog), registry);
}

function testResponsivePrimitives() {
  assert.equal(responsive.layoutForWidth(1280), "wide");
  assert.equal(responsive.layoutForWidth(768), "compact");
  assert.equal(responsive.layoutForWidth(375), "narrow");
  assert.equal(responsive.visiblePanes("narrow", "domain").join(","), "domain");
  assert.equal(responsive.visiblePanes("narrow", "middle").join(","), "middle");
  assert.equal(responsive.visiblePanes("narrow", "detail").join(","), "detail");
  assert.equal(responsive.visiblePanes("compact", "detail").join(","), "domain,detail");
}

function testVisiblePanesHaveOneNamedScrollOwner() {
  const explorerModel = model();
  const cases = [
    [1280, "domain", [["domain-nav", "knowledge-explorer-scroll-domain"], ["topic-nav", "knowledge-explorer-scroll-topic"], ["detail-pane", "knowledge-explorer-scroll-detail"]]],
    [768, "domain", [["domain-nav", "knowledge-explorer-scroll-domain"], ["topic-nav", "knowledge-explorer-scroll-topic"]]],
    [375, "detail", [["detail-pane", "knowledge-explorer-scroll-detail"]]]
  ];
  for (const [logicalWidth, focusPane, expectedOwners] of cases) {
    const root = new FakeElement("section");
    view.renderKnowledgeExplorer(root, explorerModel, { logicalWidth, selection: { focusPane } });
    assertScrollOwners(root, expectedOwners);
  }
}

function testNarrowDrillDownAndResize() {
  const root = new FakeElement("section");
  const shell = view.mountKnowledgeExplorer({ container: root, model: model(), logicalWidth: 375 });
  assert.equal(root.attr["data-layout"], "narrow");
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "domain").length, 1);
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "middle").length, 0);
  assertScrollOwners(root, [["domain-nav", "knowledge-explorer-scroll-domain"]]);

  const domain = button(root, "domain");
  assert.ok(domain, "narrow domain control should exist");
  click(domain);
  assert.equal(shell.state().focusPane, "middle");
  assert.equal(root.attr["data-layout"], "narrow");
  assert.match(collectText(root), /도메인으로 돌아가기/);
  assertScrollOwners(root, [["topic-nav", "knowledge-explorer-scroll-topic"]]);

  const middle = button(root, "middle");
  assert.ok(middle, "narrow topic/resource control should exist");
  click(middle);
  assert.equal(shell.state().focusPane, "detail");
  assert.match(collectText(root), /주제·자료로 돌아가기/);
  assertScrollOwners(root, [["detail-pane", "knowledge-explorer-scroll-detail"]]);

  const selectedBeforeResize = shell.state();
  shell.setLogicalWidth(1280);
  assert.equal(root.attr["data-layout"], "wide");
  assert.deepEqual(shell.state(), selectedBeforeResize, "resize must preserve selection");
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "domain").length, 1);
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "middle").length, 1);
  assert.equal(walk(root, (node) => node.attr && node.attr["data-pane"] === "detail").length, 1);
  assertScrollOwners(root, [["domain-nav", "knowledge-explorer-scroll-domain"], ["topic-nav", "knowledge-explorer-scroll-topic"], ["detail-pane", "knowledge-explorer-scroll-detail"]]);

  shell.setLogicalWidth(375);
  const back = walk(root, (node) => node.tag === "button" && node.attr && node.attr["data-action"] === "back")[0];
  assert.ok(back, "narrow detail must expose an explicit Korean back control");
  click(back);
  assert.equal(shell.state().focusPane, "middle");
  assert.ok(walk(root, (node) => node.focused).some((node) => node.attr && node.attr["data-group"] === "middle"), "back should restore focus to the triggering middle control");
}

function testContentAndStateStress() {
  const root = new FakeElement("section");
  const explorerModel = model();
  const longDomain = explorerModel.domains.find((domain) => domain.key === "personal_growth");
  assert.ok(longDomain, "long Korean fixture domain should exist");
  assert.doesNotThrow(() => view.renderKnowledgeExplorer(root, explorerModel, {
    logicalWidth: 375,
    surfaceState: "loading",
    selection: { domainKey: longDomain.key, middleKind: "topic", middleKey: longDomain.topic_sections[0].key, assetPath: longDomain.topic_sections[0].assets[0].path, focusPane: "detail" }
  }));
  assert.match(collectText(root), /아주 길고 길고 길고 길고 길고 길고 긴 한국어 제목/);
  const urlDomain = explorerModel.domains.find((domain) => domain.key === "reading");
  assert.ok(urlDomain, "URL fixture domain should exist");
  const urlModel = JSON.parse(JSON.stringify(explorerModel));
  const urlSection = urlModel.domains.find((domain) => domain.key === "reading").topic_sections[0];
  const unbrokenUrl = "https://example.invalid/this-is-an-intentionally-unbroken-url-for-a-narrow-knowledge-explorer-layout-stress-case";
  urlSection.assets.push({ path: unbrokenUrl, title: unbrokenUrl, type: "knowledge", kind: "knowledge" });
  view.renderKnowledgeExplorer(root, urlModel, { logicalWidth: 375, selection: { domainKey: urlDomain.key, middleKind: "topic", middleKey: urlSection.key, assetPath: unbrokenUrl, focusPane: "detail" } });
  assert.ok(collectText(root).includes("https://"), "an unbroken URL must remain renderable at 375 logical width");
  assert.doesNotThrow(() => view.renderKnowledgeExplorer(root, explorerModel, { logicalWidth: 768, surfaceState: "error" }));
  assert.doesNotThrow(() => view.renderKnowledgeExplorer(root, { domains: [], totals: {} }, { logicalWidth: 1280, surfaceState: "empty" }));
  const style = walk(root, (node) => node.tag === "style")[0];
  assert.match(style.text, /@container knowledge-explorer/);
  assert.match(style.text, /prefers-reduced-motion/);
  assert.match(style.text, /--ke-touch-target/);
  assert.match(style.text, /overflow-wrap:\s*anywhere/);
}

function testSelectedRecordRemovalRecoversDeterministically() {
  const explorerModel = model();
  const selected = view.createSelectionState(explorerModel, { focusPane: "detail" });
  const remainingDomains = explorerModel.domains.filter((domain) => domain.key !== selected.domainKey);
  const reducedModel = { ...explorerModel, domains: remainingDomains };
  const recovered = view.createSelectionState(reducedModel, selected);
  assert.notEqual(recovered.domainKey, selected.domainKey, "a removed selection must fall back to an existing domain");
  assert.equal(recovered.focusPane, "detail", "selection recovery must preserve the active drill-down step");
  const root = new FakeElement("section");
  assert.doesNotThrow(() => view.renderKnowledgeExplorer(root, reducedModel, { selection: selected, logicalWidth: 375 }));
}

testResponsivePrimitives();
testVisiblePanesHaveOneNamedScrollOwner();
testNarrowDrillDownAndResize();
testContentAndStateStress();
testSelectedRecordRemovalRecoversDeterministically();

console.log("Knowledge Explorer responsive tests passed");
