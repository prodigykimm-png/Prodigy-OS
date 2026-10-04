"use strict";

// Auction card frontmatter guard.
//
// Why this exists: Obsidian's FileManager.processFrontMatter parses the existing
// frontmatter with the YAML parser before it writes. If that parse throws, it
// writes nothing and the caller sees a save failure. An agent pass that edits
// frontmatter as raw text (instead of going through processFrontMatter) can
// produce frontmatter Obsidian refuses to parse, and the card silently stops
// saving. This module detects and repairs that class of damage.
//
// Detection is structural and dependency-free, covering the four classes
// observed in the 2026-10-03 repair: unquoted values that YAML reads as a
// mapping, a closing delimiter glued to the next line, duplicate keys, and a
// multi-line double-quoted scalar whose continuation is not indented. When the
// "yaml" module is resolvable, a full parse is also run so unknown YAML errors
// are still reported rather than missed.

const OPEN_DELIMITER = /^---(\r?\n)/;
const CLOSE_DELIMITER = /---(\r?\n|$)/g;
const KEY_VALUE = /^(\s*)([^\s#][^:]*?):([ \t]*)(.*)$/;
const INDENTED_CONTINUATION = /^\s+\S/;

let yamlParse = null;
try {
  const mod = require("yaml");
  if (mod && typeof mod.parse === "function") yamlParse = mod.parse;
} catch (_) {
  yamlParse = null;
}

function splitFrontmatter(text) {
  const source = String(text ?? "");
  const opening = OPEN_DELIMITER.exec(source);
  if (!opening) return { exists: false, fm: "", body: source, from: 0, to: 0 };
  const from = opening[0].length;
  CLOSE_DELIMITER.lastIndex = from;
  let match;
  while ((match = CLOSE_DELIMITER.exec(source))) {
    // Obsidian requires the closing delimiter to be followed by a newline, so a
    // delimiter glued to the next line does not close the frontmatter here.
    if (source.charAt(match.index - 1) !== "\n") continue;
    return { exists: true, fm: source.slice(from, match.index), body: source.slice(match.lastIndex), from, to: match.index, contentStart: match.lastIndex };
  }
  return { exists: false, fm: "", body: source, from: 0, to: 0 };
}

// A plain scalar is unsafe when YAML would read it as something other than the
// literal string: a ": " (or trailing ":") starts a nested mapping, " #" starts
// a comment, and a leading indicator character changes the node type.
function countUnescapedQuotes(value) {
  let count = 0;
  for (let i = 0; i < value.length; i++) {
    if (value.charAt(i) === '"' && value.charAt(i - 1) !== "\\") count += 1;
  }
  return count;
}

function needsQuoting(value) {
  if (!value) return false;
  if (value.startsWith('"') || value.startsWith("'")) return false;
  if (/:[ \t]/.test(value)) return true;
  if (value.endsWith(":")) return true;
  if (/[ \t]#/.test(value)) return true;
  if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(value)) return true;
  return false;
}

// Indices of lines that are real frontmatter entries. Lines inside a block
// scalar (the body of "key: |" / "key: >") look exactly like key/value pairs
// but are literal text, so they must never be parsed or rewritten.
function entryIndices(fmLines) {
  const keep = new Set();
  let blockIndent = null;
  for (let i = 0; i < fmLines.length; i++) {
    const raw = fmLines[i];
    if (blockIndent !== null) {
      if (raw.trim() === "") continue;
      const indent = raw.match(/^\s*/)[0].length;
      if (indent > blockIndent) continue;
      blockIndent = null;
    }
    const match = KEY_VALUE.exec(raw);
    if (!match) continue;
    keep.add(i);
    if (/^[|>]/.test(match[4])) blockIndent = match[1].length;
  }
  return keep;
}

function analyze(text) {
  const split = splitFrontmatter(text);
  const result = {
    exists: split.exists,
    gluedDelimiter: null,
    unquotedMappingValues: [],
    duplicateKeys: [],
    unclosedQuotes: [],
    parseError: null,
    ok: false
  };
  const lines = String(text ?? "").split("\n");
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.startsWith("---")) continue;
    if (raw === "---" || raw === "---\r") break;
    result.gluedDelimiter = { line: i + 1, text: raw.slice(0, 60) };
    break;
  }
  if (!split.exists) {
    result.reason = "no_frontmatter";
    result.ok = false;
    return result;
  }

  const fmLines = split.fm.split("\n");
  const entries = entryIndices(fmLines);
  const seen = new Map();
  for (let i = 0; i < fmLines.length; i++) {
    const match = KEY_VALUE.exec(fmLines[i]);
    if (!match || !entries.has(i)) continue;
    const indent = match[1].length;
    const key = match[2];
    const value = match[4];
    const id = indent + "|" + key;
    if (seen.has(id)) result.duplicateKeys.push({ key, line: i + 1 });
    else seen.set(id, i);

    if (!value || /^[|>]/.test(value)) continue;
    if (value.startsWith('"')) {
      if (countUnescapedQuotes(value) % 2 === 1) result.unclosedQuotes.push({ key, line: i + 1 });
      continue;
    }
    if (needsQuoting(value)) result.unquotedMappingValues.push({ key, line: i + 1, value: value.slice(0, 60) });
  }

  if (yamlParse) {
    try { yamlParse(split.fm, null, {}); }
    catch (error) { result.parseError = String((error && error.message) || error).slice(0, 200); }
  }
  result.ok = !result.gluedDelimiter
    && result.unquotedMappingValues.length === 0
    && result.duplicateKeys.length === 0
    && result.unclosedQuotes.length === 0
    && !result.parseError;
  return result;
}

