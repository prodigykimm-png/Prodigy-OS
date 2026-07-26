#!/usr/bin/env node
(function (root) {
  "use strict";

  /**
   * People Interaction Writer — standalone script.
   * Evidence `context: people` 블록 승인 시, 해당 사람의 CONTACTS 파일에
   * 통찰(insight)을 # 핵심 상호작용에 자동 추가.
   *
   * 사용법:
   *   node SYSTEM/SCRIPTS/people-interaction-writer.js \
   *     --daily-path DAILY/DAILY/2026-07-26.md \
   *     [--dry-run] [--execute]
   *
   * 또는 프로그래매틱 API:
   *   PeopleInteractionWriter.writeInteractions(app, { evidenceBlocks, peopleLinks, dailyPath })
   */

  const path = require("node:path");
  const fs = require("node:fs");

  const VAULT_ROOT = process.cwd();
  const PEOPLE_FOLDER = "PARA/RESOURCES/CONTACTS";
  const PEOPLE_TEMPLATE = "SYSTEM/TEMPLATE/FORMAT/template_people.md";

  // ---- helpers ----

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function safeName(value) {
    let name = clean(value)
      .replace(/[\\/:*?"<>|#[\]^]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Strip honorifics
    const honorifics = [
      "선생님", "대표님", "사장님", "부장님", "과장님", "대리님", "팀장님",
      "실장님", "이사님", "상무님", "전무님", "회장님", "원장님", "소장님",
      "교수님", "박사님", "매니저님",
      "대표", "사장", "부장", "과장", "대리", "팀장", "실장", "이사", "상무",
      "전무", "회장", "원장", "소장", "교수", "박사", "선생", "매니저",
      "님", "씨", "군", "양",
      "CEO", "CTO", "CFO", "COO", "CMO", "PM"
    ].sort((a, b) => b.length - a.length);

    honorifics.forEach((tok) => {
      const reSpace = new RegExp("\\s+" + tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
      if (reSpace.test(name)) { name = name.replace(reSpace, "").trim(); }
      const reAttach = new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
      if (reAttach.test(name) && name.length > tok.length) {
        const next = name.slice(0, name.length - tok.length).trim();
        if (next.length >= 2) name = next;
      }
    });

    name = name.replace(/\s+/g, " ").trim();
    if (!name) throw new Error("사람 이름을 입력해 주세요.");
    return name.slice(0, 120);
  }

  function peoplePath(name) {
    return `${PEOPLE_FOLDER}/${safeName(name)}.md`;
  }

  function loadCore() {
    try {
      return require(path.join(VAULT_ROOT, "SYSTEM/Views/people-core.js"));
    } catch (_e) {
      return null;
    }
  }

  // ---- render ----

  function renderInsightLine(insight) {
    const raw = clean(insight);
    if (!raw) return "";
    return raw.startsWith("-") ? raw : `- ${raw}`;
  }

  /**
   * Append a people insight line under # 핵심 상호작용.
   * 통찰만 기록 — 날짜/Object 링크 없음 (최근 맥락이 대체).
   * Returns { content: string, changed: boolean }
   */
  function appendInsightToContent(content, insightLine) {
    const text = String(content || "");
    const line = renderInsightLine(insightLine);
    if (!line) return { content: text, changed: false };

    const core = loadCore();
    if (core && typeof core.appendPeopleInteractionToContent === "function") {
      const next = core.appendPeopleInteractionToContent(text, line);
      return { content: next, changed: next !== text };
    }

    // Fallback: simple append
    const sectionMatch = text.match(/^# 핵심 상호작용\s*$/m);
    if (!sectionMatch) {
      // Create section
      const next = `${text.replace(/\s+$/, "")}\n\n# 핵심 상호작용\n*통찰만 기록합니다. 날짜와 출처는 최근 맥락(역링크)이 대체합니다.*\n${line}\n`;
      return { content: next, changed: true };
    }

    // Insert after section heading, skip template placeholder lines
    const lines = text.split("\n");
    const sectionIndex = lines.findIndex((l) => /^# 핵심 상호작용\s*$/.test(l));
    let insertAt = sectionIndex + 1;
    while (insertAt < lines.length) {
      const t = clean(lines[insertAt]);
      if (!t || t.startsWith("*") || t.startsWith("- YYYY") || t === "-") {
        insertAt += 1;
      } else {
        break;
      }
    }
    lines.splice(insertAt, 0, line);
    return { content: lines.join("\n"), changed: true };
  }

  /**
   * Create a new People Object from template.
   * Returns { path, content }
   */
  function createPeopleFile(name) {
    const personName = safeName(name);
    const filePath = peoplePath(personName);
    const fullPath = path.join(VAULT_ROOT, filePath);

    if (fs.existsSync(fullPath)) {
      return { path: filePath, content: fs.readFileSync(fullPath, "utf8"), existed: true };
    }

    // Read template
    const templatePath = path.join(VAULT_ROOT, PEOPLE_TEMPLATE);
    let template = "";
    if (fs.existsSync(templatePath)) {
      template = fs.readFileSync(templatePath, "utf8");
    }

    // Render content
    let content = template;
    if (!content.trim()) {
      content = [
        "---",
        "type: people",
        "status: active",
        "relationship: ",
        "company: ",
        "role: ",
        "birthday: ",
        "first_met: ",
        "last_contact: ",
        "phone: ",
        "email: ",
        "connections: ",
        "tags: ",
        "---",
        "",
        `# ${personName}`,
        "",
        "# 관계",
        "- ",
        "",
        "# 핵심 상호작용",
        "*통찰만 기록합니다. 날짜와 출처는 최근 맥락(역링크)이 대체합니다.*",
        "- ",
        "",
        "# 연결된 Object",
        ""
      ].join("\n");
    }

    // Force type: people
    if (/^type:\s*/m.test(content)) {
      content = content.replace(/^type:\s*.*$/m, "type: people");
    }

    // Ensure folder exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, "utf8");
    return { path: filePath, content, existed: false };
  }

  /**
   * Main write function.
   * @param {object} app - Obsidian app (or null for standalone)
   * @param {object} options
   * @param {Array} options.evidenceBlocks - Saved evidence blocks [{ evidence_id, title, context, experience, interpretation }]
   * @param {Array} options.peopleLinks - [{ name, person_path, resolved_path }] - resolved people links
   * @param {string} options.dailyPath - Daily note path
   * @param {boolean} options.dryRun - If true, don't write
   * @returns {Array<{ person_path, person_name, insight, action, skipped_reason? }>}
   */
  async function writeInteractions(app, options) {
    const opts = options || {};
    const blocks = opts.evidenceBlocks || [];
    const peopleLinks = opts.peopleLinks || [];
    const dailyPath = clean(opts.dailyPath);
    const dryRun = opts.dryRun !== false; // default dry-run

    if (!dailyPath) throw new Error("dailyPath is required.");
    if (!blocks.length) return [];
    if (!peopleLinks.length) return [];

    // Build a map: person path → insight lines
    const peopleInsights = Object.create(null);

    blocks.forEach((block) => {
      if (clean(block.context) !== "people") return;
      const insight = block.interpretation || block.title || block.experience;
      if (!insight) return;

      // Find matching people links for this block
      peopleLinks.forEach((link) => {
        const personPath = link.resolved_path || link.person_path;
        if (!personPath) return;
        if (!peopleInsights[personPath]) {
          peopleInsights[personPath] = { name: link.name || "", insights: [] };
        }
        peopleInsights[personPath].insights.push(insight);
      });
    });

    const results = [];
    for (const [personPath, data] of Object.entries(peopleInsights)) {
      const personName = data.name || personPath.split("/").pop().replace(/\.md$/i, "");
      const insights = data.insights;

      // Read or create file
      let content;
      let created = false;
      const fullPath = path.join(VAULT_ROOT, personPath);

      if (fs.existsSync(fullPath)) {
        content = fs.readFileSync(fullPath, "utf8");
      } else {
        if (dryRun) {
          results.push({
            person_path: personPath,
            person_name: personName,
            insight: insights[0],
            action: "create_skipped_dry_run",
            skipped_reason: "dry-run"
          });
          continue;
        }
        const createdFile = createPeopleFile(personName);
        content = createdFile.content;
        created = true;
      }

      // Append insights
      let changedCount = 0;
      for (const insight of insights) {
        const result = appendInsightToContent(content, insight);
        if (result.changed) {
          content = result.content;
          changedCount += 1;
        }
      }

      if (!dryRun && changedCount > 0) {
        if (app && app.vault && typeof app.vault.modify === "function") {
          const file = app.vault.getAbstractFileByPath(personPath);
          if (file) await app.vault.modify(file, content);
        } else {
          fs.writeFileSync(fullPath, content, "utf8");
        }
      }

      results.push({
        person_path: personPath,
        person_name: personName,
        insight: insights.join("; "),
        action: created ? "created" : (changedCount > 0 ? "appended" : "skipped"),
        changed_count: changedCount
      });
    }

    return results;
  }

  // ---- CLI ----

  function parseArgs() {
    const args = process.argv.slice(2);
    const opts = { dailyPath: "", dryRun: true };
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === "--daily-path" && args[i + 1]) { opts.dailyPath = args[i + 1]; i += 1; }
      if (args[i] === "--dry-run") opts.dryRun = true;
      if (args[i] === "--execute") opts.dryRun = false;
    }
    return opts;
  }

  function readDailyForEvidence(dailyPath) {
    const fullPath = path.join(VAULT_ROOT, dailyPath);
    if (!fs.existsSync(fullPath)) return { blocks: [], links: [] };
    const content = fs.readFileSync(fullPath, "utf8");

    // Try to parse evidence blocks from the saved Daily
    // Format: ### Evidence blocks (JSON)
    const match = content.match(/### Evidence blocks\n```json\n([\s\S]*?)\n```/);
    if (!match) return { blocks: [], links: [] };

    try {
      const data = JSON.parse(match[1]);
      return {
        blocks: Array.isArray(data.evidence_blocks) ? data.evidence_blocks : [],
        links: Array.isArray(data.object_linking_suggestions)
          ? data.object_linking_suggestions.filter((l) => l.object_kind === "people" || l.object_kind === "person")
          : []
      };
    } catch (_e) {
      return { blocks: [], links: [] };
    }
  }

  async function main() {
    const opts = parseArgs();
    if (!opts.dailyPath) {
      console.error("Usage: node people-interaction-writer.js --daily-path <path> [--dry-run] [--execute]");
      process.exit(1);
    }

    const { blocks, links } = readDailyForEvidence(opts.dailyPath);
    if (!blocks.length || !links.length) {
      console.log(JSON.stringify({ status: "no_people_evidence", results: [] }, null, 2));
      return;
    }

    const results = await writeInteractions(null, {
      evidenceBlocks: blocks,
      peopleLinks: links,
      dailyPath: opts.dailyPath,
      dryRun: opts.dryRun
    });

    console.log(JSON.stringify({ status: "ok", dryRun: opts.dryRun, results }, null, 2));
  }

  // ---- API ----

  const api = {
    writeInteractions,
    createPeopleFile,
    appendInsightToContent,
    renderInsightLine,
    safeName,
    peoplePath
  };

  root.PeopleInteractionWriter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  // Run if called directly
  if (require.main === module) {
    main().catch((err) => {
      console.error(err.message || String(err));
      process.exit(1);
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
