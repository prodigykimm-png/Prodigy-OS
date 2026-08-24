#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const APPEARANCE_PATH = path.join(ROOT, ".obsidian", "appearance.json");
const BASE_CSS_PATH = path.join(ROOT, ".obsidian", "snippets", "base.css");
const BASE_SNIPPET_ID = "base";

// Canonical Action Blue (Apple web blue family primary/focus) from DESIGN.md contract.
const ACTION_BLUE = "#0071e3";
// Obsidian Default theme is the no-community-theme baseline (empty cssTheme id).
const DEFAULT_THEME = "";

const HUB_NOTES = Object.freeze([
  { path: path.join(ROOT, "HUB", "00 Home.md"), class: "prodigy-hub-note" },
  { path: path.join(ROOT, "HUB", "10 Auction.md"), class: "prodigy-hub-note" },
]);

test("appearance.json aligns to Obsidian Default baseline and canonical Action Blue accent while preserving unrelated keys", () => {
  const raw = fs.readFileSync(APPEARANCE_PATH, "utf8");
  const config = JSON.parse(raw);

  // Theme baseline and accent are the two owned conversions for this task.
  assert.equal(config.cssTheme, DEFAULT_THEME, "cssTheme must be the Obsidian Default baseline, not a community theme");
  assert.equal(config.accentColor, ACTION_BLUE, "accentColor must be canonical Action Blue #0071e3");

  // Keys the task explicitly requires preserving must be left byte-equivalent.
  assert.ok(["moonstone", "obsidian"].includes(config.theme), "current light/dark mode must be preserved");
  assert.equal(config.showRibbon, true, "ribbon setting must be preserved");
  assert.ok(Array.isArray(config.enabledCssSnippets) && config.enabledCssSnippets.includes(BASE_SNIPPET_ID),
    "enabled css snippets must keep the base snippet enabled");

  // The preserved key-set can only grow; anything required above stays present.
  for (const key of ["theme", "showRibbon", "enabledCssSnippets"]) {
    assert.ok(key in config, `preserved key ${key} must remain in appearance.json`);
  }
});

test("prodigy-hub-note scope hides metadata and inline title only beneath the class; ordinary notes keep their chrome", () => {
  const baseCss = fs.readFileSync(BASE_CSS_PATH, "utf8");
  assert.match(baseCss, /\.prodigy-hub-note/, "base.css must define a prodigy-hub-note scope");

  // Every Hub note listed for this task must carry the scope.
  for (const note of HUB_NOTES) {
    const source = fs.readFileSync(note.path, "utf8");
    assert.match(source, /prodigy-hub-note/, `${path.basename(note.path)} must declare the prodigy-hub-note cssclass`);
  }
});

/*
 * Pure DOM/CSS oracle — no browser, no process identity.
 *
 * Parent review found AsideCdpHarness.start() is nondeterministic: a freshly
 * cloned browser process can exit between its `ps` row capture and the follow-up
 * `ps -p` identity snapshot, throwing "process identity snapshot failed: 1"
 * before any product assertion runs. The shared harness is untouchable, so this
 * test resolves the exact scoped computed-style contract directly from the
 * actual base.css instead.
 *
 * Only the selector and cascade forms present in base.css are modeled:
 *   - Selector forms `.class` and `.class .class` (descendant compound).
 *   - The two Obsidian theme defaults (.inline-title -> block, and
 *     .metadata-container -> var(--metadata-display-reading, block)) are
 *     injected first; base.css rules override in source order (later wins),
 *     matching the real browser cascade.
 *   - `--metadata-display-reading` is a custom property inherited from the
 *     nearest ancestor that sets it (the .prodigy-hub-note root, or the
 *     Obsidian `--metadata-display-*: none` helpers).
 */
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//gu, "");
}

