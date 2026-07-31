#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CONTRACT_MAP_PATH = "SYSTEM/docs/13_Contract_Map.md";
const WORKSPACE_REGISTRY_PATH = "SYSTEM/Views/workspace-registry.js";
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

function extractTemplateType(templateText) {
  const match = /^\s*type:\s*([A-Za-z0-9_]+)\s*$/m.exec(templateText);
  return match ? match[1] : null;
}

function extractHubWorkspaceId(hubText) {
  const match = /workspaceId:\s*"([^"]+)"/.exec(hubText);
  return match ? match[1] : null;
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

function earlyFailure(root, code, message) {
  return {
    status: "fail",
    root,
    legacyAliasAllowlist: LEGACY_ALIAS_ALLOWLIST.slice(),
    surfaces: [],
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
    if (fs.existsSync(hubAbs)) {
      const mounted = extractHubWorkspaceId(fs.readFileSync(hubAbs, "utf8"));
      if (mounted !== surface.workspaceId) {
        errors.push({
          code: "workspace_id_mismatch",
          surface: surface.surface,
          path: hubPath,
          expected: surface.workspaceId,
          actual: mounted,
          message: "hub mount workspaceId does not match the mapped workspace id"
        });
      }
    }
    if (!registryExists) return;
    const registryEntry = registryEntries.find((entry) => entry.id === surface.workspaceId);
    if (!registryEntry) {
      errors.push({
        code: "workspace_id_mismatch",
        surface: surface.surface,
        path: WORKSPACE_REGISTRY_PATH,
        expected: surface.workspaceId,
        actual: null,
        message: "workspace registry has no entry for the mapped workspace id"
      });
      return;
    }
    if (registryEntry.path !== hubPath) {
      errors.push({
        code: "workspace_id_mismatch",
        surface: surface.surface,
        path: WORKSPACE_REGISTRY_PATH,
        expected: hubPath,
        actual: registryEntry.path,
        message: "workspace registry path for '" + surface.workspaceId + "' does not match the mapped hub path"
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

  return {
    status: errors.length === 0 ? "pass" : "fail",
    root,
    legacyAliasAllowlist: LEGACY_ALIAS_ALLOWLIST.slice(),
    surfaces: surfaces.map((surface) => ({
      surface: surface.surface,
      workspaceId: surface.workspaceId,
      paths: surface.paths
    })),
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
  "internal links, Schema-Template linkage, and Hub/registry workspace id equality.",
  "Exit 0 = pass, 1 = contract violations found, 2 = bad invocation."
].join("\n");

function renderText(result) {
  const lines = [
    "root: " + result.root,
    "surfaces: " + result.surfaces.length,
    "link files scanned: " + result.checkedLinkFiles,
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
  LEGACY_ALIAS_ALLOWLIST,
  parseContractMap,
  parseWorkspaceRegistry,
  auditRepository
};

if (require.main === module) process.exitCode = main(process.argv.slice(2));
