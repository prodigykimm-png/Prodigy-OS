#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const CONTRACT_MAP_PATH = "SYSTEM/docs/13_Contract_Map.md";
const PROTECTED_CONTRACT_MANIFEST_PATH = "SYSTEM/SCRIPTS/prodigy-contract-baseline.json";
const PROTECTED_DOCUMENT_PATH = "SYSTEM/docs/00_Constitution.md";
const PROTECTED_ARTICLES = [3, 8, 9, 14];
const PROTECTED_CONTRACT_SCHEMA_VERSION = 1;
const PROTECTED_CONTRACT_NORMALIZATION_VERSION = 1;
const WORKSPACE_REGISTRY_PATH = "SYSTEM/Views/workspace-registry.js";
const CONTRACT_HIERARCHY_ADR_PATH = "SYSTEM/docs/ADR/ADR-007-contract-source-hierarchy.md";
const CANONICAL_UI_CONTRACT_PATH = "DESIGN.md";
const COMPATIBILITY_UI_CONTRACT_PATH = "SYSTEM/docs/DESIGN.md";
const LINK_SCAN_DIRS = ["SYSTEM/docs", "HUB"];
const LEGACY_ALIAS_ALLOWLIST = [];
const MAP_COLUMNS = ["Surface", "WorkspaceId", "Schema", "Template", "Hub", "View", "Test"];
const PATH_LAYERS = ["Schema", "Template", "Hub", "View", "Test"];
const EMPTY_CELL = "-";

function splitRow(line) {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function stripCode(cell) {
  return cell.replace(/`/g, "").trim();
}

function isDividerRow(cells) {
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

function parseContractMap(mapText) {
  const lines = mapText.split("\n");
  const headerIndex = lines.findIndex((line) => {
    if (!line.trim().startsWith("|")) return false;
    const cells = splitRow(line).map(stripCode);
    return MAP_COLUMNS.every((column, index) => cells[index] === column);
  });
  if (headerIndex === -1) {
    throw new Error("surface ownership table header not found (expected columns: " + MAP_COLUMNS.join(", ") + ")");
  }

  const surfaces = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim().startsWith("|")) break;
    const cells = splitRow(line);
    if (isDividerRow(cells)) continue;
    if (cells.length !== MAP_COLUMNS.length) {
      throw new Error(
        "malformed surface row at line " + (index + 1) + ": expected " + MAP_COLUMNS.length + " cells, got " + cells.length
      );
    }
    const values = cells.map(stripCode);
    if (!values[0] || !values[1]) {
      throw new Error("malformed surface row at line " + (index + 1) + ": empty Surface or WorkspaceId");
    }
    const paths = {};
    PATH_LAYERS.forEach((layer, offset) => {
      const value = values[offset + 2];
      paths[layer] = value === EMPTY_CELL || value === "" ? null : value;
    });
    surfaces.push({ surface: values[0], workspaceId: values[1], paths, line: index + 1 });
  }

  if (surfaces.length === 0) {
    throw new Error("surface ownership table has no data rows");
  }
  return surfaces;
}

function parseWorkspaceRegistry(registryText) {
  const entries = [];
  const pattern = /id:\s*"([^"]+)"[^{}]*?path:\s*"([^"]+)"/g;
  let match = pattern.exec(registryText);
  while (match !== null) {
    entries.push({ id: match[1], path: match[2] });
    match = pattern.exec(registryText);
  }
  return entries;
}

const WORKSPACE_ID_SHAPE = /^[a-z][a-z0-9_]*$/;
const WORKSPACE_MOUNT_TOKEN = "ProdigyWorkspaceNavigation.mount";
const EXECUTABLE_FENCE_LANGUAGES = new Set(["js", "javascript", "dataviewjs", "js-engine"]);

function executableJavaScriptRanges(source) {
  const ranges = [];
  const fencePattern = /^\s{0,3}(`{3,}|~{3,})([^\r\n]*)/;
  let sawFence = false;
  let openFence = null;
  let offset = 0;
  const lines = source.match(/.*(?:\r?\n|$)/g) || [];
  lines.forEach((line) => {
    const body = line.replace(/\r?\n$/, "");
    const match = fencePattern.exec(body);
    if (!openFence) {
      if (match) {
        sawFence = true;
        const language = match[2].trim().split(/\s+/)[0].toLowerCase();
        openFence = {
          character: match[1][0],
          length: match[1].length,
          executable: EXECUTABLE_FENCE_LANGUAGES.has(language),
          contentStart: offset + line.length
        };
      }
    } else if (
      match &&
      match[1][0] === openFence.character &&
      match[1].length >= openFence.length &&
      match[2].trim() === ""
    ) {
      if (openFence.executable) ranges.push([openFence.contentStart, offset]);
      openFence = null;
    }
    offset += line.length;
  });
  if (openFence && openFence.executable) ranges.push([openFence.contentStart, source.length]);
  return sawFence ? ranges : [[0, source.length]];
}

function previousCodeCharacter(masked, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!/\s/.test(masked[cursor])) return masked[cursor];
  }
  return "";
}