// Split a base.css file into simple top-level rules `{ selectors, declarations }`.
// base.css has no nested braces or @media blocks, so top-level `{...}` splitting
// is exact and deterministic.
function parseRules(css) {
  const source = stripCssComments(css).replace(/\r/gu, "");
  const rules = [];
  const openRe = /\{/gu;
  const closeRe = /\}/gu;
  const opens = [];
  const closes = [];
  let m;
  while ((m = openRe.exec(source)) !== null) opens.push(m.index);
  while ((m = closeRe.exec(source)) !== null) closes.push(m.index);
  if (opens.length !== closes.length) {
    throw new Error("base.css is not a simple brace-balanced rule file expected by the oracle");
  }
  for (let i = 0; i < opens.length; i++) {
    const selectorText = source.slice(i === 0 ? 0 : closes[i - 1] + 1, opens[i]).replace(/\s+/gu, " ").trim();
    if (!selectorText) continue;
    const body = source.slice(opens[i] + 1, closes[i]);
    const declarations = {};
    for (const rawDecl of body.split(";")) {
      const decl = stripCssComments(rawDecl).trim();
      if (!decl) continue;
      const idx = decl.indexOf(":");
      if (idx === -1) continue;
      declarations[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim().replace(/\s*!important$/u, "");
    }
    for (const rawSelector of selectorText.split(",")) {
      const selector = rawSelector.trim();
      if (selector) rules.push({ selector, declarations, order: rules.length });
    }
  }
  return rules;
}

function makeNode(type, classes, id) {
  return { type, classes: new Set(classes), id, parent: null };
}

// Match a selector fragment of the form `.class` (class-presence based).
function matchesCompound(part, node) {
  if (!part.startsWith(".")) return false;
  return part.split(".").filter(Boolean).every((className) => node.classes.has(className));
}

// Match a selector against the fixture tree. Supports `.class` and
// `.class .class` (rightmost matches the node, prior fragments match ancestors).
function selectorMatches(selector, node, tree) {
  const parts = selector.split(/\s+/u).filter(Boolean);
  if (parts.length === 1) return matchesCompound(parts[0], node);
  const target = parts[parts.length - 1];
  if (!matchesCompound(target, node)) return false;
  const ancestors = [];
  for (let cursor = node.parent; cursor; cursor = cursor.parent) ancestors.push(cursor);
  let lowerBound = 0;
  for (let i = parts.length - 2; i >= 0; i--) {
    const hit = ancestors.findIndex((ancestor, idx) => idx >= lowerBound && matchesCompound(parts[i], ancestor));
    if (hit === -1) return false;
    lowerBound = hit + 1;
  }
  return true;
}

// Build the fixture tree exactly as Obsidian renders a note: the note root
// carries cssclasses (including prodigy-hub-note for Hub notes) and contains
// .inline-title (duplicate title) plus .metadata-container (Properties).
function buildFixtureTree() {
  const scoped = makeNode("article", ["markdown-preview-view", "prodigy-hub-note"], "scoped");
  const scopedInline = makeNode("div", ["inline-title"], "scoped-inline");
  const scopedMeta = makeNode("div", ["metadata-container"], "scoped-meta");
  const plain = makeNode("article", [], "plain");
  const plainInline = makeNode("div", ["inline-title"], "plain-inline");
  const plainMeta = makeNode("div", ["metadata-container"], "plain-meta");
  scopedInline.parent = scoped; scopedMeta.parent = scoped;
  plainInline.parent = plain; plainMeta.parent = plain;
  return Object.freeze({
    scoped, scopedInline, scopedMeta, plain, plainInline, plainMeta,
    all: [scoped, scopedInline, scopedMeta, plain, plainInline, plainMeta],
  });
}

function buildChromeOracle() {
  // Reads BASE_CSS_PATH, or TASK2_CSS_OVERRIDE (absolute path) as a deterministic
  // mutation probe for RED demonstrations — no browser, no process identity.
  const cssPath = process.env.TASK2_CSS_OVERRIDE || BASE_CSS_PATH;
  const rules = parseRules(fs.readFileSync(cssPath, "utf8"));
  const tree = buildFixtureTree();

  // `display` declarations that match a fixture node, in source order.
  const displayEdges = [];
  // custom-property declarations, per setting node, in source order.
  const propertyEdges = [];
  for (const rule of rules) {
    for (const node of tree.all) {
      if (!selectorMatches(rule.selector, node, tree)) continue;
      if ("display" in rule.declarations) displayEdges.push({ node, value: rule.declarations.display, order: rule.order });
      for (const prop of ["--metadata-display-reading", "--metadata-display-editing"]) {
        if (prop in rule.declarations) propertyEdges.push({ node, prop, value: rule.declarations[prop], order: rule.order });
      }
    }
  }

  // Resolve a custom-property inherited by `node` from the nearest ancestor
  // (self included) that sets it.
  const inheritedProperty = (node, prop) => {
    for (let cursor = node; cursor; cursor = cursor.parent) {
      const set = propertyEdges.filter((edge) => edge.node === cursor && edge.prop === prop);
      if (set.length) return set[set.length - 1].value;
    }
    return undefined;
  };

  // Effective `display` at the top of base.css cascade: theme defaults first,
  // then base.css rule declarations override in source order.
  const displayOf = (node) => {
    const matches = displayEdges.filter((edge) => edge.node === node);
    return matches.length ? matches[matches.length - 1].value : "block";
  };

  return {
    tree,
    // Obsidian: .metadata-container { display: var(--metadata-display-reading, block) }
    metadataContainer(node) { return inheritedProperty(node, "--metadata-display-reading") || "block"; },
    // Obsidian theme default .inline-title { display: block }
    inlineTitle(node) { return displayOf(node); },
  };
}

test("scoped CSS fixture hides host chrome under .prodigy-hub-note and never leaks to an ordinary note", () => {
  const chrome = buildChromeOracle();
  const tree = chrome.tree;

  // Under the scope: metadata and inline title are hidden.
  assert.equal(chrome.metadataContainer(tree.scopedMeta), "none", "metadata must be hidden beneath .prodigy-hub-note");
  assert.equal(chrome.inlineTitle(tree.scopedInline), "none", "inline title must be hidden beneath .prodigy-hub-note");

  // Outside the scope: an ordinary note keeps its full chrome.
  assert.equal(chrome.metadataContainer(tree.plainMeta), "block", "ordinary note metadata must stay visible");
  assert.equal(chrome.inlineTitle(tree.plainInline), "block", "ordinary note inline title must stay visible");

  // Explicit leak guard: the scoped rules must not be reachable by the ordinary note.
  assert.notEqual(chrome.metadataContainer(tree.plainMeta), "none", "prodigy-hub-note must not hide an ordinary note's metadata");
  assert.notEqual(chrome.inlineTitle(tree.plainInline), "none", "prodigy-hub-note must not hide an ordinary note's inline title");
});