const escapeDoubleQuoted = (value) => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

function splitGluedDelimiter(text) {
  const lines = String(text).split("\n");
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.startsWith("---")) continue;
    if (raw === "---" || raw === "---\r") return null;
    lines[i] = "---\n" + raw.slice(3);
    return { text: lines.join("\n"), change: { kind: "gluedDelimiter", line: i + 1 } };
  }
  return null;
}

function quoteMappingValues(text) {
  const split = splitFrontmatter(text);
  if (!split.exists) return null;
  const fmLines = split.fm.split("\n");
  const entries = entryIndices(fmLines);
  const changes = [];
  for (let i = 0; i < fmLines.length; i++) {
    const match = KEY_VALUE.exec(fmLines[i]);
    if (!match || !entries.has(i)) continue;
    const value = match[4];
    if (!value || /^[|>]/.test(value) || value.startsWith('"')) continue;
    if (!needsQuoting(value)) continue;
    fmLines[i] = match[1] + match[2] + ': "' + escapeDoubleQuoted(value) + '"';
    changes.push({ kind: "quotedValue", key: match[2], line: i + 1 });
  }
  if (!changes.length) return null;
  return { text: text.slice(0, split.from) + fmLines.join("\n") + text.slice(split.to), change: changes[0], changes };
}

function foldUnclosedQuotes(text) {
  const split = splitFrontmatter(text);
  if (!split.exists) return null;
  const fmLines = split.fm.split("\n");
  const entries = entryIndices(fmLines);
  for (let i = 0; i < fmLines.length; i++) {
    const match = KEY_VALUE.exec(fmLines[i]);
    if (!match || !entries.has(i)) continue;
    const value = match[4];
    if (!value.startsWith('"')) continue;
    if (countUnescapedQuotes(value) % 2 === 0) continue;
    let accumulated = value.slice(1);
    let end = i;
    let closed = false;
    for (let j = i + 1; j < fmLines.length; j++) {
      const inner = /(^|[^\\])"/.exec(fmLines[j]);
      if (inner) { accumulated += " " + fmLines[j].slice(0, inner.index + (inner[1] ? 1 : 0)); end = j; closed = true; break; }
      accumulated += " " + fmLines[j];
    }
    if (!closed) continue;
    fmLines[i] = match[1] + match[2] + ': "' + escapeDoubleQuoted(accumulated) + '"';
    fmLines.splice(i + 1, end - i);
    return { text: text.slice(0, split.from) + fmLines.join("\n") + text.slice(split.to), change: { kind: "foldedQuote", key: match[2], line: i + 1 } };
  }
  return null;
}

function dedupeKeys(text) {
  const split = splitFrontmatter(text);
  if (!split.exists) return null;
  const fmLines = split.fm.split("\n");
  const entries = entryIndices(fmLines);
  const firstSeen = new Map();
  const drop = new Set();
  const changes = [];
  for (let i = 0; i < fmLines.length; i++) {
    const match = KEY_VALUE.exec(fmLines[i]);
    if (!match || !entries.has(i)) continue;
    const id = match[1].length + "|" + match[2];
    if (!firstSeen.has(id)) { firstSeen.set(id, i); continue; }
    const earlier = firstSeen.get(id);
    const earlierValue = KEY_VALUE.exec(fmLines[earlier])[4];
    const laterValue = match[4];
    if (!earlierValue && laterValue) {
      fmLines[earlier] = match[1] + match[2] + ": " + laterValue;
      changes.push({ kind: "dedupe", key: match[2], line: i + 1, action: "moved_value_up" });
    } else {
      changes.push({ kind: "dedupe", key: match[2], line: i + 1, action: laterValue ? "dropped_later_with_value" : "dropped_empty_duplicate" });
    }
    drop.add(i);
  }
  if (!drop.size) return null;
  const kept = fmLines.filter((_, index) => !drop.has(index));
  return { text: text.slice(0, split.from) + kept.join("\n") + text.slice(split.to), change: changes[0], changes };
}

const REPAIRS = [splitGluedDelimiter, quoteMappingValues, foldUnclosedQuotes, dedupeKeys];

function repair(text, options) {
  const maxPasses = Number((options && options.maxPasses) || 12);
  let current = String(text ?? "");
  const changes = [];
  for (let pass = 0; pass < maxPasses; pass++) {
    const before = analyze(current);
    if (before.ok) break;
    let applied = null;
    for (const step of REPAIRS) {
      const result = step(current);
      if (result) { applied = result; break; }
    }
    if (!applied) break;
    current = applied.text;
    for (const change of applied.changes || [applied.change]) changes.push(change);
  }
  const after = analyze(current);
  return { text: current, changed: current !== String(text ?? ""), changes, ok: after.ok, remaining: after };
}

module.exports = { splitFrontmatter, analyze, repair, needsQuoting, hasYamlParser: () => yamlParse !== null };