function maskJavaScript(source) {
  const masked = source.split("");
  const blank = (index) => { if (masked[index] !== "\n" && masked[index] !== "\r") masked[index] = " "; };
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (character === "/" && next === "/") {
      blank(index++); blank(index++);
      while (index < source.length && source[index] !== "\n") blank(index++);
      continue;
    }
    if (character === "/" && next === "*") {
      blank(index++); blank(index++);
      while (index < source.length) {
        if (source[index] === "*" && source[index + 1] === "/") {
          blank(index++); blank(index++);
          break;
        }
        blank(index++);
      }
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      const quote = character;
      blank(index++);
      while (index < source.length) {
        if (source[index] === "\\") {
          blank(index++);
          if (index < source.length) blank(index++);
          continue;
        }
        const closing = source[index] === quote;
        blank(index++);
        if (closing) break;
      }
      continue;
    }
    if (character === "/" && /^(?:|[({[,:;=!?&|+*%^~<>-])$/.test(previousCodeCharacter(masked, index))) {
      blank(index++);
      let inClass = false;
      while (index < source.length) {
        if (source[index] === "\\") {
          blank(index++);
          if (index < source.length) blank(index++);
          continue;
        }
        if (source[index] === "[") inClass = true;
        if (source[index] === "]") inClass = false;
        const closing = source[index] === "/" && !inClass;
        blank(index++);
        if (closing) {
          while (index < source.length && /[a-z]/i.test(source[index])) blank(index++);
          break;
        }
      }
      continue;
    }
    index += 1;
  }
  return masked.join("");
}

function matchingDelimiter(masked, openIndex, openCharacter, closeCharacter) {
  let depth = 0;
  for (let index = openIndex; index < masked.length; index += 1) {
    if (masked[index] === openCharacter) depth += 1;
    if (masked[index] === closeCharacter) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevelArguments(masked, openIndex, closeIndex) {
  const commas = [];
  const depth = { "(": 0, "[": 0, "{": 0 };
  const closing = { ")": "(", "]": "[", "}": "{" };
  for (let index = openIndex + 1; index < closeIndex; index += 1) {
    const character = masked[index];
    if (Object.prototype.hasOwnProperty.call(depth, character)) depth[character] += 1;
    else if (closing[character]) depth[closing[character]] -= 1;
    else if (character === "," && depth["("] === 0 && depth["["] === 0 && depth["{"] === 0) commas.push(index);
  }
  const starts = [openIndex + 1].concat(commas.map((index) => index + 1));
  const ends = commas.concat([closeIndex]);
  return starts.map((start, index) => [start, ends[index]]);
}

function skipJavaScriptTrivia(source, index, end) {
  let cursor = index;
  while (cursor < end) {
    if (/\s/.test(source[cursor])) {
      cursor += 1;
      continue;
    }
    if (source[cursor] === "/" && source[cursor + 1] === "/") {
      cursor += 2;
      while (cursor < end && source[cursor] !== "\n" && source[cursor] !== "\r") cursor += 1;
      continue;
    }
    if (source[cursor] === "/" && source[cursor + 1] === "*") {
      const close = source.indexOf("*/", cursor + 2);
      if (close === -1 || close + 2 > end) return -1;
      cursor = close + 2;
      continue;
    }
    break;
  }
  return cursor;
}

function parseStaticStringLiteral(source, start, end) {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") return null;
  let value = "";
  let index = start + 1;
  while (index < end) {
    const character = source[index];
    if (character === quote) return { value, end: index + 1 };
    if (character === "\n" || character === "\r" || character === "\u2028" || character === "\u2029") return null;
    if (character !== "\\") {
      value += character;
      index += 1;
      continue;
    }

    index += 1;
    if (index >= end) return null;
    const escaped = source[index];
    const simpleEscapes = {
      "'": "'", '"': '"', "\\": "\\",
      b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v"
    };
    if (Object.prototype.hasOwnProperty.call(simpleEscapes, escaped)) {
      value += simpleEscapes[escaped];
      index += 1;
      continue;
    }
    if (escaped === "\n" || escaped === "\u2028" || escaped === "\u2029") {
      index += 1;
      continue;
    }
    if (escaped === "\r") {
      index += source[index + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (escaped === "0") {
      if (/[0-9]/.test(source[index + 1] || "")) return null;
      value += "\0";
      index += 1;
      continue;
    }
    if (escaped === "x") {
      const digits = source.slice(index + 1, index + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(digits)) return null;
      value += String.fromCharCode(parseInt(digits, 16));
      index += 3;
      continue;
    }
    if (escaped === "u") {
      if (source[index + 1] === "{") {
        const close = source.indexOf("}", index + 2);
        if (close === -1 || close >= end) return null;
        const digits = source.slice(index + 2, close);
        if (!/^[0-9a-fA-F]{1,6}$/.test(digits)) return null;
        const codePoint = parseInt(digits, 16);
        if (codePoint > 0x10ffff) return null;
        value += String.fromCodePoint(codePoint);
        index = close + 1;
        continue;
      }
      const digits = source.slice(index + 1, index + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(digits)) return null;
      value += String.fromCharCode(parseInt(digits, 16));
      index += 5;
      continue;
    }

    if (!/[0-9]/.test(escaped)) {
      // ECMAScript NonEscapeCharacter: for example, "r\\egion" evaluates to
      // "region". Decimal escapes remain fail-closed because their validity and
      // meaning depend on strict mode and Annex B legacy-octal rules.
      value += escaped;
      index += 1;
      continue;
    }
    return null;
  }
  return null;
}

function splitTopLevelObjectMembers(masked, openIndex, closeIndex) {
  const members = [];
  const depth = { "(": 0, "[": 0, "{": 0 };
  const closing = { ")": "(", "]": "[", "}": "{" };
  let start = openIndex + 1;
  for (let index = openIndex + 1; index < closeIndex; index += 1) {
    const character = masked[index];
    if (Object.prototype.hasOwnProperty.call(depth, character)) depth[character] += 1;
    else if (closing[character]) depth[closing[character]] -= 1;
    else if (character === "," && depth["("] === 0 && depth["["] === 0 && depth["{"] === 0) {
      members.push([start, index]);
      start = index + 1;
    }
  }
  members.push([start, closeIndex]);
  return members;
}

function parseStaticPropertyKey(source, start, end) {
  if (source[start] === '"' || source[start] === "'") {
    const parsed = parseStaticStringLiteral(source, start, end);
    return parsed ? { key: parsed.value, end: parsed.end } : null;
  }
  const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(start, end));
  if (!identifier) return null;
  return { key: identifier[0], end: start + identifier[0].length };
}

function workspaceIdFromOptions(source, masked, start, end) {
  start = skipJavaScriptTrivia(source, start, end);
  if (start === -1 || masked[start] !== "{") return null;
  const objectEnd = matchingDelimiter(masked, start, "{", "}");
  if (objectEnd === -1 || objectEnd >= end) return null;
  const afterObject = skipJavaScriptTrivia(source, objectEnd + 1, end);
  if (afterObject !== end) return null;

  const properties = [];
  const members = splitTopLevelObjectMembers(masked, start, objectEnd);
  for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
    const member = members[memberIndex];
    const memberStart = skipJavaScriptTrivia(source, member[0], member[1]);
    if (memberStart === -1) return null;
    if (memberStart === member[1]) {
      if (memberIndex === members.length - 1) continue;
      return null;
    }
    if (masked.startsWith("...", memberStart) || masked[memberStart] === "[") return null;

    const property = parseStaticPropertyKey(source, memberStart, member[1]);
    if (!property) return null;
    let cursor = skipJavaScriptTrivia(source, property.end, member[1]);
    if (cursor === -1) return null;
    if (cursor === member[1]) {
      if (property.key === "workspaceId") return null;
      properties.push({ key: property.key, value: null });
      continue;
    }
    if (masked[cursor] !== ":") return null;
    cursor = skipJavaScriptTrivia(source, cursor + 1, member[1]);
    if (cursor === -1 || cursor === member[1]) return null;

    let value = null;
    if (property.key === "workspaceId") {
      const parsedValue = parseStaticStringLiteral(source, cursor, member[1]);
      if (!parsedValue) return null;
      const afterValue = skipJavaScriptTrivia(source, parsedValue.end, member[1]);
      if (afterValue !== member[1]) return null;
      value = parsedValue.value;
    }
    properties.push({ key: property.key, value });
  }

  const seenKeys = new Set();
  for (const property of properties) {
    if (seenKeys.has(property.key)) return null;
    seenKeys.add(property.key);
  }
  const workspaceProperties = properties.filter((property) => property.key === "workspaceId");
  return workspaceProperties.length === 1 ? workspaceProperties[0] : null;
}

function parseWorkspaceNavigationMounts(source) {
  const text = typeof source === "string" ? source : "";
  const ranges = executableJavaScriptRanges(text);
  const maskedCharacters = text.split("").map((character) => character === "\n" || character === "\r" ? character : " ");
  ranges.forEach(([rangeStart, rangeEnd]) => {
    const rangeMask = maskJavaScript(text.slice(rangeStart, rangeEnd));
    for (let index = 0; index < rangeMask.length; index += 1) maskedCharacters[rangeStart + index] = rangeMask[index];
  });
  const masked = maskedCharacters.join("");
  const mounts = [];
  ranges.forEach(([rangeStart, rangeEnd]) => {
    let searchIndex = rangeStart;
    while (searchIndex < rangeEnd) {
      const tokenIndex = masked.indexOf(WORKSPACE_MOUNT_TOKEN, searchIndex);
      if (tokenIndex === -1 || tokenIndex >= rangeEnd) break;
      searchIndex = tokenIndex + WORKSPACE_MOUNT_TOKEN.length;
      const before = masked[tokenIndex - 1] || "";
      const afterToken = masked[tokenIndex + WORKSPACE_MOUNT_TOKEN.length] || "";
      if (/[A-Za-z0-9_$]/.test(before) || /[A-Za-z0-9_$]/.test(afterToken)) continue;
      let openIndex = tokenIndex + WORKSPACE_MOUNT_TOKEN.length;
      while (openIndex < rangeEnd && /\s/.test(masked[openIndex])) openIndex += 1;
      if (masked[openIndex] !== "(") continue;
      const closeIndex = matchingDelimiter(masked, openIndex, "(", ")");
      if (closeIndex === -1 || closeIndex >= rangeEnd) {
        mounts.push({ index: tokenIndex, end: null, workspaceId: null, readable: false, raw: text.slice(tokenIndex, rangeEnd) });
        break;
      }
      const args = splitTopLevelArguments(masked, openIndex, closeIndex);
      const parsedId = args.length === 2 ? workspaceIdFromOptions(text, masked, args[1][0], args[1][1]) : null;
      mounts.push({
        index: tokenIndex,
        end: closeIndex + 1,
        workspaceId: parsedId ? parsedId.value : null,
        readable: !!parsedId && WORKSPACE_ID_SHAPE.test(parsedId.value),
        raw: text.slice(tokenIndex, closeIndex + 1)
      });
      searchIndex = closeIndex + 1;
    }
  });
  return mounts;
}

function validateWorkspaceNavigationMount(options) {
  const opts = options || {};
  const hubPath = opts.hubPath;
  const mappedWorkspaceId = opts.mappedWorkspaceId;
  const registryEntries = Array.isArray(opts.registryEntries) ? opts.registryEntries : [];
  const mounts = parseWorkspaceNavigationMounts(opts.source);
  const failure = (reason, actual, mountedId) => ({
    ok: false,
    code: "workspace_id_mismatch",
    reason,
    hubPath,
    expectedId: mappedWorkspaceId,
    mountedId: mountedId === undefined ? null : mountedId,
    actual,
    mounts
  });

  if (mounts.length !== 1) {
    return failure("mount_count_mismatch", mounts.map((mount) => mount.workspaceId));
  }
  const mount = mounts[0];
  if (!mount.readable) return failure("mount_workspace_id_unreadable", mount.workspaceId, mount.workspaceId);
  const mountedId = mount.workspaceId;
  const mountedRoutes = registryEntries.filter((entry) => entry && entry.id === mountedId);
  if (mountedRoutes.length === 0) return failure("unknown_workspace_route", mountedId, mountedId);
  if (mountedId !== mappedWorkspaceId) return failure("mounted_workspace_mismatch", mountedId, mountedId);

  const mappedRoutes = registryEntries.filter((entry) => entry && entry.id === mappedWorkspaceId);
  const routesForHub = registryEntries.filter((entry) => entry && entry.path === hubPath);
  if (
    !WORKSPACE_ID_SHAPE.test(String(mappedWorkspaceId || "")) ||
    mappedRoutes.length !== 1 ||
    mappedRoutes[0].path !== hubPath ||
    routesForHub.length !== 1 ||
    routesForHub[0].id !== mappedWorkspaceId
  ) {
    const actual = mappedRoutes.length === 1 ? mappedRoutes[0].path : mappedRoutes.map((entry) => entry.path);
    return failure("registry_map_disagreement", actual, mountedId);
  }
  return {
    ok: true,
    code: null,
    reason: null,
    hubPath,
    expectedId: mappedWorkspaceId,
    mountedId,
    actual: mountedId,
    mounts
  };
}

function extractTemplateType(templateText) {
  const match = /^\s*type:\s*([A-Za-z0-9_]+)\s*$/m.exec(templateText);
  return match ? match[1] : null;
}

function sliceSection(text, headingPattern) {
  const lines = text.split("\n");
  const startIndex = lines.findIndex((line) => headingPattern.test(line));
  if (startIndex === -1) return null;
  const collected = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    collected.push(lines[index]);
  }
  return collected;
}

function firstMarkdownPathInCodeSpan(line) {
  const pattern = /`([^`]+)`/g;
  let match = pattern.exec(line);
  while (match !== null) {
    const candidate = match[1].trim();
    if (candidate.endsWith(".md")) return candidate;
    match = pattern.exec(line);
  }
  return null;
}

// Machine-consumed ADR-007 Decision markers: "canonical contract" declares the canonical
// UI target, "UI contract 자체를 정의하지 않음" declares a compatibility-only target.
function parseUiContractDeclarations(adrText) {
  const sectionLines = sliceSection(adrText, /^##\s+Decision\s*$/);
  if (sectionLines === null) throw new Error("ADR Decision section not found");

  const items = [];
  sectionLines.forEach((line) => {
    if (/^\d+\.\s/.test(line)) {
      items.push({ declaration: line, body: [line] });
      return;
    }
    if (items.length > 0 && line.trim() !== "") items[items.length - 1].body.push(line);
  });

  const canonicalTargets = [];
  const compatibilityTargets = [];
  items.forEach((item) => {
    const declaredPath = firstMarkdownPathInCodeSpan(item.declaration);
    if (!declaredPath) return;
    const bodyText = item.body.join("\n");
    if (/canonical contract/i.test(bodyText)) {
      canonicalTargets.push(declaredPath);
      return;
    }
    if (/UI contract 자체를 정의하지 않음/.test(bodyText)) compatibilityTargets.push(declaredPath);
  });

  return { canonicalTargets, compatibilityTargets };
}

function auditUiContractDeclaration(root, errors) {
  const adrAbs = path.join(root, CONTRACT_HIERARCHY_ADR_PATH);
  let adrText;
  try {
    adrText = fs.readFileSync(adrAbs, "utf8");
  } catch (error) {
    errors.push({
      code: "canonical_ui_contract_mismatch",
      path: CONTRACT_HIERARCHY_ADR_PATH,
      expected: CANONICAL_UI_CONTRACT_PATH,
      actual: null,
      message: "contract source hierarchy ADR is unreadable: " + error.message
    });
    return null;
  }

  let declarations;
  try {
    declarations = parseUiContractDeclarations(adrText);
  } catch (error) {
    errors.push({
      code: "canonical_ui_contract_mismatch",
      path: CONTRACT_HIERARCHY_ADR_PATH,
      expected: CANONICAL_UI_CONTRACT_PATH,
      actual: null,
      message: "UI contract declarations are unparsable: " + error.message
    });
    return null;
  }

  const canonical = declarations.canonicalTargets;
  if (canonical.length !== 1) {
    errors.push({
      code: "canonical_ui_contract_mismatch",
      path: CONTRACT_HIERARCHY_ADR_PATH,
      expected: CANONICAL_UI_CONTRACT_PATH,
      actual: canonical.slice(),
      message: "expected exactly one canonical UI-contract target, found " + canonical.length
    });
  } else if (canonical[0] !== CANONICAL_UI_CONTRACT_PATH) {
    errors.push({
      code: "canonical_ui_contract_mismatch",
      path: CONTRACT_HIERARCHY_ADR_PATH,
      expected: CANONICAL_UI_CONTRACT_PATH,
      actual: canonical[0],
      message: "canonical UI-contract target is not the root design contract"
    });
  }

  if (canonical.indexOf(COMPATIBILITY_UI_CONTRACT_PATH) !== -1) {
    errors.push({
      code: "canonical_ui_contract_mismatch",
      path: COMPATIBILITY_UI_CONTRACT_PATH,
      expected: "compatibility-only",
      actual: "canonical",
      message: "compatibility UI-contract document is declared canonical"
    });
  } else if (declarations.compatibilityTargets.indexOf(COMPATIBILITY_UI_CONTRACT_PATH) === -1) {
    errors.push({
      code: "canonical_ui_contract_mismatch",
      path: COMPATIBILITY_UI_CONTRACT_PATH,
      expected: "compatibility-only",
      actual: null,
      message: "compatibility UI-contract document has no non-canonical declaration"
    });
  }

  canonical.concat(declarations.compatibilityTargets).forEach((relPath) => {
    if (fs.existsSync(path.join(root, relPath))) return;
    errors.push({
      code: "canonical_ui_contract_mismatch",
      path: relPath,
      expected: "existing declared UI-contract document",
      actual: null,
      message: "declared UI-contract document does not exist"
    });
  });

  return {
    adr: CONTRACT_HIERARCHY_ADR_PATH,
    canonicalTargets: canonical.slice(),
    compatibilityTargets: declarations.compatibilityTargets.slice()
  };
}
function listMarkdownFiles(absDir, relDir, collected) {
  if (!fs.existsSync(absDir)) return collected;
  fs.readdirSync(absDir, { withFileTypes: true }).forEach((entry) => {
    const absPath = path.join(absDir, entry.name);
    const relPath = relDir + "/" + entry.name;
    if (entry.isDirectory()) {
      listMarkdownFiles(absPath, relPath, collected);
      return;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) collected.push(relPath);
  });
  return collected;
}

function isExternalTarget(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#") || target.startsWith("//");
}

function collectInternalLinks(fileText) {
  const links = [];
  fileText.split("\n").forEach((line, lineIndex) => {
    const pattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match = pattern.exec(line);
    while (match !== null) {
      const target = match[1];
      if (!isExternalTarget(target)) {
        const withoutAnchor = target.split("#")[0].split("?")[0];
        if (withoutAnchor) links.push({ target, resolvable: decodeURIComponent(withoutAnchor), line: lineIndex + 1 });
      }
      match = pattern.exec(line);
    }
  });
  return links;
}

function normalizeProtectedText(lines) {
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}

function trimInterArticleSeparator(lines, followedByArticle) {
  const trimmed = lines.slice();
  while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === "") trimmed.pop();
  if (followedByArticle && trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === "---") {
    trimmed.pop();
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === "") trimmed.pop();
  }
  return trimmed;
}

function parseTopLevelArticleSections(text) {
  const sections = new Map();
  const lines = text.split(/\r?\n/);
  let current = null;
  let fence = null;

  function finishCurrent(followedByArticle) {
    if (!current) return;
    current.lines = trimInterArticleSeparator(current.lines, followedByArticle);
    if (!sections.has(current.article)) sections.set(current.article, []);
    sections.get(current.article).push(current.lines);
  }

  lines.forEach((line) => {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence.character &&
        fenceMatch[1].length >= fence.length &&
        fenceMatch[2].trim() === ""
      ) {
        fence = null;
      }
      if (current) current.lines.push(line);
      return;
    }
    if (fenceMatch) {
      fence = { character: fenceMatch[1][0], length: fenceMatch[1].length };
      if (current) current.lines.push(line);
      return;
    }

    const heading = /^#\s+Article\s+(\d+)\s+—/.exec(line);
    if (heading) {
      finishCurrent(true);
      current = { article: Number(heading[1]), lines: [line] };
      return;
    }
    if (current) current.lines.push(line);
  });
  finishCurrent(false);
  return sections;
}

function protectedArticleLines(text, articleNumber) {
  const matches = parseTopLevelArticleSections(text).get(articleNumber) || [];
  return matches.length === 1 ? matches[0] : null;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function hasExactKeys(value, allowedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = allowedKeys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function malformedManifest(errors, message) {
  errors.push({
    code: "protected_contract_manifest_malformed",
    path: PROTECTED_CONTRACT_MANIFEST_PATH,
    message
  });
}

function validateProtectedContractManifest(manifest, errors) {
  if (!hasExactKeys(manifest, [
    "schemaVersion",
    "documentPath",
    "normalizationVersion",
    "articles",
    "requiredFragments",
    "exceptionPolicy"
  ])) {
    malformedManifest(errors, "protected-contract manifest has missing or unknown root properties");
    return false;
  }
  if (manifest.schemaVersion !== PROTECTED_CONTRACT_SCHEMA_VERSION) {
    malformedManifest(errors, "unsupported or missing schemaVersion");
    return false;
  }
  if (manifest.documentPath !== PROTECTED_DOCUMENT_PATH) {
    malformedManifest(errors, "documentPath must identify the protected Constitution");
    return false;
  }
  if (manifest.normalizationVersion !== PROTECTED_CONTRACT_NORMALIZATION_VERSION) {
    malformedManifest(errors, "unsupported or missing normalizationVersion");
    return false;
  }
  if (!Array.isArray(manifest.articles) || !Array.isArray(manifest.requiredFragments)) {
    malformedManifest(errors, "articles and requiredFragments must be arrays");
    return false;
  }

  const articleNumbers = manifest.articles.map((entry) => entry && entry.article);
  if (
    manifest.articles.length !== PROTECTED_ARTICLES.length ||
    new Set(articleNumbers).size !== PROTECTED_ARTICLES.length ||
    !PROTECTED_ARTICLES.every((article) => articleNumbers.includes(article))
  ) {
    malformedManifest(errors, "articles must contain exactly Articles " + PROTECTED_ARTICLES.join(", "));
    return false;
  }
  for (const entry of manifest.articles) {
    if (
      !hasExactKeys(entry, ["article", "normalizedText", "sha256"]) ||
      typeof entry.normalizedText !== "string" ||
      entry.normalizedText === "" ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    ) {
      malformedManifest(errors, "each protected article requires normalizedText and a lowercase SHA-256");
      return false;
    }
  }
  for (const fragment of manifest.requiredFragments) {
    if (
      !hasExactKeys(fragment, ["article", "text"]) ||
      !PROTECTED_ARTICLES.includes(fragment.article) ||
      typeof fragment.text !== "string" ||
      fragment.text.trim() === ""
    ) {
      malformedManifest(errors, "each required fragment needs a protected article number and non-empty text");
      return false;
    }
  }
  const requiredArticleNumbers = new Set(manifest.requiredFragments.map((fragment) => fragment.article));
  if (!requiredArticleNumbers.has(3) || !requiredArticleNumbers.has(8)) {
    malformedManifest(errors, "requiredFragments must independently protect Articles 3 and 8");
    return false;
  }

  const policy = manifest.exceptionPolicy;
  if (
    !hasExactKeys(policy, [
      "article",
      "exactText",
      "occurrences",
      "afterNormalizedLine",
      "beforeNormalizedLine"
    ]) ||
    policy.article !== 8 ||
    typeof policy.exactText !== "string" ||
    policy.exactText.trim() === "" ||
    policy.occurrences !== 1 ||
    typeof policy.afterNormalizedLine !== "string" ||
    policy.afterNormalizedLine === "" ||
    typeof policy.beforeNormalizedLine !== "string" ||
    policy.beforeNormalizedLine === ""
  ) {
    malformedManifest(errors, "exceptionPolicy must define one exact Article 8 line and its adjacent normalized lines");
    return false;
  }
  return true;
}

function readProtectedRegularFile(root, relPath, role, errors) {
  const absPath = path.join(root, relPath);
  let stat;
  try {
    stat = fs.lstatSync(absPath);
  } catch (error) {
    errors.push({
      code: role === "manifest" ? "protected_contract_manifest_unreadable" : "protected_contract_document_unreadable",
      path: relPath,
      role,
      message: error.message
    });
    return null;
  }

  if (stat.isSymbolicLink() || !stat.isFile()) {
    errors.push({
      code: "protected_contract_file_unsafe",
      path: relPath,
      role,
      message: "protected " + role + " must be a regular non-symlink file whose realpath is inside the audit root"
    });
    return null;
  }

  let rootRealPath;
  let fileRealPath;
  try {
    rootRealPath = fs.realpathSync(root);
    fileRealPath = fs.realpathSync(absPath);
  } catch (error) {
    errors.push({
      code: role === "manifest" ? "protected_contract_manifest_unreadable" : "protected_contract_document_unreadable",
      path: relPath,
      role,
      message: error.message
    });
    return null;
  }

  const relativeRealPath = path.relative(rootRealPath, fileRealPath);
  const contained = relativeRealPath !== ".." && !relativeRealPath.startsWith(".." + path.sep) && !path.isAbsolute(relativeRealPath);
  if (!contained) {
    errors.push({
      code: "protected_contract_file_unsafe",
      path: relPath,
      role,
      message: "protected " + role + " must be a regular non-symlink file whose realpath is inside the audit root"
    });
    return null;
  }

  try {
    return fs.readFileSync(absPath, "utf8");
  } catch (error) {
    errors.push({
      code: role === "manifest" ? "protected_contract_manifest_unreadable" : "protected_contract_document_unreadable",
      path: relPath,
      role,
      message: error.message
    });
    return null;
  }
}

function auditProtectedContract(root, errors) {
  const manifestText = readProtectedRegularFile(root, PROTECTED_CONTRACT_MANIFEST_PATH, "manifest", errors);
  if (manifestText === null) return null;

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    errors.push({
      code: "protected_contract_manifest_malformed",
      path: PROTECTED_CONTRACT_MANIFEST_PATH,
      message: error.message
    });
    return null;
  }
  if (!validateProtectedContractManifest(manifest, errors)) return null;

  const documentText = readProtectedRegularFile(root, manifest.documentPath, "document", errors);
  if (documentText === null) {
    return { manifest: PROTECTED_CONTRACT_MANIFEST_PATH, document: manifest.documentPath, articles: PROTECTED_ARTICLES.slice() };
  }

  const articlesWithValidIntegrity = new Set();
  manifest.articles.forEach((entry) => {
    const actualHash = sha256(entry.normalizedText);
    if (actualHash !== entry.sha256) {
      errors.push({
        code: "protected_contract_manifest_integrity",
        path: PROTECTED_CONTRACT_MANIFEST_PATH,
        article: entry.article,
        expected: entry.sha256,
        actual: actualHash,
        message: "Article " + entry.article + " normalizedText does not match its manifest SHA-256"
      });
    } else {
      articlesWithValidIntegrity.add(entry.article);
    }
  });

  const articleSections = parseTopLevelArticleSections(documentText);
  let headingsValid = true;
  PROTECTED_ARTICLES.forEach((article) => {
    const actual = (articleSections.get(article) || []).length;
    if (actual === 1) return;
    headingsValid = false;
    errors.push({
      code: "protected_contract_article_heading_mismatch",
      path: manifest.documentPath,
      article,
      expected: 1,
      actual,
      message: "protected Article " + article + " must have exactly one top-level heading outside fenced blocks"
    });
  });
  if (!headingsValid) {
    return { manifest: PROTECTED_CONTRACT_MANIFEST_PATH, document: manifest.documentPath, articles: PROTECTED_ARTICLES.slice() };
  }

  const policy = manifest.exceptionPolicy;
  const exactException = normalizeProtectedText([policy.exactText]);
  const allNormalizedLines = documentText.split(/\r?\n/).map((line) => normalizeProtectedText([line]));
  const globalExceptionCount = allNormalizedLines.filter((line) => line === exactException).length;
  const exceptionLines = articleSections.get(policy.article)[0];
  const normalizedExceptionLines = exceptionLines
    ? exceptionLines.map((line) => normalizeProtectedText([line])).filter((line) => line !== "")
    : [];
  const exceptionIndexes = [];
  normalizedExceptionLines.forEach((line, index) => {
    if (line === exactException) exceptionIndexes.push(index);
  });
  const exceptionIndex = exceptionIndexes.length === 1 ? exceptionIndexes[0] : -1;
  const correctlyPlaced =
    globalExceptionCount === policy.occurrences &&
    exceptionIndexes.length === policy.occurrences &&
    exceptionIndex > 0 &&
    normalizedExceptionLines[exceptionIndex - 1] === policy.afterNormalizedLine &&
    normalizedExceptionLines[exceptionIndex + 1] === policy.beforeNormalizedLine;
  if (!correctlyPlaced) {
    errors.push({
      code: "protected_contract_exception_mismatch",
      path: manifest.documentPath,
      article: policy.article,
      expected: policy,
      actual: { occurrences: globalExceptionCount, articleOccurrences: exceptionIndexes.length },
      message: "the exact Article 8 terminology exception must occur once at its approved location"
    });
  }

  manifest.articles.forEach((entry) => {
    if (!articlesWithValidIntegrity.has(entry.article)) return;
    const lines = articleSections.get(entry.article)[0];
    const comparableLines = lines
      ? lines.filter((line) => !(entry.article === policy.article && normalizeProtectedText([line]) === exactException))
      : [];
    const actualText = lines ? normalizeProtectedText(comparableLines) : null;
    if (actualText !== entry.normalizedText) {
      errors.push({
        code: "protected_contract_section_drift",
        path: manifest.documentPath,
        article: entry.article,
        expectedSha256: entry.sha256,
        actualSha256: actualText === null ? null : sha256(actualText),
        message: "Article " + entry.article + " differs from the versioned protected-contract baseline"
      });
    }
  });

  manifest.requiredFragments.forEach((fragment) => {
    const lines = articleSections.get(fragment.article)[0];
    const normalized = lines ? normalizeProtectedText(lines) : "";
    if (!normalized.includes(normalizeProtectedText([fragment.text]))) {
      errors.push({
        code: "protected_contract_required_fragment_missing",
        path: manifest.documentPath,
        article: fragment.article,
        fragment: fragment.text,
        message: "Article " + fragment.article + " is missing a required protected fragment"
      });
    }
  });

  return { manifest: PROTECTED_CONTRACT_MANIFEST_PATH, document: manifest.documentPath, articles: PROTECTED_ARTICLES.slice() };
}

function earlyFailure(root, code, message) {
  return {
    status: "fail",
    root,
    legacyAliasAllowlist: LEGACY_ALIAS_ALLOWLIST.slice(),
    surfaces: [],
    uiContract: null,
    protectedContract: null,
    checkedLinkFiles: 0,
    errorCount: 1,
    errors: [{ code, path: CONTRACT_MAP_PATH, message }]
  };
}

function auditRepository(options) {
  const root = path.resolve((options && options.root) || process.cwd());
  const errors = [];

  let mapText;
  try {
    mapText = fs.readFileSync(path.join(root, CONTRACT_MAP_PATH), "utf8");
  } catch (error) {
    return earlyFailure(root, "contract_map_unreadable", error.message);
  }

  let surfaces;
  try {
    surfaces = parseContractMap(mapText);
  } catch (error) {
    return earlyFailure(root, "contract_map_parse_error", error.message);
  }

  surfaces.forEach((surface) => {
    PATH_LAYERS.forEach((layer) => {
      const relPath = surface.paths[layer];
      if (!relPath) return;
      if (!fs.existsSync(path.join(root, relPath))) {
        errors.push({
          code: "missing_mapped_path",
          surface: surface.surface,
          layer,
          path: relPath,
          message: layer + " path declared for " + surface.surface + " does not exist"
        });
      }
    });
  });

  surfaces.forEach((surface) => {
    const templatePath = surface.paths.Template;
    const schemaPath = surface.paths.Schema;
    if (!templatePath || !schemaPath) return;
    const templateAbs = path.join(root, templatePath);
    const schemaAbs = path.join(root, schemaPath);
    if (!fs.existsSync(templateAbs) || !fs.existsSync(schemaAbs)) return;

    const templateType = extractTemplateType(fs.readFileSync(templateAbs, "utf8"));
    if (!templateType) {
      errors.push({
        code: "schema_template_link_missing",
        surface: surface.surface,
        path: templatePath,
        schema: schemaPath,
        type: null,
        message: "template declares no frontmatter type"
      });
      return;
    }
    const schemaText = fs.readFileSync(schemaAbs, "utf8");
    if (!new RegExp("\\b" + templateType + "\\b").test(schemaText)) {
      errors.push({
        code: "schema_template_link_missing",
        surface: surface.surface,
        path: templatePath,
        schema: schemaPath,
        type: templateType,
        message: "template type '" + templateType + "' is not documented in " + schemaPath
      });
    }
  });

  const registryAbs = path.join(root, WORKSPACE_REGISTRY_PATH);
  const registryExists = fs.existsSync(registryAbs);
  const registryEntries = registryExists ? parseWorkspaceRegistry(fs.readFileSync(registryAbs, "utf8")) : [];
  if (!registryExists) {
    errors.push({
      code: "missing_mapped_path",
      surface: null,
      layer: "Registry",
      path: WORKSPACE_REGISTRY_PATH,
      message: "workspace registry does not exist"
    });
  }

  surfaces.forEach((surface) => {
    const hubPath = surface.paths.Hub;
    if (!hubPath) return;
    const hubAbs = path.join(root, hubPath);
    if (!fs.existsSync(hubAbs) || !registryExists) return;
    const validation = validateWorkspaceNavigationMount({
      source: fs.readFileSync(hubAbs, "utf8"),
      hubPath,
      mappedWorkspaceId: surface.workspaceId,
      registryEntries
    });
    if (!validation.ok) {
      errors.push({
        code: "workspace_id_mismatch",
        reason: validation.reason,
        surface: surface.surface,
        path: validation.reason === "registry_map_disagreement" ? WORKSPACE_REGISTRY_PATH : hubPath,
        expected: validation.reason === "registry_map_disagreement" ? hubPath : surface.workspaceId,
        actual: validation.actual,
        message: "workspace navigation mount must be exactly one known canonical route shared by the contract map and registry"
      });
    }
  });

  const linkFiles = LINK_SCAN_DIRS.reduce(
    (collected, relDir) => listMarkdownFiles(path.join(root, relDir), relDir, collected),
    []
  );
  linkFiles.forEach((relPath) => {
    const fileText = fs.readFileSync(path.join(root, relPath), "utf8");
    collectInternalLinks(fileText).forEach((link) => {
      const resolvedRel = path.posix.normalize(path.posix.join(path.posix.dirname(relPath), link.resolvable));
      if (fs.existsSync(path.join(root, resolvedRel))) return;
      if (LEGACY_ALIAS_ALLOWLIST.indexOf(link.resolvable) !== -1) return;
      errors.push({
        code: "broken_internal_link",
        path: relPath,
        line: link.line,
        link: link.target,
        resolved: resolvedRel,
        message: "internal link does not resolve sibling-relative to its containing file"
      });
    });
  });

  const uiContract = auditUiContractDeclaration(root, errors);
  const protectedContract = auditProtectedContract(root, errors);

  return {
    status: errors.length === 0 ? "pass" : "fail",
    root,
    legacyAliasAllowlist: LEGACY_ALIAS_ALLOWLIST.slice(),
    surfaces: surfaces.map((surface) => ({
      surface: surface.surface,
      workspaceId: surface.workspaceId,
      paths: surface.paths
    })),
    uiContract,
    protectedContract,
    checkedLinkFiles: linkFiles.length,
    errorCount: errors.length,
    errors
  };
}

function parseArgs(argv) {
  const parsed = { root: null, format: "text", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      parsed.root = argv[index + 1];
      index += 1;
    } else if (arg === "--format") {
      parsed.format = argv[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else {
      parsed.unknown = arg;
    }
  }
  return parsed;
}

const USAGE = [
  "Usage: node SYSTEM/SCRIPTS/prodigy-contract-audit.js [--root <dir>] [--format text|json]",
  "",
  "Audits SYSTEM/docs/13_Contract_Map.md: mapped path existence, sibling-relative",
  "internal links, Schema-Template linkage, Hub/registry workspace id equality, the",
  "canonical UI-contract target, and the versioned protected Constitution baseline.",
  "Exit 0 = pass, 1 = contract violations found, 2 = bad invocation."
].join("\n");

function renderText(result) {
  const lines = [
    "root: " + result.root,
    "surfaces: " + result.surfaces.length,
    "link files scanned: " + result.checkedLinkFiles,
    "canonical UI contract: " + (result.uiContract ? result.uiContract.canonicalTargets.join(", ") || "none" : "unresolved"),
    "status: " + result.status + " (" + result.errorCount + " error(s))"
  ];
  result.errors.forEach((error) => {
    lines.push([error.code, error.path, error.line ? "line " + error.line : "", error.message].filter(Boolean).join(" | "));
  });
  return lines.join("\n") + "\n";
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(USAGE + "\n");
    return 0;
  }
  if (args.unknown !== undefined || (args.root !== null && !args.root) || ["text", "json"].indexOf(args.format) === -1) {
    process.stderr.write("invalid invocation\n" + USAGE + "\n");
    return 2;
  }
  const result = auditRepository({ root: args.root || path.resolve(__dirname, "..", "..") });
  process.stdout.write(args.format === "json" ? JSON.stringify(result, null, 2) + "\n" : renderText(result));
  return result.status === "pass" ? 0 : 1;
}

module.exports = {
  CONTRACT_MAP_PATH,
  WORKSPACE_REGISTRY_PATH,
  CONTRACT_HIERARCHY_ADR_PATH,
  CANONICAL_UI_CONTRACT_PATH,
  COMPATIBILITY_UI_CONTRACT_PATH,
  PROTECTED_CONTRACT_MANIFEST_PATH,
  PROTECTED_DOCUMENT_PATH,
  PROTECTED_ARTICLES,
  LEGACY_ALIAS_ALLOWLIST,
  normalizeProtectedText,
  parseTopLevelArticleSections,
  protectedArticleLines,
  sha256,
  parseContractMap,
  parseWorkspaceRegistry,
  parseWorkspaceNavigationMounts,
  validateWorkspaceNavigationMount,
  parseUiContractDeclarations,
  auditRepository
};

if (require.main === module) process.exitCode = main(process.argv.slice(2));
