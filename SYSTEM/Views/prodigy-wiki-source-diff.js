(function (root) {
  "use strict";

  const artifactApi = root.ProdigyWikiArtifactContract
    || (typeof require === "function" ? require("./prodigy-wiki-artifact-contract.js") : null);
  const hashApi = root.LLMWikiHash
    || (typeof require === "function" ? require("./llmwiki-hash.js") : null);
  if (!artifactApi || !hashApi || typeof artifactApi.createSourceOutline !== "function") {
    throw new Error("Prodigy Wiki source diff dependencies are required.");
  }

  const VERSION = "prodigy_wiki_source_diff_v1";

  function plain(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freeze(child)]),
    ));
  }
  function clean(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
  }
  function directHash(row) {
    return clean(row && row.direct_hash) || clean(row && row.body_hash);
  }
  function pathToken(row) {
    return Array.isArray(row && row.heading_path)
      ? row.heading_path.map((value) => clean(value).normalize("NFC").toLowerCase()).join("\u001f") : "";
  }
  function rangeValue(row) {
    if (!row) return null;
    return freeze({
      range_key: row.range_key,
      heading: row.heading,
      heading_path: row.heading_path,
      level: row.level,
      start: row.start,
      end: row.end,
      direct_hash: directHash(row),
      body_hash: row.body_hash,
    });
  }
  function fallbackRange(removed, currentRows) {
    const path = Array.isArray(removed.heading_path) ? removed.heading_path.slice(0, -1) : [];
    while (path.length) {
      const token = path.map((value) => clean(value).normalize("NFC").toLowerCase()).join("\u001f");
      const match = currentRows.find((row) => pathToken(row) === token);
      if (match) return match.range_key;
      path.pop();
    }
    return currentRows[0] ? currentRows[0].range_key : "";
  }
  function compareSourceOutlines(input) {
    if (!plain(input) || !plain(input.previous_outline) || !plain(input.current_source)
      || !Array.isArray(input.previous_outline.rows)
      || input.previous_outline.source_id !== input.current_source.source_id
      || input.previous_outline.source_path !== input.current_source.source_path) {
      throw new TypeError("valid_source_diff_input_required");
    }
    const previous = input.previous_outline;
    const current = artifactApi.createSourceOutline(input.current_source);
    const previousByKey = new Map(previous.rows.map((row) => [row.range_key, row]));
    const currentByKey = new Map(current.rows.map((row) => [row.range_key, row]));
    const changes = [];
    const removed = [];
    const added = [];

    for (const prior of previous.rows) {
      const next = currentByKey.get(prior.range_key);
      if (!next) {
        removed.push(prior);
        continue;
      }
      if (directHash(prior) !== directHash(next)) {
        changes.push({
          kind: "modified",
          range_key: next.range_key,
          heading: next.heading,
          previous_range: rangeValue(prior),
          current_range: rangeValue(next),
          exact_target: true,
          rebind_only: false,
        });
      } else if (prior.start !== next.start) {
        changes.push({
          kind: "moved",
          range_key: next.range_key,
          heading: next.heading,
          previous_range: rangeValue(prior),
          current_range: rangeValue(next),
          exact_target: true,
          rebind_only: true,
        });
      }
    }
    for (const next of current.rows) {
      if (!previousByKey.has(next.range_key)) added.push(next);
    }

    const consumedRemoved = new Set();
    const consumedAdded = new Set();
    for (const prior of removed) {
      const matches = added.filter((next) => !consumedAdded.has(next.range_key)
        && clean(next.heading).normalize("NFC").toLowerCase() === clean(prior.heading).normalize("NFC").toLowerCase()
        && directHash(next) === directHash(prior));
      const reverseMatches = removed.filter((candidate) =>
        clean(candidate.heading).normalize("NFC").toLowerCase() === clean(prior.heading).normalize("NFC").toLowerCase()
        && directHash(candidate) === directHash(prior));
      if (matches.length !== 1 || reverseMatches.length !== 1) continue;
      const next = matches[0];
      consumedRemoved.add(prior.range_key);
      consumedAdded.add(next.range_key);
      changes.push({
        kind: "moved",
        range_key: next.range_key,
        prior_range_key: prior.range_key,
        heading: next.heading,
        previous_range: rangeValue(prior),
        current_range: rangeValue(next),
        exact_target: true,
        rebind_only: true,
      });
    }
    for (const prior of removed.filter((row) => !consumedRemoved.has(row.range_key))) {
      changes.push({
        kind: "removed",
        range_key: prior.range_key,
        heading: prior.heading,
        previous_range: rangeValue(prior),
        current_range: null,
        fallback_range_key: fallbackRange(prior, current.rows),
        exact_target: false,
        rebind_only: false,
      });
    }
    for (const next of added.filter((row) => !consumedAdded.has(row.range_key))) {
      changes.push({
        kind: "added",
        range_key: next.range_key,
        heading: next.heading,
        previous_range: null,
        current_range: rangeValue(next),
        exact_target: true,
        rebind_only: false,
      });
    }
    changes.sort((left, right) => {
      const leftStart = left.current_range ? left.current_range.start : left.previous_range.start;
      const rightStart = right.current_range ? right.current_range.start : right.previous_range.start;
      return leftStart - rightStart || left.heading.localeCompare(right.heading, "ko");
    });
    const summary = {
      added: changes.filter((row) => row.kind === "added").length,
      modified: changes.filter((row) => row.kind === "modified").length,
      removed: changes.filter((row) => row.kind === "removed").length,
      moved: changes.filter((row) => row.kind === "moved").length,
      total: changes.length,
    };
    const body = {
      diff_version: VERSION,
      source_id: current.source_id,
      source_path: current.source_path,
      previous_source_revision: previous.source_revision,
      current_source_revision: current.source_revision,
      changes,
      summary,
    };
    return freeze({
      ...body,
      previous_outline: previous,
      current_outline: current,
      diff_hash: hashApi.sha256(stable(body)),
      provider_count: 0,
      writer_count: 0,
    });
  }
  function intersects(left, right) {
    return left && right && Number.isSafeInteger(left.start) && Number.isSafeInteger(left.end)
      && Number.isSafeInteger(right.start) && Number.isSafeInteger(right.end)
      && left.start < right.end && right.start < left.end;
  }
  function entryCitations(entry) {
    return (entry.navigation_manifest && Array.isArray(entry.navigation_manifest.sections)
      ? entry.navigation_manifest.sections : [])
      .flatMap((section) => section.citations || []);
  }
  function assessAffectedArtifacts(input) {
    if (!plain(input) || !plain(input.diff) || input.diff.diff_version !== VERSION
      || !Array.isArray(input.entries)) throw new TypeError("valid_affected_artifact_input_required");
    const refresh = [];
    const rebind = [];
    const unaffected = [];
    for (const entry of input.entries) {
      if (!plain(entry) || entry.source_id !== input.diff.source_id
        || entry.source_path !== input.diff.source_path
        || entry.source_revision !== input.diff.previous_source_revision
        || entry.status !== "current") {
        unaffected.push(entry && entry.artifact_id);
        continue;
      }
      const citations = entryCitations(entry);
      const touched = input.diff.changes.filter((change) => change.previous_range
        && citations.some((citation) => intersects(citation.span, change.previous_range)));
      const addedInScope = entry.document_kind === "source_guide"
        && input.diff.changes.some((change) => change.kind === "added" && change.current_range
          && (!entry.scope || intersects(entry.scope, change.current_range)));
      if (touched.some((change) => change.kind !== "moved") || addedInScope) {
        refresh.push(entry.artifact_id);
      } else if (touched.some((change) => change.kind === "moved")) {
        rebind.push(entry.artifact_id);
      } else {
        unaffected.push(entry.artifact_id);
      }
    }
    const value = {
      refresh_artifact_ids: refresh.filter(Boolean).sort((left, right) => left.localeCompare(right, "en")),
      rebind_artifact_ids: rebind.filter(Boolean).sort((left, right) => left.localeCompare(right, "en")),
      unaffected_artifact_ids: unaffected.filter(Boolean).sort((left, right) => left.localeCompare(right, "en")),
      provider_count: 0,
      writer_count: 0,
    };
    return freeze({
      ...value,
      assessment_hash: hashApi.sha256(stable(value)),
    });
  }

  const api = freeze({
    VERSION,
    compareSourceOutlines,
    assessAffectedArtifacts,
  });
  root.ProdigyWikiSourceDiff = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
