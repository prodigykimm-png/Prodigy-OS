"use strict";

function renderText(report) {
  const lines = [
    "Knowledge Explorer Audit",
    `scanned: ${report.counts.scanned} reported: ${report.counts.reported} skipped: ${report.counts.skipped}`,
  ];
  for (const entry of report.entries) {
    const missing = entry.missing_invalid_metadata.map((item) => `${item.field}:${item.code}`).join(",") || "-";
    const suggestion = entry.suggestion
      ? [
          entry.suggestion.knowledge_domain ? `domain=${entry.suggestion.knowledge_domain}` : null,
          entry.suggestion.knowledge_topics ? `topics=${entry.suggestion.knowledge_topics.join("|")}` : null,
        ].filter(Boolean).join(" ")
      : entry.manual_review ? "manual_review" : "ok";
    lines.push(`${entry.path}\t${entry.current_type}\t${missing}\t${suggestion}`);
  }
  for (const entry of report.skipped) lines.push(`${entry.path}\tskipped\t-\t${entry.reason}`);
  return lines.join("\n");
}

function renderJson(report) {
  return JSON.stringify(report, null, 2);
}

module.exports = Object.freeze({ renderJson, renderText });
